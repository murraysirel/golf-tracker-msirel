// ============================================================
// js/courses.js  — FULL REPLACEMENT
// Course search replacing static dropdown
// Last updated: 24 March 2026
// ============================================================
 
import { state } from './state.js';
import { buildSC } from './scorecard.js';
 
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
  _selectedCourse = course;
 
  const tees = course.tees || [];
  const pars = course.pars || [];
 
  // Update core state
  state.cpars      = pars.length === 18 ? pars : Array(18).fill(4);
  state.activeCourse = course;
 
  // Store green coords in state for gps.js to consume
  // Format: { 1: { front:{lat,lng}, middle:{lat,lng}, back:{lat,lng} }, 2: ... }
  if (course.green_coords && Object.keys(course.green_coords).length > 0) {
    if (!state.gd.greenCoords) state.gd.greenCoords = {};
    state.gd.greenCoords[course.name] = course.green_coords;
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
 
  // Per-hole yardages for scorecard display
  if (tee.yards_per_hole?.length === 18) {
    state.activeHoleYards = tee.yards_per_hole;
  }
 
  // Per-tee pars (some courses vary par by tee — rare but handled)
  if (tee.pars_per_hole?.length === 18) {
    state.cpars = tee.pars_per_hole;
  }
 
  // Stroke indexes per tee if available, fallback to course-level SI
  if (tee.si_per_hole?.length === 18) {
    state.scannedSI = tee.si_per_hole;
  } else if (_selectedCourse?.stroke_indexes?.length === 18) {
    state.scannedSI = _selectedCourse.stroke_indexes;
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
                ${t.yardage  ? ` · ${t.yardage} yds` : ''}
                ${t.rating   ? ` · CR ${t.rating}`   : ''}
                ${t.slope    ? ` / Slope ${t.slope}`  : ''}
              </option>
            `).join('')}
          </select>
        </div>
      ` : ''}
 
      <button id="cs-change-btn" class="btn-ghost" style="font-size:12px; margin-top:8px">
        ← Change course
      </button>
      <button id="cs-report-btn" class="btn-ghost" style="font-size:11px; margin-top:4px; color:var(--dim)">
        ⚑ Report incorrect data
      </button>
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
            group_code:  state.gd?.groupCode || '',
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
 
