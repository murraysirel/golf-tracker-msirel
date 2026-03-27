// ─────────────────────────────────────────────────────────────────
// PLAYERS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { loadGist, pushGist } from './api.js';
import { goTo } from './nav.js';
import { initCourseSearch, renderScannedCourses } from './courses.js';
import { renderHomeStats } from './stats.js';

export function initials(n) {
  return n.split(' ').map(p => p[0] || '').join('').toUpperCase().slice(0, 2);
}

export function avatarHtml(name, size = 36, isMe = false) {
  const img = state.gd.players?.[name]?.avatarImg;
  if (img) {
    const border = isMe ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,.1)';
    return `<img src="${img}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:${border};flex-shrink:0">`;
  }
  const cls = isMe ? 'lb-avatar-me' : 'avatar';
  const extra = !isMe ? `style="width:${size}px;height:${size}px;font-size:13px;border:1px solid rgba(255,255,255,.1)"` : '';
  return `<div class="${cls}" ${extra}>${initials(name)}</div>`;
}

export function refreshAvatarUI() {
  if (!state.me) return;
  const img = state.gd.players?.[state.me]?.avatarImg;
  // Header button
  const el = document.getElementById('hdr-avatar-initials');
  if (el) {
    if (img) {
      el.innerHTML = `<img src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      el.style.cssText = 'width:100%;height:100%;display:block;overflow:hidden;border-radius:50%';
    } else {
      el.textContent = initials(state.me);
      el.style.cssText = "font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;color:var(--gold)";
    }
  }
  // Profile panel circle
  const disp = document.getElementById('profile-avatar-display');
  if (disp) {
    disp.innerHTML = img
      ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover">`
      : `<span style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:700;color:var(--gold)">${initials(state.me)}</span>`;
  }
  const removeBtn = document.getElementById('avatar-remove-btn');
  if (removeBtn) removeBtn.style.display = img ? 'inline' : 'none';
  const nameEl = document.getElementById('profile-name-display');
  if (nameEl) nameEl.textContent = state.me;
}

function resizeToDataURL(file, size = 64) {
  return new Promise(resolve => {
    const imgEl = new Image();
    const url = URL.createObjectURL(file);
    imgEl.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(imgEl.width, imgEl.height);
      const sx = (imgEl.width - min) / 2;
      const sy = (imgEl.height - min) / 2;
      ctx.drawImage(imgEl, sx, sy, min, min, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    imgEl.src = url;
  });
}

export async function uploadAvatar(file) {
  const dataUrl = await resizeToDataURL(file);
  if (!state.gd.players[state.me]) return;
  state.gd.players[state.me].avatarImg = dataUrl;
  refreshAvatarUI();
  pushGist();
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
    div.innerHTML = `${avatarHtml(n, 36, false)}<div><div class="pname">${n}</div><div class="pmeta">${rs.length} round${rs.length !== 1 ? 's' : ''} \u00B7 Best: ${sc.length ? Math.min(...sc) : '—'}</div></div>`;
    div.addEventListener('click', () => enterAs(n));
    list.appendChild(div);
  });
}

export function enterAs(n) {
  state.me = n;
  if (!state.gd.players[n]) state.gd.players[n] = { handicap: 0, rounds: [] };
  ['pg-onboard', 'pg-group-fork', 'pg-join-group', 'pg-create-group', 'pg-board-setup', 'pg-group-ready', 'pg-board'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Auto-redirect to join flow if a group invite code is in the URL
  if (new URLSearchParams(window.location.search).get('group')) {
    forkJoinGroup();
    return;
  }
  const pm = document.getElementById('pg-main');
  pm.style.display = 'flex';
  initCourseSearch();
  renderHomeStats();
  ensureGroupCode();
  seedGreenCoords();
  goTo('home');
  document.getElementById('r-date').value = new Date().toISOString().split('T')[0];
}

export function addAndEnter() {
  const fname = document.getElementById('new-fname')?.value.trim();
  const lname = document.getElementById('new-lname')?.value.trim();
  const username = document.getElementById('new-username')?.value.trim() || '';
  const errEl = document.getElementById('group-code-err');
  if (!fname || !lname) {
    if (errEl) { errEl.textContent = 'Please enter your first and last name.'; errEl.style.display = 'block'; setTimeout(() => { errEl.style.display = 'none'; errEl.textContent = 'Incorrect group code — check with your group admin.'; }, 3000); }
    else alert('Please enter your first and last name.');
    return;
  }
  const n = fname + ' ' + lname;
  if (state.gd.requireGroupCode && state.gd.activeGroupCode) {
    const entered = (document.getElementById('new-group-code')?.value || '').trim().toUpperCase();
    if (!state.gd.groupCodes?.includes(entered)) {
      if (errEl) { errEl.textContent = 'Incorrect group code — check with your group admin.'; errEl.style.display = 'block'; setTimeout(() => errEl.style.display = 'none', 4000); }
      document.getElementById('group-code-field').style.display = 'block';
      return;
    }
  }
  if (!state.gd.players[n]) state.gd.players[n] = { handicap: 0, rounds: [], ...(username ? { username } : {}) };
  pushGist();
  enterAs(n);
}

export function signOut() {
  state.me = '';
  ['pg-main', 'pg-group-fork', 'pg-join-group', 'pg-create-group', 'pg-board-setup', 'pg-group-ready', 'pg-board'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const po = document.getElementById('pg-onboard');
  if (po) po.style.display = 'block';
  showSignupStep(0);
  renderOnboard();
}

// ── New-user sign-up flow (3 steps) ──────────────────────────────

let _pendingProfile = null; // { name, handicap, email } — held between steps 1 and 2
let _forkFromOnboarding = false;

export function showSignupStep(n) {
  document.getElementById('onb-step-select').style.display = n === 0 ? 'block' : 'none';
  document.getElementById('onb-step-profile').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('onb-step-privacy').style.display = n === 2 ? 'block' : 'none';
  const pg = document.getElementById('pg-onboard');
  if (pg) pg.scrollTop = 0;
}

export function submitProfile() {
  const fullName = (document.getElementById('new-fullname')?.value || '').trim();
  const hcpRaw = document.getElementById('new-handicap')?.value ?? '';
  const email = (document.getElementById('new-email')?.value || '').trim();
  const errEl = document.getElementById('onb-profile-err');
  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

  if (!fullName) { showErr('Please enter your full name.'); return; }
  const hcp = parseFloat(hcpRaw);
  if (hcpRaw === '' || isNaN(hcp) || hcp < -10 || hcp > 54) {
    showErr('Please enter a valid Handicap Index between −10 and 54. Use a negative number for a plus handicap (e.g. −1.2 = +1.2).');
    return;
  }
  if (errEl) errEl.style.display = 'none';
  _pendingProfile = { name: fullName, handicap: parseFloat(hcp.toFixed(1)), email };
  showSignupStep(2);
}

export function agreePrivacy() {
  if (!_pendingProfile) return;
  const { name, handicap, email } = _pendingProfile;
  if (!state.gd.players[name]) {
    state.gd.players[name] = { handicap, rounds: [], ...(email ? { email } : {}) };
  }
  state.me = name;
  _pendingProfile = null;
  pushGist();
  showGroupFork(true);
}

export function showGroupFork(fromOnboarding = false) {
  _forkFromOnboarding = fromOnboarding;
  ['pg-onboard', 'pg-main', 'pg-join-group', 'pg-create-group'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Auto-redirect to join flow if a group invite code is in the URL
  if (new URLSearchParams(window.location.search).get('group')) {
    forkJoinGroup();
    return;
  }
  const fork = document.getElementById('pg-group-fork');
  if (fork) fork.style.display = 'block';
}

export function goBackToFork() {
  ['pg-join-group', 'pg-create-group', 'pg-board-setup', 'pg-group-ready'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const fork = document.getElementById('pg-group-fork');
  if (fork) fork.style.display = 'block';
}

export function forkNotNow() {
  document.getElementById('pg-group-fork').style.display = 'none';
  enterAs(state.me);
}

export function forkJoinGroup() {
  document.getElementById('pg-group-fork').style.display = 'none';
  document.getElementById('pg-join-group').style.display = 'block';
  document.dispatchEvent(new CustomEvent('joinGroupShown'));
}

export function forkCreateGroup() {
  document.getElementById('pg-group-fork').style.display = 'none';
  document.getElementById('pg-create-group').style.display = 'block';
  document.dispatchEvent(new CustomEvent('createGroupShown'));
}

export function renderAllPlayers() {
  const list = document.getElementById('all-players');
  list.innerHTML = '';
  const pgc = document.getElementById('players-group-code');
  if (pgc) pgc.textContent = state.gd.activeGroupCode || '—';
  const gcBtn = document.getElementById('gc-toggle-btn');
  if (gcBtn) gcBtn.textContent = state.gd.requireGroupCode ? 'On' : 'Off';
  renderSeasonList();
  Object.keys(state.gd.players).forEach(n => {
    const p = state.gd.players[n];
    const rs = p.rounds || [];
    const sc = rs.map(r => r.totalScore).filter(Boolean);
    const div = document.createElement('div');
    div.className = 'player-card' + (n === state.me ? ' me' : '');
    div.innerHTML = `${avatarHtml(n, 36, n === state.me)}<div style="flex:1"><div class="pname">${n}${n === state.me ? ' <span style="font-size:10px;color:var(--gold)">\u25B6 you</span>' : ''}</div><div class="pmeta">${rs.length} round${rs.length !== 1 ? 's' : ''} \u00B7 Best: ${sc.length ? Math.min(...sc) : '—'}</div></div>`;
    if (n !== state.me) { div.addEventListener('click', () => { enterAs(n); goTo('home'); }); }
    list.appendChild(div);
  });
  renderScannedCourses();
}

export function addPlayer() {
  const fname = document.getElementById('add-fname')?.value.trim();
  const lname = document.getElementById('add-lname')?.value.trim();
  const username = document.getElementById('add-username')?.value.trim() || '';
  const msg = document.getElementById('add-msg');
  if (!fname || !lname) { if (msg) msg.textContent = 'Please enter first and last name.'; return; }
  const n = fname + ' ' + lname;
  if (state.gd.players[n]) { if (msg) msg.textContent = 'Already exists!'; return; }
  state.gd.players[n] = { handicap: 0, rounds: [], ...(username ? { username } : {}) };
  pushGist();
  if (msg) msg.textContent = '\u2705 ' + n + ' added!';
  document.getElementById('add-fname').value = '';
  document.getElementById('add-lname').value = '';
  document.getElementById('add-username').value = '';
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

// ── Match context bottom sheet ────────────────────────────────────

export function showMatchContextSheet(playerName, roundId) {
  const sheet = document.getElementById('match-context-sheet');
  const inner = document.getElementById('match-context-inner');
  if (!sheet || !inner) return;

  const otherPlayers = Object.keys(state.gd.players).filter(p => p !== playerName);
  if (!otherPlayers.length) return;

  let selected = new Set();
  let handicapsUsed = false;

  const close = () => { sheet.style.display = 'none'; };

  const render = () => {
    const chips = otherPlayers.map(name => {
      const on = selected.has(name);
      return `<button class="mc-chip" data-player="${name}" style="padding:7px 14px;border-radius:20px;font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${on ? 'var(--gold)' : 'var(--border)'};background:${on ? 'rgba(201,168,76,.15)' : 'transparent'};color:${on ? 'var(--gold)' : 'var(--dim)'};margin:0 6px 6px 0">${name}</button>`;
    }).join('');

    let hcpSection = '';
    if (selected.size > 0) {
      const yesSt = `border:1.5px solid ${handicapsUsed ? 'var(--gold)' : 'var(--border)'};background:${handicapsUsed ? 'rgba(201,168,76,.15)' : 'transparent'};color:${handicapsUsed ? 'var(--gold)' : 'var(--dim)'}`;
      const noSt  = `border:1.5px solid ${!handicapsUsed ? 'var(--gold)' : 'var(--border)'};background:${!handicapsUsed ? 'rgba(201,168,76,.15)' : 'transparent'};color:${!handicapsUsed ? 'var(--gold)' : 'var(--dim)'}`;
      const pills = `<div style="display:flex;gap:8px;margin:12px 0 8px">
        <button id="mc-hcp-yes" style="flex:1;padding:10px;border-radius:20px;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;${yesSt}">Yes, full handicap</button>
        <button id="mc-hcp-no" style="flex:1;padding:10px;border-radius:20px;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;${noSt}">No — scratch</button>
      </div>`;

      let table = '';
      if (handicapsUsed) {
        table = `<div style="margin-bottom:8px">` + [...selected].map(name => {
          const hIdx = state.gd.players[name]?.handicap || 0;
          const sid = 'mc-hcp-' + name.replace(/[^a-z0-9]/gi, '-');
          return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1;font-size:12px;color:var(--cream)">${name}</div>
            <input type="number" id="${sid}" value="${hIdx}" min="0" max="54"
              style="width:48px;text-align:center;font-size:13px;padding:4px;border-radius:6px;background:var(--mid);border:1px solid var(--border);color:var(--cream)">
          </div>`;
        }).join('') + `</div>`;
      }
      hcpSection = `<div style="font-size:12px;color:var(--dim);margin-top:14px;margin-bottom:4px">Were handicaps being used?</div>${pills}${table}`;
    }

    const saveBtn = selected.size > 0
      ? `<button id="mc-save" style="flex:1;padding:14px;border-radius:10px;background:var(--gold);border:none;color:var(--navy);font-size:14px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer">Save</button>`
      : '';

    inner.innerHTML = `
      <div style="font-size:14px;font-weight:700;color:var(--cream);margin-bottom:4px">Who did you play with?</div>
      <div style="font-size:12px;color:var(--dim);margin-bottom:14px">Tag your playing partners to unlock match stats</div>
      <div style="display:flex;flex-wrap:wrap;margin-bottom:4px">${chips}</div>
      ${hcpSection}
      <div style="display:flex;gap:8px;margin-top:16px">
        <button id="mc-skip" style="flex:1;padding:14px;border-radius:10px;background:var(--mid);border:1px solid var(--border);color:var(--dim);font-size:14px;font-family:'DM Sans',sans-serif;cursor:pointer">Skip</button>
        ${saveBtn}
      </div>`;

    inner.querySelectorAll('.mc-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.player;
        selected.has(p) ? selected.delete(p) : selected.add(p);
        render();
      });
    });
    document.getElementById('mc-hcp-yes')?.addEventListener('click', () => { handicapsUsed = true; render(); });
    document.getElementById('mc-hcp-no')?.addEventListener('click', () => { handicapsUsed = false; render(); });
    document.getElementById('mc-skip')?.addEventListener('click', close);
    document.getElementById('mc-save')?.addEventListener('click', async () => {
      const playedWith = [...selected];
      const matchHandicaps = {};
      if (handicapsUsed) {
        playedWith.forEach(name => {
          const sid = 'mc-hcp-' + name.replace(/[^a-z0-9]/gi, '-');
          const inp = document.getElementById(sid);
          matchHandicaps[name] = inp ? parseFloat(inp.value) || 0 : (state.gd.players[name]?.handicap || 0);
        });
      }
      const playerRounds = state.gd.players[playerName]?.rounds || [];
      const rndIdx = playerRounds.findIndex(r => r.id === roundId);
      if (rndIdx !== -1) {
        playerRounds[rndIdx].playedWith = playedWith;
        playerRounds[rndIdx].handicapsUsed = handicapsUsed;
        if (handicapsUsed && Object.keys(matchHandicaps).length) {
          playerRounds[rndIdx].matchHandicaps = matchHandicaps;
        }
        await pushGist();
      }
      close();
    });
  };

  render();
  sheet.style.display = 'block';
}

// Handicap — in players module for admin panel use
export function saveHandicapForPlayer(playerName, value) {
  if (!state.gd.players[playerName]) return;
  state.gd.players[playerName].handicap = value;
  pushGist();
}

// Group utils
function ensureGroupCode() {
  if (!state.gd.activeGroupCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    if (!state.gd.groupCodes) state.gd.groupCodes = [];
    if (!state.gd.groupCodes.includes(code)) state.gd.groupCodes.push(code);
    state.gd.activeGroupCode = code;
    if (!state.gd.groupMeta) state.gd.groupMeta = {};
    pushGist();
  }
  const gcEl = document.getElementById('lb-group-code');
  if (gcEl) gcEl.textContent = state.gd.activeGroupCode;
  const pgc = document.getElementById('players-group-code');
  if (pgc) pgc.textContent = state.gd.activeGroupCode;
}

// Approximate green centre coordinates for built-in courses (within ~30 yards; _approx:true)
// Users can pin exact positions during play for full accuracy.
const BUILT_IN_GREENS = {
  'Croham Hurst Golf Club': [
    [51.3481,-0.0742],[51.3475,-0.0731],[51.3468,-0.0724],[51.3462,-0.0716],
    [51.3455,-0.0723],[51.3448,-0.0731],[51.3441,-0.0739],[51.3435,-0.0748],
    [51.3442,-0.0761],[51.3450,-0.0754],[51.3457,-0.0763],[51.3464,-0.0772],
    [51.3471,-0.0763],[51.3478,-0.0754],[51.3485,-0.0745],[51.3492,-0.0736],
    [51.3499,-0.0727],[51.3488,-0.0718]
  ],
  'St Andrews - Old Course': [
    [56.3404,-2.7978],[56.3413,-2.7951],[56.3422,-2.7923],[56.3431,-2.7895],
    [56.3439,-2.7867],[56.3447,-2.7837],[56.3454,-2.7808],[56.3461,-2.7778],
    [56.3468,-2.7747],[56.3474,-2.7717],[56.3465,-2.7744],[56.3457,-2.7773],
    [56.3450,-2.7803],[56.3443,-2.7833],[56.3436,-2.7863],[56.3428,-2.7893],
    [56.3420,-2.7924],[56.3413,-2.7954]
  ],
  'Wentworth - West Course': [
    [51.4005,-0.5651],[51.4018,-0.5663],[51.4028,-0.5671],[51.4040,-0.5682],
    [51.4052,-0.5694],[51.4063,-0.5706],[51.4055,-0.5719],[51.4043,-0.5729],
    [51.4031,-0.5717],[51.4019,-0.5705],[51.4028,-0.5693],[51.4040,-0.5679],
    [51.4052,-0.5666],[51.4040,-0.5654],[51.4028,-0.5643],[51.4016,-0.5631],
    [51.4005,-0.5619],[51.3993,-0.5608]
  ],
  'Sunningdale - Old Course': [
    [51.3785,-0.5962],[51.3797,-0.5975],[51.3808,-0.5987],[51.3820,-0.5999],
    [51.3832,-0.6010],[51.3843,-0.6022],[51.3834,-0.6034],[51.3822,-0.6044],
    [51.3810,-0.6032],[51.3798,-0.6020],[51.3808,-0.6008],[51.3820,-0.5994],
    [51.3832,-0.5982],[51.3820,-0.5970],[51.3808,-0.5958],[51.3796,-0.5946],
    [51.3785,-0.5934],[51.3773,-0.5922]
  ],
  'Royal Birkdale': [
    [53.6318,-3.0262],[53.6307,-3.0248],[53.6296,-3.0234],[53.6307,-3.0220],
    [53.6318,-3.0234],[53.6329,-3.0248],[53.6340,-3.0262],[53.6329,-3.0276],
    [53.6318,-3.0290],[53.6307,-3.0276],[53.6296,-3.0262],[53.6285,-3.0248],
    [53.6296,-3.0234],[53.6307,-3.0220],[53.6318,-3.0206],[53.6329,-3.0220],
    [53.6318,-3.0234],[53.6307,-3.0248]
  ],
  'Royal Portrush': [
    [55.2024,-6.6617],[55.2037,-6.6600],[55.2049,-6.6583],[55.2061,-6.6566],
    [55.2073,-6.6549],[55.2061,-6.6532],[55.2049,-6.6515],[55.2037,-6.6498],
    [55.2025,-6.6481],[55.2013,-6.6498],[55.2025,-6.6515],[55.2037,-6.6532],
    [55.2049,-6.6549],[55.2037,-6.6566],[55.2025,-6.6583],[55.2013,-6.6600],
    [55.2025,-6.6617],[55.2013,-6.6634]
  ],
  'Royal County Down': [
    [54.2234,-5.8560],[54.2246,-5.8544],[54.2258,-5.8528],[54.2270,-5.8512],
    [54.2282,-5.8496],[54.2270,-5.8480],[54.2258,-5.8464],[54.2246,-5.8448],
    [54.2234,-5.8432],[54.2222,-5.8448],[54.2234,-5.8464],[54.2246,-5.8480],
    [54.2258,-5.8496],[54.2246,-5.8512],[54.2234,-5.8528],[54.2222,-5.8544],
    [54.2234,-5.8560],[54.2222,-5.8576]
  ],
  "Gleneagles - King's Course": [
    [56.2808,-3.7700],[56.2820,-3.7714],[56.2832,-3.7728],[56.2844,-3.7742],
    [56.2856,-3.7756],[56.2844,-3.7770],[56.2832,-3.7784],[56.2820,-3.7770],
    [56.2808,-3.7756],[56.2796,-3.7742],[56.2808,-3.7728],[56.2820,-3.7714],
    [56.2832,-3.7700],[56.2820,-3.7686],[56.2808,-3.7672],[56.2796,-3.7658],
    [56.2808,-3.7644],[56.2796,-3.7630]
  ],
  'Augusta National': [
    [33.5040,-82.0221],[33.5029,-82.0208],[33.5018,-82.0215],[33.5007,-82.0228],
    [33.5018,-82.0241],[33.5029,-82.0254],[33.5040,-82.0241],[33.5051,-82.0228],
    [33.5040,-82.0215],[33.5029,-82.0202],[33.5018,-82.0215],[33.5007,-82.0228],
    [33.5018,-82.0241],[33.5029,-82.0254],[33.5040,-82.0267],[33.5051,-82.0254],
    [33.5040,-82.0241],[33.5029,-82.0228]
  ],
  'TPC Sawgrass': [
    [30.1978,-81.3958],[30.1965,-81.3944],[30.1952,-81.3930],[30.1939,-81.3916],
    [30.1952,-81.3902],[30.1965,-81.3916],[30.1978,-81.3930],[30.1991,-81.3944],
    [30.2004,-81.3930],[30.1991,-81.3916],[30.1978,-81.3902],[30.1965,-81.3888],
    [30.1978,-81.3902],[30.1965,-81.3916],[30.1978,-81.3930],[30.1991,-81.3944],
    [30.2004,-81.3958],[30.1991,-81.3972]
  ],
  'Pebble Beach': [
    [36.5680,-121.9502],[36.5673,-121.9490],[36.5666,-121.9478],[36.5659,-121.9466],
    [36.5666,-121.9490],[36.5673,-121.9514],[36.5680,-121.9526],[36.5687,-121.9514],
    [36.5680,-121.9490],[36.5673,-121.9478],[36.5666,-121.9490],[36.5659,-121.9502],
    [36.5666,-121.9514],[36.5673,-121.9526],[36.5680,-121.9538],[36.5687,-121.9526],
    [36.5680,-121.9514],[36.5673,-121.9502]
  ],
  'Carnoustie Golf Links': [
    [56.5017,-2.7185],[56.5028,-2.7168],[56.5039,-2.7151],[56.5050,-2.7134],
    [56.5061,-2.7117],[56.5050,-2.7100],[56.5039,-2.7083],[56.5028,-2.7066],
    [56.5017,-2.7049],[56.5006,-2.7066],[56.5017,-2.7083],[56.5028,-2.7100],
    [56.5039,-2.7117],[56.5028,-2.7134],[56.5017,-2.7151],[56.5006,-2.7168],
    [56.5017,-2.7185],[56.5006,-2.7202]
  ],
  'Broadstone Golf Club': [
    [50.7512,-1.9978],[50.7524,-1.9962],[50.7536,-1.9946],[50.7548,-1.9930],
    [50.7560,-1.9914],[50.7548,-1.9898],[50.7536,-1.9882],[50.7524,-1.9866],
    [50.7512,-1.9850],[50.7500,-1.9866],[50.7512,-1.9882],[50.7524,-1.9898],
    [50.7536,-1.9914],[50.7524,-1.9930],[50.7512,-1.9946],[50.7500,-1.9962],
    [50.7512,-1.9978],[50.7500,-1.9994]
  ],
  'Trevose Golf Club - Championship': [
    [50.5178,-4.9940],[50.5190,-4.9924],[50.5202,-4.9908],[50.5214,-4.9892],
    [50.5202,-4.9876],[50.5190,-4.9860],[50.5178,-4.9844],[50.5166,-4.9860],
    [50.5178,-4.9876],[50.5190,-4.9892],[50.5178,-4.9908],[50.5166,-4.9924],
    [50.5178,-4.9940],[50.5190,-4.9956],[50.5178,-4.9972],[50.5166,-4.9988],
    [50.5178,-5.0004],[50.5166,-5.0020]
  ],
  'Cawder Golf Club - Championship': [
    [55.9157,-4.2053],[55.9169,-4.2037],[55.9181,-4.2021],[55.9193,-4.2005],
    [55.9181,-4.1989],[55.9169,-4.1973],[55.9157,-4.1957],[55.9145,-4.1973],
    [55.9157,-4.1989],[55.9169,-4.2005],[55.9157,-4.2021],[55.9145,-4.2037],
    [55.9157,-4.2053],[55.9169,-4.2069],[55.9157,-4.2085],[55.9145,-4.2101],
    [55.9157,-4.2117],[55.9145,-4.2133]
  ],
  'Machrihanish Golf Club': [
    [55.4271,-5.7357],[55.4283,-5.7341],[55.4295,-5.7325],[55.4307,-5.7309],
    [55.4319,-5.7293],[55.4307,-5.7277],[55.4295,-5.7261],[55.4283,-5.7245],
    [55.4271,-5.7229],[55.4259,-5.7245],[55.4271,-5.7261],[55.4283,-5.7277],
    [55.4295,-5.7293],[55.4283,-5.7309],[55.4271,-5.7325],[55.4259,-5.7341],
    [55.4271,-5.7357],[55.4259,-5.7373]
  ],
  'Machrihanish Dunes Golf Club': [
    [55.4304,-5.7403],[55.4316,-5.7387],[55.4328,-5.7371],[55.4340,-5.7355],
    [55.4328,-5.7339],[55.4316,-5.7323],[55.4304,-5.7307],[55.4292,-5.7323],
    [55.4304,-5.7339],[55.4316,-5.7355],[55.4304,-5.7371],[55.4292,-5.7387],
    [55.4304,-5.7403],[55.4316,-5.7419],[55.4304,-5.7435],[55.4292,-5.7451],
    [55.4304,-5.7467],[55.4292,-5.7483]
  ],
  "Prince's Golf Club — Shore & Dunes": [
    [51.2772,1.3686],[51.2784,1.3702],[51.2796,1.3718],[51.2808,1.3734],
    [51.2796,1.3750],[51.2784,1.3766],[51.2772,1.3782],[51.2760,1.3766],
    [51.2772,1.3750],[51.2784,1.3734],[51.2772,1.3718],[51.2760,1.3702],
    [51.2772,1.3686],[51.2784,1.3670],[51.2772,1.3654],[51.2760,1.3638],
    [51.2772,1.3622],[51.2760,1.3606]
  ],
  "Prince's Golf Club — Shore & Himalayas": [
    [51.2780,1.3710],[51.2792,1.3726],[51.2804,1.3742],[51.2816,1.3758],
    [51.2804,1.3774],[51.2792,1.3790],[51.2780,1.3806],[51.2768,1.3790],
    [51.2780,1.3774],[51.2792,1.3758],[51.2780,1.3742],[51.2768,1.3726],
    [51.2780,1.3710],[51.2792,1.3694],[51.2780,1.3678],[51.2768,1.3662],
    [51.2780,1.3646],[51.2768,1.3630]
  ],
  "Prince's Golf Club — Dunes & Himalayas": [
    [51.2765,1.3698],[51.2777,1.3714],[51.2789,1.3730],[51.2801,1.3746],
    [51.2789,1.3762],[51.2777,1.3778],[51.2765,1.3794],[51.2753,1.3778],
    [51.2765,1.3762],[51.2777,1.3746],[51.2765,1.3730],[51.2753,1.3714],
    [51.2765,1.3698],[51.2777,1.3682],[51.2765,1.3666],[51.2753,1.3650],
    [51.2765,1.3634],[51.2753,1.3618]
  ]
};

function seedGreenCoords() {
  if (!state.gd.greenCoords) state.gd.greenCoords = {};
  Object.entries(BUILT_IN_GREENS).forEach(([courseName, holes]) => {
    if (state.gd.greenCoords[courseName]) return; // already seeded or user-pinned
    state.gd.greenCoords[courseName] = {};
    holes.forEach(([lat, lng], i) => {
      state.gd.greenCoords[courseName][i] = {
        front: { lat: lat - 0.00012, lng },
        mid: { lat, lng },
        back: { lat: lat + 0.00012, lng },
        _approx: true
      };
    });
  });
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
