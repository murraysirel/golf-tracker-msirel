// netlify/functions/ai.js
// Secure proxy for all Anthropic API calls.
// Uses Node's built-in https module — works on all Node versions, no fetch required.
// ANTHROPIC_API_KEY lives in Netlify environment variables only — never in code or browser.

const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Promisified https POST
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const postData = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured in Netlify environment variables' }),
    };
  }

  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  // Validate messages
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Request must include a non-empty messages array' }),
    };
  }

  // Build safe payload — only forward known fields
  const payload = {
    model: body.model || 'claude-sonnet-4-6',
    max_tokens: Math.min(Number(body.max_tokens) || 1000, 2000),
    messages: body.messages,
  };

  // Forward to Anthropic
  let result;
  try {
    result = await httpsPost(
      'api.anthropic.com',
      '/v1/messages',
      {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      JSON.stringify(payload)
    );
  } catch (e) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Network error reaching Anthropic API', detail: e.message }),
    };
  }

  // Parse Anthropic response
  let data;
  try {
    data = JSON.parse(result.body);
  } catch (e) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Non-JSON response from Anthropic', raw: result.body.slice(0, 300) }),
    };
  }

  // If Anthropic returned an error, surface it clearly
  if (result.status !== 200) {
    return {
      statusCode: result.status,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: data?.error?.message || `Anthropic returned ${result.status}`,
        type: data?.error?.type,
        full: data,
      }),
    };
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
};
