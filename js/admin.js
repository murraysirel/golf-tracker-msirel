// ─────────────────────────────────────────────────────────────────
// ADMIN SETTINGS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { DEFAULT_GIST } from './constants.js';
import { pushGist } from './api.js';
import { renderHomeStats } from './stats.js';

const ADMIN_PW = 'YorBorTrial!';

export function openAdminSettings() {
  const modal = document.getElementById('admin-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('admin-auth-wrap').style.display = 'block';
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-pw-input').value = '';
  document.getElementById('admin-pw-err').style.display = 'none';
  const ag = document.getElementById('admin-gistid');
  if (ag) ag.textContent = 'gist.github.com/murraysirel/' + DEFAULT_GIST;
}

export function closeAdminSettings() {
  const modal = document.getElementById('admin-modal');
  if (modal) modal.style.display = 'none';
}

export function verifyAdminPw() {
  const pw = document.getElementById('admin-pw-input').value;
  if (pw === ADMIN_PW) {
    document.getElementById('admin-auth-wrap').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    adminPopulatePlayers();
    renderAdminLog();
  } else {
    document.getElementById('admin-pw-err').style.display = 'block';
  }
}

function adminPopulatePlayers() {
  const sel = document.getElementById('admin-del-player');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select Player —</option>';
  Object.keys(state.gd.players).forEach(n => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    sel.appendChild(o);
  });
}

export function adminPopulateRounds() {
  const pname = document.getElementById('admin-del-player').value;
  const sel = document.getElementById('admin-del-round');
  if (!sel) return;
  if (!pname) { sel.innerHTML = '<option value="">— Select player first —</option>'; return; }
  const rs = (state.gd.players[pname]?.rounds || []);
  if (!rs.length) { sel.innerHTML = '<option value="">No rounds</option>'; return; }
  sel.innerHTML = [...rs].reverse().map((r, ri) => {
    const origIdx = rs.length - 1 - ri;
    return `<option value="${origIdx}">${r.date} \u2014 ${r.course} (${r.diff >= 0 ? '+' : ''}${r.diff})</option>`;
  }).join('');
}

export async function adminDeleteRound() {
  const pname = document.getElementById('admin-del-player').value;
  const idx = parseInt(document.getElementById('admin-del-round').value);
  const msg = document.getElementById('admin-del-msg');
  if (!pname || isNaN(idx)) { msg.textContent = 'Please select a player and round.'; return; }
  const player = state.gd.players[pname];
  if (!player || !player.rounds[idx]) { msg.textContent = 'Round not found.'; return; }
  const rnd = player.rounds[idx];
  const confirmed = confirm(`Delete round: ${rnd.date} \u2014 ${rnd.course} (${rnd.diff >= 0 ? '+' : ''}${rnd.diff}) for ${pname}?\n\nThis will be logged with your name (${state.me}).`);
  if (!confirmed) return;
  if (!state.gd.deletionLog) state.gd.deletionLog = [];
  state.gd.deletionLog.push({
    deletedBy: state.me,
    player: pname,
    course: rnd.course,
    date: rnd.date,
    score: rnd.totalScore,
    diff: rnd.diff,
    deletedAt: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  });
  player.rounds.splice(idx, 1);
  const ok = await pushGist();
  msg.innerHTML = ok
    ? `<span style="color:#2ecc71">\u2705 Round deleted and logged.</span>`
    : `<span style="color:#e67e22">\u26A0\uFE0F Deleted locally \u2014 sync pending.</span>`;
  adminPopulateRounds();
  renderAdminLog();
  renderHomeStats();
}

function renderAdminLog() {
  const el = document.getElementById('admin-del-log');
  if (!el) return;
  const log = state.gd.deletionLog || [];
  if (!log.length) { el.textContent = 'No deletions recorded yet.'; return; }
  el.innerHTML = [...log].reverse().slice(0, 20).map(e =>
    `<div style="border-bottom:1px solid rgba(255,255,255,.05);padding:5px 0">
      <span style="color:#e74c3c">\uD83D\uDDD1</span> <strong style="color:var(--cream)">${e.player}</strong> \u2014 ${e.course} (${e.date}) deleted by <strong style="color:var(--gold)">${e.deletedBy}</strong> on ${e.deletedAt}
    </div>`
  ).join('');
}
