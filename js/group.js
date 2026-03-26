// ─────────────────────────────────────────────────────────────────
// GROUP / SEASON MANAGEMENT
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { pushGist } from './api.js';
import { parseDateGB } from './stats.js';
import { signOut } from './players.js';

export function copyGroupCode() {
  const code = state.gd.groupCode || '';
  if (!code) return;
  navigator.clipboard?.writeText(code).then(() => {
    ['lb-group-code','players-group-code'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const orig = el.textContent;
      el.textContent = 'Copied!';
      setTimeout(() => el.textContent = orig, 1500);
    });
  });
}

export function leaveGroup() {
  const confirmed = confirm('Leave this group? Your data will remain in the group for others to see. To remove it, use "Delete all my data" in the Players tab first.');
  if (!confirmed) return;
  localStorage.removeItem('rrg_me');
  state.me = null;
  document.getElementById('pg-main').style.display = 'none';
  document.getElementById('pg-onboard').style.display = 'flex';
  document.getElementById('new-name').value = '';
  if (document.getElementById('new-group-code')) document.getElementById('new-group-code').value = '';
}

export function toggleGroupCodeRequired() {
  state.gd.requireGroupCode = !state.gd.requireGroupCode;
  const btn = document.getElementById('gc-toggle-btn');
  if (btn) btn.textContent = state.gd.requireGroupCode ? 'On' : 'Off';
  pushGist();
}

export function addSeason() {
  const inp = document.getElementById('new-season-name');
  const name = inp?.value.trim();
  if (!name) return;
  const yearMatch = name.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
  if (!state.gd.seasons) state.gd.seasons = [];
  state.gd.seasons.push({ name, year });
  inp.value = '';
  renderSeasonListInLeaderboard();
  rebuildSeasonSelector();
  pushGist();
}

export function deleteSeason(i) {
  if (!state.gd.seasons) return;
  state.gd.seasons.splice(i, 1);
  renderSeasonListInLeaderboard();
  rebuildSeasonSelector();
  pushGist();
}

function renderSeasonListInLeaderboard() {
  // Delegate to players page renderSeasonList via import
  import('./players.js').then(m => {
    if (typeof m.renderAllPlayers === 'function') m.renderAllPlayers();
  });
}

export function rebuildSeasonSelector() {
  const sel = document.getElementById('lb-season-sel'); if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="all">All Time</option>';
  (state.gd.seasons || []).forEach(s => {
    const o = document.createElement('option');
    o.value = 'season:' + s.name;
    o.textContent = s.name;
    sel.appendChild(o);
  });
  const allYears = new Set();
  Object.values(state.gd.players).forEach(p => (p.rounds || []).forEach(r => {
    const yr = parseDateGB(r.date).toString().slice(0, 4);
    if (yr && yr !== 'NaN') allYears.add(yr);
  }));
  [...allYears].sort().reverse().forEach(yr => {
    const covered = (state.gd.seasons || []).some(s => s.year === yr);
    if (!covered) {
      const o = document.createElement('option');
      o.value = yr; o.textContent = yr + ' Season';
      sel.appendChild(o);
    }
  });
  if (cur) sel.value = cur;
}

export function confirmDeleteMyData() {
  if (!state.me) return;
  const msg = document.getElementById('delete-data-msg');
  msg.innerHTML = `<div style="background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.3);border-radius:8px;padding:12px;margin-top:4px">
    <div style="font-size:13px;color:var(--cream);margin-bottom:8px">Are you sure? This will permanently delete all rounds and data for <strong>${state.me}</strong>. This cannot be undone.</div>
    <div style="display:flex;gap:8px">
      <button class="btn" id="confirm-delete-btn" style="background:#e74c3c;flex:1">Yes, delete everything</button>
      <button class="btn btn-ghost" id="cancel-delete-btn" style="flex:1">Cancel</button>
    </div>
  </div>`;
  document.getElementById('confirm-delete-btn').addEventListener('click', deleteMyData);
  document.getElementById('cancel-delete-btn').addEventListener('click', () => { document.getElementById('delete-data-msg').innerHTML = ''; });
}

export async function deleteMyData() {
  if (!state.me || !state.gd.players[state.me]) return;
  const msg = document.getElementById('delete-data-msg');
  msg.innerHTML = '<div class="alert"><span class="spin"></span> Deleting your data...</div>';
  delete state.gd.players[state.me];
  const ok = await pushGist();
  if (ok) {
    msg.innerHTML = '<div class="alert alert-ok">Your data has been deleted from the group.</div>';
    setTimeout(() => signOut(), 2000);
  } else {
    msg.innerHTML = '<div class="alert alert-err">Could not delete — please try again or contact your group admin.</div>';
  }
}

// Ambiguous characters excluded: 0, O, I, 1
const GROUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateGroupCode() {
  let code = '';
  const randomValues = new Uint8Array(6);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 6; i++) {
    code += GROUP_CODE_CHARS[randomValues[i] % GROUP_CODE_CHARS.length];
  }
  return code;
}

// ── Join group flow ───────────────────────────────────────────────

let _pendingGroupJoin = null; // { id, code, name, memberCount, created_by }

export function initJoinGroup() {
  _pendingGroupJoin = null;
  const inp = document.getElementById('join-group-code-inp');
  if (inp) { inp.value = ''; inp.disabled = false; }
  const findBtn = document.getElementById('join-group-find-btn');
  if (findBtn) findBtn.disabled = false;
  _showJoinSection('input');

  // Check URL param — WhatsApp invite link
  const code = new URLSearchParams(window.location.search).get('group');
  if (code) {
    const clean = code.replace(/\s/g, '').toUpperCase().slice(0, 6);
    if (inp) inp.value = clean;
    setTimeout(lookupGroupByCode, 100);
  }
}

export async function lookupGroupByCode() {
  const inp = document.getElementById('join-group-code-inp');
  const code = (inp?.value || '').replace(/\s/g, '').toUpperCase();
  if (code.length < 6) {
    _showJoinSection('error');
    const errEl = document.getElementById('join-group-error');
    if (errEl) errEl.textContent = 'Please enter a 6-character group code.';
    return;
  }
  _showJoinSection('loading');
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lookupGroup', data: { code, playerName: state.me || '' } })
    });
    const json = await res.json();
    if (!json.found) {
      _showJoinSection('error');
      document.getElementById('join-group-error').textContent = 'Group code not found — check with your group leader.';
      return;
    }
    _pendingGroupJoin = json.group;
    if (json.alreadyMember) {
      _showJoinSection('already');
      return;
    }
    _showJoinSection('confirm');
    const g = json.group;
    const info = document.getElementById('join-group-info');
    if (info) {
      info.innerHTML =
        '<div style="font-size:18px;font-weight:700;color:var(--cream);font-family:\'DM Sans\',sans-serif;margin-bottom:8px">' + _esc(g.name) + '</div>' +
        '<div style="font-size:13px;color:var(--dim);display:flex;gap:16px;flex-wrap:wrap">' +
        '<span>👥 ' + (g.memberCount || 0) + ' member' + ((g.memberCount || 0) !== 1 ? 's' : '') + '</span>' +
        (g.created_by ? '<span>Led by ' + _esc(g.created_by) + '</span>' : '') +
        '</div>';
    }
    const btn = document.getElementById('join-group-confirm-btn');
    if (btn) btn.textContent = 'Join ' + g.name;
  } catch {
    _showJoinSection('error');
    document.getElementById('join-group-error').textContent = 'Could not look up group — check your connection and try again.';
  }
}

export async function confirmJoinGroup() {
  if (!_pendingGroupJoin || !state.me) return;
  const btn = document.getElementById('join-group-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'joinGroup', data: { groupId: _pendingGroupJoin.id, playerName: state.me } })
    });
    const json = await res.json();
    if (!json.ok) throw new Error('Join failed');
    state.gd.groupCode = _pendingGroupJoin.code;
    pushGist();
    showBoardPage(_pendingGroupJoin);
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = 'Join ' + (_pendingGroupJoin?.name || 'group'); }
    _showJoinSection('error');
    document.getElementById('join-group-error').textContent = 'Could not join group — please try again.';
  }
}

export async function showBoardPage(group) {
  const g = group || _pendingGroupJoin || { name: '', code: state.gd?.groupCode || '', memberCount: 0 };
  ['pg-join-group', 'pg-group-fork', 'pg-create-group', 'pg-onboard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const boardEl = document.getElementById('pg-board');
  if (boardEl) boardEl.style.display = 'block';

  // Clear invite URL param so enterAs doesn't re-trigger join flow
  if (new URLSearchParams(window.location.search).get('group')) {
    history.replaceState({}, '', window.location.pathname);
  }

  document.getElementById('board-group-name').textContent = g.name || 'Group Board';
  document.getElementById('board-group-code-pill').textContent = g.code || '';
  const mc = g.memberCount ?? 0;
  document.getElementById('board-group-meta').textContent = mc + ' member' + (mc !== 1 ? 's' : '');
  document.getElementById('board-loading').style.display = 'block';
  document.getElementById('board-content').style.display = 'none';
  document.getElementById('board-error').style.display = 'none';
  document.getElementById('board-enter-btn').style.display = 'none';

  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', groupCode: g.code || state.gd?.groupCode || '' })
    });
    const json = await res.json();
    _renderBoardRows(json.players || [], json.rounds || []);
  } catch {
    document.getElementById('board-loading').style.display = 'none';
    const errEl = document.getElementById('board-error');
    errEl.style.display = 'block';
    errEl.textContent = 'Could not load group data — tap Start playing to continue.';
  }
  document.getElementById('board-enter-btn').style.display = 'block';
}

function _renderBoardRows(players, rounds) {
  document.getElementById('board-loading').style.display = 'none';
  const container = document.getElementById('board-rows');
  if (!container) return;
  if (!players.length) {
    container.innerHTML = '<div style="text-align:center;padding:32px;font-size:13px;color:var(--dim);font-family:\'DM Sans\',sans-serif">No members yet — you\'re the first!</div>';
    document.getElementById('board-content').style.display = 'block';
    return;
  }
  const statsMap = {};
  players.forEach(p => {
    statsMap[p.name] = { name: p.name, handicap: p.handicap ?? 0, played: 0, best: null };
  });
  rounds.forEach(r => {
    const s = statsMap[r.player_name];
    if (!s) return;
    s.played++;
    if (s.best === null || r.diff < s.best) s.best = r.diff;
  });
  const ranked = Object.values(statsMap).sort((a, b) => a.handicap - b.handicap);
  const isMe = n => n === state.me;
  container.innerHTML = ranked.map((p, i) => {
    const ini = p.name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
    const best = p.best !== null ? (p.best >= 0 ? '+' + p.best : '' + p.best) : '—';
    const me = isMe(p.name);
    const avatarBg = me ? 'rgba(201,168,76,.15)' : 'var(--mid)';
    const avatarBorder = me ? '2px solid var(--gold)' : '1.5px solid var(--border)';
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px' + (i < ranked.length - 1 ? ';border-bottom:1px solid var(--border)' : '') + '">' +
      '<div style="width:20px;text-align:center;font-size:12px;color:var(--dimmer);font-family:\'DM Sans\',sans-serif;flex-shrink:0">' + (i + 1) + '</div>' +
      '<div style="width:36px;height:36px;border-radius:50%;background:' + avatarBg + ';border:' + avatarBorder + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--gold);font-family:\'DM Sans\',sans-serif;flex-shrink:0">' + _esc(ini) + '</div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:14px;font-weight:' + (me ? '700' : '600') + ';color:var(--cream);font-family:\'DM Sans\',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
      _esc(p.name) + (me ? ' <span style="font-size:10px;color:var(--gold);font-weight:500;letter-spacing:.5px">you</span>' : '') + '</div>' +
      '<div style="font-size:11px;color:var(--dim)">' + p.played + ' round' + (p.played !== 1 ? 's' : '') + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div style="font-size:16px;font-weight:700;color:var(--cream);font-family:\'DM Sans\',sans-serif">HCP ' + p.handicap + '</div>' +
      '<div style="font-size:11px;color:var(--dim)">Best ' + best + '</div>' +
      '</div></div>';
  }).join('');
  document.getElementById('board-content').style.display = 'block';
}

function _showJoinSection(section) {
  document.getElementById('join-group-input-section').style.display = (section === 'input' || section === 'error') ? 'block' : 'none';
  document.getElementById('join-group-loading').style.display = section === 'loading' ? 'block' : 'none';
  document.getElementById('join-group-error').style.display = section === 'error' ? 'block' : 'none';
  document.getElementById('join-group-confirm').style.display = section === 'confirm' ? 'block' : 'none';
  document.getElementById('join-group-already').style.display = section === 'already' ? 'block' : 'none';
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function copyAppUrl() {
  const url = window.location.origin + window.location.pathname;
  navigator.clipboard?.writeText(url)
    .then(() => alert('App URL copied!\n\nSend this to friends:\n' + url))
    .catch(() => alert('App URL:\n' + url));
}
