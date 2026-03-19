// netlify/functions/courses.js
// Secure proxy to golfcourseapi.com
// GOLF_API_KEY lives in Netlify environment variables only.

const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function httpsRequest(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
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

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GOLF_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'GOLF_API_KEY not configured in Netlify environment variables' }),
    };
  }

  const apiHeaders = {
    Authorization: `Key ${apiKey}`,
    'User-Agent': 'RobRoyGolfTracker/1.0',
  };

  const params = event.queryStringParameters || {};

  try {
    let path;
    if (params.id) {
      path = `/v1/courses/${encodeURIComponent(params.id)}`;
    } else if (params.search) {
      path = `/v1/search?search_query=${encodeURIComponent(params.search)}`;
    } else {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Provide search or id query parameter' }),
      };
    }

    const res = await httpsRequest('api.golfcourseapi.com', path, apiHeaders);
    return { statusCode: res.status, headers: CORS_HEADERS, body: res.body };
  } catch (e) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'API request failed', detail: e.message }),
    };
  }
};
