// netlify/functions/migrate-gist-to-supabase.js
// One-time migration: reads all data from GitHub Gist and upserts to Supabase.
// Triggered by GET /.netlify/functions/migrate-gist-to-supabase
// Protected by x-admin-key header (must match SYNC_SECRET).

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const GIST_ID = '089c0ed169b5c67dbd8846002b3def45';

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Admin-key guard
  const adminKey = event.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.SYNC_SECRET) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorised' }) };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'GITHUB_TOKEN not configured' }) };
  }

  // ── 1. Read Gist ─────────────────────────────────────────────────
  let gistData;
  try {
    const res = await httpsGet('api.github.com', `/gists/${GIST_ID}`, {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'LooperMigration/1.0'
    });
    if (res.status !== 200) throw new Error(`Gist fetch failed: ${res.status}`);
    const parsed = JSON.parse(res.body);
    const content = parsed.files?.['golf_data.json']?.content || '{}';
    gistData = JSON.parse(content);
  } catch (e) {
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to read Gist', detail: e.message }) };
  }

  if (!gistData.players || typeof gistData.players !== 'object') {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'No players found in Gist data' }) };
  }

  const groupCode = gistData.activeGroupCode || gistData.groupCode || '';

  // ── 2. Upsert to Supabase ────────────────────────────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  let playerCount = 0;
  let roundCount = 0;
  const errors = [];

  for (const [playerName, playerObj] of Object.entries(gistData.players)) {
    // Upsert player
    const { error: pErr } = await supabase.from('players').upsert({
      name: playerName,
      email: playerObj.email || null,
      group_code: groupCode,
      handicap: playerObj.handicap || 0,
      match_code: playerObj.matchCode || null
    }, { onConflict: 'name,group_code' });

    if (pErr) {
      errors.push(`Player ${playerName}: ${pErr.message}`);
      continue;
    }
    playerCount++;

    // Upsert each round
    const rounds = playerObj.rounds || [];
    for (const r of rounds) {
      const { error: rErr } = await supabase.from('rounds').upsert({
        id: Math.round(r.id),
        player_name: r.player || playerName,
        group_code: groupCode,
        course: r.course,
        loc: r.loc || null,
        tee: r.tee || null,
        date: r.date || null,
        scores: r.scores || null,
        putts: r.putts || null,
        fir: r.fir || null,
        gir: r.gir || null,
        pars: r.pars || null,
        notes: r.notes || null,
        total_score: r.totalScore || null,
        total_par: r.totalPar || null,
        diff: r.diff != null ? r.diff : null,
        birdies: r.birdies || 0,
        pars_count: r.parsCount || 0,
        bogeys: r.bogeys || 0,
        doubles: r.doubles || 0,
        eagles: r.eagles || 0,
        penalties: r.penalties || 0,
        bunkers: r.bunkers || 0,
        chips: r.chips || 0,
        rating: r.rating || null,
        slope: r.slope || null,
        ai_review: r.aiReview || null,
        wolf_result: r.wolfResult || null,
        match_result: r.matchResult || null
      }, { onConflict: 'id' });

      if (rErr) {
        errors.push(`Round ${r.id} (${playerName}): ${rErr.message}`);
      } else {
        roundCount++;
      }
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ players: playerCount, rounds: roundCount, errors })
  };
};
