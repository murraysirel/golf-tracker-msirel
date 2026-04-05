// netlify/functions/auth.js
// Supabase Auth proxy for Looper — all auth traffic goes through here
// so SUPABASE_SERVICE_KEY and SUPABASE_ANON_KEY never reach the browser.

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

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

// ── Helper: track which device/browser has an active session ────────────────
async function trackSession(userId, sessionId, deviceHint) {
  if (!userId || !sessionId) return;
  await supabaseAdmin.from('user_sessions').upsert(
    { id: sessionId, user_id: userId, device_hint: deviceHint || 'Unknown device', last_seen_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
}

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
      .update({
        auth_user_id: authUserId,
        ...(dob      ? { dob }                              : {}),
        ...(handicap ? { handicap: parseFloat(handicap) || 0 } : {}),
      })
      .eq('name', byEmail.name);
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

// ── Helper: send welcome email via Resend ────────────────────────────────────
async function sendWelcomeEmail(email, playerName) {
  if (!process.env.RESEND_API_KEY) return;
  const firstName = playerName ? playerName.split(' ')[0] : 'there';
  const payload = JSON.stringify({
    from: 'Looper <hello@loopercaddie.co.uk>',
    reply_to: 'hello@loopercaddie.co.uk',
    to: email,
    subject: 'Welcome to Looper',
    html: `
      <div style="background:#0A1628;padding:40px;font-family:sans-serif;color:#F0E8D0;">
        <h1 style="color:#C9A84C;margin-bottom:8px;">LOOPER</h1>
        <p style="color:#8899BB;margin-top:0;">Your caddie in your pocket</p>
        <hr style="border-color:#1E3358;margin:24px 0;">
        <p>Hi ${firstName},</p>
        <p>You're in. Looper is ready to track your game.</p>
        <p style="margin-top:16px;font-weight:bold;color:#C9A84C;">Here's what to do next:</p>
        <ol style="color:#8899BB;line-height:2;padding-left:20px;">
          <li>Join or create a league with your mates</li>
          <li>Play your first round — we'll handle the scoring</li>
          <li>Check your stats after — your AI caddie will have notes</li>
        </ol>
        <p style="margin-top:16px;">The more you play, the smarter Looper gets. Every round builds your dataset, and your coaching gets more personal over time.</p>
        <p style="margin-top:24px;">
          <a href="https://instagram.com/loopercaddie"
             style="background:#C9A84C;color:#0A1628;padding:12px 24px;
             border-radius:8px;text-decoration:none;font-weight:bold;">
            Follow @loopercaddie
          </a>
        </p>
        <p style="margin-top:32px;color:#8899BB;font-size:13px;">
          See you on the first tee.<br>— Murray, founder of Looper
        </p>
        <p style="margin-top:16px;color:#4a5a7a;font-size:11px;">
          Please don't reply to this email. Contact us at <a href="mailto:hello@loopercaddie.co.uk" style="color:#C9A84C;">hello@loopercaddie.co.uk</a>
        </p>
      </div>
    `
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.resend.com', path: '/emails', method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });
}

// ── Helper: send magic link email via Resend ─────────────────────────────────
async function sendMagicLinkEmail(email, magicUrl) {
  if (!process.env.RESEND_API_KEY) return;
  const payload = JSON.stringify({
    from: 'Looper <hello@loopercaddie.co.uk>',
    reply_to: 'hello@loopercaddie.co.uk',
    to: email,
    subject: 'Your Looper sign-in link',
    html: `
      <div style="background:#0A1628;padding:40px;font-family:sans-serif;color:#F0E8D0;">
        <h1 style="color:#C9A84C;margin-bottom:8px;">LOOPER</h1>
        <p style="color:#8899BB;margin-top:0;">Your caddie in your pocket</p>
        <hr style="border-color:#1E3358;margin:24px 0;">
        <p>Tap the button below to sign in — no password needed.</p>
        <p style="margin-top:24px;">
          <a href="${magicUrl}" style="background:#C9A84C;color:#0A1628;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Sign in to Looper</a>
        </p>
        <p style="margin-top:24px;color:#4a5a7a;font-size:11px;">This link expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
      </div>
    `
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.resend.com', path: '/emails', method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });
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
      const { email, password, name, handicap, dob, sessionId, deviceHint } = body;
      if (!email || !password) return respond(400, { error: 'Email and password required' });

      const { data, error } = await supabaseAnon.auth.signUp({ email, password });
      if (error) return respond(400, { error: error.message });
      if (!data.session) {
        // Email confirmation pending (email confirmation enabled in Supabase dashboard)
        return respond(200, { needsConfirmation: true });
      }

      const authUserId = data.user.id;
      let playerName;
      try {
        playerName = await linkOrCreatePlayer(authUserId, email, name, handicap, dob);
      } catch (linkErr) {
        console.error('[auth] linkOrCreatePlayer failed:', linkErr.message);
        return respond(500, { error: 'Account created but profile setup failed — please try signing in' });
      }
      await trackSession(authUserId, sessionId, deviceHint);

      // Send welcome email (fire-and-forget, never blocks signup)
      sendWelcomeEmail(email, playerName).catch(() => {});

      return respond(200, {
        session: buildSession(data.session),
        playerName,
      });
    }

    // ── signInPassword ──────────────────────────────────────────────────────
    if (action === 'signInPassword') {
      const { email, password, sessionId, deviceHint } = body;
      if (!email || !password) return respond(400, { error: 'Email and password required' });

      const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
      if (error) return respond(401, { error: 'Incorrect email or password' });

      const resolved = await resolvePlayer(data.user.id);
      await trackSession(data.user.id, sessionId, deviceHint);

      if (!resolved) {
        // Auth user exists but no player row — create one
        let playerName;
        try {
          playerName = await linkOrCreatePlayer(data.user.id, email, null, 0, null);
        } catch (linkErr) {
          console.error('[auth] linkOrCreatePlayer on signIn failed:', linkErr.message);
          return respond(500, { error: 'Sign-in succeeded but profile setup failed — please try again' });
        }
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
      const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: siteUrl },
      });
      if (error) return respond(400, { error: error.message });

      // Extract magic URL — path varies between Supabase client versions
      const magicUrl = linkData?.properties?.action_link
        || (linkData?.properties?.hashed_token && (siteUrl + '#access_token=' + linkData.properties.hashed_token))
        || null;
      console.log('[auth] generateLink result:', JSON.stringify({
        hasLinkData: !!linkData,
        hasProps: !!linkData?.properties,
        propKeys: linkData?.properties ? Object.keys(linkData.properties) : [],
        hasActionLink: !!magicUrl,
      }));

      if (process.env.RESEND_API_KEY && magicUrl) {
        const result = await sendMagicLinkEmail(email, magicUrl).catch(e => { console.error('[auth] sendMagicLinkEmail error:', e); return null; });
        console.log('[auth] Resend response:', result);
      } else {
        console.warn('[auth] Magic link email NOT sent — no RESEND_API_KEY or no magicUrl');
      }

      return respond(200, { ok: true });
    }

    // ── resetPassword ─────────────────────────────────────────────────────
    if (action === 'resetPassword') {
      const { email } = body;
      if (!email) return respond(400, { error: 'Email required' });

      const siteUrl = process.env.SITE_URL || 'https://looper.netlify.app';
      const { error } = await supabaseAnon.auth.resetPasswordForEmail(email, {
        redirectTo: siteUrl + '/index.html',
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
      const { refreshToken, sessionId, deviceHint } = body;
      if (!refreshToken) return respond(400, { error: 'refreshToken required' });

      const { data, error } = await supabaseAnon.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error || !data.session) return respond(401, { error: 'Session expired — please sign in again' });

      await trackSession(data.user.id, sessionId, deviceHint);
      const resolved = await resolvePlayer(data.user.id);
      return respond(200, {
        session:    buildSession(data.session),
        playerName: resolved?.name || null,
        groupCodes: resolved?.groupCodes || [],
      });
    }

    // ── listSessions ────────────────────────────────────────────────────────
    if (action === 'listSessions') {
      const { accessToken } = body;
      if (!accessToken) return respond(400, { error: 'accessToken required' });

      const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
      if (error || !user) return respond(401, { error: 'Invalid or expired token' });

      const { data: sessions } = await supabaseAdmin
        .from('user_sessions')
        .select('id, device_hint, last_seen_at, created_at')
        .eq('user_id', user.id)
        .order('last_seen_at', { ascending: false });

      return respond(200, { sessions: sessions || [] });
    }

    // ── signOut ─────────────────────────────────────────────────────────────
    if (action === 'signOut') {
      const { accessToken, userId, sessionId, scope } = body;
      try {
        if (scope === 'global' && accessToken) {
          // Invalidate ALL sessions for this user in Supabase Auth
          await supabaseAdmin.auth.admin.signOut(accessToken, 'global');
          // Clean up our own tracking table for this user
          if (userId) {
            await supabaseAdmin.from('user_sessions').delete().eq('user_id', userId);
          }
        } else if (accessToken) {
          // Invalidate this session only
          await supabaseAdmin.auth.admin.signOut(accessToken, 'local');
          if (sessionId) {
            await supabaseAdmin.from('user_sessions').delete().eq('id', sessionId);
          }
        }
      } catch (_) {
        // Non-fatal — respond ok regardless so client still clears locally
      }
      return respond(200, { ok: true });
    }

    return respond(400, { error: 'Unknown action: ' + action });

  } catch (err) {
    console.error('[auth] unhandled error in action', action, ':', err);
    return respond(500, { error: err.message || 'Internal server error' });
  }
};
