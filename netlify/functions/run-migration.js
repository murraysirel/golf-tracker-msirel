// netlify/functions/run-migration.js
// Admin-panel trigger for the one-time Gist→Supabase migration.
// The browser calls this endpoint with no secret — the secret is injected
// server-side from the Netlify environment before forwarding to migrate-gist-to-supabase.

const https = require('https');

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const adminKey = process.env.SYNC_SECRET;
  if (!adminKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'SYNC_SECRET not configured in Netlify environment variables' }),
    };
  }

  // Resolve the site URL — Netlify injects process.env.URL in production,
  // fall back to localhost for local dev via netlify dev.
  const siteUrl = process.env.URL || 'http://localhost:8888';
  const url = new URL('/.netlify/functions/migrate-gist-to-supabase', siteUrl);

  try {
    const res = await httpsRequest(
      'GET',
      url.hostname,
      url.pathname,
      {
        'x-admin-key': adminKey,
        'Accept': 'application/json',
      },
      null
    );
    let parsed;
    try { parsed = JSON.parse(res.body); } catch (_) { parsed = { raw: res.body }; }
    return {
      statusCode: res.status,
      headers: CORS_HEADERS,
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to reach migration function', detail: err.message }),
    };
  }
};
