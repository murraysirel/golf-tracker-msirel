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
 
let _searchTimer   = null;
let _lastResults   = [];
let _selectedCourse = null;
 
// ── Called from app.js on Round page load ─────────────────────────────────────
export function initCourseSearch() {
  const wrap = document.getElementById('course-search-container');
  if (!wrap) return;
 
  wrap.innerHTML = `
    <div class="cs-wrap">
      <select id="cs-country" class="cs-country">
        ${COUNTRIES.map(c =>
          `<option value="${c.value}"${c.value === 'UK' ? ' selected' : ''}>${c.label}</option>`
        ).join('')}
      </select>
      <div class="cs-input-row">
        <input
          id="cs-input"
          type="text"
          placeholder="Search for a course…"
          autocomplete="off"
          class="cs-input"
        />
        <span id="cs-spinner" class="cs-spinner" style="display:none">⏳</span>
      </div>
      <div id="cs-results"  class="cs-results"  style="display:none"></div>
      <div id="cs-selected" class="cs-selected" style="display:none"></div>
    </div>
  `;
 
  document.getElementById('cs-input')
    ?.addEventListener('input', _onInput);
  document.getElementById('cs-country')
    ?.addEventListener('change', _onInput);
}
 
// ── Debounced input handler ───────────────────────────────────────────────────
function _onInput() {
  clearTimeout(_searchTimer);
  const q = document.getElementById('cs-input')?.value?.trim() || '';
  _hideResults();
  if (q.length < 2) return;
  _searchTimer = setTimeout(() => _runSearch(q), 380);
}
 
async function _runSearch(q) {
  const country = document.getElementById('cs-country')?.value || 'all';
  _showSpinner(true);
 
  try {
    const url = `${COURSES_API}?action=search&name=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}`;
    const res  = await fetch(url);
    const data = await res.json();
    _lastResults = data.courses || [];
    _renderResults(_lastResults);
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
  el.innerHTML = courses.map((c, i) => `
    <div class="cs-result" data-idx="${i}">
      <div class="cs-result-name">${c.name}${c.name !== c.club_name && c.club_name ? ` <span class="cs-result-club">· ${c.club_name}</span>` : ''}</div>
      <div class="cs-result-meta">
        ${c.location || ''}
        ${c.holes !== 18 ? ` · ${c.holes} holes` : ''}
        ${c.has_gps ? ' · <span class="cs-gps-badge">📍 GPS</span>' : ''}
        ${c.cached  ? ' · <span class="cs-cached-badge">✓ saved</span>' : ''}
      </div>
    </div>
  `).join('');
 
  el.querySelectorAll('.cs-result').forEach(item => {
    item.addEventListener('click', () => _onSelectResult(parseInt(item.dataset.idx)));
  });
}
 
// ── Player selects a result ───────────────────────────────────────────────────
async function _onSelectResult(idx) {
  const result = _lastResults[idx];
  if (!result) return;
 
  _hideResults();
 
  // If already fully cached (came from Supabase), use directly
  if (result.cached && result.pars?.length === 18) {
    _applyCourse(result);
    return;
  }
 
  // Otherwise fetch full detail + coordinates (cache-once write happens server-side)
  _showSpinner(true);
  try {
    const url = `${COURSES_API}?action=fetch&courseId=${encodeURIComponent(result.external_course_id)}&clubId=${encodeURIComponent(result.external_club_id || '')}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.course) {
      _applyCourse(data.course);
    } else {
      // Fallback — use slim result even without full detail
      _applyCourse(result);
    }
  } catch {
    _applyCourse(result); // Best effort fallback
  } finally {
    _showSpinner(false);
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
 
  // Rebuild scorecard with new pars
  buildSC();
 
  // Update the input to show the selected course name
  const input = document.getElementById('cs-input');
  if (input) input.value = course.name;
}
 
function _applyTee(tee) {
  state.stee = tee.colour || tee.name?.toLowerCase() || 'white';
 
  // Per-hole yardages — check both new (yards_per_hole) and old (hy) field names
  const yards = tee.yards_per_hole || tee.hy;
  if (yards?.length === 18) state.activeHoleYards = yards;
 
  // Per-tee pars — check both new (pars_per_hole) and old (par) field names
  const pars = tee.pars_per_hole || tee.par;
  if (pars?.length === 18) state.cpars = pars;

  // Stroke indexes — check both new (si_per_hole) and old (si) field names
  const siArr = tee.si_per_hole || tee.si;
  if (siArr?.length === 18) {
    state.scannedSI = siArr;
  } else if (_selectedCourse?.stroke_indexes?.length === 18) {
    state.scannedSI = _selectedCourse.stroke_indexes;
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
      if (builtinTee?.par?.length === 18) {
        state.cpars = builtinTee.par;
        if (!state.activeHoleYards && builtinTee.hy?.length === 18) {
          state.activeHoleYards = builtinTee.hy;
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
      ${course.has_gps ? `<div class="cs-gps-confirmed">📍 GPS distances available for this course</div>` : `<div class="cs-gps-none">No GPS data — you can pin greens manually during your round</div>`}
 
      ${tees.length > 0 ? `
        <div class="cs-tee-row">
          <label class="cs-tee-lbl">Playing from:</label>
          <select id="cs-tee-sel" class="cs-tee-sel">
            ${tees.map(t => `
              <option value="${t.colour}">
                ${t.name}
                ${(t.yardage || t.y) ? ` · ${t.yardage || t.y} yds` : ''}
                ${(t.rating  || t.r) ? ` · CR ${t.rating  || t.r}`  : ''}
                ${(t.slope   || t.s) ? ` / Slope ${t.slope || t.s}` : ''}
              </option>
            `).join('')}
          </select>
        </div>
      ` : ''}
 
      <button id="cs-change-btn" style="display:block;width:100%;margin-top:10px;padding:9px 16px;border-radius:20px;background:var(--mid);border:1px solid var(--border);color:var(--cream);font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">← Change course</button>
      <button id="cs-report-btn" style="display:block;width:100%;margin-top:6px;padding:8px 16px;border-radius:20px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.35);color:var(--double);font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">⚑ Report incorrect data</button>
    </div>
  `;
 
  document.getElementById('cs-tee-sel')
    ?.addEventListener('change', e => {
      const tee = tees.find(t => t.colour === e.target.value);
      if (tee) _applyTee(tee);
    });
 
  document.getElementById('cs-change-btn')
    ?.addEventListener('click', () => {
      el.style.display = 'none';
      const input = document.getElementById('cs-input');
      if (input) { input.value = ''; input.focus(); }
      _selectedCourse = null;
      state.activeCourse = null;
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
    document.getElementById('course-scan-msg').innerHTML = '<div class="alert alert-ok">✅ Course read! Check details below and correct anything before saving.</div>';

  } catch (e) {
    document.getElementById('course-scan-msg').innerHTML = '<div class="alert alert-err">⚠️ Couldn\'t fully read the card — fill in manually below or try a clearer photo.</div>';
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

  import('./api.js').then(({ pushGist }) => pushGist()).then(ok => {
    const msg = ok ? '✅ Course saved! It\'ll now appear in the course selector.' : '⚠️ Saved locally — will sync when connection is available.';
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
        <button class="btn btn-ghost btn-sm" data-edit-course="${key.replace(/'/g, "\\'")}">✏️</button>
        <button class="btn btn-ghost btn-sm" style="color:#e74c3c;border-color:rgba(231,76,60,.3)" data-delete-course="${key.replace(/'/g, "\\'")}">🗑</button>
      </div>`;
    div.querySelector('[data-edit-course]').addEventListener('click',   () => editScannedCourse(key));
    div.querySelector('[data-delete-course]').addEventListener('click', () => deleteScannedCourse(key));
    list.appendChild(div);
  });
}

export function deleteScannedCourse(key) {
  if (!confirm(`Delete "${key}" from the course list? This cannot be undone.`)) return;
  delete state.gd.customCourses[key];
  import('./api.js').then(({ pushGist }) => pushGist());
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
    msg.textContent = '⚠️ Search failed — check your connection and try again.';
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
    msg.innerHTML = `<span style="color:#2ecc71">✅ ${name} imported — review below, then save.</span>`;
    results.innerHTML = '';
    document.getElementById('course-review').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    msg.textContent = `⚠️ Import failed: ${e.message}`;
    console.error('Course API import error:', e);
  }
}
 
