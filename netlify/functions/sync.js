// netlify/functions/sync.js
// Secure proxy between the app and GitHub Gist.
// Uses Node's built-in https module — works on all Node versions, no fetch required.
// GITHUB_TOKEN lives in Netlify environment variables only — never in code or browser.

const https = require('https');

const GIST_ID = '089c0ed169b5c67dbd8846002b3def45';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
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

  // ── GET — load all data ────────────────────────────────────────
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
    if (!parsed || typeof parsed !== 'object') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid data format' }),
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
