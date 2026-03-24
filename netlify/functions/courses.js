// ============================================================
// netlify/functions/courses.js
// GolfAPI.io integration — search, fetch, cache, report
// Save this file as: netlify/functions/courses.js
// Last updated: 24 March 2026
// ============================================================
 
const https = require('https');
 
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const GOLFAPI_KEY   = process.env.GOLFAPI_KEY;  // Add to Netlify env vars
const GOLFAPI_BASE  = 'www.golfapi.io';
 
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
 
// ── Generic HTTPS request helper ──────────────────────────────────────────────
function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = { hostname, path, method: 'GET', headers };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: 'Invalid JSON', raw: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
 
function httpsPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers }
    };
    const req = https.request(options, res => {
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
 
// ── GolfAPI.io helpers ─────────────────────────────────────────────────────────
const golfApiHeaders = () => ({ 'Authorization': `Bearer ${GOLFAPI_KEY}` });
 
// Search clubs by name (costs 0.1 credits — only called on cache miss)
async function golfApiSearchClubs(name, country) {
  let path = `/api/v2.3/clubs?name=${encodeURIComponent(name)}`;
  if (country && country !== 'all') path += `&country=${encodeURIComponent(country)}`;
  return httpsGet(GOLFAPI_BASE, path, golfApiHeaders());
}
 
// Fetch full course detail (costs 1 credit)
async function golfApiGetCourse(courseId) {
  return httpsGet(GOLFAPI_BASE, `/api/v2.3/courses/${courseId}`, golfApiHeaders());
}
 
// Fetch coordinates (costs 1 credit)
async function golfApiGetCoordinates(courseId) {
  return httpsGet(GOLFAPI_BASE, `/api/v2.3/coordinates/${courseId}`, golfApiHeaders());
}
 
// ── Parse coordinates into clean per-hole structure ───────────────────────────
// poi=1 is the green. location: 1=back, 2=middle, 3=front
// poi=2 is tee box. poi=11/12 are tee markers.
function parseCoordinates(rawCoords) {
  const holes = {};
 
  for (const c of rawCoords) {
    const h = c.hole;
    if (!holes[h]) holes[h] = { green: {}, tee: null, hazards: [] };
 
    if (c.poi === 1) {
      // Green coordinates — front/middle/back
      if (c.location === 3) holes[h].green.front  = { lat: c.latitude, lng: c.longitude };
      if (c.location === 2) holes[h].green.middle = { lat: c.latitude, lng: c.longitude };
      if (c.location === 1) holes[h].green.back   = { lat: c.latitude, lng: c.longitude };
    }
 
    if (c.poi === 11 && c.location === 2) {
      // Back tee marker (poi=11 is the main tee reference point)
      holes[h].tee = { lat: c.latitude, lng: c.longitude };
    }
  }
 
  return holes; // { 1: { green: {front, middle, back}, tee: {lat,lng} }, 2: ... }
}
 
// ── Parse course detail into our schema ───────────────────────────────────────
function parseCourseDetail(clubData, courseData, coordData) {
  // Build tees array from course data
  const tees = (courseData.tees || []).map(t => ({
    colour:         (t.teeName || t.name || 'unknown').toLowerCase().replace(/\s+/g, '_'),
    name:           t.teeName || t.name || 'Unknown',
    yardage:        t.totalLength || t.yardage || null,
    rating:         parseFloat(t.courseRating || t.rating) || null,
    slope:          parseInt(t.slopeRating || t.slope) || null,
    yards_per_hole: (t.holes || []).map(h => h.length || h.yards || 0),
    pars_per_hole:  (t.holes || []).map(h => h.par || 4),
    si_per_hole:    (t.holes || []).map(h => h.strokeIndex || h.handicap || 0),
  }));
 
  // Pars — use first tee as master (they should all share the same pars)
  const firstTee = courseData.tees?.[0];
  const pars = firstTee?.holes?.length === 18
    ? firstTee.holes.map(h => h.par || 4)
    : Array(18).fill(4);
 
  // Stroke indexes — from first tee if available
  const si = firstTee?.holes?.[0]?.strokeIndex !== undefined
    ? firstTee.holes.map(h => h.strokeIndex || 0)
    : [];
 
  // Coordinates
  const greenCoords = coordData?.coordinates
    ? parseCoordinates(coordData.coordinates)
    : {};
 
  return {
    external_club_id: String(clubData.clubID || ''),
    external_course_id: String(courseData.courseID || ''),
    name:           courseData.courseName || clubData.clubName || 'Unknown Course',
    club_name:      clubData.clubName || '',
    location:       [clubData.city?.trim(), clubData.state, clubData.country].filter(Boolean).join(', '),
    country:        clubData.country || '',
    city:           clubData.city?.trim() || '',
    holes:          parseInt(courseData.numHoles) || 18,
    tees,
    pars,
    stroke_indexes: si,
    green_coords:   greenCoords,
    has_gps:        Object.keys(greenCoords).length > 0,
    data_source:    'golfapi_v2',
    data_quality:   'api',
    report_count:   0,
  };
}
 
// ── Supabase helpers ───────────────────────────────────────────────────────────
const sbHost = () => new URL(SUPABASE_URL).hostname;
const sbPath = (table, qs = '') => `/rest/v1/${table}${qs ? '?' + qs : ''}`;
const sbHeaders = (extra = {}) => ({
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
  ...extra
});
 
async function sbSelect(table, qs) {
  const result = await httpsGet(sbHost(), sbPath(table, qs), sbHeaders());
  return Array.isArray(result) ? result : [];
}
 
async function sbUpsert(table, data) {
  return httpsPost(
    sbHost(),
    sbPath(table, 'on_conflict=external_course_id'),
    { ...data, updated_at: new Date().toISOString() },
    sbHeaders({ 'Prefer': 'return=representation,resolution=merge-duplicates' })
  );
}
 
async function sbInsert(table, data) {
  return httpsPost(sbHost(), sbPath(table), data, sbHeaders());
}
 
// ── Search Supabase cache first ────────────────────────────────────────────────
async function searchCache(name, country) {
  let qs = `select=id,external_course_id,external_club_id,name,club_name,location,country,city,holes,tees,pars,stroke_indexes,green_coords,has_gps,data_source&name=ilike.*${encodeURIComponent(name)}*&limit=10`;
  if (country && country !== 'all') qs += `&country=ilike.*${encodeURIComponent(country)}*`;
  return sbSelect('courses', qs);
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
    body: JSON.stringify(body)
  });
 
  // ── ACTION: search ─────────────────────────────────────────────────────────
  // Called on every keypress (debounced). Checks Supabase first, then GolfAPI.
  if (action === 'search') {
    const name    = event.queryStringParameters?.name || '';
    const country = event.queryStringParameters?.country || 'all';
 
    if (name.length < 2) return respond(400, { error: 'Name too short' });
 
    // 1. Supabase cache check — free, instant
    const cached = await searchCache(name, country);
    if (cached.length > 0) {
      return respond(200, { courses: cached, source: 'cache' });
    }
 
    // 2. GolfAPI.io search — costs 0.1 credits, only on cache miss
    if (!GOLFAPI_KEY) return respond(200, { courses: [], source: 'no_key' });
 
    const apiResult = await golfApiSearchClubs(name, country);
    if (!apiResult?.clubs?.length) {
      return respond(200, { courses: [], source: 'api_empty' });
    }
 
    // Return slim search results to the frontend (no credits spent on detail yet)
    // Each result includes clubID + courseID so frontend can request full detail on selection
    const results = [];
    for (const club of apiResult.clubs.slice(0, 8)) {
      for (const course of (club.courses || [])) {
        results.push({
          // These IDs are used to fetch full detail on selection
          external_club_id:   String(club.clubID),
          external_course_id: String(course.courseID),
          name:       course.courseName || club.clubName,
          club_name:  club.clubName,
          location:   [club.city?.trim(), club.state, club.country].filter(Boolean).join(', '),
          country:    club.country,
          city:       club.city?.trim(),
          holes:      course.numHoles,
          has_gps:    course.hasGPS === 1,
          cached:     false,
        });
      }
    }
 
    return respond(200, { courses: results, source: 'api' });
  }
 
  // ── ACTION: fetch ──────────────────────────────────────────────────────────
  // Called once when a player selects a course from search results.
  // Fetches full detail + coordinates, saves to Supabase, returns complete record.
  if (action === 'fetch') {
    const courseId = event.queryStringParameters?.courseId;
    const clubId   = event.queryStringParameters?.clubId;
 
    if (!courseId) return respond(400, { error: 'Missing courseId' });
 
    // Check if already fully cached in Supabase
    const existing = await sbSelect('courses',
      `external_course_id=eq.${encodeURIComponent(courseId)}&select=*&limit=1`
    );
    if (existing.length > 0 && existing[0].pars?.length === 18) {
      return respond(200, { course: existing[0], source: 'cache' });
    }
 
    // Not cached — fetch from GolfAPI (costs 2 credits: course + coordinates)
    if (!GOLFAPI_KEY) return respond(503, { error: 'No API key configured' });
 
    const [courseData, coordData] = await Promise.all([
      golfApiGetCourse(courseId),
      golfApiGetCoordinates(courseId),
    ]);
 
    if (courseData.error) return respond(502, { error: 'GolfAPI course fetch failed' });
 
    // We need club data — either from a prior search result or fetch the club
    let clubData = { clubID: clubId, clubName: courseData.clubName || '', city: courseData.city || '', state: courseData.state || '', country: courseData.country || 'UK' };
 
    const parsed = parseCourseDetail(clubData, courseData, coordData);
 
    // Save to Supabase — this is the "cache once" write
    const saved = await sbUpsert('courses', parsed);
    const record = Array.isArray(saved) ? saved[0] : parsed;
 
    return respond(200, { course: record, source: 'api' });
  }
 
  // ── ACTION: report ─────────────────────────────────────────────────────────
  // Player flags incorrect data on a course. Logged for Murray to review.
  if (action === 'report' && event.httpMethod === 'POST') {
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
  }
 
  return respond(404, { error: 'Unknown action' });
};
 
