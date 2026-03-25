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

export function copyAppUrl() {
  const url = window.location.origin + window.location.pathname;
  navigator.clipboard?.writeText(url)
    .then(() => alert('App URL copied!\n\nSend this to friends:\n' + url))
    .catch(() => alert('App URL:\n' + url));
}
