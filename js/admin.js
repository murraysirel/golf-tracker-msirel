// ─────────────────────────────────────────────────────────────────
// ADMIN SETTINGS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { pushData } from './api.js';
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
    renderAdminCorrections();
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
  const ok = await pushData();
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

function renderAdminCorrections() {
  const el = document.getElementById('admin-corrections');
  if (!el) return;
  const corrections = (state.gd.courseCorrections || []).filter(c => c.status === 'pending');
  if (!corrections.length) { el.textContent = 'No pending corrections.'; return; }
  el.innerHTML = '';
  corrections.forEach((c, idx) => {
    // Find original index in the full array
    const origIdx = state.gd.courseCorrections.indexOf(c);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px;margin-bottom:8px';
    wrap.innerHTML = `
      <div style="font-weight:600;color:var(--cream);font-size:12px;margin-bottom:4px">${c.course} — Hole ${c.hole}</div>
      <div style="font-size:11px;color:var(--dim);margin-bottom:4px">Par ${c.par} · Yards ${c.yards ?? '—'} · SI ${c.si ?? '—'}</div>
      <div style="font-size:11px;color:var(--cream);margin-bottom:6px;font-style:italic">"${c.note}"</div>
      <div style="font-size:10px;color:var(--dimmer);margin-bottom:8px">By ${c.reportedBy} · ${c.reportedAt}</div>
      <div id="correction-edit-${origIdx}" style="display:none;margin-bottom:8px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <label style="font-size:10px;color:var(--dim)">Par<input type="number" id="fix-par-${origIdx}" value="${c.par}" min="3" max="6" style="width:44px;margin-left:4px"></label>
          <label style="font-size:10px;color:var(--dim)">Yards<input type="number" id="fix-yards-${origIdx}" value="${c.yards ?? ''}" min="50" max="700" style="width:54px;margin-left:4px"></label>
          <label style="font-size:10px;color:var(--dim)">SI<input type="number" id="fix-si-${origIdx}" value="${c.si ?? ''}" min="1" max="18" style="width:44px;margin-left:4px"></label>
        </div>
        <button class="btn btn-sm" style="margin-top:6px;padding:6px 12px;font-size:11px" data-save-fix="${origIdx}">Save fix</button>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" style="width:auto;padding:5px 10px;font-size:11px" data-open-fix="${origIdx}">Apply fix</button>
        <button class="btn btn-ghost" style="width:auto;padding:5px 10px;font-size:11px;border-color:rgba(231,76,60,.3);color:#e74c3c" data-dismiss="${origIdx}">Dismiss</button>
      </div>`;
    el.appendChild(wrap);
  });

  // Bind events
  el.querySelectorAll('[data-open-fix]').forEach(btn => {
    const i = btn.dataset.openFix;
    btn.addEventListener('click', () => {
      const edit = document.getElementById('correction-edit-' + i);
      if (edit) edit.style.display = edit.style.display === 'none' ? '' : 'none';
    });
  });
  el.querySelectorAll('[data-save-fix]').forEach(btn => {
    btn.addEventListener('click', () => adminApplyFix(parseInt(btn.dataset.saveFix)));
  });
  el.querySelectorAll('[data-dismiss]').forEach(btn => {
    btn.addEventListener('click', () => adminDismissCorrection(parseInt(btn.dataset.dismiss)));
  });
}

async function adminApplyFix(origIdx) {
  const c = state.gd.courseCorrections?.[origIdx];
  if (!c) return;
  const newPar = parseInt(document.getElementById('fix-par-' + origIdx)?.value);
  const newYards = parseInt(document.getElementById('fix-yards-' + origIdx)?.value) || null;
  const newSI = parseInt(document.getElementById('fix-si-' + origIdx)?.value) || null;
  const holeIdx = c.hole - 1; // 0-based

  // Apply to all tees of the matching course
  const { COURSES } = await import('./constants.js');
  const { getCourseByRef } = await import('./courses.js');
  let applied = false;

  // Try built-in courses
  COURSES.forEach(course => {
    if (course.name !== c.course) return;
    Object.values(course.tees).forEach(teeData => {
      if (!isNaN(newPar) && teeData.pars_per_hole?.[holeIdx] != null) { teeData.pars_per_hole[holeIdx] = newPar; applied = true; }
      if (newYards && teeData.yards_per_hole) teeData.yards_per_hole[holeIdx] = newYards;
      if (newSI && teeData.si_per_hole) teeData.si_per_hole[holeIdx] = newSI;
    });
  });

  // Also try custom courses
  if (state.gd.customCourses?.[c.course]) {
    const cc = state.gd.customCourses[c.course];
    Object.values(cc.tees || {}).forEach(teeData => {
      if (!isNaN(newPar) && teeData.pars_per_hole?.[holeIdx] != null) { teeData.pars_per_hole[holeIdx] = newPar; applied = true; }
      if (newYards && teeData.yards_per_hole) teeData.yards_per_hole[holeIdx] = newYards;
      if (newSI && teeData.si_per_hole) teeData.si_per_hole[holeIdx] = newSI;
    });
  }

  c.status = 'resolved';
  c.resolvedAt = new Date().toLocaleDateString('en-GB');
  c.resolvedBy = state.me;
  await pushData();
  renderAdminCorrections();
  const msg = document.getElementById('admin-del-msg');
  if (msg) { msg.style.color = 'var(--par)'; msg.innerHTML = `<span style="color:#2ecc71">Fix applied${!applied ? ' (custom course updated — built-in courses require a code change)' : ''}.</span>`; }
}

async function adminDismissCorrection(origIdx) {
  const c = state.gd.courseCorrections?.[origIdx];
  if (!c) return;
  c.status = 'dismissed';
  c.resolvedAt = new Date().toLocaleDateString('en-GB');
  c.resolvedBy = state.me;
  await pushData();
  renderAdminCorrections();
}

export async function adminSeedDemo(reset = false) {
  const btn = document.getElementById('admin-seed-btn');
  const msg = document.getElementById('admin-seed-msg');
  if (!msg) return;
  if (btn) btn.disabled = true;
  msg.style.color = 'var(--dim)';
  msg.textContent = reset ? 'Re-seeding demo data\u2026' : 'Seeding demo data\u2026';
  try {
    const url = '/.netlify/functions/run-seed-demo' + (reset ? '?reset=true' : '');
    const res = await fetch(url, { method: 'POST' });
    const json = await res.json();
    if (res.ok) {
      msg.style.color = '#2ecc71';
      msg.textContent = '\u2705 ' + (json.message || 'Demo data seeded.');
    } else {
      msg.style.color = '#e74c3c';
      msg.textContent = `\u274C Error ${res.status}: ${json.error || 'unknown'}`;
    }
  } catch (err) {
    msg.style.color = '#e74c3c';
    msg.textContent = '\u274C Network error \u2014 check connection.';
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function adminFixCourseData() {
  const btn = document.getElementById('admin-fix-courses-btn');
  const msg = document.getElementById('admin-fix-courses-msg');
  if (!msg) return;
  if (btn) btn.disabled = true;
  msg.style.color = 'var(--dim)';
  msg.textContent = 'Scanning for corrupted course records…';
  try {
    const secret = prompt('Enter admin secret:');
    if (!secret) { msg.textContent = 'Cancelled.'; return; }
    const res  = await fetch(`/.netlify/functions/courses?action=fix-bad-data&secret=${encodeURIComponent(secret)}`);
    const data = await res.json();
    if (!res.ok) {
      msg.style.color = 'var(--double)';
      msg.textContent = `Error: ${data.error || res.status}`;
      return;
    }
    msg.style.color = 'var(--par)';
    const details = (data.details || []).map(d => `• ${d.name}: ${d.reason}`).join('\n');
    msg.textContent = data.message + (details ? '\n\n' + details : '');
  } catch (e) {
    msg.style.color = 'var(--double)';
    msg.textContent = `Network error: ${e.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function adminCleanupLegacyGroups() {
  const btn = document.getElementById('admin-cleanup-groups-btn');
  const msg = document.getElementById('admin-cleanup-groups-msg');
  if (!msg) return;
  if (btn) btn.disabled = true;
  msg.style.color = 'var(--dim)';
  msg.textContent = 'Scanning for unnamed/legacy groups…';
  try {
    const { querySupabase } = await import('./api.js');
    const res = await querySupabase('cleanupUnnamedGroups', {});
    if (res && res.error) {
      msg.style.color = 'var(--double)';
      msg.textContent = `Error: ${res.error}`;
    } else if (res) {
      msg.style.color = 'var(--par)';
      const removed = (res.removedGroups || []).map(g => `• ${g.name || '(unnamed)'} [${g.code || g.id}]`).join('\n');
      msg.textContent = res.message + (removed ? '\n\n' + removed : '');
    } else {
      msg.style.color = 'var(--dim)';
      msg.textContent = 'No response from server.';
    }
  } catch (e) {
    msg.style.color = 'var(--double)';
    msg.textContent = `Network error: ${e.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function adminShowApiCallLog() {
  const container = document.getElementById('admin-api-log-container');
  const btn = document.getElementById('admin-api-log-btn');
  if (!container) return;
  if (btn) btn.disabled = true;
  container.innerHTML = '<span style="color:var(--dim)">Loading…</span>';
  try {
    const { querySupabase } = await import('./api.js');
    const res = await querySupabase('getApiCallLog', {});
    const rows = res?.rows || [];
    if (!rows.length) {
      container.innerHTML = '<span style="color:var(--dim)">No API calls logged yet.</span>';
      return;
    }
    const total = rows.length;
    const hits = rows.filter(r => r.was_cache_hit).length;
    const hitRate = total ? Math.round((hits / total) * 100) : 0;
    const byEndpoint = {};
    rows.forEach(r => { byEndpoint[r.endpoint] = (byEndpoint[r.endpoint] || 0) + 1; });
    const epSummary = Object.entries(byEndpoint)
      .sort((a, b) => b[1] - a[1])
      .map(([ep, n]) => `${ep}: ${n}`)
      .join(' · ');
    const recent = rows.slice(0, 20).map(r => {
      const ts = r.timestamp ? new Date(r.timestamp).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '?';
      const hit = r.was_cache_hit ? '<span style="color:var(--par)">cache</span>' : '<span style="color:var(--gold)">API</span>';
      return `<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)">${ts} — ${r.endpoint} — ${r.course_name || '—'} — ${hit}</div>`;
    }).join('');
    container.innerHTML = `
      <div style="margin-bottom:8px;color:var(--cream)">
        <strong>${total}</strong> calls logged · <strong>${hitRate}%</strong> cache hit rate
      </div>
      <div style="font-size:11px;color:var(--dim);margin-bottom:8px">${epSummary}</div>
      <div style="font-size:11px;max-height:200px;overflow-y:auto">${recent}</div>`;
  } catch (e) {
    container.innerHTML = `<span style="color:var(--double)">Error: ${e.message}</span>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function adminShowApiUsage() {
  const container = document.getElementById('admin-token-container');
  const btn = document.getElementById('admin-token-btn');
  if (!container) return;
  if (btn) btn.disabled = true;
  container.innerHTML = '<span style="color:var(--dim)">Checking…</span>';
  try {
    const res  = await fetch('/.netlify/functions/courses?action=usage');
    const data = await res.json();
    if (!res.ok) {
      container.innerHTML = `<span style="color:var(--double)">Error: ${data.error || res.status}</span>`;
      return;
    }
    if (data.apiRequestsLeft === null) {
      container.innerHTML = '<span style="color:var(--dim)">No token data recorded yet — make a course search first.</span>';
      return;
    }
    const n = data.apiRequestsLeft;
    const colour = n > 100 ? 'var(--par)' : n > 20 ? 'var(--bogey)' : 'var(--double)';
    const ts = data.lastChecked
      ? new Date(data.lastChecked).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '?';
    container.innerHTML = `
      <div style="color:${colour};font-size:20px;font-weight:700">${n.toLocaleString()} requests left</div>
      <div style="color:var(--dim);font-size:11px;margin-top:4px">Last recorded: ${ts}</div>`;
  } catch (e) {
    container.innerHTML = `<span style="color:var(--double)">Network error: ${e.message}</span>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Expose for inline onclick in admin panel HTML
window._adminSeedDemo             = adminSeedDemo;
window._adminFixCourseData        = adminFixCourseData;
window._adminCleanupLegacyGroups  = adminCleanupLegacyGroups;
window._adminShowApiCallLog       = adminShowApiCallLog;
window._adminShowApiUsage         = adminShowApiUsage;
