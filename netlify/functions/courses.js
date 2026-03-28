// ============================================================
// netlify/functions/courses.js
// GolfAPI.io integration — search (Supabase-only), fetch on
// selection, api_call_log monitoring, data repair admin action.
//
// Architecture:
//   Search  → Supabase ONLY.  Zero GolfAPI calls during search.
//   Fetch   → Supabase if has_hole_data=true, else ONE GolfAPI call.
//   The admin/import-courses.js script pre-populates the directory.
// ============================================================

const https = require('https');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const GOLFAPI_KEY   = process.env.GOLFAPI_KEY;
const SYNC_SECRET   = process.env.SYNC_SECRET;   // Used to protect admin actions
const GOLFAPI_BASE  = 'www.golfapi.io';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Generic HTTPS helpers ──────────────────────────────────────────────────────
function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: 'Invalid JSON', raw: data.slice(0, 500) }); }
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
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: 'Invalid JSON' }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── GolfAPI helpers ────────────────────────────────────────────────────────────
const golfApiHeaders = () => ({ Authorization: `Bearer ${GOLFAPI_KEY}` });

async function golfApiSearchClubs(name, country) {
  const countryParam = (country && country !== 'all') ? `&country=${encodeURIComponent(country)}` : '';
  return httpsGet(GOLFAPI_BASE, `/api/v2.3/clubs?name=${encodeURIComponent(name)}${countryParam}`, golfApiHeaders());
}

async function golfApiGetCourse(courseId) {
  return httpsGet(GOLFAPI_BASE, `/api/v2.3/courses/${courseId}`, golfApiHeaders());
}

async function golfApiGetCoordinates(courseId) {
  return httpsGet(GOLFAPI_BASE, `/api/v2.3/coordinates/${courseId}`, golfApiHeaders());
}

// ── Coordinate parser ─────────────────────────────────────────────────────────
// poi=1 = green; location: 1=back, 2=middle, 3=front
// poi=11 = back tee marker
function parseCoordinates(rawCoords) {
  const holes = {};
  for (const c of (rawCoords || [])) {
    const h = c.hole;
    if (!holes[h]) holes[h] = { green: {}, tee: null };
    if (c.poi === 1) {
      if (c.location === 3) holes[h].green.front  = { lat: c.latitude, lng: c.longitude };
      if (c.location === 2) holes[h].green.middle = { lat: c.latitude, lng: c.longitude };
      if (c.location === 1) holes[h].green.back   = { lat: c.latitude, lng: c.longitude };
    }
    if (c.poi === 11 && c.location === 2) {
      holes[h].tee = { lat: c.latitude, lng: c.longitude };
    }
  }
  return holes;
}

// ── Validate parsed hole data ─────────────────────────────────────────────────
// Returns { valid: bool, reason: string }
function validateHoleData(tees) {
  if (!Array.isArray(tees) || tees.length === 0) {
    return { valid: false, reason: 'No tees found in API response' };
  }

  // Find a tee with full hole data
  const teesWithHoles = tees.filter(t =>
    Array.isArray(t.pars_per_hole) && t.pars_per_hole.length === 18
  );
  if (teesWithHoles.length === 0) {
    return { valid: false, reason: 'No tee has 18 holes of par data' };
  }

  // Check every tee with hole data
  for (const tee of teesWithHoles) {
    const pars = tee.pars_per_hole;
    const si   = tee.si_per_hole;

    // Every par must be 3, 4, or 5
    if (pars.some(p => p < 3 || p > 5)) {
      return { valid: false, reason: `Tee "${tee.name}": par value out of range 3–5` };
    }

    // All pars must not be 4 — that's the default-fallback signature
    if (pars.every(p => p === 4)) {
      return { valid: false, reason: `Tee "${tee.name}": all 18 holes are par 4 — likely default fallback data, not real course data` };
    }

    // Stroke indexes: if present, must be 1–18 with no duplicates
    if (Array.isArray(si) && si.length === 18) {
      if (si.some(v => v < 1 || v > 18)) {
        return { valid: false, reason: `Tee "${tee.name}": stroke index out of range 1–18` };
      }
      const siSet = new Set(si);
      if (siSet.size !== 18) {
        return { valid: false, reason: `Tee "${tee.name}": duplicate stroke index values` };
      }
    }
  }

  // At least one tee must have yardage data
  const hasYardage = tees.some(t =>
    Array.isArray(t.yards_per_hole) && t.yards_per_hole.some(y => y > 0)
  );
  if (!hasYardage) {
    return { valid: false, reason: 'No yardage data found in any tee' };
  }

  return { valid: true, reason: 'ok' };
}

// ── Parse full course detail from GolfAPI response ────────────────────────────
function parseCourseDetail(clubData, rawCourseData, coordData) {
  // GolfAPI may wrap in { course: {...} } or { data: {...} } — unwrap defensively
  const courseData = rawCourseData?.course || rawCourseData?.data || rawCourseData;

  console.log('[courses] parseCourseDetail top-level keys:', Object.keys(courseData || {}));
  console.log('[courses] tees count:', (courseData?.tees || []).length,
    '| first-tee holes:', courseData?.tees?.[0]?.holes?.length ?? 'n/a');

  const tees = (courseData.tees || []).map(t => ({
    colour:         mapTeeColour(t.teeName || t.name || ''),
    name:           t.teeName || t.name || 'Unknown',
    yardage:        t.totalLength || t.yardage || null,
    rating:         parseFloat(t.courseRating || t.rating) || null,
    slope:          parseInt(t.slopeRating   || t.slope)   || null,
    yards_per_hole: (t.holes || []).map(h => h.length || h.yards || 0),
    pars_per_hole:  (t.holes || []).map(h => parseInt(h.par)   || 4),
    si_per_hole:    (() => { const arr = (t.holes || []).map(h => parseInt(h.strokeIndex || h.handicap) || 0); return arr.some(v => v > 0) ? arr : null; })(),
  }));

  const firstTee = courseData.tees?.[0];
  const pars = firstTee?.holes?.length === 18
    ? firstTee.holes.map(h => parseInt(h.par) || 4)
    : Array(18).fill(4);

  const si = firstTee?.holes?.[0]?.strokeIndex !== undefined
    ? firstTee.holes.map(h => parseInt(h.strokeIndex || h.handicap) || 0)
    : [];

  const greenCoords = coordData?.coordinates
    ? parseCoordinates(coordData.coordinates)
    : {};

  const overallPar = pars.reduce((a, b) => a + b, 0);

  return {
    external_club_id:   String(clubData.clubID   || ''),
    external_course_id: String(courseData.courseID || ''),
    name:        courseData.courseName || clubData.clubName || 'Unknown Course',
    club_name:   clubData.clubName || '',
    location:    [clubData.city?.trim(), clubData.state, clubData.country].filter(Boolean).join(', '),
    country:     clubData.country || '',
    city:        clubData.city?.trim() || '',
    holes:       parseInt(courseData.numHoles) || 18,
    tees,
    pars,
    stroke_indexes: si,
    overall_par: overallPar,
    tee_types:   tees.map(t => t.name),
    green_coords:   greenCoords,
    has_gps:        Object.keys(greenCoords).length > 0,
    has_hole_data:  false,  // Will be set to true after validation passes
    data_source:    'golfapi_v2',
    data_quality:   'api',
    report_count:   0,
  };
}

// Map a GolfAPI tee name to our standard colour key
function mapTeeColour(teeName) {
  const n = (teeName || '').toLowerCase();
  if (/black|champion/.test(n)) return 'black';
  if (/blue|back/.test(n))      return 'blue';
  if (/white|medal|mens|men/.test(n)) return 'white';
  if (/yellow|gents|standard|forward|senior/.test(n)) return 'yellow';
  if (/red|ladi|women/.test(n)) return 'red';
  return n.replace(/\s+/g, '_') || 'white';
}

// ── Supabase helpers ───────────────────────────────────────────────────────────
const sbHost    = () => new URL(SUPABASE_URL).hostname;
const sbPath    = (table, qs = '') => `/rest/v1/${table}${qs ? '?' + qs : ''}`;
const sbHeaders = (extra = {}) => ({
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer:        'return=representation',
  ...extra,
});

async function sbSelect(table, qs) {
  const result = await httpsGet(sbHost(), sbPath(table, qs), sbHeaders());
  if (!Array.isArray(result)) {
    const msg = result?.message || result?.error || JSON.stringify(result).slice(0, 200);
    console.error(`[courses] sbSelect(${table}) Supabase error:`, msg);
    throw new Error(`Supabase query failed: ${msg}`);
  }
  return result;
}

async function sbUpsert(table, data) {
  return httpsPost(
    sbHost(),
    sbPath(table, 'on_conflict=external_course_id'),
    { ...data, updated_at: new Date().toISOString() },
    sbHeaders({ Prefer: 'return=representation,resolution=merge-duplicates' }),
  );
}

async function sbUpdate(table, data, qs) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = https.request({
      hostname: sbHost(),
      path:     sbPath(table, qs),
      method:   'PATCH',
      headers:  { ...sbHeaders(), 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve([]); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sbInsert(table, data) {
  return httpsPost(sbHost(), sbPath(table), data, sbHeaders());
}

// ── Log an API call to api_call_log ───────────────────────────────────────────
async function logCall(endpoint, courseName, wasCacheHit, details = {}) {
  try {
    await sbInsert('api_call_log', {
      timestamp:    new Date().toISOString(),
      endpoint,
      course_name:  courseName || null,
      was_cache_hit: wasCacheHit,
      details:      Object.keys(details).length > 0 ? details : null,
    });
  } catch (e) {
    // Non-critical — don't let logging failures break the request
    console.warn('[courses] api_call_log write failed:', e?.message);
  }
}

// ── Search Supabase (ONLY — no GolfAPI fallback) ──────────────────────────────
async function searchCache(name, country) {
  // Only select columns guaranteed to exist in the base courses table schema.
  // overall_par and tee_types require migration 001_courses_extra_columns.sql —
  // omit them here to avoid a PGRST204 column-not-found error.
  let qs = `select=id,external_course_id,external_club_id,name,location,country,has_hole_data&name=ilike.*${encodeURIComponent(name)}*&limit=12`;
  if (country && country !== 'all') qs += `&country=ilike.*${encodeURIComponent(country)}*`;
  return sbSelect('courses', qs);
}

// ── Load full detail from Supabase cache ───────────────────────────────────────
async function loadCachedDetail(courseId) {
  const rows = await sbSelect('courses',
    `external_course_id=eq.${encodeURIComponent(courseId)}&select=*&limit=1`
  );
  return rows[0] || null;
}

// ── Check if cached detail has valid hole data ─────────────────────────────────
function cacheHasGoodHoleData(row) {
  if (!row || row.has_hole_data !== true) return false;
  if (!Array.isArray(row.tees) || row.tees.length === 0) return false;
  const t0 = row.tees[0];
  if (!Array.isArray(t0?.pars_per_hole) || t0.pars_per_hole.length !== 18) return false;
  // Extra guard: reject if all pars are 4 (corrupted fallback data)
  if (t0.pars_per_hole.every(p => p === 4)) return false;
  return true;
}

// ── Main handler ───────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS };
  }

  const action  = event.queryStringParameters?.action || 'search';
  const respond = (status, body) => ({
    statusCode: status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {

  // ── ACTION: search ──────────────────────────────────────────────────────────
  // Tier 1: Supabase directory. Tier 2: GolfAPI.io fallback if directory empty.
  if (action === 'search') {
    const name    = event.queryStringParameters?.name    || '';
    const country = event.queryStringParameters?.country || 'all';

    if (name.length < 2) return respond(400, { error: 'Name too short' });

    // 1. Try Supabase first
    let courses = [];
    try {
      courses = await searchCache(name, country);
    } catch (e) {
      // Log the error but fall through to GolfAPI — don't block search on Supabase issues
      console.error('[courses] searchCache error (falling through to GolfAPI):', e?.message);
    }

    if (courses.length > 0) {
      logCall('search', name, true, { country, results: courses.length });
      return respond(200, { courses: courses.map(c => ({ ...c, cached: true })), source: 'cache' });
    }

    // 2. Supabase empty — fall back to GolfAPI.io (costs 0.1 credits per call)
    if (GOLFAPI_KEY) {
      try {
        const apiRes = await golfApiSearchClubs(name, country);
        const clubs  = apiRes?.clubs || apiRes?.data || [];
        const requestsLeft = apiRes?.apiRequestsLeft ?? null;
        if (Array.isArray(clubs) && clubs.length > 0) {
          const mapped = [];
          for (const club of clubs) {
            const coursesInClub = Array.isArray(club.courses) && club.courses.length > 0
              ? club.courses
              : [{ id: club.id, course_name: club.club_name || club.name || '' }];
            for (const course of coursesInClub) {
              if (!course.id) continue;
              mapped.push({
                external_course_id: String(course.id),
                external_club_id:   String(club.club_id || club.id || ''),
                name:      course.course_name || club.club_name || '',
                location:  [club.city, club.state, club.country].filter(Boolean).join(', '),
                country:   club.country || country,
                has_hole_data: false,
              });
            }
          }
          if (mapped.length > 0) {
            // Cache results back to Supabase so next search hits DB (fire-and-forget)
            Promise.all(mapped.map(c => sbUpsert('courses', c))).catch(() => {});
            logCall('search', name, false, { country, results: mapped.length, source: 'api_fallback', apiRequestsLeft: requestsLeft });
            return respond(200, { courses: mapped, source: 'api' });
          }
        }
      } catch (apiErr) {
        console.error('[courses] GolfAPI fallback error:', apiErr?.message);
      }
    }

    logCall('search', name, false, { country, results: 0 });
    return respond(200, {
      courses: [],
      source: 'cache_empty',
      hint: 'No courses found. Try a different spelling or country filter.',
    });
  }

  // ── ACTION: fetch ───────────────────────────────────────────────────────────
  // Called once when a user selects a course.
  // Returns from Supabase if has_hole_data=true and data is valid.
  // Falls back to ONE GolfAPI call if not yet cached.
  if (action === 'fetch') {
    const courseId = event.queryStringParameters?.courseId;
    const clubId   = event.queryStringParameters?.clubId;

    if (!courseId) return respond(400, { error: 'Missing courseId' });

    // 1. Check Supabase for valid cached hole data
    let cached = null;
    try {
      cached = await loadCachedDetail(courseId);
    } catch (e) {
      console.error('[courses] loadCachedDetail error:', e?.message);
    }

    if (cacheHasGoodHoleData(cached)) {
      logCall('fetch', cached.name, true, { courseId, source: 'cache' });
      return respond(200, { course: cached, source: 'cache' });
    }

    // 2. Not cached with good data — fetch from GolfAPI (ONE call, cached forever after)
    if (!GOLFAPI_KEY) {
      return respond(503, { error: 'Course details are not available — API key not configured.' });
    }

    console.log('[courses] Cache miss for', courseId, '— fetching from GolfAPI');

    let courseData, coordData, fetchRequestsLeft;
    try {
      [courseData, coordData] = await Promise.all([
        golfApiGetCourse(courseId),
        golfApiGetCoordinates(courseId),
      ]);
      fetchRequestsLeft = courseData?.apiRequestsLeft ?? coordData?.apiRequestsLeft ?? null;
    } catch (e) {
      console.error('[courses] GolfAPI fetch error:', e?.message);
      logCall('fetch', courseId, false, { courseId, error: e?.message, stage: 'network' });
      return respond(502, { error: 'Could not reach course data service — please try again.' });
    }

    if (courseData?.error) {
      console.error('[courses] GolfAPI returned error:', courseData.error);
      logCall('fetch', courseId, false, { courseId, error: courseData.error, stage: 'api_error' });
      return respond(502, { error: 'Course details incomplete — please try again.' });
    }

    // 3. Parse the response
    const unwrapped = courseData?.course || courseData?.data || courseData;
    const clubData = {
      clubID:   clubId || unwrapped.clubID || '',
      clubName: unwrapped.clubName || unwrapped.courseName || '',
      city:     unwrapped.city || '',
      state:    unwrapped.state || '',
      country:  unwrapped.country || 'UK',
    };

    const parsed = parseCourseDetail(clubData, courseData, coordData);

    // 4. Validate before saving — if validation fails, do NOT write to Supabase
    const validation = validateHoleData(parsed.tees);
    if (!validation.valid) {
      console.error('[courses] Validation failed for', courseId, ':', validation.reason);
      // Log the raw response for debugging
      logCall('fetch', parsed.name, false, {
        courseId,
        error: validation.reason,
        stage: 'validation_failed',
        raw_tees_count:       (unwrapped?.tees || []).length,
        raw_first_tee_holes:  unwrapped?.tees?.[0]?.holes?.length ?? 'n/a',
      });
      return respond(422, {
        error: 'Course details incomplete — please try again.',
        debug: validation.reason,
      });
    }

    // 5. Validation passed — mark as having good data and save
    parsed.has_hole_data = true;

    // Strip fields not yet in the courses table schema before writing.
    // The full parsed object (with club_name, city, holes, has_gps etc.) is
    // still returned to the frontend below. Run migration 001_courses_extra_columns.sql
    // to store these fields in Supabase permanently.
    const { club_name, city, holes, has_gps, data_source, data_quality, report_count, pars, stroke_indexes, ...dbSafe } = parsed;
    const saved = await sbUpsert('courses', dbSafe);
    const record = Array.isArray(saved)
      ? { ...saved[0], club_name, city, holes, has_gps, pars, stroke_indexes }
      : { ...parsed };

    logCall('fetch', parsed.name, false, { courseId, source: 'api', tees: parsed.tees.length, apiRequestsLeft: fetchRequestsLeft ?? null });

    return respond(200, { course: record, source: 'api' });
  }

  // ── ACTION: fix-bad-data ────────────────────────────────────────────────────
  // Admin action: find all courses in Supabase where hole data is corrupted
  // (all pars = 4, or fewer than 18 holes, or invalid pars) and reset
  // has_hole_data = false so they will be re-fetched on next user selection.
  //
  // Protected by SYNC_SECRET.
  // Usage: GET /.netlify/functions/courses?action=fix-bad-data&secret=<SYNC_SECRET>
  if (action === 'fix-bad-data') {
    if (SYNC_SECRET && event.queryStringParameters?.secret !== SYNC_SECRET) {
      return respond(401, { error: 'Unauthorised' });
    }

    let allCourses = [];
    try {
      // Fetch all courses that currently have has_hole_data = true
      allCourses = await sbSelect('courses',
        'has_hole_data=eq.true&select=id,external_course_id,name,tees&limit=1000'
      );
    } catch (e) {
      return respond(500, { error: 'Failed to query courses', detail: e?.message });
    }

    const toReset = [];

    for (const course of allCourses) {
      // Check 1: tees must be a non-empty array
      if (!Array.isArray(course.tees) || course.tees.length === 0) {
        toReset.push({ id: course.id, name: course.name, reason: 'no tees array' });
        continue;
      }

      const t0 = course.tees[0];

      // Check 2: first tee must have pars_per_hole with 18 entries
      if (!Array.isArray(t0?.pars_per_hole) || t0.pars_per_hole.length !== 18) {
        toReset.push({ id: course.id, name: course.name, reason: 'pars_per_hole missing or not 18 entries' });
        continue;
      }

      // Check 3: pars must be 3–5 (not all defaulted to 4)
      if (t0.pars_per_hole.every(p => p === 4)) {
        toReset.push({ id: course.id, name: course.name, reason: 'all pars are 4 (default fallback data)' });
        continue;
      }

      // Check 4: any par outside 3–5 range
      if (t0.pars_per_hole.some(p => p < 3 || p > 5)) {
        toReset.push({ id: course.id, name: course.name, reason: 'par value outside 3–5 range' });
        continue;
      }

      // Check 5: if SI present, must be 1–18 with no duplicates
      if (Array.isArray(t0.si_per_hole) && t0.si_per_hole.length === 18) {
        if (t0.si_per_hole.some(v => v < 1 || v > 18) || new Set(t0.si_per_hole).size !== 18) {
          toReset.push({ id: course.id, name: course.name, reason: 'invalid stroke index data' });
          continue;
        }
      }
    }

    if (toReset.length === 0) {
      return respond(200, { reset: 0, message: 'No corrupted records found — all looks clean.' });
    }

    // Reset has_hole_data = false for each bad record individually
    let resetCount = 0;
    const errors = [];
    for (const c of toReset) {
      try {
        await sbUpdate('courses',
          { has_hole_data: false, updated_at: new Date().toISOString() },
          `id=eq.${encodeURIComponent(c.id)}`
        );
        resetCount++;
        console.log(`[courses] reset has_hole_data for: ${c.name} (${c.reason})`);
      } catch (e) {
        errors.push({ id: c.id, name: c.name, error: e?.message });
      }
    }

    return respond(200, {
      reset:   resetCount,
      errors:  errors.length,
      details: toReset.map(c => ({ name: c.name, reason: c.reason })),
      message: `Reset ${resetCount} corrupted course records. They will be re-fetched from GolfAPI on next user selection.`,
    });
  }

  // ── ACTION: report ──────────────────────────────────────────────────────────
  if (action === 'report' && event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { course_id, player_name, group_code, issue } = body;

      if (!course_id || !issue) return respond(400, { error: 'Missing fields' });

      await sbInsert('course_reports', {
        course_id,
        player_name: player_name || 'Unknown',
        group_code:  group_code  || '',
        issue,
        created_at: new Date().toISOString(),
      });

      return respond(200, { ok: true });
    } catch (e) {
      console.error('[courses] report error:', e?.message);
      return respond(500, { error: 'Failed to save report' });
    }
  }

  // ── ACTION: inspect (debug) ─────────────────────────────────────────────────
  // Returns the raw GolfAPI response so you can verify field names.
  // Usage: /.netlify/functions/courses?action=inspect&courseId=<id>&secret=<SYNC_SECRET>
  if (action === 'inspect') {
    if (SYNC_SECRET && event.queryStringParameters?.secret !== SYNC_SECRET) {
      return respond(401, { error: 'Unauthorised' });
    }
    const courseId = event.queryStringParameters?.courseId;
    if (!courseId) return respond(400, { error: 'Missing courseId' });
    if (!GOLFAPI_KEY) return respond(503, { error: 'No API key configured' });
    try {
      const [rawCourse, rawCoords] = await Promise.all([
        golfApiGetCourse(courseId),
        golfApiGetCoordinates(courseId),
      ]);
      return respond(200, {
        raw_course: rawCourse,
        raw_coords_sample: rawCoords?.coordinates?.slice(0, 3),
      });
    } catch (e) {
      console.error('[courses] inspect error:', e?.message);
      return respond(502, { error: 'GolfAPI request failed', detail: e?.message });
    }
  }

  // ── ACTION: usage ───────────────────────────────────────────────────────────
  // Returns the most recently recorded GolfAPI token balance from api_call_log.
  if (action === 'usage') {
    try {
      const rows = await sbSelect('api_call_log',
        `details->>apiRequestsLeft=not.is.null&order=timestamp.desc&limit=1&select=timestamp,details`
      );
      if (!rows.length) return respond(200, { apiRequestsLeft: null, lastChecked: null });
      return respond(200, {
        apiRequestsLeft: rows[0].details?.apiRequestsLeft ?? null,
        lastChecked: rows[0].timestamp,
      });
    } catch (e) {
      return respond(500, { error: 'Failed to query usage', detail: e?.message });
    }
  }

  // ── ACTION: diagnose ────────────────────────────────────────────────────────
  // Tests Supabase connectivity and key config. Protected by SYNC_SECRET.
  // Usage: GET /.netlify/functions/courses?action=diagnose&secret=<SYNC_SECRET>
  if (action === 'diagnose') {
    if (SYNC_SECRET && event.queryStringParameters?.secret !== SYNC_SECRET) {
      return respond(401, { error: 'Unauthorised' });
    }
    const result = {
      supabase_url_set:  !!SUPABASE_URL,
      supabase_key_set:  !!SUPABASE_KEY,
      golfapi_key_set:   !!GOLFAPI_KEY,
      sync_secret_set:   !!SYNC_SECRET,
      tables: {},
    };
    for (const table of ['courses', 'api_call_log']) {
      try {
        const rows = await sbSelect(table, 'limit=1&select=id');
        result.tables[table] = { ok: true, rows: rows.length };
      } catch (e) {
        result.tables[table] = { ok: false, error: e?.message };
      }
    }
    return respond(200, result);
  }

  return respond(404, { error: 'Unknown action' });

  } catch (err) {
    console.error('[courses] unhandled error in action', action, ':', err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
