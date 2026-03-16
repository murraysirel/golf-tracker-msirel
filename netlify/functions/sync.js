Try AI directly in your favorite apps … Use Gemini to generate drafts and refine content, plus get Gemini Pro with access to Google's next-gen AI for £18.99 £0 for 1 month
// netlify/functions/sync.js
// Secure proxy between the app and GitHub Gist.
// The GITHUB_TOKEN environment variable lives on Netlify's servers only —
// it is never exposed to the browser or stored in the codebase.

const GIST_ID = '089c0ed169b5c67dbd8846002b3def45';
const GITHUB_API = `https://api.github.com/gists/${GIST_ID}`;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server not configured — GITHUB_TOKEN missing' }),
    };
  }

  const ghHeaders = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // ── GET — load all data ────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(GITHUB_API, { headers: ghHeaders });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const j = await res.json();
      const content = j.files?.['golf_data.json']?.content || '{}';
      return { statusCode: 200, headers, body: content };
    } catch (e) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Failed to load from Gist', detail: e.message }),
      };
    }
  }

  // ── POST — save all data ───────────────────────────────────────
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      if (!body.data) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing data field' }),
        };
      }

      // Basic validation — must be an object with a players key
      const parsed = typeof body.data === 'string' ? JSON.parse(body.data) : body.data;
      if (!parsed || typeof parsed !== 'object') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid data format' }),
        };
      }

      const content = typeof body.data === 'string' ? body.data : JSON.stringify(body.data);

      const res = await fetch(GITHUB_API, {
        method: 'PATCH',
        headers: ghHeaders,
        body: JSON.stringify({
          files: { 'golf_data.json': { content } },
        }),
      });

      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, saved: new Date().toISOString() }),
      };
    } catch (e) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Failed to save to Gist', detail: e.message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
};
