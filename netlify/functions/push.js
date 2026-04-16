// netlify/functions/push.js
// Client-facing push token management: registerToken, removeToken.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function makeHeaders(event) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': event?.headers?.origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

exports.handler = async (event) => {
  const headers = makeHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let action, data;
  try {
    ({ action, data } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    if (action === 'registerToken') {
      const { playerName, token, platform } = data || {};
      if (!playerName || !token) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName and token required' }) };
      }
      await supabase.from('device_tokens').upsert(
        { player_name: playerName, token, platform: platform || 'ios' },
        { onConflict: 'player_name,token', ignoreDuplicates: true }
      );
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'removeToken') {
      const { playerName, token } = data || {};
      if (!playerName || !token) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName and token required' }) };
      }
      await supabase.from('device_tokens')
        .delete()
        .eq('player_name', playerName)
        .eq('token', token);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
