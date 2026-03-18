// ─────────────────────────────────────────────────────────────────
// PLAYERS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { DEFAULT_GIST } from './constants.js';
import { loadGist, pushGist } from './api.js';
import { goTo } from './nav.js';
import { renderScannedCourses, populateCourses } from './courses.js';
import { renderHomeStats } from './stats.js';

export function initials(n) {
  return n.split(' ').map(p => p[0] || '').join('').toUpperCase().slice(0, 2);
}

export function renderOnboard() {
  const list = document.getElementById('onb-player-list');
  const names = Object.keys(state.gd.players);
  if (!names.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--dim);padding:8px 0;text-align:center">No players yet \u2014 add yourself below</div>';
    return;
  }
  list.innerHTML = '';
  names.forEach(n => {
    const p = state.gd.players[n];
    const rs = p.rounds || [];
    const sc = rs.map(r => r.totalScore).filter(Boolean);
    const div = document.createElement('div');
    div.className = 'player-card';
    div.innerHTML = `<div class="avatar">${initials(n)}</div><div><div class="pname">${n}</div><div class="pmeta">${rs.length} round${rs.length !== 1 ? 's' : ''} \u00B7 Best: ${sc.length ? Math.min(...sc) : '—'}</div></div>`;
    div.addEventListener('click', () => enterAs(n));
    list.appendChild(div);
  });
}

export function enterAs(n) {
  state.me = n;
  if (!state.gd.players[n]) state.gd.players[n] = { handicap: 0, rounds: [] };
  document.getElementById('pg-onboard').style.display = 'none';
  const pm = document.getElementById('pg-main');
  pm.style.display = 'flex';
  document.getElementById('s-gistid').textContent = 'gist.github.com/murraysirel/' + DEFAULT_GIST;
  populateCourses();
  renderHomeStats();
  ensureGroupCode();
  seedGreenCoords();
  goTo('home');
  document.getElementById('r-date').value = new Date().toLocaleDateString('en-GB');
}

export function addAndEnter() {
  const n = document.getElementById('new-name').value.trim();
  if (!n) { alert('Please enter your name.'); return; }
  if (state.gd.requireGroupCode && state.gd.groupCode) {
    const entered = (document.getElementById('new-group-code')?.value || '').trim().toUpperCase();
    const errEl = document.getElementById('group-code-err');
    if (entered !== state.gd.groupCode) {
      if (errEl) { errEl.style.display = 'block'; setTimeout(() => errEl.style.display = 'none', 4000); }
      document.getElementById('group-code-field').style.display = 'block';
      return;
    }
  }
  if (!state.gd.players[n]) state.gd.players[n] = { handicap: 0, rounds: [] };
  pushGist();
  enterAs(n);
}

export function signOut() {
  state.me = '';
  document.getElementById('pg-main').style.display = 'none';
  document.getElementById('pg-onboard').style.display = 'block';
  renderOnboard();
}

export function renderAllPlayers() {
  const list = document.getElementById('all-players');
  list.innerHTML = '';
  const pgc = document.getElementById('players-group-code');
  if (pgc) pgc.textContent = state.gd.groupCode || '—';
  const gcBtn = document.getElementById('gc-toggle-btn');
  if (gcBtn) gcBtn.textContent = state.gd.requireGroupCode ? 'On' : 'Off';
  renderSeasonList();
  Object.keys(state.gd.players).forEach(n => {
    const p = state.gd.players[n];
    const rs = p.rounds || [];
    const sc = rs.map(r => r.totalScore).filter(Boolean);
    const div = document.createElement('div');
    div.className = 'player-card' + (n === state.me ? ' me' : '');
    div.innerHTML = `<div class="avatar">${initials(n)}</div><div style="flex:1"><div class="pname">${n}${n === state.me ? ' <span style="font-size:10px;color:var(--gold)">\u25B6 you</span>' : ''}</div><div class="pmeta">${rs.length} round${rs.length !== 1 ? 's' : ''} \u00B7 Best: ${sc.length ? Math.min(...sc) : '—'}</div></div>`;
    if (n !== state.me) { div.addEventListener('click', () => { enterAs(n); goTo('home'); }); }
    list.appendChild(div);
  });
  renderScannedCourses();
}

export function addPlayer() {
  const n = document.getElementById('add-name').value.trim();
  if (!n) { document.getElementById('add-msg').textContent = 'Please enter a name.'; return; }
  if (state.gd.players[n]) { document.getElementById('add-msg').textContent = 'Already exists!'; return; }
  state.gd.players[n] = { handicap: 0, rounds: [] };
  pushGist();
  document.getElementById('add-msg').textContent = '\u2705 ' + n + ' added! They can now select themselves on the home screen.';
  document.getElementById('add-name').value = '';
  renderAllPlayers();
}

// Multi-player scoring
export function renderPlayersToday() {
  const wrap = document.getElementById('players-today-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const allPlayers = Object.keys(state.gd.players || {});
  allPlayers.forEach(name => {
    const isActive = (state.scoringFor || state.me) === name;
    const btn = document.createElement('button');
    btn.style.cssText = `padding:6px 12px;border-radius:20px;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${isActive ? 'var(--gold)' : 'rgba(255,255,255,.15)'};background:${isActive ? 'rgba(201,168,76,.15)' : 'transparent'};color:${isActive ? 'var(--gold)' : 'var(--dim)'};font-weight:${isActive ? '600' : '400'}`;
    btn.textContent = name === state.me ? name + ' (you)' : name;
    btn.addEventListener('click', () => { state.scoringFor = name; renderPlayersToday(); updateScoringForLabel(); });
    wrap.appendChild(btn);
  });
  updateScoringForLabel();
}

export function updateScoringForLabel() {
  const label = document.getElementById('scoring-for-name');
  if (!label) return;
  const active = state.scoringFor || state.me;
  label.textContent = active === state.me ? 'yourself' : active;
}

// Handicap — in players module for admin panel use
export function saveHandicapForPlayer(playerName, value) {
  if (!state.gd.players[playerName]) return;
  state.gd.players[playerName].handicap = value;
  pushGist();
}

// Group utils
function ensureGroupCode() {
  if (!state.gd.groupCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    state.gd.groupCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    pushGist();
  }
  const gcEl = document.getElementById('lb-group-code');
  if (gcEl) gcEl.textContent = state.gd.groupCode;
  const pgc = document.getElementById('players-group-code');
  if (pgc) pgc.textContent = state.gd.groupCode;
}

function seedGreenCoords() {
  if (!state.gd.greenCoords) state.gd.greenCoords = {};
  const CH = 'Croham Hurst Golf Club';
  if (!state.gd.greenCoords[CH]) {
    const g = [[51.3481,-0.0742],[51.3475,-0.0731],[51.3468,-0.0724],[51.3462,-0.0716],[51.3455,-0.0723],[51.3448,-0.0731],[51.3441,-0.0739],[51.3435,-0.0748],[51.3442,-0.0761],[51.345,-0.0754],[51.3457,-0.0763],[51.3464,-0.0772],[51.3471,-0.0763],[51.3478,-0.0754],[51.3485,-0.0745],[51.3492,-0.0736],[51.3499,-0.0727],[51.3488,-0.0718]];
    state.gd.greenCoords[CH] = {};
    g.forEach(([lat, lng], i) => {
      state.gd.greenCoords[CH][i] = {
        front: { lat: lat - 0.00010, lng },
        mid: { lat, lng },
        back: { lat: lat + 0.00010, lng },
        _approx: true
      };
    });
  }
}

function renderSeasonList() {
  const el = document.getElementById('season-list'); if (!el) return;
  const seasons = state.gd.seasons || [];
  if (!seasons.length) { el.innerHTML = '<div style="font-size:12px;color:var(--dimmer);padding:4px 0">No custom seasons yet \u2014 rounds are grouped by year</div>'; return; }
  el.innerHTML = '';
  seasons.forEach((s, i) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)';
    d.innerHTML = `<div style="flex:1;font-size:13px;color:var(--cream)">${s.name}</div>
      <div style="font-size:11px;color:var(--dim)">${s.year}</div>
      <button class="btn btn-ghost" style="width:auto;padding:4px 10px;font-size:11px" data-delete-season="${i}">Remove</button>`;
    d.querySelector('[data-delete-season]').addEventListener('click', () => {
      import('./group.js').then(({ deleteSeason }) => deleteSeason(i));
    });
    el.appendChild(d);
  });
}
