// ─────────────────────────────────────────────────────────────────
// LIVE ROUND
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { getCourseByRef } from './courses.js';
import { recalc, scoreCol } from './scorecard.js';
import { goTo } from './nav.js';
// Wolf hooks loaded via dynamic import to avoid circular deps

// ── Live publish helpers ──────────────────────────────────────────

export function publishLiveState() {
  // Only publish for multi-player group rounds
  if (!state.liveInvite.liveRoundId || state.liveState.group.length < 2) return;
  import('./api.js').then(({ pushSupabase }) => {
    pushSupabase('publishLiveRound', {
      round: {
        id: state.liveInvite.liveRoundId,
        host: state.me,
        players: [...state.liveState.group],
        course: getCourseByRef()?.name || '',
        tee: state.stee || '',
        hole: state.liveState.hole,
        scores: { ...state.liveState.groupScores },
        putts: { ...state.liveState.groupPutts },
        pars: [...state.cpars]
      }
    });
  });
}

export function endLivePublish() {
  if (!state.liveInvite.liveRoundId) return;
  import('./api.js').then(({ pushSupabase }) => {
    pushSupabase('endLiveRound', { roundId: state.liveInvite.liveRoundId });
  });
  state.liveInvite.liveRoundId = null;
}


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

  const course = getCourseByRef();
  const teeData = Array.isArray(course?.tees)
    ? course.tees.find(t => t.colour === state.stee)
    : course?.tees?.[state.stee];
  const si = teeData?.si || teeData?.si_per_hole || (state.scannedSI?.some(v => v != null) ? state.scannedSI : null);

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

  const course = getCourseByRef();
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

  // Show team assignment when match play mode is selected and 2+ players chosen
  const teamsDiv = document.getElementById('live-match-teams');
  if (teamsDiv) {
    if (state.gameMode === 'match' && state.liveState.group.length >= 2) {
      renderMatchTeams();
      teamsDiv.style.display = 'block';
    } else {
      teamsDiv.style.display = 'none';
    }
  }
  // Update match play toggle
  updateMatchPlayToggle();
}

export function toggleGroupPlayer(name) {
  const idx = state.liveState.group.indexOf(name);
  if (idx === -1) {
    if (state.liveState.group.length >= 4) return; // max 4
    if (state.gameMode === 'sixes' && state.liveState.group.length >= 3) return; // max 3 for sixes
    state.liveState.group.push(name);
  } else {
    state.liveState.group.splice(idx, 1);
  }
  showGroupSetup();
}

export function toggleMatchPlay() {
  // Legacy toggle — match play is now set via the format pill (state.gameMode = 'match').
  // This function is kept for the hidden #live-matchplay-toggle button wired in app.js.
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
    const n = state.liveState.group.length;
    if (n < 2 || n > 4) {
      alert('Match play requires 2–4 players. Please select your players above.');
      return;
    }
    const { a, b } = state.liveState.matchTeams;
    if (!a.length || !b.length) {
      alert('Please assign at least one player to each team before starting.');
      return;
    }
    state.liveState.matchPlay = true;
    state.liveState.matchResult = {
      teamA: [...a],
      teamB: [...b],
      labelA: teamLabel(a),
      labelB: teamLabel(b),
      holesUp: 0,
      leader: null,
      holesPlayed: 0,
      result: 'ongoing'
    };
  }
  // Sixes validation + init
  if (state.gameMode === 'sixes') {
    if (state.liveState.group.length !== 3) {
      alert('Sixes requires exactly 3 players. Please select 3 players above.');
      return;
    }
    import('./gamemodes.js').then(({ initSixesState }) => initSixesState(state.liveState.group));
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
    // Publish live state for multi-player rounds so other players get an invite
    if (state.liveState.group.length > 1) {
      state.liveInvite.liveRoundId = Date.now();
      publishLiveState();
    }
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

    // Show match leaderboard overlay if player is in an active match
    import('./overlay.js').then(({ showMatchOverlay }) => showMatchOverlay());
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
  let slope = 113;
  {
    const course = getCourseByRef();
    const teeData = course?.tees?.[state.stee];
    slope = teeData?.slope || 113;
  }

  if (!state.liveState.hcpOverrides) state.liveState.hcpOverrides = {};

  // Calculate playing handicaps and find the minimum so the lowest-HCP player gets 0 strokes
  const hcps = state.liveState.group.map(name => {
    const hcpIdx = state.gd.players[name]?.handicap || 0;
    return { name, hcpIdx, playingHcp: Math.round(hcpIdx * (slope / 113)) };
  });
  const minHcp = Math.min(...hcps.map(p => p.playingHcp));
  hcps.forEach(p => { p.strokes = p.playingHcp - minHcp; });

  // Initialise overrides with relative stroke values
  hcps.forEach(p => { state.liveState.hcpOverrides[p.name] = p.strokes; });

  const rows = hcps.map(({ name, hcpIdx, strokes }) => {
    const safeId = 'hcp-ov-' + name.replace(/[^a-z0-9]/gi, '-');
    const desc = strokes === 0 ? 'scratch for this match' : `gets ${strokes} strokes`;
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--cream)">${name}</div>
          <div style="font-size:11px;color:var(--dim);margin-top:2px">HCP index: ${hcpIdx} — ${desc}</div>
        </div>
        <input type="number" id="${safeId}" value="${strokes}" min="0" max="54"
          style="width:48px;text-align:center;font-size:14px;font-weight:600;padding:4px;border-radius:6px;background:var(--mid);border:1px solid var(--border);color:var(--cream)">
        <div style="font-size:12px;color:var(--gold)">strokes</div>
      </div>`;
  }).join('');

  inner.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:var(--cream);margin-bottom:12px">Stroke allocation</div>
    ${rows}
    <button id="hcp-go-btn" style="width:100%;padding:14px;border-radius:10px;background:var(--gold);border:none;color:var(--navy);font-size:15px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;margin-top:16px;display:block">Let's play →</button>`;

  // Select-on-focus for all number inputs (Fix 3)
  inner.querySelectorAll('input[type="number"]').forEach(inp => {
    inp.addEventListener('focus', function() { this.select(); });
    inp.addEventListener('touchstart', function() { setTimeout(() => this.select(), 0); }, { passive: true });
  });

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
  const par    = state.cpars[h];
  const hYards = state.activeHoleYards?.length === 18 ? state.activeHoleYards : null;
  const si     = state.scannedSI?.some(v => v != null) ? state.scannedSI : null;

  document.getElementById('live-hole-num').textContent = h + 1;
  document.getElementById('live-par').textContent = par;
  document.getElementById('live-yards').textContent = hYards?.[h] || '—';
  document.getElementById('live-si').textContent = (si && si[h] > 0) ? si[h] : '—';

  // Always use group rendering (handles 1 or more players)
  liveRenderGroupHole(h);

  document.getElementById('live-note').value = state.liveState.notes[h] || '';

  // Update GPS display for new hole
  import('./gps.js').then(({ updateGPSDisplay, updateDriveBtn }) => {
    if (state.gpsState.watching) updateGPSDisplay(h);
    updateDriveBtn(h, true);
  });

  // Push live state update for remote viewers
  publishLiveState();

  document.getElementById('live-prev').disabled = h === 0;
  document.getElementById('live-btn-prev2').disabled = h === 0;
  document.getElementById('live-next').disabled = h === 17;
  const nextBtn = document.getElementById('live-btn-next2');
  nextBtn.textContent = h === 17 ? 'Finish & Save Round' : 'Next Hole \u2192';

  liveUpdateRunning();

  // Refresh match overlay if active
  import('./overlay.js').then(({ refreshMatchOverlay }) => refreshMatchOverlay());

  // Wolf: update banner
  if (state.gameMode === 'wolf') {
    import('./gamemodes.js').then(({ updateWolfBanner }) => updateWolfBanner(h));
  } else {
    const wolfBar = document.getElementById('wolf-live-bar');
    if (wolfBar) wolfBar.style.display = 'none';
  }

  // Sixes: update banner
  if (state.gameMode === 'sixes') {
    import('./gamemodes.js').then(({ updateSixesBanner }) => updateSixesBanner(h));
  } else {
    const sixesBar = document.getElementById('sixes-live-bar');
    if (sixesBar) sixesBar.style.display = 'none';
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

    const sixesPtsHtml = state.gameMode === 'sixes'
      ? `<span class="sixes-player-pts" data-player="${name}" style="font-size:11px;color:var(--par);font-weight:600;margin-left:6px">—pts</span>`
      : '';

    const row = document.createElement('div');
    row.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--wa-06);margin-bottom:6px';
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600;color:${name === state.me ? 'var(--gold)' : 'var(--cream)'}">${name}${sixesPtsHtml}</span>
        <span style="font-size:11px;color:var(--dim)">${sc != null ? (sc - par >= 0 ? '+' + (sc - par) : '' + (sc - par)) + ' this hole' : 'no score'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:10px;color:var(--dim);width:38px">Score</span>
        <button class="live-score-btn lg-score-minus" data-player="${name}">−</button>
        <span class="live-score-val" data-player="${name}" style="color:${scColor}">${sc != null ? sc : par}</span>
        <button class="live-score-btn lg-score-plus" data-player="${name}">+</button>
        <span style="font-size:10px;color:var(--dim);margin-left:6px;width:34px">Putts</span>
        <button class="live-putt-btn lg-putts-minus" data-player="${name}">−</button>
        <span style="font-size:22px;font-weight:700;color:var(--cream);width:28px;text-align:center">${pt != null ? pt : '—'}</span>
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
    const maxPutts = state.liveState.groupScores[playerName]?.[h] ?? 6;
    state.liveState.groupPutts[playerName][h] = Math.max(0, Math.min(maxPutts, cur + delta));
  }
  liveRenderGroupHole(h);
  // Bounce animation on updated score value
  if (field === 'score') {
    const scoreEl = document.querySelector(`.live-score-val[data-player="${playerName}"]`);
    if (scoreEl) {
      scoreEl.classList.add('score-bounce');
      setTimeout(() => scoreEl.classList.remove('score-bounce'), 210);
    }
    // Keep group match scores in sync (persisted at round-end via pushData)
    syncPlayerMatchScore(playerName);
    // Refresh overlay immediately so current player's score shows live
    import('./overlay.js').then(({ refreshMatchOverlay }) => refreshMatchOverlay());
    // Sixes: recalculate and redisplay standings
    if (state.gameMode === 'sixes') {
      import('./gamemodes.js').then(({ updateSixesBanner }) => updateSixesBanner(h));
    }
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

function renderMatchTeams() {
  const container = document.getElementById('live-match-teams');
  if (!container) return;
  const group = state.liveState.group;

  // Re-initialise teams if the player list has changed
  const mt = state.liveState.matchTeams;
  const allAssigned = [...mt.a, ...mt.b];
  const stale = !group.every(p => allAssigned.includes(p)) || allAssigned.some(p => !group.includes(p));
  if (stale || (!mt.a.length && !mt.b.length)) {
    state.liveState.matchTeams = { a: [], b: [] };
    group.forEach((p, i) => {
      if (i % 2 === 0) state.liveState.matchTeams.a.push(p);
      else state.liveState.matchTeams.b.push(p);
    });
  }

  const { a, b } = state.liveState.matchTeams;
  const chipSt = team => `padding:7px 14px;border-radius:20px;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${team === 'a' ? 'var(--gold)' : '#5dade2'};background:${team === 'a' ? 'rgba(201,168,76,.15)' : 'rgba(93,173,226,.12)'};color:${team === 'a' ? 'var(--gold)' : '#5dade2'};display:block;width:100%;text-align:left;margin-bottom:6px`;

  container.innerHTML = `<div style="font-size:10px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:var(--dim);margin-bottom:10px">Teams — tap a player to swap sides</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><div style="font-size:9px;color:var(--gold);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px">Team A</div><div id="live-team-a-chips"></div></div><div><div style="font-size:9px;color:#5dade2;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px">Team B</div><div id="live-team-b-chips"></div></div></div>`;

  const aEl = container.querySelector('#live-team-a-chips');
  const bEl = container.querySelector('#live-team-b-chips');

  const addChip = (name, team, targetEl) => {
    const btn = document.createElement('button');
    btn.style.cssText = chipSt(team);
    btn.textContent = name === state.me ? name + ' (you)' : name;
    btn.title = 'Tap to move to other team';
    btn.addEventListener('click', () => {
      if (team === 'a') {
        state.liveState.matchTeams.a = state.liveState.matchTeams.a.filter(p => p !== name);
        state.liveState.matchTeams.b.push(name);
      } else {
        state.liveState.matchTeams.b = state.liveState.matchTeams.b.filter(p => p !== name);
        state.liveState.matchTeams.a.push(name);
      }
      renderMatchTeams();
    });
    targetEl?.appendChild(btn);
  };

  a.forEach(n => addChip(n, 'a', aEl));
  b.forEach(n => addChip(n, 'b', bEl));
}

function getHcpStrokesOnHole(playerName, holeIdx) {
  const hcp = Math.round(state.liveState.hcpOverrides[playerName] ?? (state.gd.players[playerName]?.handicap || 0));
  if (hcp <= 0) return 0;
  const course = getCourseByRef();
  const si = course?.stroke_indexes?.[holeIdx] ?? (holeIdx + 1);
  return Math.floor(hcp / 18) + (si <= (hcp % 18) ? 1 : 0);
}

function teamLabel(players) {
  return players.length > 1
    ? players.map(n => n.split(' ')[0]).join(' & ')
    : players[0] || '?';
}

function updateMatchBanner(h) {
  const banner = document.getElementById('live-match-banner');
  const statusEl = document.getElementById('live-match-status');
  const holeEl = document.getElementById('live-match-hole-result');
  if (!banner || !state.liveState.matchPlay) {
    if (banner) banner.style.display = 'none';
    return;
  }

  computeMatchResult();
  const mr = state.liveState.matchResult;
  if (!mr || !mr.teamA) { banner.style.display = 'none'; return; }

  banner.style.display = '';

  // Hole result for current hole — best net score per team
  const bestNet = team => {
    const nets = team.map(p => {
      const g = state.liveState.groupScores[p]?.[h];
      return g != null ? g - getHcpStrokesOnHole(p, h) : null;
    }).filter(s => s != null);
    return nets.length ? Math.min(...nets) : null;
  };
  const netA = bestNet(mr.teamA), netB = bestNet(mr.teamB);
  if (netA != null && netB != null) {
    const holeResult = netA < netB ? `${mr.labelA} wins hole` : netA > netB ? `${mr.labelB} wins hole` : 'Hole halved';
    if (holeEl) holeEl.textContent = holeResult;
  } else {
    if (holeEl) holeEl.textContent = 'Scores not entered yet';
  }

  // Running match status
  if (mr.result === 'won') {
    const holesLeft = 17 - mr.holesPlayed;
    if (statusEl) statusEl.textContent = `🏆 ${mr.leader} wins ${mr.holesUp}&${holesLeft}`;
    banner.style.background = 'rgba(201,168,76,.18)';
  } else if (mr.result === 'halved') {
    if (statusEl) statusEl.textContent = 'Match halved after 18';
  } else if (mr.holesPlayed === 0) {
    if (statusEl) statusEl.textContent = `${mr.labelA} vs ${mr.labelB} — all square`;
  } else {
    const upStr = mr.holesUp > 0 ? `${mr.leader} ${mr.holesUp}UP` : 'All square';
    const remaining = 17 - mr.holesPlayed;
    if (mr.holesUp > 0 && mr.holesUp >= remaining) {
      if (statusEl) statusEl.textContent = `${mr.leader} DORMIE — ${upStr} with ${remaining} to play`;
    } else {
      if (statusEl) statusEl.textContent = `${upStr} through ${mr.holesPlayed}`;
    }
  }
}

function computeMatchResult() {
  if (!state.liveState.matchPlay) return;
  const mr = state.liveState.matchResult;
  if (!mr?.teamA || !mr?.teamB) return;

  const { teamA, teamB } = mr;
  let holesUp = 0; // positive = team A leads
  let holesPlayed = 0;
  let matchWon = false;

  for (let h = 0; h < 18; h++) {
    const netA = teamA.map(p => { const g = state.liveState.groupScores[p]?.[h]; return g != null ? g - getHcpStrokesOnHole(p, h) : null; }).filter(s => s != null);
    const netB = teamB.map(p => { const g = state.liveState.groupScores[p]?.[h]; return g != null ? g - getHcpStrokesOnHole(p, h) : null; }).filter(s => s != null);
    if (!netA.length || !netB.length) continue;
    const bestA = Math.min(...netA), bestB = Math.min(...netB);
    holesPlayed++;
    if (bestA < bestB) holesUp++;
    else if (bestB < bestA) holesUp--;
    const remaining = 18 - holesPlayed;
    if (Math.abs(holesUp) > remaining) { matchWon = true; break; }
  }

  const labelA = teamLabel(teamA), labelB = teamLabel(teamB);
  const leader = holesUp > 0 ? labelA : holesUp < 0 ? labelB : null;
  const result = matchWon ? 'won' : (holesPlayed === 18 && holesUp === 0) ? 'halved' : 'ongoing';

  state.liveState.matchResult = { ...mr, labelA, labelB, holesUp: Math.abs(holesUp), leader, holesPlayed, result };
}

// ── Running totals ────────────────────────────────────────────────

export function liveUpdateRunning() {
  const el = document.getElementById('live-run-score');
  const vp = document.getElementById('live-run-vp');
  const isGroup = state.liveState.group.length > 1;

  // Sixes: show live standings in the header bar
  if (state.gameMode === 'sixes' && isGroup) {
    import('./gamemodes.js').then(({ getSixesStandings }) => {
      const standings = getSixesStandings();
      if (el) {
        const top = standings[0];
        el.textContent = top ? `${top.name.split(' ')[0]}: ${top.points}pts` : '—';
        el.style.color = 'var(--par)';
      }
      if (vp) {
        vp.textContent = standings.slice(1).map(p => `${p.name.split(' ')[0]}: ${p.points}pts`).join(' · ');
      }
    });
    return;
  }

  if (isGroup) {
    // Show scoring-for player's gross vs par, with net below
    const primary = state.scoringFor || state.liveState.group[0];
    let tot = 0, par = 0, strokes = 0, n = 0;
    for (let h = 0; h < 18; h++) {
      par += state.cpars[h];
      const sc = state.liveState.groupScores[primary]?.[h];
      if (sc != null) { tot += sc; strokes += getHcpStrokesOnHole(primary, h); n++; }
    }
    if (!n) {
      if (el) { el.textContent = '—'; el.style.color = 'var(--gold)'; }
      if (vp) vp.textContent = '';
      return;
    }
    const d = tot - par;
    const nd = d - strokes;
    const fmtD = d === 0 ? 'E' : (d > 0 ? '+' + d : '' + d);
    const fmtN = nd === 0 ? 'E' : (nd > 0 ? '+' + nd : '' + nd);
    if (el) { el.textContent = fmtD; el.style.color = d < 0 ? 'var(--birdie)' : d > 0 ? 'var(--bogey)' : 'var(--gold)'; }
    if (vp) vp.textContent = fmtN + ' net';
  } else {
    let tot = 0, par = 0, strokes = 0, n = 0;
    for (let h = 0; h < 18; h++) {
      par += state.cpars[h];
      if (state.liveState.scores[h] != null) {
        tot += state.liveState.scores[h];
        strokes += getHcpStrokesOnHole(state.me, h);
        n++;
      }
    }
    if (!n) { if (el) { el.textContent = '—'; el.style.color = 'var(--gold)'; } if (vp) vp.textContent = ''; return; }
    const d = tot - par;
    const nd = d - strokes;
    const fmtD = d === 0 ? 'E' : (d > 0 ? '+' + d : '' + d);
    const fmtN = nd === 0 ? 'E' : (nd > 0 ? '+' + nd : '' + nd);
    if (el) { el.textContent = fmtD; el.style.color = d < 0 ? 'var(--birdie)' : d > 0 ? 'var(--bogey)' : 'var(--gold)'; }
    if (vp) vp.textContent = fmtN + ' net';
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
  const advance = () => {
    if (h < 17) {
      liveGoto(h + 1);
      localStorage.setItem('rr_live_backup', JSON.stringify({
        savedAt: Date.now(),
        hole: state.liveState.hole,
        scores: state.liveState.scores,
        putts: state.liveState.putts,
        fir: state.liveState.fir,
        gir: state.liveState.gir,
        notes: state.liveState.notes,
        group: state.liveState.group,
        groupScores: state.liveState.groupScores,
        groupPutts: state.liveState.groupPutts,
        groupFir: state.liveState.groupFir,
        groupGir: state.liveState.groupGir,
        course: getCourseByRef()?.name || '',
        gameMode: state.gameMode,
        wolfState: state.wolfState
      }));
    } else {
      liveFinishAndSave();
    }
  };

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

export function cancelRound(skipConfirm = false) {
  if (!skipConfirm && !confirm('Cancel this round? All progress will be lost.')) return;
  endLivePublish();
  localStorage.removeItem('rr_live_backup');
  import('./overlay.js').then(({ hideMatchOverlay }) => hideMatchOverlay());
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
  state.liveState.matchTeams = { a: [], b: [] };
  state.liveState.hcpOverrides = {};
  state.sixesState = null;
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
  import('./overlay.js').then(({ hideMatchOverlay }) => hideMatchOverlay());

  // Pull any remote editor score updates before saving
  if (state.liveInvite.liveRoundId && state.liveState.group.length > 1) {
    try {
      const { querySupabase } = await import('./api.js');
      const res = await querySupabase('fetchLiveRound', { roundId: state.liveInvite.liveRoundId });
      if (res?.round?.scores) {
        state.liveState.group.forEach(name => {
          if (name === state.me) return; // don't overwrite host's own scores
          const remote = res.round.scores[name];
          if (remote?.some(s => s != null)) state.liveState.groupScores[name] = remote;
        });
      }
    } catch (e) { /* non-critical — save local data */ }
  }

  endLivePublish();
  await liveGroupSave();
}

async function liveGroupSave() {
  const course = getCourseByRef();
  if (!course) { alert('No course selected.'); return; }
  const tees = Array.isArray(course.tees) ? course.tees : [];
  const teeData = tees.find(t => t.colour === state.stee) || tees[0] || {};

  const _rawDate = document.getElementById('r-date')?.value || '';
  const date = _rawDate
    ? (_rawDate.includes('-') ? _rawDate.split('-').reverse().join('/') : _rawDate)
    : new Date().toLocaleDateString('en-GB');
  const notes = document.getElementById('r-notes')?.value || '';

  const { pushData, pushSupabase, updateUnsyncedBadge, ss } = await import('./api.js');

  // Final match score sync for all group members before persisting
  state.liveState.group.forEach(name => syncPlayerMatchScore(name));

  // Pre-compute Sixes result once (shared across all player round objects)
  let sixesResult = null;
  if (state.gameMode === 'sixes' && state.sixesState) {
    const { sixesGetSaveData } = await import('./gamemodes.js');
    sixesResult = sixesGetSaveData();
  }

  const savedRounds = []; // collect rounds to protect if pushData fails

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
      rating: teeData.rating, slope: teeData.slope,
      // Include match outcome if match play was used
      ...(state.liveState.matchPlay && state.liveState.matchResult
        ? { matchOutcome: { ...state.liveState.matchResult } }
        : {}),
      // Include Wolf result if Wolf round
      ...(state.gameMode === 'wolf' && state.wolfState?.order?.length
        ? { wolfResult: { order: state.wolfState.order, finalScores: { ...state.wolfState.scores }, holeResults: state.wolfState.holeResults, winner: [...state.wolfState.order].sort((a, b) => (state.wolfState.scores[b] || 0) - (state.wolfState.scores[a] || 0))[0] || '' } }
        : {}),
      // Include Sixes result if Sixes round
      ...(sixesResult ? { sixesResult } : {})
    };
    if (!state.gd.players[playerName]) state.gd.players[playerName] = { handicap: 0, rounds: [] };
    state.gd.players[playerName].rounds.push(rnd);
    savedRounds.push({ savedAt: Date.now(), player: playerName, round: rnd });
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
        rating: teeData.rating, slope: teeData.slope,
        wolfResult
      };
      if (!state.gd.players[playerName]) state.gd.players[playerName] = { handicap: 0, rounds: [] };
      state.gd.players[playerName].rounds.push(rnd);
      savedRounds.push({ savedAt: Date.now(), player: playerName, round: rnd });
    }
  }

  // Capture info before state reset for match context sheet
  const _me = state.me;
  const _meRoundId = state.gd.players[state.me]?.rounds?.slice(-1)[0]?.id;
  const _groupPlayers = [...state.liveState.group];

  const ok = await pushData(); // single pushData call for all players
  if (ok) {
    localStorage.removeItem('rr_live_backup');
  } else {
    // Protect rounds in a key loadGist() never overwrites
    const unsynced = JSON.parse(localStorage.getItem('rr_unsynced_rounds') || '[]');
    for (const item of savedRounds) unsynced.push(item);
    localStorage.setItem('rr_unsynced_rounds', JSON.stringify(unsynced));
    updateUnsyncedBadge();
  }

  // Parallel write to Supabase for each saved round — fire and forget
  Promise.all(savedRounds.map(item => {
    const playerData = {
      name: item.player,
      email: state.gd.players[item.player]?.email || null,
      handicap: state.gd.players[item.player]?.handicap || 0,
      matchCode: state.gd.players[item.player]?.matchCode || null
    };
    return pushSupabase('saveRound', { round: item.round, playerData });
  })).then(results => {
    const allSbOk = results.every(Boolean);
    if (ok && allSbOk) {
      ss('ok', 'Synced \u2713');
    } else if (ok && !allSbOk) {
      ss('warn', '\u26A0 Gist only');
    }
  });

  const syncMsg = ok ? '\u2705 Saved & synced!' : '\u26A0\uFE0F Saved locally \u2014 will sync when online';
  const names = _groupPlayers.join(', ');
  let finalMsg = `${syncMsg}\n\nRound saved for: ${names}\n${course.name} \u00B7 ${state.stee} tees`;
  if (sixesResult?.standings?.length) {
    const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
    const standingLines = sixesResult.standings.map((p, i) => `  ${medals[i] || ' '} ${p.name}: ${p.points}pts`).join('\n');
    finalMsg += `\n\n\u26F3 Sixes Result:\n${standingLines}`;
  }
  alert(finalMsg);

  // Reset
  state.sixesState = null;
  state.liveState = {
    hole: 0, scores: Array(18).fill(null), putts: Array(18).fill(null),
    fir: Array(18).fill(''), gir: Array(18).fill(''), notes: Array(18).fill(''),
    group: [], groupScores: {}, groupPutts: {}, groupFir: {}, groupGir: {},
    matchPlay: false, matchFormat: 'singles', matchResult: null, matchTeams: { a: [], b: [] }, hcpOverrides: {}
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
  const course = getCourseByRef();
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
  const course = getCourseByRef();
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

  const { pushData } = await import('./api.js');
  await pushData();

  if (msg) { msg.style.color = 'var(--par)'; msg.textContent = '✅ Report submitted — admin will review.'; }
  setTimeout(() => { document.getElementById('correction-modal').style.display = 'none'; }, 1500);
}
