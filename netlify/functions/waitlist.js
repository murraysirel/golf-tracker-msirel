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

async function sendConfirmationEmail(email, name, isFounder, signupNumber) {
  const firstName = name ? name.split(' ')[0] : 'there';
  const founderLine = isFounder
    ? `You're signup number ${signupNumber} — which means you're in the first 50. That means 6 months of Looper completely free when we launch.`
    : `You're on the waitlist at number ${signupNumber}. We'll be in touch the moment we launch.`;

  const payload = JSON.stringify({
    from: 'Looper <hello@loopercaddie.co.uk>',
    reply_to: 'hello@loopercaddie.co.uk',
    to: email,
    subject: "You're on the Looper waitlist",
    html: `
      <div style="background:#0A1628;padding:40px;font-family:sans-serif;color:#F0E8D0;">
        <h1 style="color:#C9A84C;margin-bottom:8px;">LOOPER</h1>
        <p style="color:#8899BB;margin-top:0;">Your caddie in your pocket</p>
        <hr style="border-color:#1E3358;margin:24px 0;">
        <p>Hi ${firstName},</p>
        <p>${founderLine}</p>
        <p>We're putting the finishing touches on Looper and will be in
        touch very soon. Follow us on Instagram for updates as we get
        closer to launch.</p>
        <p style="margin-top:32px;">
          <a href="https://instagram.com/loopercaddie"
             style="background:#C9A84C;color:#0A1628;padding:12px 24px;
             border-radius:8px;text-decoration:none;font-weight:bold;">
            Follow @loopercaddie
          </a>
        </p>
        <p style="margin-top:32px;color:#8899BB;font-size:13px;">
          — Murray, founder of Looper
        </p>
        <p style="margin-top:16px;color:#4a5a7a;font-size:11px;">
          Please don't reply to this email. If you need to get in touch, email us at <a href="mailto:hello@loopercaddie.co.uk" style="color:#C9A84C;">hello@loopercaddie.co.uk</a>
        </p>
      </div>
    `
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', () => resolve({ error: 'email failed' }));
    req.write(payload);
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

    await sendConfirmationEmail(
      record.email,
      record.name,
      isFounder,
      result[0]?.signup_number
    );

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
