// ============================================================
// js/courses.js  — FULL REPLACEMENT
// Course search replacing static dropdown
// Last updated: 24 March 2026
// ============================================================
 
import { state } from './state.js';
import { buildSC } from './scorecard.js';
import { COURSES as BUILTIN_COURSES } from './constants.js';
 
const COURSES_API = '/.netlify/functions/courses';
 
// Country filter options — extend as needed
const COUNTRIES = [
  { value: 'all',     label: 'All countries' },
  { value: 'UK',      label: '🇬🇧 United Kingdom' },
  { value: 'Ireland', label: '🇮🇪 Ireland' },
  { value: 'USA',     label: '🇺🇸 United States' },
  { value: 'Spain',   label: '🇪🇸 Spain' },
  { value: 'Portugal',label: '🇵🇹 Portugal' },
  { value: 'France',  label: '🇫🇷 France' },
  { value: 'Australia',label:'🇦🇺 Australia' },
  { value: 'South Africa', label: '🇿🇦 South Africa' },
  { value: 'Sweden',  label: '🇸🇪 Sweden' },
  { value: 'Canada',  label: '🇨🇦 Canada' },
];

// SVG icons for country pills — simplified flag style (inline, no external assets)
const COUNTRY_PILL_SVG = {
  UK: `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="40" fill="#012169"/><path d="M0 0L60 40M60 0L0 40" stroke="#fff" stroke-width="6"/><path d="M0 0L60 40M60 0L0 40" stroke="#C8102E" stroke-width="3"/><path d="M30 0V40M0 20H60" stroke="#fff" stroke-width="10"/><path d="M30 0V40M0 20H60" stroke="#C8102E" stroke-width="6"/></svg>`,
  Ireland: `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="40" fill="#169B62"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#FF883E"/></svg>`,
  USA: `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="40" fill="#B22234"/><g fill="#fff"><rect y="3" width="60" height="3"/><rect y="9" width="60" height="3"/><rect y="15" width="60" height="3"/><rect y="21" width="60" height="3"/><rect y="27" width="60" height="3"/><rect y="33" width="60" height="3"/></g><rect width="24" height="21" fill="#3C3B6E"/><text x="12" y="13" fill="#fff" font-size="8" text-anchor="middle" font-family="sans-serif">★</text></svg>`,
  Spain: `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="10" fill="#c60b1e"/><rect y="10" width="60" height="20" fill="#ffc400"/><rect y="30" width="60" height="10" fill="#c60b1e"/></svg>`,
  Portugal: `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><rect width="22" height="40" fill="#006600"/><rect x="22" width="38" height="40" fill="#ff0000"/><circle cx="22" cy="20" r="7" fill="#ff0000" stroke="#ffc400" stroke-width="2"/></svg>`,
  France: `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="40" fill="#002654"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#CE1126"/></svg>`,
  all: `<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/><ellipse cx="9" cy="9" rx="3" ry="7" fill="none" stroke="currentColor" stroke-width="1"/><line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" stroke-width="1"/></svg>`,
};

let _activeCountry = 'UK';
 
let _searchTimer    = null;
let _lastResults    = [];
let _selectedCourse = null;
 
// ── Called from app.js on Round page load ─────────────────────────────────────
export function initCourseSearch() {
  const wrap = document.getElementById('course-search-container');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="cs-wrap">
      <div class="cs-input-row">
        <input
          id="cs-input"
          type="text"
          placeholder="Search for a course…"
          autocomplete="off"
          class="cs-input"
          style="border-radius:10px;border-top:1px solid var(--border)"
        />
        <span id="cs-spinner" class="cs-spinner" style="display:none">⏳</span>
      </div>
      <div id="cs-results"  class="cs-results"  style="display:none"></div>
      <div id="cs-selected" class="cs-selected" style="display:none"></div>
    </div>
  `;
  // Hidden select for backward compat with _runSearch reading country
  const hiddenSel = document.createElement('select');
  hiddenSel.id = 'cs-country';
  hiddenSel.style.display = 'none';
  COUNTRIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.value;
    opt.textContent = c.label;
    if (c.value === _activeCountry) opt.selected = true;
    hiddenSel.appendChild(opt);
  });
  wrap.appendChild(hiddenSel);

  document.getElementById('cs-input')
    ?.addEventListener('input', _onInput);

  // Render country pills
  renderCountryPills();
}

// ── Country pill strip ───────────────────────────────────────────────────────
export function renderCountryPills() {
  const strip = document.getElementById('country-pills-strip');
  if (!strip) return;
  const pillCountries = [
    { value: 'UK',      label: 'United Kingdom' },
    { value: 'Ireland', label: 'Ireland' },
    { value: 'USA',     label: 'USA' },
    { value: 'Spain',   label: 'Spain' },
    { value: 'Portugal',label: 'Portugal' },
    { value: 'France',  label: 'France' },
    { value: 'all',     label: 'All countries' },
  ];
  strip.innerHTML = pillCountries.map(c => {
    const svg = COUNTRY_PILL_SVG[c.value] || COUNTRY_PILL_SVG.all;
    const active = c.value === _activeCountry ? ' active' : '';
    return `<div class="country-pill${active}" data-country="${c.value}">${svg}<span class="country-pill-label">${c.label}</span></div>`;
  }).join('');
  strip.querySelectorAll('.country-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      _activeCountry = pill.dataset.country;
      // Update hidden select
      const sel = document.getElementById('cs-country');
      if (sel) sel.value = _activeCountry;
      // Re-render pills
      strip.querySelectorAll('.country-pill').forEach(p => p.classList.toggle('active', p.dataset.country === _activeCountry));
      // Re-trigger search if there's text
      const q = document.getElementById('cs-input')?.value?.trim();
      if (q && q.length >= 2) {
        clearTimeout(_searchTimer);
        _runSearch(q);
      }
    });
  });
}

// ── Tee pills (called after _applyCourse) ────────────────────────────────────
export function renderTeePills(course) {
  const placeholder = document.getElementById('tee-placeholder-card');
  const pillsCard = document.getElementById('tee-pills-card');
  const pillsRow = document.getElementById('tee-pills-row');
  const pillsInfo = document.getElementById('tee-pills-info');
  if (!pillsCard || !pillsRow) return;

  const tees = course?.tees || [];
  if (!tees.length) return;

  if (placeholder) placeholder.style.display = 'none';
  pillsCard.style.display = 'block';

  const TC_COLORS = { blue:'#3498db', yellow:'#f1c40f', white:'var(--cream)', red:'#e74c3c', black:'#555' };

  pillsRow.innerHTML = tees.map(t => {
    const colour = (t.colour || t.name || 'white').toLowerCase();
    const isActive = colour === state.stee;
    const textColor = TC_COLORS[colour] || 'var(--cream)';
    return `<div class="tee-pill${isActive ? ' active' : ''}" data-tee="${colour}" style="color:${textColor}">
      ${t.name || colour}
      ${t.yardage ? `<div style="font-size:8px;font-weight:500;color:var(--dim);margin-top:1px">${t.yardage}y</div>` : ''}
    </div>`;
  }).join('');

  // Show info for active tee
  const activeTee = tees.find(t => (t.colour || '').toLowerCase() === state.stee);
  if (pillsInfo && activeTee) {
    const parts = [];
    if (activeTee.rating) parts.push(`CR ${activeTee.rating}`);
    if (activeTee.slope) parts.push(`Slope ${activeTee.slope}`);
    if (activeTee.yardage) parts.push(`${activeTee.yardage} yards`);
    pillsInfo.textContent = parts.join(' · ');
  }

  pillsRow.querySelectorAll('.tee-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const tee = tees.find(t => (t.colour || '').toLowerCase() === pill.dataset.tee);
      if (tee) {
        _applyTee(tee);
        renderTeePills(course);
      }
    });
  });
}
 
// ── Debounced input handler ───────────────────────────────────────────────────
function _onInput() {
  clearTimeout(_searchTimer);
  const q = document.getElementById('cs-input')?.value?.trim() || '';
  _hideResults();
  if (q.length < 2) return;
  // 400ms — search hits Supabase only, but we still debounce to avoid spamming on
  // fast typists. No API calls fire during search under any circumstances.
  _searchTimer = setTimeout(() => _runSearch(q), 400);
}
 
async function _runSearch(q) {
  const country = document.getElementById('cs-country')?.value || 'all';
  _showSpinner(true);

  try {
    const url = `${COURSES_API}?action=search&name=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}`;
    const res  = await fetch(url);
    const data = await res.json();
    _lastResults = data.courses || [];

    // Built-in course fallback disabled — GolfAPI is live

    if (_lastResults.length === 0) {
      _showResultsMsg(data.hint || 'No courses found — try a different spelling or country filter.');
    } else {
      _renderResults(_lastResults);
    }
  } catch {
    _showResultsMsg('Search failed — check your connection and try again.');
  } finally {
    _showSpinner(false);
  }
}
 
// ── Render search result list ─────────────────────────────────────────────────
function _renderResults(courses) {
  const el = document.getElementById('cs-results');
  if (!el) return;
 
  if (courses.length === 0) {
    el.style.display = 'block';
    el.innerHTML = `<div class="cs-empty">No courses found. Try a different spelling or country filter.</div>`;
    return;
  }
 
  el.style.display = 'block';
  el.innerHTML = courses.map((c, i) => {
    // Green dot = hole data already cached (instant load, no API call on selection)
    const holeDataBadge = c.has_hole_data
      ? ' <span class="cs-holedata-badge" title="Full course data cached — loads instantly">●</span>'
      : '';
    // Par badge shown when available at directory level
    const parBadge = c.overall_par ? ` · <span class="cs-par-badge">Par ${c.overall_par}</span>` : '';

    return `
    <div class="cs-result" data-idx="${i}">
      <div class="cs-result-name">${c.name}${c.name !== c.club_name && c.club_name ? ` <span class="cs-result-club">· ${c.club_name}</span>` : ''}${holeDataBadge}</div>
      <div class="cs-result-meta">
        ${c.location || ''}${parBadge}
        ${c.holes && c.holes !== 18 ? ` · ${c.holes} holes` : ''}
        ${c.has_gps ? ' · <span class="cs-gps-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M9 16s-5-4.3-5-8.5a5 5 0 0 1 10 0C14 11.7 9 16 9 16z"/><circle cx="9" cy="7.5" r="1.5"/></svg> GPS</span>' : ''}
      </div>
    </div>`;
  }).join('');
 
  el.querySelectorAll('.cs-result').forEach(item => {
    item.addEventListener('click', () => _onSelectResult(parseInt(item.dataset.idx)));
  });
}
 
// ── Player selects a result ───────────────────────────────────────────────────
async function _onSelectResult(idx) {
  const result = _lastResults[idx];
  if (!result) return;

  _hideResults();

  // Built-in course: apply directly without API fetch
  if (result._builtin) {
    _applyCourse(result);
    return;
  }

  const fetchUrl = `${COURSES_API}?action=fetch&courseId=${encodeURIComponent(result.external_course_id)}&clubId=${encodeURIComponent(result.external_club_id || '')}`;

  // has_hole_data=true means valid hole data is already in Supabase — load from cache,
  // no GolfAPI call. Still goes through the fetch action so the server can return the
  // full row (the search result only has slim/directory-level fields).
  let cacheSucceeded = false;
  if (result.has_hole_data === true) {
    _showLoadingState('Loading course details…');
    try {
      const res  = await fetch(fetchUrl);
      const data = await res.json();
      if (data.course) { _applyCourse(data.course); cacheSucceeded = true; return; }
    } catch { /* fall through to live fetch */ }
    finally { _hideLoadingState(); }
  }
  if (cacheSucceeded) return;

  // Hole data not yet cached — server will make ONE GolfAPI call, validate, then save.
  _showLoadingState('Getting course details…');
  try {
    const res  = await fetch(fetchUrl);
    const data = await res.json();

    if (res.status === 422) {
      // Server-side validation failed — do not apply broken data
      _showResultsMsg('Course details incomplete — please try again. If this keeps happening, use "Report incorrect data".');
      return;
    }

    if (data.course) {
      _applyCourse(data.course);
    } else {
      // Unexpected error from server — apply slim result as best effort
      // (_applyTee will try the built-in fallback if pars are all-4)
      _applyCourse(result);
    }
  } catch {
    _applyCourse(result); // Network failure — best effort with slim data
  } finally {
    _hideLoadingState();
  }
}
 
// ── Apply selected course to app state ───────────────────────────────────────
// This is the equivalent of what onCourseChange() used to do with the dropdown.
function _applyCourse(course) {
  // Normalise tees: old Supabase schema stored tees as a { colour: {...} } object;
  // new GolfAPI schema stores as [{ colour, pars_per_hole, ... }] array.
  if (course.tees && !Array.isArray(course.tees)) {
    course = { ...course, tees: Object.entries(course.tees).map(([colour, t]) => ({ colour, ...t })) };
  }

  _selectedCourse = course;

  const tees = course.tees || [];
  const pars = course.pars || [];

  // Update core state
  state.cpars      = pars.length === 18 ? pars : Array(18).fill(4);
  state.activeCourse = course;
 
  // Store green coords in state for gps.js to consume.
  // Backend returns: { "1": { green: { front, middle, back }, tee: {lat,lng} }, "2": ... }
  // gps.js expects:  { 0: { front, mid, back }, 1: ... }  (0-indexed, 'mid' not 'middle')
  if (course.green_coords && Object.keys(course.green_coords).length > 0) {
    if (!state.gd.greenCoords) state.gd.greenCoords = {};
    if (!state.gd.teeCoords)   state.gd.teeCoords   = {};
    const greenMap = {};
    const teeMap   = {};
    Object.entries(course.green_coords).forEach(([holeNum, data]) => {
      const h0 = parseInt(holeNum) - 1;   // 1-indexed string → 0-indexed int
      const g  = data.green || {};
      greenMap[h0] = {
        front: g.front  || null,
        mid:   g.middle || g.mid || null, // API uses 'middle', gps.js reads 'mid'
        back:  g.back   || null,
      };
      if (data.tee) teeMap[h0] = data.tee;
    });
    state.gd.greenCoords[course.name] = greenMap;
    if (Object.keys(teeMap).length) state.gd.teeCoords[course.name] = teeMap;
  }
 
  // Apply first tee by default
  if (tees.length > 0) _applyTee(tees[0]);
 
  // Show selected course card with tee selector
  _renderSelectedCard(course);

  // Show tee pills
  renderTeePills(course);

  // Rebuild scorecard with new pars
  buildSC();

  // Update the input to show the selected course name
  const input = document.getElementById('cs-input');
  if (input) input.value = course.name;
}
 
function _applyTee(tee) {
  state.stee = tee.colour || tee.name?.toLowerCase() || 'white';
 
  const yards = tee.yards_per_hole;
  if (yards?.length === 18) state.activeHoleYards = yards;

  const pars = tee.pars_per_hole;
  if (pars?.length === 18) state.cpars = pars;

  // Guard: only use SI if at least one value is non-zero (all-zero = API returned nothing)
  const siArr = tee.si_per_hole;
  if (siArr?.length === 18 && siArr.some(v => v > 0)) {
    state.scannedSI = siArr;
  } else if (_selectedCourse?.stroke_indexes?.length === 18 && _selectedCourse.stroke_indexes.some(v => v > 0)) {
    state.scannedSI = _selectedCourse.stroke_indexes;
  } else {
    state.scannedSI = null; // no valid SI data — clear stale values
  }

  // Fallback: if pars are still all-4 (GolfAPI returned no per-hole data),
  // look up the course in the built-in constants and use its verified data.
  if (state.cpars.every(p => p === 4)) {
    const courseName = (_selectedCourse?.name || '').toLowerCase();
    const builtin = BUILTIN_COURSES.find(c => {
      if (c.name === 'Custom / Other') return false;
      const cn = c.name.toLowerCase();
      const nWords  = courseName.split(/\W+/).filter(w => w.length > 3).slice(0, 2).join(' ');
      const cnWords = cn.split(/\W+/).filter(w => w.length > 3).slice(0, 2).join(' ');
      return nWords && (courseName.includes(cnWords) || cn.includes(nWords));
    });
    if (builtin) {
      const colour = tee.colour || state.stee;
      const builtinTee = builtin.tees[colour] || builtin.tees[builtin.def] || Object.values(builtin.tees)[0];
      if (builtinTee?.pars_per_hole?.length === 18) {
        state.cpars = builtinTee.pars_per_hole;
        if (!state.activeHoleYards && builtinTee.yards_per_hole?.length === 18) {
          state.activeHoleYards = builtinTee.yards_per_hole;
        }
      }
    }
  }

  buildSC();
}
 
// ── Render the selected course card ──────────────────────────────────────────
function _renderSelectedCard(course) {
  const el = document.getElementById('cs-selected');
  if (!el) return;
 
  const tees = course.tees || [];
 
  el.style.display = 'block';
  el.innerHTML = `
    <div class="cs-card">
      <div class="cs-card-name">${course.name}</div>
      ${course.location ? `<div class="cs-card-loc">${course.location}</div>` : ''}
      ${course.has_gps ? `<div class="cs-gps-confirmed"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M9 16s-5-4.3-5-8.5a5 5 0 0 1 10 0C14 11.7 9 16 9 16z"/><circle cx="9" cy="7.5" r="1.5"/></svg> GPS distances available for this course</div>` : `<div class="cs-gps-none">No GPS data — you can pin greens manually during your round</div>`}

      <button id="cs-change-btn" style="display:block;width:100%;margin-top:10px;padding:9px 16px;border-radius:20px;background:var(--mid);border:1px solid var(--border);color:var(--cream);font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">← Change course</button>
      <button id="cs-report-btn" style="display:block;width:100%;margin-top:6px;padding:8px 16px;border-radius:20px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.35);color:var(--double);font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">⚑ Report incorrect data</button>
    </div>
  `;
 
  document.getElementById('cs-change-btn')
    ?.addEventListener('click', () => {
      el.style.display = 'none';
      const input = document.getElementById('cs-input');
      if (input) { input.value = ''; input.focus(); }
      _selectedCourse = null;
      state.activeCourse = null;
      // Reset tee pills
      const placeholder = document.getElementById('tee-placeholder-card');
      const pillsCard = document.getElementById('tee-pills-card');
      if (placeholder) placeholder.style.display = 'block';
      if (pillsCard) pillsCard.style.display = 'none';
    });
 
  document.getElementById('cs-report-btn')
    ?.addEventListener('click', () => _showReportModal(course));
}
 
// ── Report modal ──────────────────────────────────────────────────────────────
function _showReportModal(course) {
  document.getElementById('cs-report-modal')?.remove();
 
  const modal = document.createElement('div');
  modal.id = 'cs-report-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card" style="max-width:320px">
      <div class="ct">Report data issue</div>
      <div style="font-size:13px; color:var(--dim); margin-bottom:12px">${course.name}</div>
      <textarea
        id="cs-report-text"
        placeholder="What's wrong? e.g. wrong pars on holes 4 and 7, GPS coordinates seem off on back 9…"
        style="width:100%; min-height:80px; background:var(--mid); color:var(--cream); border:1px solid var(--border); border-radius:8px; padding:8px; font-size:13px; resize:vertical"
      ></textarea>
      <div style="display:flex; gap:8px; margin-top:12px">
        <button id="cs-report-send" class="btn" style="flex:1">Send report</button>
        <button id="cs-report-cancel" class="btn-ghost" style="flex:1">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
 
  document.getElementById('cs-report-cancel')
    ?.addEventListener('click', () => modal.remove());
 
  document.getElementById('cs-report-send')
    ?.addEventListener('click', async () => {
      const issue = document.getElementById('cs-report-text')?.value?.trim();
      if (!issue) return;
 
      try {
        await fetch(`${COURSES_API}?action=report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            course_id:   course.id || course.external_course_id,
            player_name: state.me,
            group_code:  state.gd?.activeGroupCode || '',
            issue,
          }),
        });
      } catch { /* non-critical, silent fail */ }
 
      modal.remove();
      // Show brief confirmation
      const conf = document.createElement('div');
      conf.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--card);color:var(--cream);padding:10px 18px;border-radius:20px;font-size:13px;z-index:999;border:1px solid var(--border)';
      conf.textContent = 'Report sent — thanks for the feedback';
      document.body.appendChild(conf);
      setTimeout(() => conf.remove(), 3000);
    });
}
 
// ── Utility helpers ───────────────────────────────────────────────────────────
function _showSpinner(show) {
  const el = document.getElementById('cs-spinner');
  if (el) el.style.display = show ? 'inline' : 'none';
}
 
function _hideResults() {
  const el = document.getElementById('cs-results');
  if (el) el.style.display = 'none';
}
 
function _showResultsMsg(msg) {
  const el = document.getElementById('cs-results');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `<div class="cs-empty">${msg}</div>`;
}

// Show an inline loading message while fetching hole detail from GolfAPI
function _showLoadingState(msg) {
  _showSpinner(true);
  const res = document.getElementById('cs-results');
  if (res) {
    res.style.display = 'block';
    res.innerHTML = `<div class="cs-loading">${msg}</div>`;
  }
}

function _hideLoadingState() {
  _showSpinner(false);
  const res = document.getElementById('cs-results');
  if (res) res.style.display = 'none';
}

// ── Expose getCourseByRef for any module still using it ───────────────────────
// Returns the currently active course — backwards compatible with old usage
export function getCourseByRef() {
  return _selectedCourse;
}

export function clearCourseSelection() {
  _selectedCourse = null;
  state.activeCourse = null;
  const input = document.getElementById('cs-input');
  if (input) input.value = '';
  const sel = document.getElementById('cs-selected');
  if (sel) sel.style.display = 'none';
  const results = document.getElementById('cs-results');
  if (results) results.style.display = 'none';
  // Reset tee pills
  const placeholder = document.getElementById('tee-placeholder-card');
  const pillsCard = document.getElementById('tee-pills-card');
  if (placeholder) placeholder.style.display = 'block';
  if (pillsCard) pillsCard.style.display = 'none';
}

// ── Course card scanner (AI photo parse) ─────────────────────────────────────

export function handleCoursePhoto(input) {
  const f = input.files[0]; if (!f) return;
  state.courseCardFile = f;
  const prev = document.getElementById('course-card-prev');
  prev.src = URL.createObjectURL(f); prev.style.display = 'block';
  document.getElementById('course-scan-btn').style.display = 'block';
  document.getElementById('course-scan-msg').innerHTML = '';
  document.getElementById('course-review').style.display = 'none';
}

export function buildParEditGrid(pars) {
  state.scannedPars = [...pars];
  const gridOut = document.getElementById('par-edit-grid');
  gridOut.innerHTML = '';
  const gridIn = document.getElementById('par-edit-grid-in');
  gridIn.innerHTML = '';
  for (let h = 0; h < 18; h++) {
    const cell = document.createElement('div');
    cell.style.cssText = 'text-align:center';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:9px;color:var(--dimmer);margin-bottom:2px';
    label.textContent = h + 1;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = 3; inp.max = 6;
    inp.value = pars[h] || 4;
    inp.id = 'sp' + h;
    inp.style.cssText = 'width:100%;text-align:center;padding:5px 2px;font-size:13px;border-radius:6px;font-weight:600';
    inp.addEventListener('input', _updateParTotal);
    cell.appendChild(label); cell.appendChild(inp);
    if (h < 9) gridOut.appendChild(cell);
    else gridIn.appendChild(cell);
  }
  _updateParTotal();
}

function _renderTeeRatingsUI(ratings) {
  const container = document.getElementById('tee-ratings-detail');
  if (!container) return;
  const found = Object.entries(ratings).filter(([, d]) => d && (d.rating || d.slope));
  if (!found.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<div style="font-size:11px;color:var(--dim);margin-bottom:8px">Per-tee ratings (edit if needed):</div>` +
    found.map(([tee, d]) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <div style="font-size:12px;color:var(--cream);min-width:46px;text-transform:capitalize">${tee}</div>
        <label style="font-size:11px;color:var(--dim);display:flex;align-items:center;gap:4px">Rating
          <input type="number" id="tr-rating-${tee}" value="${d.rating || ''}" step="0.1" style="width:52px;font-size:11px;padding:2px 4px;border-radius:5px;background:var(--mid);border:1px solid var(--border);color:var(--cream)">
        </label>
        <label style="font-size:11px;color:var(--dim);display:flex;align-items:center;gap:4px">Slope
          <input type="number" id="tr-slope-${tee}" value="${d.slope || ''}" style="width:46px;font-size:11px;padding:2px 4px;border-radius:5px;background:var(--mid);border:1px solid var(--border);color:var(--cream)">
        </label>
      </div>`).join('');
}

function _updateParTotal() {
  let tot = 0;
  for (let h = 0; h < 18; h++) {
    const v = parseInt(document.getElementById('sp' + h)?.value) || 4;
    state.scannedPars[h] = v;
    tot += v;
  }
  const el = document.getElementById('par-total-disp');
  if (el) el.textContent = `Total Par: ${tot} (Out: ${state.scannedPars.slice(0,9).reduce((a,b)=>a+b,0)} · In: ${state.scannedPars.slice(9).reduce((a,b)=>a+b,0)})`;
}

export async function scanCourseCard() {
  if (!state.courseCardFile) return;
  document.getElementById('course-scan-msg').innerHTML = '<div class="alert"><span class="spin"></span> Reading course card with AI — this may take a moment...</div>';
  document.getElementById('course-scan-btn').disabled = true;

  try {
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(state.courseCardFile);
    });

    const prompt = `This is a golf course scorecard. Extract the following and return ONLY valid JSON, no other text:
{
  "courseName": "Full course name",
  "location": "Town/city, County/State, Country",
  "holes": [
    {"hole": 1, "par": 4, "yards_white": 380, "yards_yellow": 365, "yards_red": 340, "strokeIndex": 7},
    ... all 18 holes
  ],
  "teeRatings": {
    "white":  {"rating": 70.2, "slope": 121},
    "yellow": {"rating": 69.2, "slope": 118},
    "blue":   {"rating": 67.5, "slope": 114},
    "red":    {"rating": 67.4, "slope": 114}
  }
}
Only include teeRatings entries that are visible on the card. Use null for any value you cannot read clearly.`;

    const resp = await fetch('/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: state.courseCardFile.type || 'image/jpeg', data: b64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });

    const data = await resp.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (!parsed.holes || parsed.holes.length < 9) throw new Error('Not enough holes read');

    state.scannedPars = parsed.holes.map(h => h.par || 4);
    state.scannedSI   = parsed.holes.map(h => h.strokeIndex || null);
    state.scannedYards = {};
    ['white','yellow','blue','red','black'].forEach(tee => {
      const key = 'yards_' + tee;
      const arr = parsed.holes.map(h => h[key] || null);
      if (arr.some(v => v != null)) state.scannedYards[tee] = arr;
    });

    document.getElementById('sc-name').value = parsed.courseName || '';
    document.getElementById('sc-loc').value  = parsed.location   || '';

    const totalPar = state.scannedPars.reduce((a, b) => a + b, 0);
    document.getElementById('sc-par').value = totalPar;

    const ratings   = parsed.teeRatings || {};
    const firstTee  = Object.values(ratings).find(t => t && t.rating);
    if (firstTee) {
      document.getElementById('sc-rating').value = firstTee.rating || '';
      document.getElementById('sc-slope').value  = firstTee.slope  || '';
    }

    state._scannedTeeRatings = {};
    Object.entries(ratings).forEach(([tee, d]) => {
      if (d && (d.rating || d.slope)) state._scannedTeeRatings[tee] = { rating: d.rating, slope: d.slope };
    });

    buildParEditGrid(state.scannedPars);
    _renderTeeRatingsUI(ratings);

    ['blue','yellow','white','red'].forEach(tee => {
      const cb = document.getElementById('tee-' + tee);
      if (cb) cb.checked = !!(ratings[tee] && ratings[tee].rating);
    });

    document.getElementById('course-review').style.display = 'block';
    document.getElementById('course-scan-msg').innerHTML = '<div class="alert alert-ok">&#10003; Course read! Check details below and correct anything before saving.</div>';

  } catch (e) {
    document.getElementById('course-scan-msg').innerHTML = '<div class="alert alert-err">&#9888; Couldn\'t fully read the card — fill in manually below or try a clearer photo.</div>';
    buildParEditGrid(Array(18).fill(4));
    document.getElementById('course-review').style.display = 'block';
  }
  document.getElementById('course-scan-btn').disabled = false;
}

export function saveCourse() {
  const name   = document.getElementById('sc-name').value.trim();
  const loc    = document.getElementById('sc-loc').value.trim();
  const par    = parseInt(document.getElementById('sc-par').value) || state.scannedPars.reduce((a, b) => a + b, 0);
  const rating = parseFloat(document.getElementById('sc-rating').value) || 72;
  const slope  = parseInt(document.getElementById('sc-slope').value) || 113;

  if (!name) { document.getElementById('course-save-msg').textContent = 'Please enter a course name.'; return; }

  for (let h = 0; h < 18; h++) {
    state.scannedPars[h] = parseInt(document.getElementById('sp' + h)?.value) || 4;
  }

  const tees = {};
  if (state._apiTees && Object.keys(state._apiTees).length) {
    Object.entries(state._apiTees).forEach(([key, t]) => {
      if (!document.getElementById('tee-' + key)?.checked && ['blue','yellow','white','red'].includes(key)) return;
      tees[key] = { ...t, par: [...state.scannedPars], rating: t.rating ?? rating, slope: t.slope ?? slope, totalPar: par };
    });
    state._apiTees = null;
  } else {
    ['blue','yellow','white','red'].forEach(tee => {
      if (document.getElementById('tee-' + tee)?.checked) {
        const hy         = state.scannedYards[tee] || null;
        const totalYards = hy ? hy.reduce((a, b) => a + (b || 0), 0) : 0;
        const siClean    = state.scannedSI.some(v => v != null) ? [...state.scannedSI] : null;
        const teeRating  = parseFloat(document.getElementById(`tr-rating-${tee}`)?.value) || state._scannedTeeRatings?.[tee]?.rating || rating;
        const teeSlope   = parseInt(document.getElementById(`tr-slope-${tee}`)?.value)    || state._scannedTeeRatings?.[tee]?.slope  || slope;
        tees[tee] = {
          par: [...state.scannedPars], rating: teeRating, slope: teeSlope,
          yards: totalYards || 0, totalPar: par,
          ...(hy      ? { hy }      : {}),
          ...(siClean ? { si: siClean } : {})
        };
      }
    });
  }

  if (!Object.keys(tees).length) {
    document.getElementById('course-save-msg').textContent = 'Please select at least one tee colour.';
    return;
  }

  if (!state.gd.customCourses) state.gd.customCourses = {};
  state.gd.customCourses[name] = { name, loc, tees, addedBy: state.me, addedDate: new Date().toLocaleDateString('en-GB') };
  state._scannedTeeRatings = null;

  import('./api.js').then(({ pushData }) => pushData()).then(ok => {
    const msg = ok ? '&#10003; Course saved! It\'ll now appear in the course selector.' : '&#9888; Saved locally — will sync when connection is available.';
    document.getElementById('course-save-msg').textContent = msg;
    setTimeout(() => {
      cancelCourseScan();
      import('./nav.js').then(({ switchEntry }) => switchEntry('manual'));
    }, 2000);
  });
}

export function cancelCourseScan() {
  state.courseCardFile = null;
  document.getElementById('course-card-prev').style.display = 'none';
  document.getElementById('course-scan-btn').style.display  = 'none';
  document.getElementById('course-scan-msg').innerHTML      = '';
  document.getElementById('course-review').style.display    = 'none';
  document.getElementById('course-save-msg').textContent    = '';
  document.getElementById('sc-name').value = '';
  document.getElementById('sc-loc').value  = '';
  const inp = document.getElementById('course-card-inp');
  if (inp) inp.value = '';
}

// ── Custom course list (saved courses) ───────────────────────────────────────

export function renderScannedCourses() {
  const card = document.getElementById('scanned-courses-card');
  const list = document.getElementById('scanned-courses-list');
  if (!state.gd.customCourses || !Object.keys(state.gd.customCourses).length) {
    if (card) card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  list.innerHTML = '';
  Object.entries(state.gd.customCourses).forEach(([key, c]) => {
    const tees = Object.keys(c.tees || {});
    const par  = c.tees[tees[0]]?.totalPar || '?';
    const div  = document.createElement('div');
    div.style.cssText = 'border-bottom:1px solid rgba(255,255,255,.06);padding:10px 0;display:flex;justify-content:space-between;align-items:center';
    div.innerHTML = `
      <div>
        <div style="font-size:13px;font-weight:500;color:var(--cream)">${c.name || key}</div>
        <div style="font-size:10px;color:var(--dim);margin-top:2px">${c.loc || ''} · Par ${par} · ${tees.join(', ')} tees</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" data-edit-course="${key.replace(/'/g, "\\'")}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 2.5a2 2 0 0 1 2.8 2.8L7 14.5l-4 1 1-4z"/></svg></button>
        <button class="btn btn-ghost btn-sm" style="color:#e74c3c;border-color:rgba(231,76,60,.3)" data-delete-course="${key.replace(/'/g, "\\'")}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h12"/><path d="M13 5v9a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 5 14V5"/><path d="M7 5V3.5A1.5 1.5 0 0 1 8.5 2h1A1.5 1.5 0 0 1 11 3.5V5"/></svg></button>
      </div>`;
    div.querySelector('[data-edit-course]').addEventListener('click',   () => editScannedCourse(key));
    div.querySelector('[data-delete-course]').addEventListener('click', () => deleteScannedCourse(key));
    list.appendChild(div);
  });
}

export function deleteScannedCourse(key) {
  if (!confirm(`Delete "${key}" from the course list? This cannot be undone.`)) return;
  delete state.gd.customCourses[key];
  import('./api.js').then(({ pushData }) => pushData());
  renderScannedCourses();
}

export function editScannedCourse(key) {
  const c = state.gd.customCourses[key];
  if (!c) return;
  import('./nav.js').then(({ goTo, switchEntry }) => { goTo('round'); switchEntry('course'); });
  document.getElementById('sc-name').value   = c.name || key;
  document.getElementById('sc-loc').value    = c.loc  || '';
  const tees     = Object.keys(c.tees || {});
  const firstTee = c.tees[tees[0]] || {};
  document.getElementById('sc-par').value    = firstTee.totalPar || '';
  document.getElementById('sc-rating').value = firstTee.rating   || '';
  document.getElementById('sc-slope').value  = firstTee.slope    || '';
  const pars = firstTee.par || Array(18).fill(4);
  buildParEditGrid(pars);
  ['blue','yellow','white','red'].forEach(t => {
    const cb = document.getElementById('tee-' + t);
    if (cb) cb.checked = !!(c.tees[t]);
  });
  document.getElementById('course-review').style.display = 'block';
  delete state.gd.customCourses[key];
}

// ── GolfCourse API search + import ───────────────────────────────────────────

function _apiTeeToKey(teeName) {
  const n = (teeName || '').toLowerCase().trim();
  if (/black|champion/.test(n)) return 'black';
  if (/blue|back/.test(n))      return 'blue';
  if (/white|medal|mens|men/.test(n)) return 'white';
  if (/yellow|gents|standard|forward/.test(n)) return 'yellow';
  if (/red|ladi|women/.test(n)) return 'red';
  return n.split(/\s+/)[0] || 'white';
}

export async function searchCourseAPI() {
  const q       = document.getElementById('api-course-search')?.value.trim();
  const msg     = document.getElementById('api-search-msg');
  const results = document.getElementById('api-search-results');
  if (!q) { msg.textContent = 'Enter a course name to search.'; return; }

  msg.innerHTML   = '<span class="spin"></span> Searching…';
  results.innerHTML = '';

  try {
    const resp = await fetch(`/.netlify/functions/courses?search=${encodeURIComponent(q)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Search failed');

    const courses = data.courses || [];
    if (!courses.length) { msg.textContent = 'No courses found. Try a different name.'; return; }

    msg.textContent = `${courses.length} result${courses.length > 1 ? 's' : ''} found:`;
    results.innerHTML = '';
    courses.slice(0, 10).forEach(c => {
      const div = document.createElement('div');
      div.style.cssText = 'padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer';
      div.innerHTML = `
        <div style="font-size:13px;font-weight:500;color:var(--cream)">${c.club_name || c.course_name || 'Unknown'}</div>
        <div style="font-size:10px;color:var(--dim);margin-top:2px">${[c.location?.city, c.location?.state, c.location?.country].filter(Boolean).join(', ') || ''}</div>
        <div style="font-size:10px;color:var(--gold);margin-top:2px">${c.holes || 18} holes · Tap to import →</div>`;
      div.addEventListener('click', () => importCourseFromAPI(c.id));
      results.appendChild(div);
    });
  } catch (e) {
    msg.textContent = '&#9888; Search failed — check your connection and try again.';
    console.error('Course API search error:', e);
  }
}

export async function importCourseFromAPI(courseId) {
  const msg     = document.getElementById('api-search-msg');
  const results = document.getElementById('api-search-results');
  msg.innerHTML   = '<span class="spin"></span> Importing course…';
  results.innerHTML = '';

  try {
    const resp = await fetch(`/.netlify/functions/courses?id=${encodeURIComponent(courseId)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Import failed');

    const c   = data.course || data;
    const name = c.club_name || c.course_name || '';
    const loc  = [c.location?.city, c.location?.state, c.location?.country].filter(Boolean).join(', ');

    const tees = {};
    (c.tees || []).forEach(tee => {
      const key   = _apiTeeToKey(tee.tee_name);
      const holes = tee.holes || [];
      if (holes.length < 9) return;
      const par = holes.map(h => h.par || 4);
      const hy  = holes.map(h => h.yardage || null);
      tees[key] = {
        par, rating: tee.course_rating || null, slope: tee.slope_rating || null,
        yards: tee.total_yards || hy.reduce((a, b) => a + (b || 0), 0) || 0,
        totalPar: tee.par_total || par.reduce((a, b) => a + b, 0), hy,
      };
    });

    if (!Object.keys(tees).length) throw new Error('No tee data returned for this course');

    if (c.location?.latitude && c.location?.longitude && name) {
      if (!state.gd.greenCoords) state.gd.greenCoords = {};
      if (!state.gd.greenCoords[name]) {
        const lat = parseFloat(c.location.latitude);
        const lng = parseFloat(c.location.longitude);
        state.gd.greenCoords[name] = {};
        for (let h = 1; h <= 18; h++) state.gd.greenCoords[name][h] = { lat, lng, _approx: true };
      }
    }

    document.getElementById('sc-name').value   = name;
    document.getElementById('sc-loc').value    = loc;
    const firstTeeKey = Object.keys(tees)[0];
    const firstTee    = tees[firstTeeKey];
    document.getElementById('sc-par').value    = firstTee.totalPar || '';
    document.getElementById('sc-rating').value = firstTee.rating   || '';
    document.getElementById('sc-slope').value  = firstTee.slope    || '';

    state.scannedPars  = [...firstTee.par];
    state.scannedSI    = Array(18).fill(null);
    state.scannedYards = {};
    Object.entries(tees).forEach(([k, t]) => { if (t.hy) state.scannedYards[k] = t.hy; });
    state._apiTees = tees;

    buildParEditGrid(state.scannedPars);
    ['blue','yellow','white','red','black'].forEach(t => {
      const cb = document.getElementById('tee-' + t);
      if (cb) cb.checked = !!(tees[t]);
    });

    document.getElementById('course-review').style.display = 'block';
    msg.innerHTML = `<span style="color:#2ecc71">&#10003; ${name} imported — review below, then save.</span>`;
    results.innerHTML = '';
    document.getElementById('course-review').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    msg.textContent = `&#9888; Import failed: ${e.message}`;
    console.error('Course API import error:', e);
  }
}
 
