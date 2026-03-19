// ─────────────────────────────────────────────────────────────────
// COURSES
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { COURSES, TC } from './constants.js';
import { pushGist } from './api.js';
import { switchEntry } from './nav.js';

export function getCourseByRef(ref) {
  if (!isNaN(ref)) return COURSES[parseInt(ref)];
  return state.gd.customCourses?.[ref] || null;
}

export function populateCourses() {
  const sel = document.getElementById('course-sel');
  sel.innerHTML = '<option value="">— Select Course —</option>';
  COURSES.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = c.name;
    sel.appendChild(o);
  });
  if (state.gd.customCourses && Object.keys(state.gd.customCourses).length) {
    const grp = document.createElement('optgroup');
    grp.label = '\uD83D\uDCF8 Scanned Courses';
    Object.keys(state.gd.customCourses).forEach(key => {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = state.gd.customCourses[key].name + ' \u2605';
      grp.appendChild(o);
    });
    sel.appendChild(grp);
  }
}

export function onCourseChange() {
  const i = document.getElementById('course-sel').value;
  const w = document.getElementById('tee-wrap');
  if (i === '') { w.style.display = 'none'; return; }
  const c = getCourseByRef(i);
  if (!c) { w.style.display = 'none'; return; }
  w.style.display = 'block';
  const bc = document.getElementById('tee-btns');
  bc.innerHTML = '';
  Object.keys(c.tees).forEach(tee => {
    const b = document.createElement('button');
    b.className = `tee-btn ${tee}`;
    b.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${TC[tee]?.d || '#fff'};margin-right:4px;vertical-align:middle"></span>${TC[tee]?.l || tee}`;
    b.addEventListener('click', () => selTee(i, tee));
    bc.appendChild(b);
  });
  const defTee = c.def || c.defaultTee || Object.keys(c.tees)[0];
  selTee(i, defTee);
}

export function selTee(ci, tee) {
  const c = getCourseByRef(ci);
  if (!c || !c.tees[tee]) return;
  state.stee = tee;
  state.cpars = [...c.tees[tee].par];
  document.querySelectorAll('.tee-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.tee-btn.${tee}`).forEach(b => b.classList.add('active'));
  const t = c.tees[tee];
  const yds = t.y || t.yards || 0;
  const r = t.r || t.rating || '—';
  const s = t.s || t.slope || '—';
  const tp = t.tp || t.totalPar || state.cpars.reduce((a, b) => a + b, 0);
  const loc = c.loc || c.location || '';
  document.getElementById('tee-info').textContent = `Par ${tp}${yds ? ' \u00B7 ' + yds + 'yds' : ''} \u00B7 Rating ${r} \u00B7 Slope ${s}${loc ? ' \u00B7 ' + loc : ''}`;
  // Import buildSC lazily to avoid circular dep
  import('./scorecard.js').then(m => m.buildSC());
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
    inp.addEventListener('input', updateParTotal);
    cell.appendChild(label); cell.appendChild(inp);
    if (h < 9) gridOut.appendChild(cell);
    else gridIn.appendChild(cell);
  }
  updateParTotal();
}

function updateParTotal() {
  let tot = 0;
  for (let h = 0; h < 18; h++) {
    const v = parseInt(document.getElementById('sp' + h)?.value) || 4;
    state.scannedPars[h] = v;
    tot += v;
  }
  const el = document.getElementById('par-total-disp');
  if (el) el.textContent = `Total Par: ${tot} (Out: ${state.scannedPars.slice(0,9).reduce((a,b)=>a+b,0)} \u00B7 In: ${state.scannedPars.slice(9).reduce((a,b)=>a+b,0)})`;
}

export async function scanCourseCard() {
  if (!state.courseCardFile) return;
  document.getElementById('course-scan-msg').innerHTML = '<div class="alert"><span class="spin"></span> Reading course card with AI \u2014 this may take a moment...</div>';
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
    state.scannedSI = parsed.holes.map(h => h.strokeIndex || null);
    state.scannedYards = {};
    ['white','yellow','blue','red','black'].forEach(tee => {
      const key = 'yards_' + tee;
      const arr = parsed.holes.map(h => h[key] || null);
      if (arr.some(v => v != null)) state.scannedYards[tee] = arr;
    });

    document.getElementById('sc-name').value = parsed.courseName || '';
    document.getElementById('sc-loc').value = parsed.location || '';

    const totalPar = state.scannedPars.reduce((a, b) => a + b, 0);
    document.getElementById('sc-par').value = totalPar;

    const ratings = parsed.teeRatings || {};
    const firstTee = Object.values(ratings).find(t => t && t.rating);
    if (firstTee) {
      document.getElementById('sc-rating').value = firstTee.rating || '';
      document.getElementById('sc-slope').value = firstTee.slope || '';
    }

    buildParEditGrid(state.scannedPars);

    ['blue','yellow','white','red'].forEach(tee => {
      const cb = document.getElementById('tee-' + tee);
      if (cb) cb.checked = !!(ratings[tee] && ratings[tee].rating);
    });

    document.getElementById('course-review').style.display = 'block';
    document.getElementById('course-scan-msg').innerHTML = '<div class="alert alert-ok">\u2705 Course read! Check details below and correct anything before saving.</div>';

  } catch (e) {
    document.getElementById('course-scan-msg').innerHTML = '<div class="alert alert-err">\u26A0\uFE0F Couldn\'t fully read the card \u2014 fill in manually below or try a clearer photo.</div>';
    buildParEditGrid(Array(18).fill(4));
    document.getElementById('course-review').style.display = 'block';
  }
  document.getElementById('course-scan-btn').disabled = false;
}

export function saveCourse() {
  const name = document.getElementById('sc-name').value.trim();
  const loc = document.getElementById('sc-loc').value.trim();
  const par = parseInt(document.getElementById('sc-par').value) || state.scannedPars.reduce((a, b) => a + b, 0);
  const rating = parseFloat(document.getElementById('sc-rating').value) || 72;
  const slope = parseInt(document.getElementById('sc-slope').value) || 113;

  if (!name) { document.getElementById('course-save-msg').textContent = 'Please enter a course name.'; return; }

  for (let h = 0; h < 18; h++) {
    state.scannedPars[h] = parseInt(document.getElementById('sp' + h)?.value) || 4;
  }

  const tees = {};
  if (state._apiTees && Object.keys(state._apiTees).length) {
    // Use full API tee data — update par array from the editable grid
    Object.entries(state._apiTees).forEach(([key, t]) => {
      if (!document.getElementById('tee-' + key)?.checked && ['blue','yellow','white','red'].includes(key)) return;
      tees[key] = {
        ...t,
        par: [...state.scannedPars],
        rating: t.rating ?? rating,
        slope: t.slope ?? slope,
        totalPar: par,
      };
    });
    state._apiTees = null;
  } else {
    ['blue','yellow','white','red'].forEach(tee => {
      if (document.getElementById('tee-' + tee)?.checked) {
        const hy = state.scannedYards[tee] || null;
        const totalYards = hy ? hy.reduce((a, b) => a + (b || 0), 0) : 0;
        const siClean = state.scannedSI.some(v => v != null) ? [...state.scannedSI] : null;
        tees[tee] = {
          par: [...state.scannedPars],
          rating, slope,
          yards: totalYards || 0,
          totalPar: par,
          ...(hy ? { hy } : {}),
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

  pushGist().then(ok => {
    const msg = ok ? '\u2705 Course saved to group list! It\'ll now appear in the course selector.' : '\u26A0\uFE0F Saved locally \u2014 will sync when token is available.';
    document.getElementById('course-save-msg').textContent = msg;
    populateCourses();
    setTimeout(() => { cancelCourseScan(); switchEntry('manual'); }, 2000);
  });
}

export function cancelCourseScan() {
  state.courseCardFile = null;
  document.getElementById('course-card-prev').style.display = 'none';
  document.getElementById('course-scan-btn').style.display = 'none';
  document.getElementById('course-scan-msg').innerHTML = '';
  document.getElementById('course-review').style.display = 'none';
  document.getElementById('course-save-msg').textContent = '';
  document.getElementById('sc-name').value = '';
  document.getElementById('sc-loc').value = '';
  const inp = document.getElementById('course-card-inp');
  if (inp) inp.value = '';
}

export function renderScannedCourses() {
  const card = document.getElementById('scanned-courses-card');
  const list = document.getElementById('scanned-courses-list');
  if (!state.gd.customCourses || !Object.keys(state.gd.customCourses).length) {
    card.style.display = 'none'; return;
  }
  card.style.display = 'block'; list.innerHTML = '';
  Object.entries(state.gd.customCourses).forEach(([key, c]) => {
    const tees = Object.keys(c.tees || {});
    const par = c.tees[tees[0]]?.totalPar || '?';
    const div = document.createElement('div');
    div.style.cssText = 'border-bottom:1px solid rgba(255,255,255,.06);padding:10px 0;display:flex;justify-content:space-between;align-items:center';
    div.innerHTML = `
      <div>
        <div style="font-size:13px;font-weight:500;color:var(--cream)">${c.name || key}</div>
        <div style="font-size:10px;color:var(--dim);margin-top:2px">${c.loc || ''} \u00B7 Par ${par} \u00B7 ${tees.join(', ')} tees</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" data-edit-course="${key.replace(/'/g, "\\'")}">✏️</button>
        <button class="btn btn-ghost btn-sm" style="color:#e74c3c;border-color:rgba(231,76,60,.3)" data-delete-course="${key.replace(/'/g, "\\'")}"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div>`;
    // Bind events after appending
    const editBtn = div.querySelector('[data-edit-course]');
    const deleteBtn = div.querySelector('[data-delete-course]');
    editBtn.addEventListener('click', () => editScannedCourse(key));
    deleteBtn.addEventListener('click', () => deleteScannedCourse(key));
    list.appendChild(div);
  });
}

export function deleteScannedCourse(key) {
  if (!confirm(`Delete "${key}" from the course list? This cannot be undone.`)) return;
  delete state.gd.customCourses[key];
  pushGist();
  populateCourses();
  renderScannedCourses();
}

export function editScannedCourse(key) {
  const c = state.gd.customCourses[key];
  if (!c) return;
  import('./nav.js').then(({ goTo, switchEntry }) => {
    goTo('round');
    switchEntry('course');
  });
  document.getElementById('sc-name').value = c.name || key;
  document.getElementById('sc-loc').value = c.loc || '';
  const tees = Object.keys(c.tees || {});
  const firstTee = c.tees[tees[0]] || {};
  document.getElementById('sc-par').value = firstTee.totalPar || '';
  document.getElementById('sc-rating').value = firstTee.rating || '';
  document.getElementById('sc-slope').value = firstTee.slope || '';
  const pars = firstTee.par || Array(18).fill(4);
  buildParEditGrid(pars);
  ['blue','yellow','white','red'].forEach(t => {
    const cb = document.getElementById('tee-' + t);
    if (cb) cb.checked = !!(c.tees[t]);
  });
  document.getElementById('course-review').style.display = 'block';
  delete state.gd.customCourses[key];
}

// ── Golf Course API search + import ──────────────────────────────

// Map API tee names to app tee colour keys
function apiTeeToKey(teeName) {
  const n = (teeName || '').toLowerCase().trim();
  if (/black|champion/.test(n)) return 'black';
  if (/blue|back/.test(n)) return 'blue';
  if (/white|medal|mens|men/.test(n)) return 'white';
  if (/yellow|gents|standard|forward/.test(n)) return 'yellow';
  if (/red|ladi|women/.test(n)) return 'red';
  // fallback: keep first word, lowercase
  return n.split(/\s+/)[0] || 'white';
}

export async function searchCourseAPI() {
  const q = document.getElementById('api-course-search')?.value.trim();
  const msg = document.getElementById('api-search-msg');
  const results = document.getElementById('api-search-results');
  if (!q) { msg.textContent = 'Enter a course name to search.'; return; }

  msg.innerHTML = '<span class="spin"></span> Searching…';
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
  const msg = document.getElementById('api-search-msg');
  const results = document.getElementById('api-search-results');
  msg.innerHTML = '<span class="spin"></span> Importing course…';
  results.innerHTML = '';

  try {
    const resp = await fetch(`/.netlify/functions/courses?id=${encodeURIComponent(courseId)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Import failed');

    const c = data.course || data;

    // Build name and location
    const name = c.club_name || c.course_name || '';
    const loc = [c.location?.city, c.location?.state, c.location?.country].filter(Boolean).join(', ');

    // Build tees from API tee data
    const tees = {};
    (c.tees || []).forEach(tee => {
      const key = apiTeeToKey(tee.tee_name);
      const holes = tee.holes || [];
      if (holes.length < 9) return;
      const par = holes.map(h => h.par || 4);
      const hy = holes.map(h => h.yardage || null);
      tees[key] = {
        par,
        rating: tee.course_rating || null,
        slope: tee.slope_rating || null,
        yards: tee.total_yards || hy.reduce((a, b) => a + (b || 0), 0) || 0,
        totalPar: tee.par_total || par.reduce((a, b) => a + b, 0),
        hy,
      };
    });

    if (!Object.keys(tees).length) throw new Error('No tee data returned for this course');

    // Seed approximate green coords from course lat/lng if available
    if (c.location?.latitude && c.location?.longitude && name) {
      if (!state.gd.greenCoords) state.gd.greenCoords = {};
      if (!state.gd.greenCoords[name]) {
        // Place all 18 holes at course centre — very approximate
        const lat = parseFloat(c.location.latitude);
        const lng = parseFloat(c.location.longitude);
        state.gd.greenCoords[name] = {};
        for (let h = 1; h <= 18; h++) {
          state.gd.greenCoords[name][h] = { lat, lng, _approx: true };
        }
      }
    }

    // Populate the review form
    document.getElementById('sc-name').value = name;
    document.getElementById('sc-loc').value = loc;

    const firstTeeKey = Object.keys(tees)[0];
    const firstTee = tees[firstTeeKey];
    document.getElementById('sc-par').value = firstTee.totalPar || '';
    document.getElementById('sc-rating').value = firstTee.rating || '';
    document.getElementById('sc-slope').value = firstTee.slope || '';

    // Store tee yard data on state for saveCourse() to pick up
    state.scannedPars = [...firstTee.par];
    state.scannedSI = Array(18).fill(null);
    state.scannedYards = {};
    Object.entries(tees).forEach(([k, t]) => {
      if (t.hy) state.scannedYards[k] = t.hy;
    });
    // Store extra tee data so saveCourse() gets all tees
    state._apiTees = tees;

    buildParEditGrid(state.scannedPars);

    // Check tee colour boxes for tees we got
    ['blue', 'yellow', 'white', 'red', 'black'].forEach(t => {
      const cb = document.getElementById('tee-' + t);
      if (cb) cb.checked = !!(tees[t]);
    });

    document.getElementById('course-review').style.display = 'block';
    msg.innerHTML = `<span style="color:#2ecc71">✅ ${name} imported — review below, then save.</span>`;
    results.innerHTML = '';

    // Scroll to review section
    document.getElementById('course-review').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    msg.textContent = `⚠️ Import failed: ${e.message}`;
    console.error('Course API import error:', e);
  }
}

export function handleCoursePhoto(input) {
  const f = input.files[0]; if (!f) return;
  state.courseCardFile = f;
  const prev = document.getElementById('course-card-prev');
  prev.src = URL.createObjectURL(f); prev.style.display = 'block';
  document.getElementById('course-scan-btn').style.display = 'block';
  document.getElementById('course-scan-msg').innerHTML = '';
  document.getElementById('course-review').style.display = 'none';
}
