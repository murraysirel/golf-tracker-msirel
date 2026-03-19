// ─────────────────────────────────────────────────────────────────
// LIVE ROUND
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { getCourseByRef } from './courses.js';
import { recalc } from './scorecard.js';
import { goTo } from './nav.js';


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

// ── Group setup ───────────────────────────────────────────────────

export function initLiveRound() {
  const ci = document.getElementById('course-sel')?.value;
  const course = ci !== '' ? getCourseByRef(ci) : null;
  if (!course) {
    alert('Please select a course first in the Round tab.');
    goTo('round');
    return;
  }
  // Sync any manually-entered scorecard data into liveState
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

  // Show group setup screen
  showGroupSetup();
}

function showGroupSetup() {
  const setup = document.getElementById('live-group-setup');
  const holeView = document.getElementById('live-hole-view');
  if (setup) setup.style.display = 'block';
  if (holeView) holeView.style.display = 'none';

  // Render player chips
  const chips = document.getElementById('live-group-chips');
  if (!chips) return;
  chips.innerHTML = '';
  const allPlayers = Object.keys(state.gd.players || {});
  allPlayers.forEach(name => {
    const isSelected = state.liveState.group.includes(name);
    const chip = document.createElement('button');
    chip.style.cssText = `padding:7px 14px;border-radius:20px;font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${isSelected ? 'var(--gold)' : 'var(--wa-15)'};background:${isSelected ? 'rgba(201,168,76,.15)' : 'transparent'};color:${isSelected ? 'var(--gold)' : 'var(--dim)'};font-weight:${isSelected ? '600' : '400'}`;
    chip.textContent = name === state.me ? name + ' (you)' : name;
    chip.dataset.player = name;
    chip.addEventListener('click', () => toggleGroupPlayer(name));
    chips.appendChild(chip);
  });
  // Pre-select current player if group is empty
  if (!state.liveState.group.length && state.me) {
    state.liveState.group = [state.me];
    showGroupSetup();
  }
  // Update match play toggle
  updateMatchPlayToggle();
}

export function toggleGroupPlayer(name) {
  const idx = state.liveState.group.indexOf(name);
  if (idx === -1) {
    if (state.liveState.group.length >= 4) return; // max 4
    state.liveState.group.push(name);
  } else {
    state.liveState.group.splice(idx, 1);
  }
  // Disable match play if no longer 2 players
  if (state.liveState.group.length !== 2) {
    state.liveState.matchPlay = false;
  }
  showGroupSetup();
}

export function toggleMatchPlay() {
  if (state.liveState.group.length !== 2) {
    alert('Match play requires exactly 2 players selected.');
    return;
  }
  state.liveState.matchPlay = !state.liveState.matchPlay;
  state.liveState.matchResult = state.liveState.matchPlay ? {
    format: 'singles',
    players: [...state.liveState.group],
    holesUp: 0,
    leader: null,
    holesPlayed: 0,
    result: 'ongoing'
  } : null;
  updateMatchPlayToggle();
}

function updateMatchPlayToggle() {
  const btn = document.getElementById('live-matchplay-toggle');
  if (!btn) return;
  const on = state.liveState.matchPlay;
  btn.style.borderColor = on ? 'var(--gold)' : 'var(--wa-15)';
  btn.style.background = on ? 'rgba(201,168,76,.15)' : 'transparent';
  btn.style.color = on ? 'var(--gold)' : 'var(--dim)';
  btn.textContent = on ? 'On' : 'Off';
}

export function startGroupRound() {
  if (!state.liveState.group.length) {
    state.liveState.group = [state.me];
  }
  // Initialise per-player arrays
  state.liveState.groupScores = {};
  state.liveState.groupPutts = {};
  state.liveState.groupFir = {};
  state.liveState.groupGir = {};
  state.liveState.group.forEach(name => {
    state.liveState.groupScores[name] = Array(18).fill(null);
    state.liveState.groupPutts[name] = Array(18).fill(null);
    state.liveState.groupFir[name] = Array(18).fill('');
    state.liveState.groupGir[name] = Array(18).fill('');
  });
  // If single player, copy existing liveState scores into their group slot
  if (state.liveState.group.length === 1) {
    const p = state.liveState.group[0];
    state.liveState.groupScores[p] = [...state.liveState.scores];
    state.liveState.groupPutts[p] = [...state.liveState.putts];
    state.liveState.groupFir[p] = [...state.liveState.fir];
    state.liveState.groupGir[p] = [...state.liveState.gir];
  }

  // Show hole view
  const setup = document.getElementById('live-group-setup');
  const holeView = document.getElementById('live-hole-view');
  if (setup) setup.style.display = 'none';
  if (holeView) holeView.style.display = 'block';

  liveRenderPips();
  liveGoto(state.liveState.hole);

  // Show floating caddie button (returns to this screen if user navigates away)
  state.roundActive = true;
  document.getElementById('caddie-btn')?.classList.add('visible');

  // Wake lock (persistent preference stored in localStorage)
  const wlPref = localStorage.getItem('rr_wakelock');
  if ('wakeLock' in navigator) {
    if (wlPref === 'yes') {
      requestWakeLock();
    } else if (wlPref === null && confirm('Keep screen on during your round?')) {
      localStorage.setItem('rr_wakelock', 'yes');
      requestWakeLock();
    } else if (wlPref === null) {
      localStorage.setItem('rr_wakelock', 'no');
    }
  }

  // Auto-start GPS watch (distances display once green coords are available)
  import('./gps.js').then(({ startGPSWatch }) => startGPSWatch());
}

// ── Pip strip ─────────────────────────────────────────────────────

export function liveRenderPips() {
  const el = document.getElementById('live-pips'); if (!el) return;
  el.innerHTML = '';
  const isGroup = state.liveState.group.length > 1;
  for (let h = 0; h < 18; h++) {
    const pip = document.createElement('div');
    pip.className = 'live-pip';
    // For group mode use first player's scores for pip colouring
    const sc = isGroup
      ? (state.liveState.groupScores[state.liveState.group[0]]?.[h] ?? null)
      : state.liveState.scores[h];
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

// ── Go to hole ────────────────────────────────────────────────────

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

  // Always use group rendering (handles 1 or more players)
  liveRenderGroupHole(h);

  document.getElementById('live-note').value = state.liveState.notes[h] || '';

  // Update GPS display and pin-green button
  import('./gps.js').then(({ updateGPSDisplay, hasGreenCoords }) => {
    if (state.gpsState.watching) updateGPSDisplay(h);
    const pinBtn = document.getElementById('live-pin-green-btn');
    if (pinBtn) pinBtn.style.display = hasGreenCoords(h) ? 'none' : 'block';
  });

  document.getElementById('live-prev').disabled = h === 0;
  document.getElementById('live-btn-prev2').disabled = h === 0;
  document.getElementById('live-next').disabled = h === 17;
  const nextBtn = document.getElementById('live-btn-next2');
  nextBtn.textContent = h === 17 ? 'Finish & Save Round' : 'Next Hole \u2192';

  liveUpdateRunning();
}

// ── Group hole rendering ──────────────────────────────────────────

function liveRenderGroupHole(h) {
  const container = document.getElementById('live-group-rows');
  if (!container) return;
  container.innerHTML = '';
  const par = state.cpars[h];

  state.liveState.group.forEach(name => {
    const sc = state.liveState.groupScores[name]?.[h] ?? null;
    const pt = state.liveState.groupPutts[name]?.[h] ?? null;
    const fir = state.liveState.groupFir[name]?.[h] ?? '';
    const gir = state.liveState.groupGir[name]?.[h] ?? '';

    const scColor = sc != null ? (() => {
      const d = sc - par;
      return d <= -2 ? 'var(--eagle)' : d === -1 ? 'var(--birdie)' : d === 0 ? 'var(--par)' : d === 1 ? 'var(--bogey)' : 'var(--double)';
    })() : 'var(--gold)';

    const firBtns = par === 3 ? '' : `
      <span style="font-size:10px;color:var(--dim)">FIR</span>
      <button class="live-toggle-btn lg-fir-yes${fir === 'Yes' ? ' on-yes' : ''}" data-player="${name}" style="flex:0 0 auto;padding:6px 10px;font-size:11px">Hit</button>
      <button class="live-toggle-btn lg-fir-no${fir === 'No' ? ' on-no' : ''}" data-player="${name}" style="flex:0 0 auto;padding:6px 10px;font-size:11px">Miss</button>`;

    const row = document.createElement('div');
    row.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--wa-06);margin-bottom:6px';
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600;color:${name === state.me ? 'var(--gold)' : 'var(--cream)'}">${name}</span>
        <span style="font-size:11px;color:var(--dim)">${sc != null ? (sc - par >= 0 ? '+' + (sc - par) : '' + (sc - par)) + ' this hole' : 'no score'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:10px;color:var(--dim);width:42px">Score</span>
        <button class="live-score-btn lg-score-minus" data-player="${name}" style="width:34px;height:34px;font-size:16px">−</button>
        <span style="font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:700;color:${scColor};width:44px;text-align:center;line-height:1">${sc != null ? sc : '—'}</span>
        <button class="live-score-btn lg-score-plus" data-player="${name}" style="width:34px;height:34px;font-size:16px">+</button>
        <span style="font-size:10px;color:var(--dim);margin-left:8px;width:36px">Putts</span>
        <button class="live-putt-btn lg-putts-minus" data-player="${name}" style="width:30px;height:30px">−</button>
        <span style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:var(--cream);width:28px;text-align:center">${pt != null ? pt : '—'}</span>
        <button class="live-putt-btn lg-putts-plus" data-player="${name}" style="width:30px;height:30px">+</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${firBtns}
        <span style="font-size:10px;color:var(--dim)">GIR</span>
        <button class="live-toggle-btn lg-gir-yes${gir === 'Yes' ? ' on-yes' : ''}" data-player="${name}" style="flex:0 0 auto;padding:6px 10px;font-size:11px">Hit</button>
        <button class="live-toggle-btn lg-gir-no${gir === 'No' ? ' on-no' : ''}" data-player="${name}" style="flex:0 0 auto;padding:6px 10px;font-size:11px">Miss</button>
      </div>`;
    container.appendChild(row);
  });

  // Bind events via delegation
  container.querySelectorAll('.lg-score-minus').forEach(btn => {
    btn.addEventListener('click', () => liveGroupAdj(btn.dataset.player, 'score', -1));
  });
  container.querySelectorAll('.lg-score-plus').forEach(btn => {
    btn.addEventListener('click', () => liveGroupAdj(btn.dataset.player, 'score', 1));
  });
  container.querySelectorAll('.lg-putts-minus').forEach(btn => {
    btn.addEventListener('click', () => liveGroupAdj(btn.dataset.player, 'putts', -1));
  });
  container.querySelectorAll('.lg-putts-plus').forEach(btn => {
    btn.addEventListener('click', () => liveGroupAdj(btn.dataset.player, 'putts', 1));
  });
  container.querySelectorAll('.lg-fir-yes').forEach(btn => {
    btn.addEventListener('click', () => liveGroupToggle(btn.dataset.player, 'fir', 'Yes'));
  });
  container.querySelectorAll('.lg-fir-no').forEach(btn => {
    btn.addEventListener('click', () => liveGroupToggle(btn.dataset.player, 'fir', 'No'));
  });
  container.querySelectorAll('.lg-gir-yes').forEach(btn => {
    btn.addEventListener('click', () => liveGroupToggle(btn.dataset.player, 'gir', 'Yes'));
  });
  container.querySelectorAll('.lg-gir-no').forEach(btn => {
    btn.addEventListener('click', () => liveGroupToggle(btn.dataset.player, 'gir', 'No'));
  });

  // Update match banner
  updateMatchBanner(h);
}

function liveGroupAdj(playerName, field, delta) {
  const h = state.liveState.hole;
  const par = state.cpars[h];
  if (field === 'score') {
    const cur = state.liveState.groupScores[playerName]?.[h] ?? par;
    if (!state.liveState.groupScores[playerName]) state.liveState.groupScores[playerName] = Array(18).fill(null);
    state.liveState.groupScores[playerName][h] = Math.max(1, Math.min(15, cur + delta));
  } else {
    const cur = state.liveState.groupPutts[playerName]?.[h] ?? 0;
    if (!state.liveState.groupPutts[playerName]) state.liveState.groupPutts[playerName] = Array(18).fill(null);
    state.liveState.groupPutts[playerName][h] = Math.max(0, Math.min(6, cur + delta));
  }
  liveRenderGroupHole(h);
  liveUpdateRunning();
  // Sync first player's scores into liveState.scores for pip colours
  const first = state.liveState.group[0];
  if (first) state.liveState.scores[h] = state.liveState.groupScores[first]?.[h] ?? null;
  liveRenderPips();
}

function liveGroupToggle(playerName, field, val) {
  const h = state.liveState.hole;
  const store = field === 'fir' ? state.liveState.groupFir : state.liveState.groupGir;
  if (!store[playerName]) store[playerName] = Array(18).fill('');
  store[playerName][h] = store[playerName][h] === val ? '' : val;
  liveRenderGroupHole(h);
}

// ── Match play ────────────────────────────────────────────────────

function updateMatchBanner(h) {
  const banner = document.getElementById('live-match-banner');
  const statusEl = document.getElementById('live-match-status');
  const holeEl = document.getElementById('live-match-hole-result');
  if (!banner || !state.liveState.matchPlay || state.liveState.group.length !== 2) {
    if (banner) banner.style.display = 'none';
    return;
  }

  computeMatchResult();
  const mr = state.liveState.matchResult;
  if (!mr) { banner.style.display = 'none'; return; }

  banner.style.display = '';

  // Hole result for current hole
  const [p1, p2] = state.liveState.group;
  const s1 = state.liveState.groupScores[p1]?.[h];
  const s2 = state.liveState.groupScores[p2]?.[h];
  if (s1 != null && s2 != null) {
    const diff = s1 - s2;
    const holeResult = diff < 0 ? `${p1} wins hole` : diff > 0 ? `${p2} wins hole` : 'Hole halved';
    if (holeEl) holeEl.textContent = holeResult;
  } else {
    if (holeEl) holeEl.textContent = 'Scores not entered yet';
  }

  // Running match status
  if (mr.result === 'won') {
    const holesLeft = 17 - mr.holesPlayed;
    statusEl.textContent = `🏆 ${mr.leader} wins ${mr.holesUp}&${holesLeft}`;
    banner.style.background = 'rgba(201,168,76,.18)';
  } else if (mr.result === 'halved') {
    statusEl.textContent = 'Match all square after 18 — halved';
  } else if (mr.holesPlayed === 0) {
    statusEl.textContent = 'Match play — all square';
  } else {
    const upStr = mr.holesUp > 0 ? `${mr.leader} ${mr.holesUp}UP` : 'All square';
    const remaining = 17 - mr.holesPlayed;
    // Dormie check
    if (mr.holesUp > 0 && mr.holesUp >= remaining) {
      statusEl.textContent = `${mr.leader} DORMIE — ${upStr} with ${remaining} to play`;
    } else {
      statusEl.textContent = `${upStr} through ${mr.holesPlayed}`;
    }
  }
}

function computeMatchResult() {
  if (!state.liveState.matchPlay || state.liveState.group.length !== 2) return;
  const [p1, p2] = state.liveState.group;
  let holesUp = 0; // positive = p1 leads
  let holesPlayed = 0;
  let matchWon = false;

  for (let h = 0; h < 18; h++) {
    const s1 = state.liveState.groupScores[p1]?.[h];
    const s2 = state.liveState.groupScores[p2]?.[h];
    if (s1 == null || s2 == null) continue;
    holesPlayed++;
    if (s1 < s2) holesUp++;
    else if (s2 < s1) holesUp--;
    const remaining = 18 - holesPlayed;
    // Match won check
    if (Math.abs(holesUp) > remaining) { matchWon = true; break; }
  }

  const leader = holesUp > 0 ? p1 : holesUp < 0 ? p2 : null;
  const result = matchWon ? 'won' : (holesPlayed === 18 && holesUp === 0) ? 'halved' : 'ongoing';

  state.liveState.matchResult = {
    format: 'singles',
    players: [p1, p2],
    holesUp: Math.abs(holesUp),
    leader,
    holesPlayed,
    result
  };
}

// ── Running totals ────────────────────────────────────────────────

export function liveUpdateRunning() {
  const el = document.getElementById('live-run-score');
  const vp = document.getElementById('live-run-vp');
  const isGroup = state.liveState.group.length > 1;

  if (isGroup) {
    // Show all players' running totals (compact)
    const parts = state.liveState.group.map(name => {
      let tot = 0, par = 0, n = 0;
      for (let h = 0; h < 18; h++) {
        par += state.cpars[h];
        const sc = state.liveState.groupScores[name]?.[h];
        if (sc != null) { tot += sc; n++; }
      }
      if (!n) return `${name}: —`;
      const d = tot - par;
      return `${name.split(' ')[0]}: ${tot} (${d >= 0 ? '+' : ''}${d})`;
    });
    if (el) { el.textContent = parts[0] || '—'; el.style.color = 'var(--gold)'; }
    if (vp) vp.textContent = parts.slice(1).join(' · ') || '';
  } else {
    let tot = 0, par = 0, n = 0;
    for (let h = 0; h < 18; h++) {
      par += state.cpars[h];
      if (state.liveState.scores[h] != null) { tot += state.liveState.scores[h]; n++; }
    }
    if (!n) { if (el) { el.textContent = '—'; el.style.color = 'var(--gold)'; } if (vp) vp.textContent = 'vs par'; return; }
    const d = tot - par;
    if (el) { el.textContent = tot; el.style.color = d < 0 ? 'var(--birdie)' : d > 0 ? 'var(--bogey)' : 'var(--gold)'; }
    if (vp) vp.textContent = d === 0 ? 'Level' : (d > 0 ? '+' + d : d) + ' vs par';
  }
}

// ── Single-player controls ────────────────────────────────────────

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

// ── Next / Finish ─────────────────────────────────────────────────

export function liveNextOrFinish() {
  const h = state.liveState.hole;
  if (h < 17) {
    liveGoto(h + 1);
  } else {
    // Save round(s)
    liveFinishAndSave();
  }
}

async function liveFinishAndSave() {
  state.roundActive = false;
  document.getElementById('caddie-btn')?.classList.remove('visible');
  releaseWakeLock();
  // Always save directly for all group sizes
  await liveGroupSave();
}

async function liveGroupSave() {
  const ci = document.getElementById('course-sel')?.value;
  if (!ci) { alert('No course selected.'); return; }
  const course = getCourseByRef(ci);
  if (!course) { alert('Course not found.'); return; }
  const teeData = course.tees?.[state.stee];
  if (!teeData) { alert('Tee data not found.'); return; }

  const date = document.getElementById('r-date')?.value || new Date().toLocaleDateString('en-GB');
  const notes = document.getElementById('r-notes')?.value || '';

  const { pushGist } = await import('./api.js');

  for (const playerName of state.liveState.group) {
    const sc = state.liveState.groupScores[playerName] || Array(18).fill(null);
    const pt = state.liveState.groupPutts[playerName] || Array(18).fill(null);
    const fi = state.liveState.groupFir[playerName] || Array(18).fill('');
    const gi = state.liveState.groupGir[playerName] || Array(18).fill('');
    const vs = sc.filter(Boolean);
    if (!vs.length) continue; // skip players with no scores entered
    const ts = vs.reduce((a, b) => a + b, 0);
    const tp = state.cpars.reduce((a, b) => a + b, 0);
    const d = ts - tp;
    const rnd = {
      id: Date.now() + Math.random(),
      player: playerName,
      course: course.name,
      loc: course.loc || course.location || '',
      tee: state.stee,
      date, notes,
      pars: [...state.cpars], scores: sc, putts: pt, fir: fi, gir: gi,
      totalScore: ts, totalPar: tp, diff: d,
      birdies: sc.filter((s, i) => s && s < state.cpars[i]).length,
      parsCount: sc.filter((s, i) => s && s === state.cpars[i]).length,
      bogeys: sc.filter((s, i) => s && s === state.cpars[i] + 1).length,
      doubles: sc.filter((s, i) => s && s >= state.cpars[i] + 2).length,
      eagles: sc.filter((s, i) => s && s <= state.cpars[i] - 2).length,
      rating: teeData.r, slope: teeData.s,
      // Include match outcome if match play was used
      ...(state.liveState.matchPlay && state.liveState.matchResult
        ? { matchOutcome: { ...state.liveState.matchResult } }
        : {})
    };
    if (!state.gd.players[playerName]) state.gd.players[playerName] = { handicap: 0, rounds: [] };
    state.gd.players[playerName].rounds.push(rnd);
  }

  const ok = await pushGist();
  const syncMsg = ok ? '\u2705 Saved & synced!' : '\u26A0\uFE0F Saved locally \u2014 will sync when online';
  const names = state.liveState.group.join(', ');
  alert(`${syncMsg}\n\nRound saved for: ${names}\n${course.name} \u00B7 ${state.stee} tees`);

  // Reset
  state.liveState = {
    hole: 0, scores: Array(18).fill(null), putts: Array(18).fill(null),
    fir: Array(18).fill(''), gir: Array(18).fill(''), notes: Array(18).fill(''),
    group: [], groupScores: {}, groupPutts: {}, groupFir: {}, groupGir: {},
    matchPlay: false, matchFormat: 'singles', matchResult: null
  };
  state.cpars = Array(18).fill(4);
  state.stee = '';

  import('./nav.js').then(({ goTo: gt }) => {
    import('./stats.js').then(({ renderHomeStats }) => {
      renderHomeStats();
      gt('stats');
    });
  });
}

export function liveFinish() {
  liveNextOrFinish();
}

// ── Course correction report (Feature 5) ─────────────────────────

export function openCorrectionModal() {
  const modal = document.getElementById('correction-modal');
  if (!modal) return;

  const h = state.liveState.hole;
  const par = state.cpars[h];
  const ci = document.getElementById('course-sel')?.value;
  const course = ci !== '' ? getCourseByRef(ci) : null;
  const teeData = course?.tees?.[state.stee];
  const yards = teeData?.hy?.[h] || '—';
  const si = teeData?.si?.[h] || '—';

  const prefill = document.getElementById('correction-prefill');
  if (prefill) {
    prefill.innerHTML = `<strong style="color:var(--gold)">${course?.name || 'Unknown course'}</strong><br>
      Hole ${h + 1} · Par ${par} · Yards ${yards} · SI ${si}`;
  }

  const note = document.getElementById('correction-note');
  if (note) note.value = '';
  const msg = document.getElementById('correction-msg');
  if (msg) msg.textContent = '';

  modal.style.display = 'flex';
}

export async function submitCorrectionReport() {
  const note = document.getElementById('correction-note')?.value.trim();
  const msg = document.getElementById('correction-msg');
  if (!note) { if (msg) msg.textContent = 'Please describe the issue.'; return; }

  const h = state.liveState.hole;
  const par = state.cpars[h];
  const ci = document.getElementById('course-sel')?.value;
  const course = ci !== '' ? getCourseByRef(ci) : null;
  const teeData = course?.tees?.[state.stee];

  if (!state.gd.courseCorrections) state.gd.courseCorrections = [];
  state.gd.courseCorrections.push({
    id: Date.now(),
    course: course?.name || '',
    hole: h + 1,
    par,
    yards: teeData?.hy?.[h] || null,
    si: teeData?.si?.[h] || null,
    reportedBy: state.me,
    reportedAt: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    note,
    status: 'pending'
  });

  const { pushGist } = await import('./api.js');
  await pushGist();

  if (msg) { msg.style.color = 'var(--par)'; msg.textContent = '✅ Report submitted — admin will review.'; }
  setTimeout(() => { document.getElementById('correction-modal').style.display = 'none'; }, 1500);
}
