// netlify/functions/run-seed-demo.js
// Admin-panel trigger for seeding the DEMO01 group in Supabase.
// The browser calls this with no secret — SYNC_SECRET is injected server-side.

const https = require('https');

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function httpsRequest(method, hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
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
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'SYNC_SECRET not configured' }) };
  }

  const reset = event.queryStringParameters?.reset === 'true';
  const siteUrl = process.env.URL || 'http://localhost:8888';
  const url = new URL(`/.netlify/functions/seed-demo${reset ? '?reset=true' : ''}`, siteUrl);

  try {
    const res = await httpsRequest('GET', url.hostname, url.pathname + url.search, {
      'x-admin-key': adminKey,
      'Accept': 'application/json',
    });
    let parsed;
    try { parsed = JSON.parse(res.body); } catch (_) { parsed = { raw: res.body }; }
    return { statusCode: res.status, headers: CORS_HEADERS, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to reach seed function', detail: err.message }) };
  }
};
