// netlify/functions/auth.js
// Supabase Auth proxy for Looper — all auth traffic goes through here
// so SUPABASE_SERVICE_KEY and SUPABASE_ANON_KEY never reach the browser.

const { createClient } = require('@supabase/supabase-js');

// Anon client — for password sign-in and sign-up (issues user-scoped JWTs)
const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin client — for magic links, user lookup, server-side sign-out
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const respond = (status, body) => ({
  statusCode: status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ── Helper: resolve player name + group codes from auth user id ──────────────
async function resolvePlayer(authUserId) {
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('name')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (!player) return null;

  const { data: memberships } = await supabaseAdmin
    .from('group_members')
    .select('groups(code)')
    .eq('player_id', player.name);

  const groupCodes = (memberships || [])
    .map(m => m.groups?.code)
    .filter(Boolean);

  return { name: player.name, groupCodes };
}

// ── Helper: link or create player row for a new auth user ───────────────────
async function linkOrCreatePlayer(authUserId, email, name, handicap, dob) {
  // 1. Try to link by email (existing player row with matching email)
  const { data: byEmail } = await supabaseAdmin
    .from('players')
    .select('name')
    .ilike('email', email)
    .maybeSingle();

  if (byEmail) {
    await supabaseAdmin
      .from('players')
      .update({ auth_user_id: authUserId })
      .eq('name', byEmail.name)
      .is('auth_user_id', null);
    return byEmail.name;
  }

  // 2. Try to link by name (player existed before email/auth was introduced)
  const playerName = name || email.split('@')[0];
  const { data: byName } = await supabaseAdmin
    .from('players')
    .select('name, handicap')
    .eq('name', playerName)
    .maybeSingle();

  if (byName) {
    await supabaseAdmin
      .from('players')
      .update({
        auth_user_id: authUserId,
        email: email.toLowerCase(),
        ...(dob ? { dob } : {}),
        handicap: parseFloat(handicap) || byName.handicap || 0,
      })
      .eq('name', byName.name);
    return byName.name;
  }

  // 3. No existing row — create new player
  await supabaseAdmin
    .from('players')
    .insert({
      name: playerName,
      email: email.toLowerCase(),
      dob: dob || null,
      handicap: parseFloat(handicap) || 0,
      auth_user_id: authUserId,
    });
  return playerName;
}

// ── Helper: build safe session object to return to client ───────────────────
function buildSession(supabaseSession) {
  return {
    accessToken:  supabaseSession.access_token,
    refreshToken: supabaseSession.refresh_token,
    expiresIn:    supabaseSession.expires_in,
    userId:       supabaseSession.user?.id,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' });
  }

  const { action } = body;

  try {

    // ── signUp ──────────────────────────────────────────────────────────────
    // Creates a Supabase auth user, then links/creates the players row.
    // Email confirmation is disabled in Supabase dashboard for frictionless UX.
    if (action === 'signUp') {
      const { email, password, name, handicap, dob } = body;
      if (!email || !password) return respond(400, { error: 'Email and password required' });

      const { data, error } = await supabaseAnon.auth.signUp({ email, password });
      if (error) return respond(400, { error: error.message });
      if (!data.session) {
        // Email confirmation pending (email confirmation enabled in Supabase dashboard)
        return respond(200, { needsConfirmation: true });
      }

      const authUserId = data.user.id;
      const playerName = await linkOrCreatePlayer(authUserId, email, name, handicap, dob);

      return respond(200, {
        session: buildSession(data.session),
        playerName,
      });
    }

    // ── signInPassword ──────────────────────────────────────────────────────
    if (action === 'signInPassword') {
      const { email, password } = body;
      if (!email || !password) return respond(400, { error: 'Email and password required' });

      const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
      if (error) return respond(401, { error: 'Incorrect email or password' });

      const resolved = await resolvePlayer(data.user.id);
      if (!resolved) {
        // Auth user exists but no player row — create one
        const playerName = await linkOrCreatePlayer(data.user.id, email, null, 0, null);
        return respond(200, {
          session: buildSession(data.session),
          playerName,
          groupCodes: [],
        });
      }

      return respond(200, {
        session: buildSession(data.session),
        playerName: resolved.name,
        groupCodes: resolved.groupCodes,
      });
    }

    // ── sendMagicLink ───────────────────────────────────────────────────────
    // Sends a magic link email. User taps link → redirected to SITE_URL with
    // access_token + refresh_token in URL hash. Client reads these directly
    // (no second server round-trip needed).
    if (action === 'sendMagicLink') {
      const { email } = body;
      if (!email) return respond(400, { error: 'Email required' });

      const siteUrl = process.env.SITE_URL || 'https://looper.netlify.app';
      const { error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: siteUrl },
      });
      if (error) return respond(400, { error: error.message });

      return respond(200, { ok: true });
    }

    // ── getPlayerByAuthId ───────────────────────────────────────────────────
    // Called after magic link redirect to resolve player name from auth token.
    // Client sends the access token (from URL hash); we look up by auth user id.
    if (action === 'getPlayerByAuthId') {
      const { accessToken } = body;
      if (!accessToken) return respond(400, { error: 'accessToken required' });

      // Verify the access token and extract user id
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
      if (error || !user) return respond(401, { error: 'Invalid or expired token' });

      const resolved = await resolvePlayer(user.id);
      if (!resolved) {
        // Magic link for a new user who has no player row yet — they need to sign up
        return respond(200, {
          userId: user.id,
          email:  user.email,
          needsProfile: true,
        });
      }

      return respond(200, {
        userId:     user.id,
        playerName: resolved.name,
        groupCodes: resolved.groupCodes,
      });
    }

    // ── refreshSession ──────────────────────────────────────────────────────
    if (action === 'refreshSession') {
      const { refreshToken } = body;
      if (!refreshToken) return respond(400, { error: 'refreshToken required' });

      const { data, error } = await supabaseAnon.auth.setSession({
        access_token:  'placeholder', // required but ignored during refresh
        refresh_token: refreshToken,
      });
      if (error || !data.session) return respond(401, { error: 'Session expired — please sign in again' });

      const resolved = await resolvePlayer(data.user.id);
      return respond(200, {
        session:    buildSession(data.session),
        playerName: resolved?.name || null,
        groupCodes: resolved?.groupCodes || [],
      });
    }

    // ── signOut ─────────────────────────────────────────────────────────────
    if (action === 'signOut') {
      const { userId } = body;
      if (userId) {
        await supabaseAdmin.auth.admin.signOut(userId);
      }
      return respond(200, { ok: true });
    }

    return respond(400, { error: 'Unknown action: ' + action });

  } catch (err) {
    console.error('[auth] unhandled error in action', action, ':', err);
    return respond(500, { error: err.message || 'Internal server error' });
  }
};
