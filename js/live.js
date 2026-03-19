// ─────────────────────────────────────────────────────────────────
// LIVE ROUND
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { getCourseByRef } from './courses.js';
import { recalc } from './scorecard.js';
import { goTo } from './nav.js';

export function initLiveRound() {
  const ci = document.getElementById('course-sel')?.value;
  const course = ci !== '' ? getCourseByRef(ci) : null;
  if (!course) {
    alert('Please select a course first in the Round tab.');
    goTo('round');
    return;
  }
  for (let h = 0; h < 18; h++) {
    const sv = document.getElementById('h' + h)?.value;
    const pv = document.getElementById('p' + h)?.value;
    const fv = document.getElementById('fir' + h)?.value;
    const gv = document.getElementById('gir' + h)?.value;
    if (sv !== undefined) state.liveState.scores[h] = sv !== '' ? parseInt(sv) : null;
    if (pv !== undefined) state.liveState.putts[h] = pv !== '' ? parseInt(pv) : null;
    if (fv !== undefined) state.liveState.fir[h] = fv || '';
    if (gv !== undefined) state.liveState.gir[h] = gv || '';
  }
  liveRenderPips();
  liveGoto(state.liveState.hole);
}

export function liveRenderPips() {
  const el = document.getElementById('live-pips'); if (!el) return;
  el.innerHTML = '';
  for (let h = 0; h < 18; h++) {
    const pip = document.createElement('div');
    pip.className = 'live-pip';
    const sc = state.liveState.scores[h];
    const par = state.cpars[h];
    if (h === state.liveState.hole) pip.classList.add('active');
    else if (sc != null) {
      const d = sc - par;
      if (d <= -2) pip.classList.add('eagle-pip');
      else if (d === -1) pip.classList.add('birdie-pip');
      else if (d === 1) pip.classList.add('bogey-pip');
      else if (d >= 2) pip.classList.add('double-pip');
      else pip.classList.add('done');
    }
    pip.addEventListener('click', () => liveGoto(h));
    el.appendChild(pip);
  }
}

export function liveGoto(h) {
  if (h < 0 || h > 17) return;
  state.liveState.hole = h;
  liveRenderPips();
  const par = state.cpars[h];
  const ci = document.getElementById('course-sel')?.value;
  const course = ci !== '' ? getCourseByRef(ci) : null;
  const teeData = course?.tees?.[state.stee];
  const hYards = teeData?.hy;
  const si = teeData?.si;

  document.getElementById('live-hole-num').textContent = h + 1;
  document.getElementById('live-par').textContent = par;
  document.getElementById('live-yards').textContent = hYards?.[h] || '—';
  document.getElementById('live-si').textContent = si?.[h] || '—';

  const sc = state.liveState.scores[h];
  const sv = document.getElementById('live-score-val');
  sv.textContent = sc != null ? sc : '—';
  if (sc != null) {
    const d = sc - par;
    sv.style.color = d <= -2 ? 'var(--eagle)' : d === -1 ? 'var(--birdie)' : d === 0 ? 'var(--par)' : d === 1 ? 'var(--bogey)' : 'var(--double)';
  } else sv.style.color = 'var(--gold)';

  const pv = state.liveState.putts[h];
  document.getElementById('live-putt-val').textContent = pv != null ? pv : '—';

  const firField = document.getElementById('live-fir-field');
  firField.style.display = par === 3 ? 'none' : 'block';
  liveUpdateToggle('fir', state.liveState.fir[h]);
  liveUpdateToggle('gir', state.liveState.gir[h]);

  document.getElementById('live-note').value = state.liveState.notes[h] || '';

  // Update GPS display and status pill
  import('./gps.js').then(({ updateGPSDisplay, updateLiveGPSPill }) => {
    if (state.gpsState.watching) updateGPSDisplay(h);
    updateLiveGPSPill();
  });

  document.getElementById('live-prev').disabled = h === 0;
  document.getElementById('live-btn-prev2').disabled = h === 0;
  document.getElementById('live-next').disabled = h === 17;
  const nextBtn = document.getElementById('live-btn-next2');
  nextBtn.textContent = h === 17 ? 'Finish & Save Round' : 'Next Hole \u2192';

  liveUpdateRunning();
}

export function liveAdj(field, delta) {
  const h = state.liveState.hole;
  if (field === 'score') {
    const cur = state.liveState.scores[h] ?? state.cpars[h];
    state.liveState.scores[h] = Math.max(1, Math.min(15, cur + delta));
  } else {
    const cur = state.liveState.putts[h] ?? 0;
    state.liveState.putts[h] = Math.max(0, Math.min(6, cur + delta));
  }
  liveGoto(h);
  liveSyncToManual(h);
}

export function liveSetToggle(field, val) {
  const h = state.liveState.hole;
  state.liveState[field][h] = state.liveState[field][h] === val ? '' : val;
  liveUpdateToggle(field, state.liveState[field][h]);
  liveSyncToManual(h);
}

export function liveUpdateToggle(field, val) {
  const yes = document.getElementById(`live-${field}-yes`);
  const no = document.getElementById(`live-${field}-no`);
  if (!yes || !no) return;
  yes.className = 'live-toggle-btn' + (val === 'Yes' ? ' on-yes' : '');
  no.className = 'live-toggle-btn' + (val === 'No' ? ' on-no' : '');
}

export function liveSaveNote() {
  state.liveState.notes[state.liveState.hole] = document.getElementById('live-note').value;
}

export function liveUpdateRunning() {
  let tot = 0, par = 0, n = 0;
  for (let h = 0; h < 18; h++) {
    par += state.cpars[h];
    if (state.liveState.scores[h] != null) { tot += state.liveState.scores[h]; n++; }
  }
  const el = document.getElementById('live-run-score');
  const vp = document.getElementById('live-run-vp');
  if (!n) { el.textContent = '—'; vp.textContent = 'vs par'; return; }
  const d = tot - par;
  el.textContent = tot;
  el.style.color = d < 0 ? 'var(--birdie)' : d > 0 ? 'var(--bogey)' : 'var(--gold)';
  vp.textContent = d === 0 ? 'Level' : (d > 0 ? '+' + d : d) + ' vs par';
}

function liveSyncToManual(h) {
  const sc = state.liveState.scores[h];
  const pt = state.liveState.putts[h];
  const fi = state.liveState.fir[h];
  const gi = state.liveState.gir[h];
  const hEl = document.getElementById('h' + h);
  const pEl = document.getElementById('p' + h);
  const firEl = document.getElementById('fir' + h);
  const girEl = document.getElementById('gir' + h);
  if (hEl && sc != null) hEl.value = sc;
  if (pEl && pt != null) pEl.value = pt;
  if (firEl) firEl.value = fi || '';
  if (girEl) girEl.value = gi || '';
  recalc();
  liveRenderPips();
}

export function liveNextOrFinish() {
  const h = state.liveState.hole;
  if (h < 17) {
    liveGoto(h + 1);
  } else {
    for (let i = 0; i < 18; i++) liveSyncToManual(i);
    goTo('round');
    setTimeout(() => {
      document.getElementById('save-round-btn')?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  }
}

export function liveFinish() {
  liveNextOrFinish();
}
