#!/usr/bin/env node
// ============================================================
// admin/import-courses.js
// One-off bulk import of UK and Ireland courses from GolfAPI.io
// into the Supabase courses table (directory-level data only —
// no hole detail, no API detail calls).
//
// Run once manually. Safe to re-run: uses upsert on external_course_id.
//
// Usage:
//   node admin/import-courses.js
//
// Requires environment variables (set in .env or export before running):
//   GOLFAPI_KEY          — GolfAPI.io Bearer token
//   SUPABASE_URL         — Supabase project URL
//   SUPABASE_SERVICE_KEY — Supabase service-role key
//
// To load from a .env file automatically, install dotenv:
//   npm install dotenv
//   node -r dotenv/config admin/import-courses.js
// ============================================================

const DRY_RUN = true; // ← Set to false when ready to write to Supabase

// ── Load env vars ─────────────────────────────────────────────────────────────
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch {}

const GOLFAPI_KEY   = process.env.GOLFAPI_KEY;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!GOLFAPI_KEY)  { console.error('ERROR: GOLFAPI_KEY not set'); process.exit(1); }
if (!SUPABASE_URL) { console.error('ERROR: SUPABASE_URL not set'); process.exit(1); }
if (!SUPABASE_KEY) { console.error('ERROR: SUPABASE_SERVICE_KEY not set'); process.exit(1); }

const https = require('https');

// ── Countries to import ───────────────────────────────────────────────────────
// GolfAPI uses full country name strings as returned in their responses.
// Adjust these if GolfAPI uses different strings for your region.
const IMPORT_TARGETS = [
  { country: 'United Kingdom', code: 'GB' },
  { country: 'Ireland',        code: 'IE' },
];

// ── Search terms strategy ─────────────────────────────────────────────────────
// GolfAPI.io's search endpoint requires a name parameter. We use a-z prefix
// searches to sweep all clubs in the target country. Each search costs 0.1
// credits. Total: 26 letters × 2 countries = 52 searches = 5.2 credits.
// Results are deduplicated by external_course_id before writing.
const SEARCH_TERMS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Optional: add extra terms likely to catch courses that might slip through
// single-letter searches (e.g. very short club names like "R&A")
const EXTRA_TERMS = ['golf', 'links', 'park', 'heath', 'downs', 'manor', 'royal'];

const ALL_TERMS = [...SEARCH_TERMS, ...EXTRA_TERMS];

// ── HTTPS helpers ─────────────────────────────────────────────────────────────
function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: { error: 'Invalid JSON', raw: data.slice(0, 200) } }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: { error: 'Invalid JSON' } }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── GolfAPI helpers ───────────────────────────────────────────────────────────
const GOLFAPI_HOST = 'www.golfapi.io';
const golfHeaders  = () => ({ Authorization: `Bearer ${GOLFAPI_KEY}` });

async function searchClubs(name, country) {
  const path = `/api/v2.3/clubs?name=${encodeURIComponent(name)}&country=${encodeURIComponent(country)}`;
  const res = await httpsGet(GOLFAPI_HOST, path, golfHeaders());
  return res.body;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
const sbHost = () => new URL(SUPABASE_URL).hostname;
const sbHeaders = (extra = {}) => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
  ...extra,
});

async function sbUpsertBatch(rows) {
  // Upsert via POST with merge-duplicates on external_course_id
  const res = await httpsPost(
    sbHost(),
    '/rest/v1/courses?on_conflict=external_course_id',
    rows,
    sbHeaders({ Prefer: 'return=representation,resolution=merge-duplicates' }),
  );
  return res;
}

async function sbCountCourses() {
  const res = await httpsGet(
    sbHost(),
    '/rest/v1/courses?select=id&limit=1',
    { ...sbHeaders(), Prefer: 'count=exact' },
  );
  // Supabase returns count in Content-Range header; parse from response metadata if needed
  // For simplicity, just return the result length as a sanity check
  return Array.isArray(res.body) ? res.body.length : 0;
}

// ── Parse a GolfAPI search result into a directory-level row ──────────────────
// We only store basic info at import time. has_hole_data stays false.
// Full hole detail is fetched on first course selection by a user.
function parseClubsResponse(apiResult, countryCode) {
  const rows = [];
  for (const club of (apiResult.clubs || [])) {
    for (const course of (club.courses || [])) {
      // Skip non-18-hole courses unless they're 9-hole layouts (included)
      const numHoles = parseInt(course.numHoles) || 18;

      // Extract tee names if the search result includes them (often it doesn't at this level)
      const teeTypes = (course.tees || []).map(t => t.teeName || t.name).filter(Boolean);

      // Overall par: may be available as course.par or from tees
      const overallPar = course.par || null;

      rows.push({
        external_club_id:   String(club.clubID || ''),
        external_course_id: String(course.courseID || ''),
        name:               course.courseName || club.clubName || 'Unknown',
        club_name:          club.clubName || '',
        location:           [club.city?.trim(), club.state, club.country].filter(Boolean).join(', '),
        country:            club.country || countryCode,
        city:               club.city?.trim() || '',
        holes:              numHoles,
        has_gps:            course.hasGPS === 1,
        has_hole_data:      false,  // Will be set to true when full detail is fetched
        overall_par:        overallPar,
        tee_types:          teeTypes.length > 0 ? teeTypes : null,
        data_source:        'import_bulk',
        data_quality:       'directory',
        report_count:       0,
        // Leave tees, pars, stroke_indexes, green_coords null —
        // they are populated on first user selection
      });
    }
  }
  return rows;
}

// ── Sleep helper ──────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main import ───────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Looper Course Directory Import`);
  console.log(`  DRY_RUN = ${DRY_RUN}`);
  if (DRY_RUN) console.log('  (No data will be written to Supabase)');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const seen     = new Set();   // Deduplicate by external_course_id
  const allRows  = [];
  let   apiCalls = 0;
  const countsByCountry = {};

  for (const target of IMPORT_TARGETS) {
    console.log(`\n── ${target.country} (${target.code}) ──────────────────────────────`);
    let countryCount = 0;
    countsByCountry[target.code] = 0;

    for (const term of ALL_TERMS) {
      process.stdout.write(`  Searching "${term}" in ${target.country}... `);

      let apiResult;
      try {
        apiResult = await searchClubs(term, target.country);
        apiCalls++;
      } catch (e) {
        console.log(`ERROR: ${e.message}`);
        continue;
      }

      // Rate-limit guard: 200ms between calls
      await sleep(200);

      if (apiResult.error) {
        console.log(`API error: ${apiResult.error}`);
        continue;
      }

      const clubs   = apiResult.clubs || [];
      const rows    = parseClubsResponse(apiResult, target.code);
      let   newRows = 0;

      for (const row of rows) {
        if (!row.external_course_id || seen.has(row.external_course_id)) continue;
        seen.add(row.external_course_id);
        allRows.push(row);
        newRows++;
        countryCount++;
      }

      console.log(`${clubs.length} clubs → ${rows.length} courses → ${newRows} new (running total: ${allRows.length})`);
    }

    countsByCountry[target.code] = countryCount;
    console.log(`\n  ${target.country} subtotal: ${countryCount} unique courses`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Total unique courses found:  ${allRows.length}`);
  for (const [code, count] of Object.entries(countsByCountry)) {
    console.log(`    ${code}: ${count}`);
  }
  console.log(`  API calls used:              ${apiCalls}`);
  console.log(`  Estimated credit cost:       ${(apiCalls * 0.1).toFixed(1)} credits`);
  console.log('');

  if (DRY_RUN) {
    console.log('  DRY_RUN = true — nothing written to Supabase.');
    console.log('  Set DRY_RUN = false at the top of this file and re-run to import.');
    console.log('');

    // Show a sample of what would be imported
    console.log('  Sample rows (first 5):');
    for (const row of allRows.slice(0, 5)) {
      console.log(`    [${row.country}] ${row.name} — ${row.location} (id: ${row.external_course_id})`);
    }
    console.log('');
    return;
  }

  // ── Write to Supabase in batches of 50 ───────────────────────────────────────
  console.log(`  Writing ${allRows.length} courses to Supabase in batches of 50...`);
  console.log('');

  const BATCH_SIZE = 50;
  let written = 0;
  let errors  = 0;

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const result = await sbUpsertBatch(batch);

    if (result.status >= 400) {
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} ERROR (HTTP ${result.status}):`, JSON.stringify(result.body).slice(0, 200));
      errors += batch.length;
    } else {
      written += batch.length;
      process.stdout.write(`  Stored ${batch.length} courses (running total: ${written}/${allRows.length})\r`);
    }

    // Rate-limit guard: don't hammer Supabase
    if (i + BATCH_SIZE < allRows.length) await sleep(100);
  }

  console.log('');
  console.log('');
  console.log('  ✅ Import complete.');
  console.log(`     Written:  ${written}`);
  console.log(`     Errors:   ${errors}`);
  console.log('');
  console.log('  Next steps:');
  console.log('  1. Deploy the updated netlify/functions/courses.js');
  console.log('  2. Run the fix-bad-data action to reset any corrupted hole data:');
  console.log('     curl "https://<your-site>/.netlify/functions/courses?action=fix-bad-data&secret=<SYNC_SECRET>"');
  console.log('');
}

main().catch(e => {
  console.error('\nFATAL ERROR:', e.message);
  process.exit(1);
});
