// ─────────────────────────────────────────────────────────────────
// CADDIE VIEW
// Full-screen on-course interface with GPS distances and scoring.
// Opens via the floating Caddie button (shown when a round is active).
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { liveAdj, liveSetToggle, liveSaveNote, liveNextOrFinish, liveRenderPips } from './live.js';
import { startGPS, updateGPSDisplay } from './gps.js';

// ── Wake Lock ─────────────────────────────────────────────────────
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
  } catch (e) { /* denied or not supported */ }
}

function releaseWakeLock() {
  if (state.wakeLock) { state.wakeLock.release(); state.wakeLock = null; }
}

// ── Pips ─────────────────────────────────────────────────────────
function renderCaddiePips() {
  const el = document.getElementById('caddie-pips');
  if (!el) return;
  el.innerHTML = '';
  for (let h = 0; h < 18; h++) {
    const pip = document.createElement('div');
    pip.className = 'caddie-pip';
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
    pip.addEventListener('click', () => caddieGoto(h));
    el.appendChild(pip);
  }
}

// ── Render current hole ───────────────────────────────────────────
export function renderCaddieHole(h) {
  const par = state.cpars[h];
  document.getElementById('caddie-hole-num').textContent = h + 1;
  document.getElementById('caddie-par-val').textContent = par;

  // Score
  const sc = state.liveState.scores[h];
  const scEl = document.getElementById('caddie-score-val');
  if (scEl) {
    scEl.textContent = sc != null ? sc : '—';
    const d = sc != null ? sc - par : null;
    scEl.style.color = d == null ? 'var(--gold)'
      : d <= -2 ? 'var(--eagle)' : d === -1 ? 'var(--birdie)' : d === 0 ? 'var(--par)'
      : d === 1 ? 'var(--bogey)' : 'var(--double)';
  }

  // Putts
  const pt = state.liveState.putts[h];
  const ptEl = document.getElementById('caddie-putt-val');
  if (ptEl) ptEl.textContent = pt != null ? pt : '—';

  // FIR (hidden on par 3s)
  const firField = document.getElementById('caddie-fir-field');
  if (firField) firField.style.display = par === 3 ? 'none' : '';
  updateCaddieToggle('fir', state.liveState.fir[h]);
  updateCaddieToggle('gir', state.liveState.gir[h]);

  // Note
  const noteEl = document.getElementById('caddie-note');
  if (noteEl) noteEl.value = state.liveState.notes[h] || '';

  // Nav button
  const nextBtn = document.getElementById('caddie-next-btn');
  if (nextBtn) nextBtn.textContent = h === 17 ? 'Finish & Save Round' : 'Next Hole →';
  const prevBtn = document.getElementById('caddie-prev-btn');
  if (prevBtn) prevBtn.disabled = h === 0;

  renderCaddiePips();

  // Update GPS display for new hole
  if (state.gpsState.watching && state.gpsState.coords) {
    updateGPSDisplay(h);
  }
}

function updateCaddieToggle(field, val) {
  const yes = document.getElementById('caddie-' + field + '-yes');
  const no = document.getElementById('caddie-' + field + '-no');
  if (!yes || !no) return;
  yes.className = 'caddie-toggle-btn' + (val === 'Yes' ? ' on-yes' : '');
  no.className = 'caddie-toggle-btn' + (val === 'No' ? ' on-no' : '');
}

function caddieGoto(h) {
  if (h < 0 || h > 17) return;
  state.liveState.hole = h;
  renderCaddieHole(h);
}

// ── Controls ─────────────────────────────────────────────────────

export function caddieAdj(field, delta) {
  liveAdj(field, delta);
  renderCaddieHole(state.liveState.hole);
}

export function caddieToggle(field, val) {
  liveSetToggle(field, val);
  renderCaddieHole(state.liveState.hole);
}

export function caddieNote() {
  liveSaveNote();
}

export function caddiePrev() {
  caddieGoto(state.liveState.hole - 1);
}

export function caddieNext() {
  const h = state.liveState.hole;
  if (h < 17) {
    caddieGoto(h + 1);
  } else {
    closeCaddieView();
    liveNextOrFinish();
  }
}

// ── Open / Close ─────────────────────────────────────────────────

export async function openCaddieView() {
  const view = document.getElementById('caddie-view');
  if (!view) return;

  // Ask about Wake Lock
  if ('wakeLock' in navigator) {
    if (confirm('Keep screen on during your round?')) {
      await requestWakeLock();
    }
  }

  // Start GPS
  startGPS();

  // Render current hole
  renderCaddieHole(state.liveState.hole);

  view.classList.add('open');
}

export function closeCaddieView() {
  document.getElementById('caddie-view')?.classList.remove('open');
  releaseWakeLock();
}

// ── Draggable Caddie button ───────────────────────────────────────

export function initCaddieButton() {
  const btn = document.getElementById('caddie-btn');
  if (!btn) return;

  let dragging = false;
  let justDragged = false;
  let startX, startY, btnX, btnY;

  // Suppress the click that fires right after a drag release
  btn.addEventListener('click', e => {
    if (justDragged) { justDragged = false; e.stopImmediatePropagation(); }
  }, true);

  btn.addEventListener('pointerdown', e => {
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = btn.getBoundingClientRect();
    btnX = rect.left + rect.width / 2;
    btnY = rect.top + rect.height / 2;
    btn.setPointerCapture(e.pointerId);
  });

  btn.addEventListener('pointermove', e => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragging = true;
    if (!dragging) return;

    const newX = btnX + dx;
    const newY = btnY + dy;
    const half = 34;
    const clampedX = Math.max(half, Math.min(window.innerWidth - half, newX));
    const clampedY = Math.max(half, Math.min(window.innerHeight - half, newY));

    btn.style.left = clampedX + 'px';
    btn.style.top = clampedY + 'px';
    btn.style.transform = 'none';
    btn.style.bottom = 'auto';
  });

  btn.addEventListener('pointerup', e => {
    if (dragging) {
      dragging = false;
      justDragged = true; // suppress click after drag
    }
  });
}
