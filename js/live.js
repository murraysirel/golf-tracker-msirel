// ─────────────────────────────────────────────────────────────────
// LIVE ROUND
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { getCourseByRef } from './courses.js';
import { recalc, scoreCol } from './scorecard.js';
import { goTo } from './nav.js';
// Wolf hooks loaded via dynamic import to avoid circular deps


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

// ── Score colour helper ───────────────────────────────────────────
function updateScoreColour(element, score, par) {
  if (element && score != null) element.style.color = scoreCol(score - par);
}

// ── Group match score sync ────────────────────────────────────────

function calculateNetTotal(holes, playingHcp, pars, si) {
  let net = 0;
  for (let i = 0; i < 18; i++) {
    if (holes[i] == null) continue;
    const siVal = si?.[i] ?? (i + 1); // fallback if no SI data
    let strokes = siVal <= playingHcp ? 1 : 0;
    if (playingHcp > 18) strokes += siVal <= (playingHcp - 18) ? 1 : 0;
    net += (holes[i] - strokes) - pars[i];
  }
  return net;
}

function syncPlayerMatchScore(playerName) {
  const matchId = state.currentMatchId;
  if (!matchId) return;
  const match = state.gd.matches?.[matchId];
  if (!match || match.status !== 'active') return;

  const ci = document.getElementById('course-sel')?.value;
  const course = ci && ci !== '' ? getCourseByRef(ci) : null;
  const teeData = course?.tees?.[state.stee];
  const si = teeData?.si || (state.scannedSI?.some(v => v != null) ? state.scannedSI : null);

  const holes = [...(state.liveState.groupScores[playerName] || Array(18).fill(null))];
  const playingHcp = state.liveState.hcpOverrides?.[playerName] ?? state.gd.players[playerName]?.handicap ?? 0;
  const holesPlayed = holes.filter(s => s != null).length;

  if (!match.scores[playerName]) {
    match.scores[playerName] = { holes: new Array(18).fill(null), netTotal: 0, holesPlayed: 0, lastUpdated: 0 };
  }
  match.scores[playerName].holes = holes;
  match.scores[playerName].holesPlayed = holesPlayed;
  match.scores[playerName].netTotal = calculateNetTotal(holes, playingHcp, state.cpars, si);
  match.scores[playerName].lastUpdated = Date.now();
}

// ── Group setup ───────────────────────────────────────────────────

export function initLiveRound() {
  // If a round is already in progress, restore the current hole — don't reinitialise
  if (state.roundActive && state.liveState.group.length > 0) {
    const setup = document.getElementById('live-group-setup');
    const holeView = document.getElementById('live-hole-view');
    if (setup) setup.style.display = 'none';
    if (holeView) holeView.style.display = 'block';
    liveRenderPips();
    liveGoto(state.liveState.hole);
    return;
  }

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
  // Match play is now a format pill — hide the old toggle row
  const mpRow = document.getElementById('live-matchplay-row');
  if (mpRow) mpRow.style.display = 'none';
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
  // Wolf validation
  if (state.gameMode === 'wolf' && state.liveState.group.length !== 4) {
    alert('Wolf requires exactly 4 players. Please select 4 players above.');
    return;
  }
  // Match play validation + init
  if (state.gameMode === 'match') {
    if (state.liveState.group.length !== 2) {
      alert('Match play requires exactly 2 players. Please select 2 players above.');
      return;
    }
    state.liveState.matchPlay = true;
    state.liveState.matchResult = {
      format: 'singles',
      players: [...state.liveState.group],
      holesUp: 0,
      leader: null,
      holesPlayed: 0,
      result: 'ongoing'
    };
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

  // The actual launch: show hole view, caddie button, wake lock, GPS
  const launchRound = () => {
    const setup = document.getElementById('live-group-setup');
    const holeView = document.getElementById('live-hole-view');
    if (setup) setup.style.display = 'none';

    if (state.gameMode === 'wolf') {
      import('./gamemodes.js').then(({ showWolfOrderSetup }) => {
        showWolfOrderSetup(state.liveState.group);
      });
    } else {
      if (holeView) holeView.style.display = 'block';
      liveRenderPips();
      liveGoto(state.liveState.hole);
    }

    state.roundActive = true;
    const _cBtn = document.getElementById('caddie-btn');
    _cBtn?.classList.add('visible');
    _cBtn?.classList.add('in-progress');

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

    import('./gps.js').then(({ startGPSWatch }) => startGPSWatch());
  };

  // For group rounds (2+ players), show handicap confirmation first
  if (state.liveState.group.length > 1) {
    showHcpModal(launchRound);
  } else {
    launchRound();
  }
}

function showHcpModal(onConfirm) {
  const modal = document.getElementById('hcp-confirm-modal');
  const inner = document.getElementById('hcp-confirm-inner');
  if (!modal || !inner) { onConfirm(); return; }

  // Get slope from selected course/tee for playing handicap calculation
  const ci = document.getElementById('course-sel')?.value;
  let slope = 113;
  if (ci && ci !== '') {
    const course = getCourseByRef(ci);
    const teeData = course?.tees?.[state.stee];
    slope = teeData?.s || teeData?.slope || 113;
  }

  if (!state.liveState.hcpOverrides) state.liveState.hcpOverrides = {};

  const rows = state.liveState.group.map(name => {
    const hcpIdx = state.gd.players[name]?.handicap || 0;
    const playingHcp = Math.round(hcpIdx * (slope / 113));
    state.liveState.hcpOverrides[name] = playingHcp;
    const safeId = 'hcp-ov-' + name.replace(/[^a-z0-9]/gi, '-');
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--cream)">${name}</div>
          <div style="font-size:11px;color:var(--dim);margin-top:2px">HCP index: ${hcpIdx}</div>
        </div>
        <div style="font-size:12px;color:var(--gold)">Gets</div>
        <input type="number" id="${safeId}" value="${playingHcp}" min="0" max="54"
          style="width:48px;text-align:center;font-size:14px;font-weight:600;padding:4px;border-radius:6px;background:var(--mid);border:1px solid var(--border);color:var(--cream)">
        <div style="font-size:12px;color:var(--gold)">strokes</div>
      </div>`;
  }).join('');

  inner.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:var(--cream);margin-bottom:12px">Stroke allocation</div>
    ${rows}
    <button id="hcp-go-btn" style="width:100%;padding:14px;border-radius:10px;background:var(--gold);border:none;color:var(--navy);font-size:15px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;margin-top:16px;display:block">Let's play →</button>`;

  document.getElementById('hcp-go-btn').addEventListener('click', () => {
    state.liveState.group.forEach(name => {
      const safeId = 'hcp-ov-' + name.replace(/[^a-z0-9]/gi, '-');
      const inp = document.getElementById(safeId);
      if (inp) state.liveState.hcpOverrides[name] = parseInt(inp.value) || 0;
    });
    modal.style.display = 'none';
    onConfirm();
  });

  modal.style.display = 'block';
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
  // Pre-fill null scores to par on first visit to a hole
  state.liveState.group.forEach(name => {
    if (state.liveState.groupScores[name] && state.liveState.groupScores[name][h] === null) {
      state.liveState.groupScores[name][h] = state.cpars[h];
    }
  });
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

  // Wolf: update banner
  if (state.gameMode === 'wolf') {
    import('./gamemodes.js').then(({ updateWolfBanner }) => updateWolfBanner(h));
  } else {
    const wolfBar = document.getElementById('wolf-live-bar');
    if (wolfBar) wolfBar.style.display = 'none';
  }
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

    const scColor = sc != null ? scoreCol(sc - par) : 'var(--gold)';

    const row = document.createElement('div');
    row.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--wa-06);margin-bottom:6px';
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600;color:${name === state.me ? 'var(--gold)' : 'var(--cream)'}">${name}</span>
        <span style="font-size:11px;color:var(--dim)">${sc != null ? (sc - par >= 0 ? '+' + (sc - par) : '' + (sc - par)) + ' this hole' : 'no score'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:10px;color:var(--dim);width:38px">Score</span>
        <button class="live-score-btn lg-score-minus" data-player="${name}">−</button>
        <span class="live-score-val" data-player="${name}" style="color:${scColor}">${sc != null ? sc : par}</span>
        <button class="live-score-btn lg-score-plus" data-player="${name}">+</button>
        <span style="font-size:10px;color:var(--dim);margin-left:6px;width:34px">Putts</span>
        <button class="live-putt-btn lg-putts-minus" data-player="${name}">−</button>
        <span style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:var(--cream);width:28px;text-align:center">${pt != null ? pt : '—'}</span>
        <button class="live-putt-btn lg-putts-plus" data-player="${name}">+</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
        <div${par === 3 ? ' style="display:none"' : ''}>
          <button class="live-toggle-pill lg-fir-pill${fir === 'Yes' ? ' active-fir' : ''}" data-player="${name}">Fairway Hit</button>
        </div>
        <div>
          <button class="live-toggle-pill lg-gir-pill${gir === 'Yes' ? ' active-gir' : ''}" data-player="${name}">Green in Reg</button>
        </div>
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
  container.querySelectorAll('.lg-fir-pill').forEach(btn => {
    btn.addEventListener('click', () => liveGroupToggle(btn.dataset.player, 'fir', 'Yes'));
  });
  container.querySelectorAll('.lg-gir-pill').forEach(btn => {
    btn.addEventListener('click', () => liveGroupToggle(btn.dataset.player, 'gir', 'Yes'));
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

    // Fix 3: track when wolf first adjusts their score — hides the 6-pointer button
    if (state.gameMode === 'wolf' && state.wolfState && !state.wolfState.wolfShotStarted?.[h]) {
      import('./gamemodes.js').then(({ getWolfForHole, updateWolfBanner }) => {
        if (playerName === getWolfForHole(h)) {
          if (!state.wolfState.wolfShotStarted) state.wolfState.wolfShotStarted = {};
          state.wolfState.wolfShotStarted[h] = true;
          updateWolfBanner(h);
        }
      });
    }
  } else {
    const cur = state.liveState.groupPutts[playerName]?.[h] ?? 0;
    if (!state.liveState.groupPutts[playerName]) state.liveState.groupPutts[playerName] = Array(18).fill(null);
    state.liveState.groupPutts[playerName][h] = Math.max(0, Math.min(6, cur + delta));
  }
  liveRenderGroupHole(h);
  // Bounce animation on updated score value
  if (field === 'score') {
    const scoreEl = document.querySelector(`.live-score-val[data-player="${playerName}"]`);
    if (scoreEl) {
      scoreEl.classList.add('score-bounce');
      setTimeout(() => scoreEl.classList.remove('score-bounce'), 210);
    }
    // Keep group match scores in sync (persisted at round-end via pushGist)
    syncPlayerMatchScore(playerName);
  }
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
  const advance = () => { if (h < 17) liveGoto(h + 1); else liveFinishAndSave(); };

  // Wolf: calculate hole points then show result before advancing
  if (state.gameMode === 'wolf') {
    import('./gamemodes.js').then(({ isWolfRound, calcHolePoints, showHoleResult }) => {
      if (isWolfRound()) {
        const scores = {};
        state.wolfState.order.forEach(name => {
          scores[name] = state.liveState.groupScores[name] || Array(18).fill(null);
        });
        const result = calcHolePoints(h, scores, state.cpars);
        showHoleResult(result, h, advance);
      } else {
        advance();
      }
    });
    return;
  }
  advance();
}

export function cancelRound() {
  if (!confirm('Cancel this round? All progress will be lost.')) return;
  state.roundActive = false;
  state.liveState.hole = 0;
  state.liveState.scores = Array(18).fill(null);
  state.liveState.putts = Array(18).fill(null);
  state.liveState.fir = Array(18).fill('');
  state.liveState.gir = Array(18).fill('');
  state.liveState.notes = Array(18).fill('');
  state.liveState.group = [];
  state.liveState.groupScores = {};
  state.liveState.groupPutts = {};
  state.liveState.groupFir = {};
  state.liveState.groupGir = {};
  state.liveState.matchPlay = false;
  state.liveState.hcpOverrides = {};
  const cBtn = document.getElementById('caddie-btn');
  cBtn?.classList.remove('visible');
  cBtn?.classList.remove('in-progress');
  releaseWakeLock();
  goTo('home');
}

async function liveFinishAndSave() {
  state.roundActive = false;
  const _cBtn2 = document.getElementById('caddie-btn');
  _cBtn2?.classList.remove('visible');
  _cBtn2?.classList.remove('in-progress');
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

  // Final match score sync for all group members before persisting
  state.liveState.group.forEach(name => syncPlayerMatchScore(name));

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
        : {}),
      // Include Wolf result if Wolf round
      ...(state.gameMode === 'wolf' && state.wolfState?.order?.length
        ? { wolfResult: { order: state.wolfState.order, finalScores: { ...state.wolfState.scores }, holeResults: state.wolfState.holeResults, winner: [...state.wolfState.order].sort((a, b) => (state.wolfState.scores[b] || 0) - (state.wolfState.scores[a] || 0))[0] || '' } }
        : {})
    };
    if (!state.gd.players[playerName]) state.gd.players[playerName] = { handicap: 0, rounds: [] };
    state.gd.players[playerName].rounds.push(rnd);
  }

  // Fix 4: for Wolf rounds, ensure every player in wolfState.order is saved
  // (guards against any player not in liveState.group due to edge cases)
  if (state.gameMode === 'wolf' && state.wolfState?.order?.length) {
    const wolfResult = {
      order: state.wolfState.order,
      finalScores: { ...state.wolfState.scores },
      holeResults: state.wolfState.holeResults,
      winner: [...state.wolfState.order].sort((a, b) => (state.wolfState.scores[b] || 0) - (state.wolfState.scores[a] || 0))[0] || ''
    };
    for (const playerName of state.wolfState.order) {
      if (state.liveState.group.includes(playerName)) continue; // already saved in the loop above
      const sc = state.liveState.groupScores[playerName] || Array(18).fill(null);
      const vs = sc.filter(Boolean);
      if (!vs.length) continue;
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
        pars: [...state.cpars], scores: sc,
        putts: state.liveState.groupPutts[playerName] || Array(18).fill(null),
        fir: state.liveState.groupFir[playerName] || Array(18).fill(''),
        gir: state.liveState.groupGir[playerName] || Array(18).fill(''),
        totalScore: ts, totalPar: tp, diff: d,
        birdies: sc.filter((s, i) => s && s < state.cpars[i]).length,
        parsCount: sc.filter((s, i) => s && s === state.cpars[i]).length,
        bogeys: sc.filter((s, i) => s && s === state.cpars[i] + 1).length,
        doubles: sc.filter((s, i) => s && s >= state.cpars[i] + 2).length,
        eagles: sc.filter((s, i) => s && s <= state.cpars[i] - 2).length,
        rating: teeData.r, slope: teeData.s,
        wolfResult
      };
      if (!state.gd.players[playerName]) state.gd.players[playerName] = { handicap: 0, rounds: [] };
      state.gd.players[playerName].rounds.push(rnd);
    }
  }

  // Capture info before state reset for match context sheet
  const _me = state.me;
  const _meRoundId = state.gd.players[state.me]?.rounds?.slice(-1)[0]?.id;
  const _groupPlayers = [...state.liveState.group];

  const ok = await pushGist(); // single pushGist call for all players
  const syncMsg = ok ? '\u2705 Saved & synced!' : '\u26A0\uFE0F Saved locally \u2014 will sync when online';
  const names = _groupPlayers.join(', ');
  alert(`${syncMsg}\n\nRound saved for: ${names}\n${course.name} \u00B7 ${state.stee} tees`);

  // Reset
  state.liveState = {
    hole: 0, scores: Array(18).fill(null), putts: Array(18).fill(null),
    fir: Array(18).fill(''), gir: Array(18).fill(''), notes: Array(18).fill(''),
    group: [], groupScores: {}, groupPutts: {}, groupFir: {}, groupGir: {},
    matchPlay: false, matchFormat: 'singles', matchResult: null, hcpOverrides: {}
  };
  state.cpars = Array(18).fill(4);
  state.stee = '';

  import('./nav.js').then(({ goTo: gt }) => {
    import('./stats.js').then(({ renderHomeStats }) => {
      renderHomeStats();
      gt('stats');
    });
  });

  // Show match context sheet for players outside this round (non-blocking)
  if (ok && _meRoundId != null) {
    const _otherPlayers = Object.keys(state.gd.players).filter(p => !_groupPlayers.includes(p));
    if (_otherPlayers.length > 0) {
      import('./players.js').then(({ showMatchContextSheet }) => showMatchContextSheet(_me, _meRoundId));
    }
  }
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
