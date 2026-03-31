// ─────────────────────────────────────────────────────────────────
// COMPETITION SCORING — Standalone hole-by-hole UI for competitions
// Carbon copy of live.js scoring, scoped to tee group, no game modes.
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { getCourseByRef } from './courses.js';
import { scoreCol } from './scorecard.js';
import { goTo } from './nav.js';

let _statPlayer = null;

// ── Comp scoring state (separate from live state) ────────────────
const cs = {
  active: false,
  comp: null,
  roundIdx: 0,
  hole: 0,
  group: [],
  groupScores: {},
  groupPutts: {},
  groupFir: {},
  groupGir: {},
  notes: Array(18).fill(''),
  hcpOverrides: {},
};

// ── Nudge toast ──────────────────────────────────────────────────
function _showNudge(msg) {
  let el = document.getElementById('cs-nudge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cs-nudge';
    el.style.cssText = 'position:fixed;top:calc(var(--safe-top,0px) + 64px);left:50%;transform:translateX(-50%);background:var(--card);border:1px solid rgba(201,168,76,.4);border-radius:20px;padding:8px 20px;font-size:12px;font-family:"DM Sans",sans-serif;color:var(--cream);z-index:9999;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,.4);white-space:nowrap;transition:opacity .3s;opacity:0';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 1500);
}

// ── AutoGir ──────────────────────────────────────────────────────
function _autoGirCheck() {
  const h = cs.hole;
  const par = state.cpars[h];
  const sc = cs.groupScores[_statPlayer]?.[h];
  const pt = cs.groupPutts[_statPlayer]?.[h];
  if (sc == null || pt == null || sc <= 0 || pt <= 0 || pt >= sc) return;
  if (!cs.groupGir[_statPlayer]) cs.groupGir[_statPlayer] = Array(18).fill('');
  cs.groupGir[_statPlayer][h] = (sc - pt) <= (par - 2) ? 'Yes' : 'No';
  // Don't call _renderStatPanel here — caller already renders
}

// ── Score/putts adjuster ─────────────────────────────────────────
function _adj(playerName, field, delta) {
  const h = cs.hole;
  const par = state.cpars[h];
  if (field === 'score') {
    const cur = cs.groupScores[playerName]?.[h] ?? par;
    if (!cs.groupScores[playerName]) cs.groupScores[playerName] = Array(18).fill(null);
    cs.groupScores[playerName][h] = Math.max(1, Math.min(15, cur + delta));
    if (playerName === _statPlayer) _autoGirCheck();
  } else {
    const cur = cs.groupPutts[playerName]?.[h] ?? 2;
    if (!cs.groupPutts[playerName]) cs.groupPutts[playerName] = Array(18).fill(null);
    const maxPutts = cs.groupScores[playerName]?.[h] ?? par;
    const newVal = Math.max(0, Math.min(maxPutts, cur + delta));
    if (delta > 0 && newVal === cur) _showNudge("Putts can't exceed your score");
    cs.groupPutts[playerName][h] = newVal;
  }
  _renderHole(h);
  _renderStatPanel(h);
  if (field === 'putts' && playerName === _statPlayer) _autoGirCheck();
  _updateRunning();
  _renderPips();
  _saveBackup();
}

function _toggle(playerName, field, val) {
  const h = cs.hole;
  const store = field === 'fir' ? cs.groupFir : cs.groupGir;
  if (!store[playerName]) store[playerName] = Array(18).fill('');
  store[playerName][h] = val;
  _renderStatPanel(h);
  _saveBackup();
}

// ── Init comp scoring ────────────────────────────────────────────
export function initCompScore() {
  if (cs.active && cs.group.length > 0) {
    // Restore in-progress round
    const setup = document.getElementById('cs-setup');
    const holeView = document.getElementById('cs-hole-view');
    if (setup) setup.style.display = 'none';
    if (holeView) holeView.style.display = 'flex';
    _renderPips();
    _goto(cs.hole);
    return;
  }

  // Show setup / pre-launch screen
  const setup = document.getElementById('cs-setup');
  const holeView = document.getElementById('cs-hole-view');
  if (setup) setup.style.display = 'block';
  if (holeView) holeView.style.display = 'none';

  const comp = cs.comp || state.activeCompetition;
  if (!comp) {
    if (setup) setup.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--dimmer)">No competition loaded.</div>';
    return;
  }

  const roundsConfig = comp.rounds_config || [];
  const rc = roundsConfig[cs.roundIdx] || roundsConfig[0] || {};
  const shortCourse = (rc.course || '').replace(/ Golf Club| Golf Course| Golf Links/g, '');

  if (setup) {
    setup.innerHTML = `
      <div style="padding:20px">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Competition Round</div>
        <div style="font-size:20px;font-weight:700;color:var(--cream);margin-bottom:4px">${comp.name}</div>
        <div style="font-size:12px;color:var(--dim);margin-bottom:16px">${shortCourse || 'Course TBD'} · Round ${cs.roundIdx + 1}</div>
        <div style="font-size:11px;color:var(--dim);margin-bottom:6px">Your tee group:</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
          ${cs.group.map(name => `<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--mid);border:1px solid var(--border);border-radius:8px">
            <div style="width:24px;height:24px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--dim)">${(name.split(' ').map(w => w[0]).join('')).slice(0,2).toUpperCase()}</div>
            <span style="font-size:12px;color:var(--cream)">${name}</span>
          </div>`).join('')}
        </div>
        <button id="cs-start-btn" class="btn" style="width:100%;border-radius:40px;font-size:15px;padding:16px">Let's go →</button>
      </div>`;

    document.getElementById('cs-start-btn')?.addEventListener('click', () => {
      // Init arrays
      cs.groupScores = {};
      cs.groupPutts = {};
      cs.groupFir = {};
      cs.groupGir = {};
      cs.group.forEach(name => {
        cs.groupScores[name] = Array(18).fill(null);
        cs.groupPutts[name] = Array(18).fill(null);
        cs.groupFir[name] = Array(18).fill('');
        cs.groupGir[name] = Array(18).fill('');
      });
      cs.active = true;
      cs.hole = 0;
      _statPlayer = state.me;
      if (setup) setup.style.display = 'none';
      if (holeView) holeView.style.display = 'flex';
      _renderPips();
      _goto(0);

      // Show leaderboard pill
      const lbPill = document.getElementById('cs-lb-pill');
      if (lbPill) lbPill.style.display = 'flex';
    });
  }
}

// ── Prepare comp scoring (called from competition.js) ────────────
export function prepareCompScore(comp, roundIdx, groupPlayers) {
  cs.comp = comp;
  cs.roundIdx = roundIdx;
  cs.group = [...groupPlayers];
  cs.hcpOverrides = comp.hcp_overrides || {};
  cs.active = false;
  cs.hole = 0;
  cs.notes = Array(18).fill('');
}

// ── Navigate to hole ─────────────────────────────────────────────
function _goto(h) {
  if (h < 0 || h > 17) return;
  try {
    cs.hole = h;
    // Pre-fill null scores to par, putts to 2
    cs.group.forEach(name => {
      if (cs.groupScores[name] && cs.groupScores[name][h] === null) {
        cs.groupScores[name][h] = state.cpars[h];
      }
      if (cs.groupPutts[name] && cs.groupPutts[name][h] === null) {
        cs.groupPutts[name][h] = 2;
      }
    });
    _statPlayer = _statPlayer || state.me;
    const par = state.cpars[h];
    const si = state.scannedSI?.some(v => v != null) ? state.scannedSI : null;

    const holeNumEl = document.getElementById('cs-hole-num');
    if (holeNumEl) holeNumEl.textContent = 'Hole ' + (h + 1);
    const parEl = document.getElementById('cs-par');
    if (parEl) parEl.textContent = par;
    const subEl = document.getElementById('cs-hole-sub');
    if (subEl) subEl.textContent = si && si[h] > 0 ? 'SI ' + si[h] : '';

    _renderHole(h);
    _renderStatPanel(h);

    const noteEl = document.getElementById('cs-note');
    if (noteEl) noteEl.value = cs.notes[h] || '';

    const prevBtn = document.getElementById('cs-prev');
    if (prevBtn) prevBtn.disabled = h === 0;
    const nextBtn = document.getElementById('cs-next');
    if (nextBtn) nextBtn.textContent = h === 17 ? 'Finish & Save' : 'Next hole →';

    _updateRunning();
    _renderPips();
  } catch (e) {
    console.error('[compScore] goto error', h, e);
  }
}

// ── Hole rendering (player rows with score adjusters) ────────────
function _renderHole(h) {
  const container = document.getElementById('cs-group-rows');
  if (!container) return;
  container.innerHTML = '';
  const par = state.cpars[h];

  cs.group.forEach(name => {
    const sc = cs.groupScores[name]?.[h] ?? null;
    const isMe = name === state.me;
    const sel = name === _statPlayer;

    let runTot = 0, runPar = 0, thru = 0;
    for (let i = 0; i < 18; i++) {
      const s = cs.groupScores[name]?.[i];
      if (s != null && i !== h) { runTot += s; runPar += state.cpars[i]; thru++; }
    }
    const runD = runTot - runPar;
    const fmtRun = thru > 0
      ? `<span style="color:${runD < 0 ? 'var(--birdie)' : runD === 0 ? 'var(--par)' : 'var(--bogey)'}">${runD === 0 ? 'E' : (runD > 0 ? '+' : '') + runD}</span> thru ${thru}`
      : 'No scores yet';

    const hd = sc != null ? sc - par : null;
    let scCol = 'var(--dimmer)';
    if (hd != null) { if (hd <= -2) scCol = 'var(--eagle)'; else if (hd === -1) scCol = 'var(--birdie)'; else if (hd === 0) scCol = 'var(--par)'; else if (hd === 1) scCol = 'var(--bogey)'; else scCol = 'var(--double)'; }

    const row = document.createElement('div');
    row.style.cssText = `background:${sel ? 'var(--card)' : 'var(--mid)'};border:1px solid ${sel ? 'var(--gold)' : 'var(--border)'};border-radius:10px;padding:11px 14px;display:flex;align-items:center;gap:12px;margin-bottom:6px;cursor:pointer`;
    row.dataset.player = name;
    row.innerHTML = `
      <div style="width:32px;height:32px;border-radius:50%;background:${sel ? 'rgba(201,168,76,.2)' : 'var(--border)'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${sel ? 'var(--gold)' : 'var(--dim)'};flex-shrink:0">${(name.split(' ').map(w => w[0]).join('')).slice(0,2).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;color:var(--cream)">${name}${isMe ? '<span style="font-size:10px;color:var(--gold);margin-left:5px">you</span>' : ''}</div>
        <div style="font-size:11px;color:var(--dim);margin-top:1px">${fmtRun}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="cs-score-minus" data-player="${name}" style="width:30px;height:30px;border-radius:8px;background:var(--navy);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--dim);cursor:pointer;font-weight:300">−</button>
        <div style="font-size:20px;font-weight:700;min-width:24px;text-align:center;color:${scCol}">${sc != null ? sc : '·'}</div>
        <button class="cs-score-plus" data-player="${name}" style="width:30px;height:30px;border-radius:8px;background:var(--navy);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--dim);cursor:pointer;font-weight:300">+</button>
      </div>`;
    container.appendChild(row);
  });

  // Row click → select player
  container.querySelectorAll('[data-player]').forEach(row => {
    if (row.tagName === 'DIV' && row.parentElement === container) {
      row.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        _statPlayer = row.dataset.player;
        _renderHole(h);
        _renderStatPanel(h);
      });
    }
  });
  container.querySelectorAll('.cs-score-minus').forEach(btn => { btn.addEventListener('click', e => { e.stopPropagation(); _adj(btn.dataset.player, 'score', -1); }); });
  container.querySelectorAll('.cs-score-plus').forEach(btn => { btn.addEventListener('click', e => { e.stopPropagation(); _adj(btn.dataset.player, 'score', 1); }); });
}

// ── Stat panel (putts, FIR, GIR) ─────────────────────────────────
function _renderStatPanel(h) {
  if (!_statPlayer) _statPlayer = state.me;
  const par = state.cpars[h];
  const pt = cs.groupPutts[_statPlayer]?.[h] ?? 2;
  const fir = cs.groupFir[_statPlayer]?.[h] ?? '';
  const gir = cs.groupGir[_statPlayer]?.[h] ?? '';
  const isPar3 = par === 3;

  const whoEl = document.getElementById('cs-stat-who');
  if (whoEl) whoEl.textContent = _statPlayer;
  const puttVal = document.getElementById('cs-putt-val');
  if (puttVal) puttVal.textContent = pt;

  // FIR toggles
  const firEl = document.getElementById('cs-fir-toggles');
  if (firEl) {
    if (isPar3) {
      firEl.innerHTML = '<span style="font-size:10px;color:var(--dimmer)">N/A (par 3)</span>';
      if (!cs.groupFir[_statPlayer]) cs.groupFir[_statPlayer] = Array(18).fill('');
      cs.groupFir[_statPlayer][h] = 'N/A';
    } else {
      firEl.innerHTML = ['Yes', 'No'].map(v => {
        const active = fir === v;
        const cls = active ? (v === 'Yes' ? 'background:rgba(46,204,113,.15);border-color:var(--par);color:var(--par)' : 'background:rgba(231,76,60,.15);border-color:var(--double);color:var(--double)') : 'background:var(--navy);border-color:var(--border);color:var(--dim)';
        return `<button class="cs-fir-btn" data-val="${v}" style="padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;${cls};border-width:1px;border-style:solid">${v === 'Yes' ? 'Y' : 'N'}</button>`;
      }).join('');
    }
  }

  // GIR toggles
  const girEl = document.getElementById('cs-gir-toggles');
  if (girEl) {
    girEl.innerHTML = ['Yes', 'No'].map(v => {
      const active = gir === v;
      const cls = active ? (v === 'Yes' ? 'background:rgba(46,204,113,.15);border-color:var(--par);color:var(--par)' : 'background:rgba(231,76,60,.15);border-color:var(--double);color:var(--double)') : 'background:var(--navy);border-color:var(--border);color:var(--dim)';
      return `<button class="cs-gir-btn" data-val="${v}" style="padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;${cls};border-width:1px;border-style:solid">${v === 'Yes' ? 'Y' : 'N'}</button>`;
    }).join('');
  }

  // Wire putts (onclick to prevent accumulation)
  const pMinus = document.getElementById('cs-putt-minus');
  if (pMinus) pMinus.onclick = () => _adj(_statPlayer, 'putts', -1);
  const pPlus = document.getElementById('cs-putt-plus');
  if (pPlus) pPlus.onclick = () => _adj(_statPlayer, 'putts', 1);

  // Wire FIR (delegation)
  const firParent = document.getElementById('cs-fir-toggles');
  if (firParent) firParent.onclick = e => {
    const btn = e.target.closest('.cs-fir-btn');
    if (!btn) return;
    const v = btn.dataset.val;
    const cur = cs.groupFir[_statPlayer]?.[cs.hole];
    _toggle(_statPlayer, 'fir', cur === v ? '' : v);
  };

  // Wire GIR (delegation)
  const girParent = document.getElementById('cs-gir-toggles');
  if (girParent) girParent.onclick = e => {
    const btn = e.target.closest('.cs-gir-btn');
    if (!btn) return;
    const v = btn.dataset.val;
    const cur = cs.groupGir[_statPlayer]?.[cs.hole];
    _toggle(_statPlayer, 'gir', cur === v ? '' : v);
  };
}

// ── Pip bars ─────────────────────────────────────────────────────
function _renderPips() {
  const el = document.getElementById('cs-pips');
  if (!el) return;
  const first = cs.group[0];
  el.innerHTML = Array.from({ length: 18 }, (_, i) => {
    const sc = cs.groupScores[first]?.[i];
    const par = state.cpars[i];
    const d = sc != null ? sc - par : null;
    let col = 'var(--border)';
    if (d != null) { if (d <= -2) col = 'var(--eagle)'; else if (d === -1) col = 'var(--birdie)'; else if (d === 0) col = 'var(--par)'; else if (d === 1) col = 'var(--bogey)'; else col = 'var(--double)'; }
    const cur = i === cs.hole ? ';outline:1px solid var(--gold);outline-offset:1px' : '';
    return `<div style="flex:1;height:4px;border-radius:2px;background:${col}${cur}"></div>`;
  }).join('');
}

// ── Running score ────────────────────────────────────────────────
function _updateRunning() {
  const el = document.getElementById('cs-running');
  if (!el) return;
  const first = cs.group[0] || state.me;
  let tot = 0, par = 0, n = 0;
  for (let i = 0; i < 18; i++) {
    const s = cs.groupScores[first]?.[i];
    if (s != null) { tot += s; par += state.cpars[i]; n++; }
  }
  const d = tot - par;
  if (n > 0) {
    el.innerHTML = `<span style="font-size:18px;font-weight:700;color:${d < 0 ? 'var(--birdie)' : d === 0 ? 'var(--par)' : 'var(--bogey)'}">${d === 0 ? 'E' : (d > 0 ? '+' : '') + d}</span> <span style="font-size:11px;color:var(--dim)">thru ${n}</span>`;
  } else {
    el.innerHTML = '';
  }
}

// ── Next / Finish ────────────────────────────────────────────────
export function compScoreNext() {
  if (cs.hole < 17) { _goto(cs.hole + 1); _saveBackup(); }
  else { _finishAndSave(); }
}

export function compScorePrev() {
  if (cs.hole > 0) _goto(cs.hole - 1);
}

// ── Save backup to localStorage ──────────────────────────────────
function _saveBackup() {
  try {
    localStorage.setItem('rr_comp_backup', JSON.stringify({
      savedAt: Date.now(), comp: cs.comp?.id, roundIdx: cs.roundIdx,
      hole: cs.hole, group: cs.group,
      groupScores: cs.groupScores, groupPutts: cs.groupPutts,
      groupFir: cs.groupFir, groupGir: cs.groupGir, notes: cs.notes,
    }));
  } catch {}
}

// ── Save note ────────────────────────────────────────────────────
export function compScoreSaveNote() {
  const noteEl = document.getElementById('cs-note');
  if (noteEl) cs.notes[cs.hole] = noteEl.value;
  _saveBackup();
}

// ── Finish round & save ──────────────────────────────────────────
async function _finishAndSave() {
  cs.active = false;
  const course = getCourseByRef();
  if (!course) { alert('No course selected.'); return; }
  const tees = Array.isArray(course.tees) ? course.tees : [];
  const teeData = tees.find(t => t.colour === state.stee) || tees[0] || {};
  const roundsConfig = cs.comp?.rounds_config || [];
  const rc = roundsConfig[cs.roundIdx] || {};
  const date = rc.date || new Date().toLocaleDateString('en-GB');

  const { pushData, pushSupabase, updateUnsyncedBadge, ss } = await import('./api.js');
  const savedRounds = [];

  for (const playerName of cs.group) {
    const sc = cs.groupScores[playerName] || Array(18).fill(null);
    const pt = cs.groupPutts[playerName] || Array(18).fill(null);
    const fi = cs.groupFir[playerName] || Array(18).fill('');
    const gi = cs.groupGir[playerName] || Array(18).fill('');
    const vs = sc.filter(Boolean);
    if (!vs.length) continue;
    const ts = vs.reduce((a, b) => a + b, 0);
    const tp = state.cpars.reduce((a, b) => a + b, 0);
    const rnd = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      player: playerName,
      course: course.name, loc: course.loc || course.location || '',
      tee: state.stee, date, notes: cs.notes.join(' | ').trim() || '',
      pars: [...state.cpars], scores: sc, putts: pt, fir: fi, gir: gi,
      totalScore: ts, totalPar: tp, diff: ts - tp,
      birdies: sc.filter((s, i) => s && s < state.cpars[i]).length,
      parsCount: sc.filter((s, i) => s && s === state.cpars[i]).length,
      bogeys: sc.filter((s, i) => s && s === state.cpars[i] + 1).length,
      doubles: sc.filter((s, i) => s && s >= state.cpars[i] + 2).length,
      eagles: sc.filter((s, i) => s && s <= state.cpars[i] - 2).length,
      rating: teeData.rating, slope: teeData.slope,
    };
    if (!state.gd.players[playerName]) state.gd.players[playerName] = { handicap: 0, rounds: [] };
    state.gd.players[playerName].rounds.push(rnd);
    savedRounds.push({ savedAt: Date.now(), player: playerName, round: rnd });
  }

  const ok = await pushData();
  if (ok) { localStorage.removeItem('rr_comp_backup'); }
  else {
    const unsynced = JSON.parse(localStorage.getItem('rr_unsynced_rounds') || '[]');
    savedRounds.forEach(item => unsynced.push(item));
    localStorage.setItem('rr_unsynced_rounds', JSON.stringify(unsynced));
    updateUnsyncedBadge();
  }

  // Fire-and-forget Supabase saves
  Promise.all(savedRounds.map(item => {
    const pd = { name: item.player, email: state.gd.players[item.player]?.email || null, handicap: state.gd.players[item.player]?.handicap || 0 };
    return pushSupabase('saveRound', { round: item.round, playerData: pd });
  })).catch(() => {});

  alert(`Round saved for ${cs.group.join(', ')}!\n${course.name} · ${state.stee || ''} tees`);

  // Reset
  cs.hole = 0; cs.group = []; cs.groupScores = {}; cs.groupPutts = {};
  cs.groupFir = {}; cs.groupGir = {}; cs.notes = Array(18).fill('');

  // Hide leaderboard pill
  const lbPill = document.getElementById('cs-lb-pill');
  if (lbPill) lbPill.style.display = 'none';

  // Navigate back to competition home
  state.activeCompetitionId = cs.comp?.id;
  state.activeCompetition = cs.comp;
  goTo('competition');
}

// ── Cancel round ─────────────────────────────────────────────────
export function compScoreCancel() {
  if (!confirm('Cancel this competition round? All progress will be lost.')) return;
  localStorage.removeItem('rr_comp_backup');
  cs.active = false; cs.hole = 0; cs.group = [];
  cs.groupScores = {}; cs.groupPutts = {}; cs.groupFir = {}; cs.groupGir = {};
  const lbPill = document.getElementById('cs-lb-pill');
  if (lbPill) lbPill.style.display = 'none';
  goTo('competition');
}
