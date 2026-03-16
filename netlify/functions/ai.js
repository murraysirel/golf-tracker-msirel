// netlify/functions/ai.js
// Secure proxy for all Anthropic API calls.
// The ANTHROPIC_API_KEY environment variable lives on Netlify's servers only —
// it is never exposed to the browser or stored in the codebase.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server not configured — ANTHROPIC_API_KEY missing' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // Validate required fields
  if (!body.messages || !Array.isArray(body.messages)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing messages array' }) };
  }

  // Build the Anthropic request — only forward safe fields
  const anthropicPayload = {
    model: body.model || 'claude-sonnet-4-20250514',
    max_tokens: Math.min(body.max_tokens || 1000, 2000), // cap at 2000
    messages: body.messages,
  };

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicPayload),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: data?.error?.message || `Anthropic API error ${res.status}` }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (e) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Failed to reach Anthropic API', detail: e.message }),
    };
  }
};
