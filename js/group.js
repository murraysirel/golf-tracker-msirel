// ─────────────────────────────────────────────────────────────────
// GROUP / SEASON MANAGEMENT
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { pushData, querySupabase, loadGroupData } from './api.js';
import { parseDateGB } from './stats.js';
import { signOut } from './players.js';
import { goTo } from './nav.js';

export function copyGroupCode() {
  const code = state.gd.activeGroupCode || '';
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

// Remove a group code from the player's list and persist.
// Does NOT sign the player out — used for silent removal (e.g. legacy groups).
export function removeGroupFromList(code) {
  if (!code) return;
  state.gd.groupCodes = (state.gd.groupCodes || []).filter(c => c !== code);
  if (state.gd.activeGroupCode === code) {
    state.gd.activeGroupCode = state.gd.groupCodes[0] || '';
    localStorage.setItem('gt_activegroup', state.gd.activeGroupCode);
  }
  pushData();
  import('./leaderboard.js').then(m => m.renderLeaderboard());
}

export function leaveGroup() {
  const confirmed = confirm('Leave this group? Your data will remain in the group for others to see. To remove it, use "Delete all my data" in the Players tab first.');
  if (!confirmed) return;
  // Remove the current group code from the list before signing out
  const code = state.gd.activeGroupCode;
  if (code) {
    state.gd.groupCodes = (state.gd.groupCodes || []).filter(c => c !== code);
    state.gd.activeGroupCode = state.gd.groupCodes[0] || '';
    localStorage.setItem('gt_activegroup', state.gd.activeGroupCode);
    pushData();
  }
  localStorage.removeItem('rrg_me');
  state.me = null;
  document.getElementById('pg-main').style.display = 'none';
  document.getElementById('pg-onboard').style.display = 'flex';
  document.getElementById('new-name')?.value && (document.getElementById('new-name').value = '');
  if (document.getElementById('new-group-code')) document.getElementById('new-group-code').value = '';
}

export function toggleGroupCodeRequired() {
  state.gd.requireGroupCode = !state.gd.requireGroupCode;
  const btn = document.getElementById('gc-toggle-btn');
  if (btn) btn.textContent = state.gd.requireGroupCode ? 'On' : 'Off';
  pushData();
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
  pushData();
}

export function deleteSeason(i) {
  if (!state.gd.seasons) return;
  state.gd.seasons.splice(i, 1);
  renderSeasonListInLeaderboard();
  rebuildSeasonSelector();
  pushData();
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
  const ok = await pushData();
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

// ── Create group flow ─────────────────────────────────────────────

const CREATE_BOARDS = [
  { id: 'stableford',       name: 'Avg Stableford',       desc: 'Average Stableford points per round' },
  { id: 'net_score',        name: 'Avg Net Score',         desc: 'Average net score relative to par' },
  { id: 'buffer',           name: 'Buffer or Better',      desc: 'Rounds played at handicap buffer or better' },
  { id: 'pts_scoring',      name: 'Pts Scoring (Net)',     desc: '3 pts for net eagle, 1 pt for net birdie' },
  { id: 'best_round',       name: 'Best Round (Gross)',    desc: 'Best gross score of the season' },
  { id: 'fewest_doubles',   name: 'Fewest Doubles+',      desc: 'Lowest average double bogeys per round' },
  { id: 'most_birdies',     name: 'Most Birdies',         desc: 'Most birdies in a single round' },
  { id: 'most_net_birdies', name: 'Most Net Birdies',     desc: 'Most net birdies in a single round' },
];

// Map old board IDs from existing groups to new VIEWS IDs
const BOARD_ID_MAP = {
  season: 'stableford', scoring_gross: 'pts_scoring', scoring_net: 'pts_scoring',
  best_gross: 'best_round', best_net: 'net_score',
};
function normaliseBoardIds(ids) {
  if (!ids?.length) return CREATE_BOARDS.map(b => b.id);
  const mapped = ids.map(id => BOARD_ID_MAP[id] || id);
  // Deduplicate while preserving order
  return [...new Set(mapped)].filter(id => CREATE_BOARDS.some(b => b.id === id));
}
export { normaliseBoardIds };

let _pendingGroupName = '';
let _selectedBoards = new Set();

export function initCreateGroup() {
  _pendingGroupName = '';
  const inp = document.getElementById('create-group-name-inp');
  if (inp) inp.value = '';
  const err = document.getElementById('create-group-name-err');
  if (err) err.style.display = 'none';
}

export function submitGroupName() {
  const inp = document.getElementById('create-group-name-inp');
  const name = (inp?.value || '').trim();
  const err = document.getElementById('create-group-name-err');
  if (name.length < 2 || name.length > 30) {
    if (err) { err.textContent = 'Group name must be 2–30 characters.'; err.style.display = 'block'; }
    return;
  }
  if (err) err.style.display = 'none';
  _pendingGroupName = name;
  document.getElementById('pg-create-group').style.display = 'none';
  document.getElementById('pg-board-setup').style.display = 'block';
  _renderBoardSetup();
}

function _renderBoardSetup() {
  _selectedBoards = new Set(CREATE_BOARDS.map(b => b.id));
  document.getElementById('board-setup-err').style.display = 'none';
  const btn = document.getElementById('board-setup-confirm-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Confirm Leagues'; }
  const list = document.getElementById('board-setup-list');
  if (!list) return;
  list.innerHTML = CREATE_BOARDS.map((b, i) =>
    '<div class="cg-board-row" data-id="' + b.id + '" style="display:flex;align-items:center;gap:12px;padding:14px 0;' +
    (i < CREATE_BOARDS.length - 1 ? 'border-bottom:1px solid var(--border);' : '') +
    'cursor:pointer;-webkit-tap-highlight-color:transparent">' +
    '<div style="flex:1;min-width:0">' +
    '<div class="cg-board-name" style="font-size:14px;font-weight:600;color:var(--cream);font-family:\'DM Sans\',sans-serif">' + b.name + '</div>' +
    '<div style="font-size:12px;color:var(--dim);margin-top:2px;font-family:\'DM Sans\',sans-serif">' + b.desc + '</div>' +
    '</div>' +
    '<div class="cg-board-pill" data-id="' + b.id + '" style="width:44px;height:26px;border-radius:13px;background:var(--gold);position:relative;flex-shrink:0;transition:background .15s">' +
    '<div style="width:20px;height:20px;border-radius:50%;background:white;position:absolute;top:3px;right:3px;transition:right .15s,left .15s;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>' +
    '</div></div>'
  ).join('');
  list.querySelectorAll('.cg-board-row').forEach(row => {
    row.addEventListener('click', () => _toggleBoard(row.dataset.id));
  });
}

function _toggleBoard(id) {
  const isActive = _selectedBoards.has(id);
  if (isActive) {
    _selectedBoards.delete(id);
  } else {
    _selectedBoards.add(id);
  }
  _updateBoardPill(id, !isActive);
  if (_selectedBoards.size > 0) document.getElementById('board-setup-err').style.display = 'none';
}

function _updateBoardPill(id, active) {
  const pill = document.querySelector('.cg-board-pill[data-id="' + id + '"]');
  if (!pill) return;
  pill.style.background = active ? 'var(--gold)' : 'var(--dimmer)';
  const dot = pill.firstElementChild;
  if (dot) { dot.style.right = active ? '3px' : ''; dot.style.left = active ? '' : '3px'; }
  const nameEl = document.querySelector('.cg-board-row[data-id="' + id + '"] .cg-board-name');
  if (nameEl) nameEl.style.color = active ? 'var(--cream)' : 'var(--dim)';
}

export async function confirmBoardSetup() {
  if ((state.gd.groupCodes || []).length >= 5) {
    const err = document.getElementById('board-setup-err');
    if (err) { err.textContent = 'You can be in a maximum of 5 leagues at once.'; err.style.display = 'block'; }
    return;
  }
  if (_selectedBoards.size === 0) {
    const err = document.getElementById('board-setup-err');
    if (err) { err.textContent = 'At least one board must remain active.'; err.style.display = 'block'; }
    return;
  }
  const btn = document.getElementById('board-setup-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating group…'; }
  document.getElementById('board-setup-err').style.display = 'none';
  const code = generateGroupCode();
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createGroup',
        data: {
          name: _pendingGroupName,
          code,
          adminId: state.me,
          activeBoards: [..._selectedBoards],
          season: new Date().getFullYear()
        }
      })
    });
    const json = await res.json();
    // Log the full response so we can diagnose any schema or RLS issues
    console.log('[createGroup] server response (HTTP', res.status, '):', JSON.stringify(json));
    if (!json.ok) {
      // Surface the actual server error rather than swallowing it
      throw new Error(json.error || 'Create failed (HTTP ' + res.status + ')');
    }
    state.gd.groupId = json.group.id;
    if (!state.gd.groupCodes) state.gd.groupCodes = [];
    if (!state.gd.groupCodes.includes(json.group.code)) state.gd.groupCodes.push(json.group.code);
    state.gd.activeGroupCode = json.group.code;
    if (!state.gd.groupMeta) state.gd.groupMeta = {};
    state.gd.groupMeta[json.group.code] = { name: json.group.name || _pendingGroupName };
    pushData();
    // Upsert this player into the new group so they appear in the picker immediately
    await querySupabase('upsertPlayer', {
      playerName: state.me,
      handicap: state.gd.players?.[state.me]?.handicap || 0
    });
    await loadGroupData(json.group.code);
    _showGroupReady(json.group);
  } catch (e) {
    console.error('[createGroup] failed:', e?.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Leagues'; }
    const errEl = document.getElementById('board-setup-err');
    if (errEl) {
      // Show the real error during development; trim to something user-friendly in prod
      const msg = e?.message && e.message !== 'Create failed' ? e.message : 'Could not create group — please try again.';
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
  }
}

function _showGroupReady(group) {
  document.getElementById('pg-board-setup').style.display = 'none';
  document.getElementById('pg-group-ready').style.display = 'block';
  document.getElementById('ready-group-name-sub').textContent = group.name + ' is ready to play.';
  document.getElementById('ready-group-code').textContent = group.code;
  const appUrl = window.location.origin + window.location.pathname;
  const shareUrl = appUrl + '?group=' + group.code;
  document.getElementById('ready-share-url').textContent = shareUrl;
  const waBtn = document.getElementById('ready-whatsapp-btn');
  if (waBtn) {
    const msg = encodeURIComponent('Join my Looper group ' + group.name + '! Tap to join: ' + shareUrl);
    waBtn.href = 'https://wa.me/?text=' + msg;
  }
  const copyBtn = document.getElementById('ready-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(shareUrl).then(() => {
        const orig = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = orig; }, 1500);
      }).catch(() => {
        copyBtn.textContent = shareUrl;
      });
    };
  }
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
        '<span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px"><path d="M12 16v-1.5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3V16"/><circle cx="7" cy="5.5" r="3"/><path d="M16 16v-1.5a3 3 0 0 0-2.2-2.9"/><path d="M12 2.6a3 3 0 0 1 0 5.8"/></svg>' + (g.memberCount || 0) + ' member' + ((g.memberCount || 0) !== 1 ? 's' : '') + '</span>' +
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
  if ((state.gd.groupCodes || []).length >= 5) {
    const errEl = document.getElementById('join-group-error');
    if (errEl) { errEl.textContent = 'You can be in a maximum of 5 leagues at once.'; errEl.style.display = 'block'; }
    return;
  }
  const btn = document.getElementById('join-group-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'joinGroup', data: { groupId: _pendingGroupJoin.id, playerName: state.me } })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Join failed');

    // If pending approval, show message and don't add to active groups yet
    if (json.status === 'pending') {
      if (btn) { btn.disabled = true; btn.textContent = 'Request sent'; }
      const errEl = document.getElementById('join-group-error');
      if (errEl) {
        errEl.style.display = 'block';
        errEl.style.color = 'var(--par)';
        errEl.textContent = 'Request sent! The league admin needs to approve you before you can see the boards.';
      }
      return;
    }

    state.gd.groupId = _pendingGroupJoin.id;
    if (!state.gd.groupCodes) state.gd.groupCodes = [];
    if (!state.gd.groupCodes.includes(_pendingGroupJoin.code)) state.gd.groupCodes.push(_pendingGroupJoin.code);
    state.gd.activeGroupCode = _pendingGroupJoin.code;
    if (!state.gd.groupMeta) state.gd.groupMeta = {};
    state.gd.groupMeta[_pendingGroupJoin.code] = { name: _pendingGroupJoin.name };
    localStorage.setItem('gt_activegroup', _pendingGroupJoin.code);
    pushData();
    // Upsert this player into the joined group so they appear in the picker immediately
    await querySupabase('upsertPlayer', {
      playerName: state.me,
      handicap: state.gd.players?.[state.me]?.handicap || 0
    });
    await loadGroupData(_pendingGroupJoin.code);
    showBoardPage(_pendingGroupJoin);
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = 'Join ' + (_pendingGroupJoin?.name || 'group'); }
    _showJoinSection('error');
    document.getElementById('join-group-error').textContent = 'Could not join group — please try again.';
  }
}

export async function showBoardPage(group) {
  const g = group || _pendingGroupJoin || { name: '', code: state.gd?.activeGroupCode || '', memberCount: 0 };
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
      body: JSON.stringify({ action: 'read', groupCode: g.code || state.gd?.activeGroupCode || '', requestingPlayer: state.me })
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

// ── Group settings (admin) ────────────────────────────────────────

let _settingsGroup = null;
let _settingsActiveBoards = new Set();
let _settingsMembers = [];
let _settingsPendingMembers = [];
let _modalConfirmCb = null;

export async function initGroupSettings() {
  const group = state.gd.group;
  if (!group || group.admin_id !== state.me) return;
  _settingsGroup = group;
  const normalised = normaliseBoardIds(group.active_boards);
  _settingsActiveBoards = new Set(normalised);

  // Start member fetch in background while rendering static sections
  const membersFetch = querySupabase('getGroupMembers', { groupId: group.id });

  _renderGSNameSection();
  _renderGSBoardsSection();
  _renderGSInviteSection();

  // Navigate first so user sees the page immediately
  goTo('group-settings');

  // Then fill members when data arrives
  const res = await membersFetch;
  const allMembers = res?.members || [];
  _settingsMembers = allMembers.filter(m => m.status === 'approved' || !m.status);
  _settingsPendingMembers = allMembers.filter(m => m.status === 'pending');
  _renderGSMembersSection();
}

// ── Section 1: Group Name ─────────────────────────────────────────

function _renderGSNameSection() {
  const inp = document.getElementById('gs-name-inp');
  const saveBtn = document.getElementById('gs-name-save-btn');
  const errEl = document.getElementById('gs-name-err');
  if (inp) {
    inp.value = _settingsGroup.name;
    inp.oninput = () => {
      if (saveBtn) saveBtn.style.display = inp.value.trim() !== _settingsGroup.name ? 'block' : 'none';
      if (errEl) errEl.style.display = 'none';
    };
  }
  if (saveBtn) saveBtn.style.display = 'none';
  if (errEl) errEl.style.display = 'none';
}

export async function saveGroupName() {
  const inp = document.getElementById('gs-name-inp');
  const saveBtn = document.getElementById('gs-name-save-btn');
  const errEl = document.getElementById('gs-name-err');
  const name = inp?.value.trim();
  if (!name || name.length < 2 || name.length > 30) {
    if (errEl) { errEl.textContent = 'Name must be 2–30 characters.'; errEl.style.display = 'block'; }
    return;
  }
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  const res = await querySupabase('renameGroup', { groupId: _settingsGroup.id, adminId: state.me, name });
  if (!res?.ok) {
    if (errEl) { errEl.textContent = 'Could not save — please try again.'; errEl.style.display = 'block'; }
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    return;
  }
  _settingsGroup.name = name;
  if (state.gd.group) state.gd.group.name = name;
  if (saveBtn) { saveBtn.style.display = 'none'; saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
}

// ── Section 2: Active Boards ──────────────────────────────────────

// Track board order (separate from active set)
let _boardOrder = [];

function _renderGSBoardsSection() {
  const list = document.getElementById('gs-boards-list');
  if (!list) return;
  // Init order from active_boards or default CREATE_BOARDS order
  if (!_boardOrder.length) _boardOrder = normaliseBoardIds(_settingsGroup?.active_boards);
  // Ensure all CREATE_BOARDS are represented
  CREATE_BOARDS.forEach(b => { if (!_boardOrder.includes(b.id)) _boardOrder.push(b.id); });

  const orderedBoards = _boardOrder.map(id => CREATE_BOARDS.find(b => b.id === id)).filter(Boolean);

  list.innerHTML = orderedBoards.map((b, i) => {
    const active = _settingsActiveBoards.has(b.id);
    return '<div class="gs-board-row" data-id="' + b.id + '" data-idx="' + i + '" style="display:flex;align-items:center;gap:10px;padding:14px 16px;' +
      (i < orderedBoards.length - 1 ? 'border-bottom:1px solid var(--border);' : '') +
      'cursor:pointer;-webkit-tap-highlight-color:transparent;position:relative">' +
      '<div class="gs-grip" style="display:flex;flex-direction:column;gap:2px;padding:4px 2px;cursor:grab;touch-action:none;flex-shrink:0;color:var(--dimmer)">' +
      '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="9" cy="2" r="1.2"/><circle cx="3" cy="6" r="1.2"/><circle cx="9" cy="6" r="1.2"/><circle cx="3" cy="10" r="1.2"/><circle cx="9" cy="10" r="1.2"/></svg></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div class="gs-board-name" style="font-size:14px;font-weight:600;color:' + (active ? 'var(--cream)' : 'var(--dim)') + ';font-family:\'DM Sans\',sans-serif">' + _esc(b.name) + '</div>' +
      '<div style="font-size:12px;color:var(--dim);margin-top:2px;font-family:\'DM Sans\',sans-serif">' + _esc(b.desc) + '</div>' +
      '</div>' +
      '<div class="gs-pill" data-id="' + b.id + '" style="width:44px;height:26px;border-radius:13px;background:' + (active ? 'var(--gold)' : 'var(--dimmer)') + ';position:relative;flex-shrink:0;transition:background .15s">' +
      '<div style="width:20px;height:20px;border-radius:50%;background:white;position:absolute;top:3px;' + (active ? 'right:3px;left:auto' : 'left:3px;right:auto') + ';transition:right .15s,left .15s;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>' +
      '</div></div>';
  }).join('');

  // Toggle click (on the pill area only)
  list.querySelectorAll('.gs-pill').forEach(pill => {
    pill.addEventListener('click', (e) => { e.stopPropagation(); _handleBoardToggle(pill.dataset.id); });
  });

  // Touch-based reorder on grip handles
  _initBoardDragReorder(list);
}

function _initBoardDragReorder(list) {
  let dragEl = null, startY = 0, startIdx = -1;
  list.querySelectorAll('.gs-grip').forEach(grip => {
    grip.addEventListener('touchstart', (e) => {
      dragEl = grip.closest('.gs-board-row');
      if (!dragEl) return;
      startIdx = parseInt(dragEl.dataset.idx);
      startY = e.touches[0].clientY;
      dragEl.style.opacity = '0.7';
      dragEl.style.transition = 'none';
      dragEl.style.zIndex = '10';
    }, { passive: true });
  });
  list.addEventListener('touchmove', (e) => {
    if (!dragEl) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - startY;
    dragEl.style.transform = `translateY(${dy}px)`;
    // Find swap target
    const rows = [...list.querySelectorAll('.gs-board-row')];
    const dragRect = dragEl.getBoundingClientRect();
    const dragMid = dragRect.top + dragRect.height / 2;
    for (const row of rows) {
      if (row === dragEl) continue;
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const idx = parseInt(row.dataset.idx);
      if (dragMid < mid && idx < startIdx) {
        // Swap up
        const tmp = _boardOrder[startIdx];
        _boardOrder.splice(startIdx, 1);
        _boardOrder.splice(idx, 0, tmp);
        _renderGSBoardsSection();
        return;
      }
      if (dragMid > mid && idx > startIdx) {
        // Swap down
        const tmp = _boardOrder[startIdx];
        _boardOrder.splice(startIdx, 1);
        _boardOrder.splice(idx, 0, tmp);
        _renderGSBoardsSection();
        return;
      }
    }
  }, { passive: false });
  list.addEventListener('touchend', () => {
    if (dragEl) {
      dragEl.style.opacity = '';
      dragEl.style.transition = '';
      dragEl.style.transform = '';
      dragEl.style.zIndex = '';
      dragEl = null;
      // Persist the new order (only active boards)
      const activeOrdered = _boardOrder.filter(id => _settingsActiveBoards.has(id));
      querySupabase('updateGroupBoards', { groupId: _settingsGroup.id, adminId: state.me, activeBoards: activeOrdered });
      if (state.gd.group) state.gd.group.active_boards = activeOrdered;
    }
  });
}

function _handleBoardToggle(id) {
  const isActive = _settingsActiveBoards.has(id);
  if (isActive) {
    if (_settingsActiveBoards.size <= 1) return;
    const board = CREATE_BOARDS.find(b => b.id === id);
    _showGSModal({
      title: 'Hide ' + (board?.name || id) + '?',
      body: 'Hide <strong>' + _esc(board?.name || id) + '</strong> for your whole group? Scores are not deleted — you can re-enable it any time.',
      confirmText: 'Yes, hide it',
      onConfirm: () => _applyBoardToggle(id, false)
    });
  } else {
    _applyBoardToggle(id, true);
  }
}

async function _applyBoardToggle(id, enable) {
  if (enable) { _settingsActiveBoards.add(id); } else { _settingsActiveBoards.delete(id); }
  _updatePillUI('.gs-pill[data-id="' + id + '"]', '.gs-board-row[data-id="' + id + '"] .gs-board-name', enable);
  const activeBoards = [..._settingsActiveBoards];
  await querySupabase('updateGroupBoards', { groupId: _settingsGroup.id, adminId: state.me, activeBoards });
  if (state.gd.group) state.gd.group.active_boards = activeBoards;
}

// ── Section 3: Members ────────────────────────────────────────────

function _renderGSMembersSection() {
  const list = document.getElementById('gs-members-list');
  if (!list) return;

  // Show pending members awaiting approval (if any)
  const pendingMembers = (_settingsPendingMembers || []);
  let pendingHtml = '';
  if (pendingMembers.length) {
    pendingHtml = '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin:8px 16px 6px">Pending Approval</div>';
    pendingHtml += pendingMembers.map(m =>
      `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
        <div style="flex:1;font-size:13px;color:var(--cream)">${_esc(m.playerId)}</div>
        <button class="gs-approve" data-player="${_esc(m.playerId)}" class="btn" style="padding:4px 12px;border-radius:16px;font-size:10px;background:var(--gold);color:var(--navy);border:none;cursor:pointer;font-family:'DM Sans',sans-serif">Approve</button>
        <button class="gs-decline" data-player="${_esc(m.playerId)}" style="padding:4px 12px;border-radius:16px;font-size:10px;background:transparent;border:1px solid rgba(231,76,60,.4);color:#e74c3c;cursor:pointer;font-family:'DM Sans',sans-serif">Decline</button>
      </div>`
    ).join('');
  }

  if (!_settingsMembers.length && !pendingMembers.length) {
    list.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--dim)">No members yet.</div>';
    return;
  }
  list.innerHTML = pendingHtml + _settingsMembers.map((m, i) => {
    const isMe = m.playerId === state.me;
    const hcp = m.handicap != null ? 'HCP ' + m.handicap : '';
    const joinDate = m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const ini = m.playerId.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;' + (i < _settingsMembers.length - 1 ? 'border-bottom:1px solid var(--border);' : '') + '">' +
      '<div style="width:34px;height:34px;border-radius:50%;background:' + (isMe ? 'rgba(201,168,76,.15)' : 'var(--mid)') + ';border:' + (isMe ? '2px solid var(--gold)' : '1.5px solid var(--border)') + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--gold);font-family:\'DM Sans\',sans-serif;flex-shrink:0">' + _esc(ini) + '</div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:14px;font-weight:' + (isMe ? '700' : '600') + ';color:' + (isMe ? 'var(--gold)' : 'var(--cream)') + ';font-family:\'DM Sans\',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(m.playerId) + (isMe ? ' <span style="font-size:10px;font-weight:500">you</span>' : '') + '</div>' +
      '<div style="font-size:11px;color:var(--dim);margin-top:2px;display:flex;gap:10px">' +
      (hcp ? '<span>' + hcp + '</span>' : '') + (joinDate ? '<span>Joined ' + joinDate + '</span>' : '') +
      '</div></div>' +
      (!isMe ? '<button class="gs-rm" data-player="' + _esc(m.playerId) + '" style="background:none;border:none;color:var(--dimmer);font-size:20px;cursor:pointer;padding:4px 8px;line-height:1;-webkit-tap-highlight-color:transparent" title="Remove">×</button>' : '<div style="width:40px"></div>') +
      '</div>';
  }).join('');
  list.querySelectorAll('.gs-rm').forEach(btn => {
    btn.addEventListener('click', () => _handleRemoveMember(btn.dataset.player));
  });
  // Approve/decline pending members
  list.querySelectorAll('.gs-approve').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      await querySupabase('approveGroupMember', { groupId: _settingsGroup.id, adminId: state.me, playerName: btn.dataset.player, approve: true });
      _settingsPendingMembers = _settingsPendingMembers.filter(m => m.playerId !== btn.dataset.player);
      _settingsMembers.push({ playerId: btn.dataset.player, status: 'approved' });
      _renderGSMembersSection();
    });
  });
  list.querySelectorAll('.gs-decline').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      await querySupabase('approveGroupMember', { groupId: _settingsGroup.id, adminId: state.me, playerName: btn.dataset.player, approve: false });
      _settingsPendingMembers = _settingsPendingMembers.filter(m => m.playerId !== btn.dataset.player);
      _renderGSMembersSection();
    });
  });
}

function _handleRemoveMember(playerId) {
  _showGSModal({
    title: 'Remove ' + playerId + '?',
    body: 'Remove <strong>' + _esc(playerId) + '</strong> from <strong>' + _esc(_settingsGroup.name) + '</strong>? Their personal stats will not be affected.',
    confirmText: 'Remove',
    confirmRed: true,
    onConfirm: async () => {
      const res = await querySupabase('removeGroupMember', { groupId: _settingsGroup.id, adminId: state.me, playerId });
      if (res?.ok) {
        _settingsMembers = _settingsMembers.filter(m => m.playerId !== playerId);
        _renderGSMembersSection();
      }
    }
  });
}

// ── Section 4: Invite Link ────────────────────────────────────────

function _renderGSInviteSection() {
  const appUrl = window.location.origin + window.location.pathname;
  const inviteUrl = appUrl + '?group=' + _settingsGroup.code;
  const urlEl = document.getElementById('gs-invite-url');
  if (urlEl) urlEl.textContent = inviteUrl;
  const waBtn = document.getElementById('gs-invite-wa-btn');
  if (waBtn) waBtn.href = 'https://wa.me/?text=' + encodeURIComponent('Join my Looper group ' + _settingsGroup.name + '! Tap to join: ' + inviteUrl);
  const regenBtn = document.getElementById('gs-regen-btn');
  if (regenBtn) regenBtn.onclick = () => {
    _showGSModal({
      title: 'Regenerate invite link?',
      body: 'The old invite link will stop working immediately.',
      confirmText: 'Regenerate',
      onConfirm: async () => {
        const res = await querySupabase('regenerateGroupCode', { groupId: _settingsGroup.id, adminId: state.me });
        if (res?.ok && res.code) {
          _settingsGroup.code = res.code;
          if (state.gd.group) state.gd.group.code = res.code;
          // Update in groupCodes[] and activeGroupCode
          const oldCode = _settingsGroup.code;
          const idx = state.gd.groupCodes?.indexOf(oldCode);
          if (idx != null && idx >= 0) state.gd.groupCodes[idx] = res.code;
          if (state.gd.activeGroupCode === oldCode) state.gd.activeGroupCode = res.code;
          if (state.gd.groupMeta?.[oldCode]) {
            state.gd.groupMeta[res.code] = state.gd.groupMeta[oldCode];
            delete state.gd.groupMeta[oldCode];
          }
          localStorage.setItem('gt_activegroup', res.code);
          _renderGSInviteSection();
        }
      }
    });
  };
}

// ── Shared modal ──────────────────────────────────────────────────

function _showGSModal({ title, body, confirmText, confirmRed, onConfirm }) {
  const modal = document.getElementById('gs-modal');
  if (!modal) return;
  const titleEl = document.getElementById('gs-modal-title');
  const bodyEl = document.getElementById('gs-modal-body');
  const confirmBtn = document.getElementById('gs-modal-confirm');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = body;
  if (confirmBtn) {
    confirmBtn.textContent = confirmText || 'Confirm';
    confirmBtn.style.background = confirmRed ? '#e74c3c' : '';
    confirmBtn.style.borderColor = confirmRed ? '#e74c3c' : '';
  }
  _modalConfirmCb = onConfirm || null;
  modal.style.display = 'flex';
}

export function hideGSModal() {
  const modal = document.getElementById('gs-modal');
  if (modal) modal.style.display = 'none';
  _modalConfirmCb = null;
}

export function confirmGSModal() {
  const cb = _modalConfirmCb;
  hideGSModal();
  if (cb) cb();
}

// ── Shared utility ────────────────────────────────────────────────

function _updatePillUI(pillSel, nameSel, active) {
  const pill = document.querySelector(pillSel);
  if (pill) {
    pill.style.background = active ? 'var(--gold)' : 'var(--dimmer)';
    const dot = pill.firstElementChild;
    if (dot) { dot.style.right = active ? '3px' : ''; dot.style.left = active ? '' : '3px'; }
  }
  const nameEl = document.querySelector(nameSel);
  if (nameEl) nameEl.style.color = active ? 'var(--cream)' : 'var(--dim)';
}
