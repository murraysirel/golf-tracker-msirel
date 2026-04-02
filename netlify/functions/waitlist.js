// netlify/functions/waitlist.js
// Receives Tally webhook → writes to Supabase waitlist table
// Last updated: 02 April 2026

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FOUNDER_LIMIT = 50;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sbPost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: `/rest/v1/${path}`,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function getCount() {
  return new Promise((resolve) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: '/rest/v1/waitlist?select=id&is_founder=eq.false',
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'count=exact',
      }
    };
    const req = https.request(options, res => {
      const count = parseInt(
        res.headers['content-range']?.split('/')[1] || '0'
      );
      resolve(count);
    });
    req.on('error', () => resolve(0));
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS')
    return { statusCode: 204, headers: CORS };

  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  try {
    const body = JSON.parse(event.body || '{}');
    const fields = body.data?.fields || [];

    const get = (label) => fields.find(
      f => f.label?.toLowerCase().includes(label.toLowerCase())
    )?.value || null;

    const email = get('email');
    if (!email) return {
      statusCode: 400, headers: CORS,
      body: JSON.stringify({ error: 'Email required' })
    };

    const currentCount = await getCount();
    const isFounder = currentCount < FOUNDER_LIMIT;

    const record = {
      email: email.toLowerCase().trim(),
      name: get('name'),
      group_size: get('group'),
      how_found: get('how'),
      gdpr_consent: true,
      is_founder: isFounder,
    };

    const result = await sbPost('waitlist', record);

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        signup_number: result[0]?.signup_number,
        is_founder: isFounder,
        spots_remaining: Math.max(0, FOUNDER_LIMIT - currentCount - 1),
      })
    };
  } catch (err) {
    console.error('[waitlist]', err);
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ error: 'Server error' })
    };
  }
};
