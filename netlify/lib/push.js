// netlify/lib/push.js
// Shared APNs push notification helper. Zero npm dependencies — uses Node built-in http2 + crypto.
// Imported by supabase.js (to send after notification inserts) and functions/push.js (token mgmt).

const http2 = require('http2');
const crypto = require('crypto');

// ── APNs JWT (cached across warm Lambda invocations) ────────────────
let _jwt = null;
let _jwtExp = 0;

function _getJwt() {
  const now = Math.floor(Date.now() / 1000);
  if (_jwt && _jwtExp > now) return _jwt;

  const header = Buffer.from(JSON.stringify({
    alg: 'ES256', kid: process.env.APNS_KEY_ID
  })).toString('base64url');

  const claims = Buffer.from(JSON.stringify({
    iss: process.env.APNS_TEAM_ID, iat: now
  })).toString('base64url');

  const input = `${header}.${claims}`;
  const key = crypto.createPrivateKey(process.env.APNS_KEY_P8.replace(/\\n/g, '\n'));
  const sig = crypto.sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });

  _jwt = `${input}.${sig.toString('base64url')}`;
  _jwtExp = now + 3300; // 55 min (APNs tokens valid 60 min)
  return _jwt;
}

// ── Notification copy ───────────────────────────────────────────────
const TEMPLATES = {
  friend_request:  { title: 'Friend Request',  body: '{from} sent you a friend request' },
  friend_accepted: { title: 'Friend Accepted', body: '{from} accepted your friend request' },
  round_liked:     { title: 'Round Liked',      body: '{from} liked your round at {course}' },
  round_comment:   { title: 'New Comment',      body: '{from}: {text}' },
  live_invite:     { title: 'Live Round',        body: '{from} is playing at {course} — join in!' },
  join_request:    { title: 'Join Request',      body: '{from} wants to join your group' },
  join_approved:   { title: 'Group Joined',      body: "You've been approved to join the group" },
};

function _buildPayload(type, fromPlayer, extra) {
  const tpl = TEMPLATES[type];
  if (!tpl) return null;
  const body = tpl.body
    .replace('{from}', fromPlayer || 'Someone')
    .replace('{course}', extra?.course || 'a course')
    .replace('{text}', extra?.text || '');
  return {
    aps: {
      alert: { title: tpl.title, body },
      sound: 'default',
      badge: 1,
      'thread-id': type,
    },
    type,
    ...(extra || {}),
  };
}

// ── APNs HTTP/2 send ────────────────────────────────────────────────
const APNS_HOST = 'api.push.apple.com';
const APNS_TOPIC = 'com.loopercaddie.app';

function _send(token, payload) {
  return new Promise(resolve => {
    let session;
    const timeout = setTimeout(() => {
      try { session?.close(); } catch (_) {}
      resolve({ gone: false });
    }, 8000);

    try {
      session = http2.connect(`https://${APNS_HOST}`);
    } catch (_) {
      clearTimeout(timeout);
      return resolve({ gone: false });
    }

    session.on('error', () => {
      clearTimeout(timeout);
      try { session.close(); } catch (_) {}
      resolve({ gone: false });
    });

    const body = JSON.stringify(payload);
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      'authorization': `bearer ${_getJwt()}`,
      'apns-topic': APNS_TOPIC,
      'apns-push-type': 'alert',
      'apns-expiration': '0',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    });

    let respData = '';
    let status = 0;
    req.on('response', (headers) => { status = headers[':status']; });
    req.on('data', c => { respData += c; });
    req.on('end', () => {
      clearTimeout(timeout);
      try { session.close(); } catch (_) {}
      const gone = status === 410 || (status === 400 && respData.includes('BadDeviceToken'));
      resolve({ gone });
    });
    req.on('error', () => {
      clearTimeout(timeout);
      try { session.close(); } catch (_) {}
      resolve({ gone: false });
    });

    req.write(body);
    req.end();
  });
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Send a push notification to all of a player's registered devices.
 * Fire-and-forget: never throws, never blocks the caller.
 *
 * @param {object} supabase  - Supabase admin client
 * @param {string} playerName - Recipient
 * @param {object} opts
 * @param {string} opts.type       - Notification type key (must match TEMPLATES)
 * @param {string} opts.fromPlayer - Sender name (for copy)
 * @param {object} [opts.payload]  - Extra data ({ course, text, roundId, ... })
 */
async function sendPushToPlayer(supabase, playerName, { type, fromPlayer, payload }) {
  if (!process.env.APNS_KEY_P8 || !playerName) return;

  try {
    const { data: tokens } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('player_name', playerName);

    if (!tokens?.length) return;

    const apnsPayload = _buildPayload(type, fromPlayer, payload);
    if (!apnsPayload) return;

    const gone = [];
    await Promise.all(tokens.map(async ({ token }) => {
      const result = await _send(token, apnsPayload);
      if (result.gone) gone.push(token);
    }));

    // Clean up invalid tokens
    if (gone.length) {
      await supabase.from('device_tokens').delete().in('token', gone).catch(() => {});
    }
  } catch (_) {
    // Never throw — push is best-effort
  }
}

module.exports = { sendPushToPlayer };
