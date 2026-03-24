// netlify/functions/sync.js
// Secure proxy between the app and GitHub Gist.
// Uses Node's built-in https module — works on all Node versions, no fetch required.
// GITHUB_TOKEN lives in Netlify environment variables only — never in code or browser.

// ─── SECURITY MAINTENANCE ───────────────────────────────────────────
// GitHub token rotation: rotate GITHUB_TOKEN every 90 days
// Last rotated: [DATE — update this when you rotate]
// To rotate: GitHub → Settings → Developer settings → Personal access
// tokens → Tokens (classic) → regenerate → update in Netlify env vars
// ────────────────────────────────────────────────────────────────────

console.warn('[Looper] sync.js loaded — ensure GITHUB_TOKEN is set in Netlify env vars');

const https = require('https');

const GIST_ID = '089c0ed169b5c67dbd8846002b3def45';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

// ── Part 3: In-memory rate limiting ───────────────────────────────
// NOTE: Netlify serverless functions do not persist memory between cold
// starts, so this resets when the function container is recycled.
// This is acceptable — it prevents sustained abuse within a session
// without requiring an external database.
const writeCounts = {}; // { [ip]: { count: number, windowStart: number } }

// ── Part 2: Schema validation ──────────────────────────────────────
// Intentionally loose — rejects obviously malformed/malicious payloads
// without enforcing strict typing on every round field (too brittle).
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validatePayload(data) {
  if (!isPlainObject(data)) return false;

  // players must be a plain object
  if (!isPlainObject(data.players)) return false;

  // Each player value must have a rounds array; handicap is optional but must be a number if present
  for (const player of Object.values(data.players)) {
    if (!isPlainObject(player)) return false;
    if (!Array.isArray(player.rounds)) return false;
    if (player.handicap !== undefined && typeof player.handicap !== 'number') return false;
  }

  // groupCode, if present, must be a 6-character alphanumeric string
  if (data.groupCode !== undefined) {
    if (typeof data.groupCode !== 'string' || !/^[A-Z0-9]{6}$/i.test(data.groupCode)) return false;
  }

  // Optional top-level fields must be the right type if present
  if (data.customCourses !== undefined && !isPlainObject(data.customCourses)) return false;
  if (data.deletionLog !== undefined && !Array.isArray(data.deletionLog)) return false;
  if (data.seasons !== undefined && !Array.isArray(data.seasons)) return false;

  return true;
}

function httpsRequest(method, hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (postData) reqHeaders['Content-Length'] = Buffer.byteLength(postData);

    const req = https.request({ hostname, path, method, headers: reqHeaders }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

exports.handler = async (event) => {
  // CORS preflight — no auth required
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'GITHUB_TOKEN not configured in Netlify environment variables' }),
    };
  }

  const ghHeaders = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'RobRoyGolfTracker/1.0',
  };

  // ── GET — load all data (read-only, no auth required) ─────────
  if (event.httpMethod === 'GET') {
    try {
      const res = await httpsRequest('GET', 'api.github.com', `/gists/${GIST_ID}`, ghHeaders, null);
      if (res.status !== 200) throw new Error(`GitHub ${res.status}: ${res.body.slice(0, 100)}`);
      const j = JSON.parse(res.body);
      const content = j.files?.['golf_data.json']?.content || '{}';
      return { statusCode: 200, headers: CORS_HEADERS, body: content };
    } catch (e) {
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Failed to load from Gist', detail: e.message }),
      };
    }
  }

  // ── POST — save all data ───────────────────────────────────────
  if (event.httpMethod === 'POST') {

    // Rate limiting — 60 writes per hour per IP
    const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim()
              || event.headers['client-ip']
              || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const limit = 60;

    if (!writeCounts[ip] || now - writeCounts[ip].windowStart > windowMs) {
      writeCounts[ip] = { count: 1, windowStart: now };
    } else {
      writeCounts[ip].count++;
    }

    if (writeCounts[ip].count > limit) {
      return {
        statusCode: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Too many requests — try again later' }),
      };
    }

    // Parse body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    if (!body.data) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing data field' }),
      };
    }

    const parsed = typeof body.data === 'string' ? JSON.parse(body.data) : body.data;

    // Part 2: Schema validation
    if (!validatePayload(parsed)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid payload structure' }),
      };
    }

    const content = typeof body.data === 'string' ? body.data : JSON.stringify(body.data);
    const patchBody = JSON.stringify({ files: { 'golf_data.json': { content } } });

    try {
      const res = await httpsRequest('PATCH', 'api.github.com', `/gists/${GIST_ID}`, ghHeaders, patchBody);
      if (res.status !== 200) throw new Error(`GitHub ${res.status}: ${res.body.slice(0, 100)}`);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, saved: new Date().toISOString() }),
      };
    } catch (e) {
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Failed to save to Gist', detail: e.message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
};
