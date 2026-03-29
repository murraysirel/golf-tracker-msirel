// ─────────────────────────────────────────────────────────────────
// COMPETITION MODE — Live activity feed, today's leaderboard,
// competition-specific leaderboard, admin panel
// Also exports getMatchLeaderboard for group match standings
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { loadAppData, querySupabase } from './api.js';
import { calcStableford, parseDateGB } from './stats.js';
import { initials, avatarHtml } from './players.js';
import { getCourseByRef } from './courses.js';

let _compCommentaryGenerators = null;
try {
  const m = await import('./competition-setup.js');
  _compCommentaryGenerators = { preview: m.generateCompPreview, halftime: m.generateHalftimeSummary, final: m.generateFinalSummary };
} catch { /* not yet available */ }

let _lastSnapshot = null;
let _pollInterval = null;
let _feed = [];
let _format = 'stableford';
let _lastPollTime = null;

const BIRDIE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>`;

const EAGLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/></svg>`;

const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

function todayGB() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${mon}/${d.getFullYear()}`;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

function diffSnapshots(oldSnap, newSnap) {
  const events = [];
  const today = todayGB();
  const now = Date.now();
  Object.entries(newSnap.players || {}).forEach(([name, player]) => {
    const oldRounds = (oldSnap?.players?.[name]?.rounds || []);
    const oldIds = new Set(oldRounds.map(r => r.id));
    (player.rounds || []).filter(r => r.date === today).forEach(r => {
      if (!oldIds.has(r.id)) {
        events.push({ type: 'round', player: name, course: r.course, score: r.totalScore, diff: r.diff, ts: now });
        if (r.scores && r.pars) {
          for (let h = 0; h < 18; h++) {
            const s = r.scores[h], p = r.pars[h];
            if (s == null || p == null) continue;
            const d = s - p;
            if (d <= -2) events.push({ type: 'eagle', player: name, hole: h + 1, ts: now - 1 });
            else if (d === -1) events.push({ type: 'birdie', player: name, hole: h + 1, ts: now - 2 });
          }
        }
      }
    });
  });
  return events;
}

function updatePollStatus() {
  const el = document.getElementById('comp-poll-status');
  if (!el) return;
  if (_lastPollTime) {
    const mins = Math.floor((Date.now() - _lastPollTime) / 60000);
    el.textContent = mins < 1 ? 'Updated just now' : `Updated ${mins}m ago`;
  } else {
    el.textContent = 'Polling every 45s';
  }
}

async function pollAndUpdate() {
  if (state.demoMode) return;
  const { getStoredSession } = await import('./auth.js');
  const session = getStoredSession();
  await loadAppData(session?.playerName || '', state.gd?.activeGroupCode || '');
  const newEvents = diffSnapshots(_lastSnapshot, state.gd);
  if (newEvents.length) {
    _feed = [...newEvents, ..._feed].slice(0, 50);
    renderActivityFeed();
  }
  _lastSnapshot = JSON.parse(JSON.stringify(state.gd));
  _lastPollTime = Date.now();

  // Render the appropriate leaderboard
  if (state.activeCompetitionId) {
    renderCompetitionLeaderboard();
  } else {
    renderCompLeaderboard();
  }
  updatePollStatus();
  import('./overlay.js').then(({ refreshMatchOverlay }) => refreshMatchOverlay());
}

export async function initCompetition() {
  if (!_lastSnapshot) {
    _lastSnapshot = JSON.parse(JSON.stringify(state.gd));
  }
  _lastPollTime = Date.now();

  document.getElementById('comp-fmt-stab')?.addEventListener('click', () => setFormat('stableford'));
  document.getElementById('comp-fmt-gross')?.addEventListener('click', () => setFormat('gross'));

  // Load competition selector
  await renderCompSelector();

  if (state.activeCompetitionId) {
    renderCompetitionLeaderboard();
  } else {
    renderCompLeaderboard();
  }
  renderActivityFeed();
  renderCompAdmin();
  renderCompCommentary();
  if (state.activeCompetitionId) checkAutoCommentary();
  updatePollStatus();

  if (!_pollInterval) {
    _pollInterval = setInterval(pollAndUpdate, 45000);
  }
}

function setFormat(fmt) {
  _format = fmt;
  document.getElementById('comp-fmt-stab')?.classList.toggle('active', fmt === 'stableford');
  document.getElementById('comp-fmt-gross')?.classList.toggle('active', fmt === 'gross');
  if (state.activeCompetitionId) {
    renderCompetitionLeaderboard();
  } else {
    renderCompLeaderboard();
  }
}

// ── Competition selector (pill strip) ────────────────────────────

async function renderCompSelector() {
  const el = document.getElementById('comp-selector');
  if (!el) return;

  let comps = [];
  try {
    const res = await querySupabase('getMyCompetitions', { playerName: state.me });
    comps = res?.competitions || [];
  } catch { /* ignore */ }

  if (!comps.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<button class="fpill ${!state.activeCompetitionId ? 'active' : ''}" data-comp-id="">Today</button>` +
    comps.map(c =>
      `<button class="fpill ${state.activeCompetitionId === c.id ? 'active' : ''}" data-comp-id="${c.id}">${c.name}</button>`
    ).join('');

  el.querySelectorAll('.fpill').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.compId || null;
      state.activeCompetitionId = id;
      state.activeCompetition = id ? comps.find(c => c.id === id) || null : null;
      el.querySelectorAll('.fpill').forEach(b => b.classList.toggle('active', b === btn));
      if (id) {
        renderCompetitionLeaderboard();
      } else {
        renderCompLeaderboard();
      }
      renderCompAdmin();
      renderCompCommentary();
    });
  });
}

// ── Competition-specific leaderboard ─────────────────────────────

async function renderCompetitionLeaderboard() {
  const el = document.getElementById('comp-lb');
  if (!el) return;

  let comp = state.activeCompetition;
  if (!comp && state.activeCompetitionId) {
    try {
      const res = await querySupabase('getCompetition', { id: state.activeCompetitionId });
      if (res?.found) { comp = res.competition; state.activeCompetition = comp; }
    } catch { /* ignore */ }
  }
  if (!comp) { el.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px">Competition not found.</div>'; return; }

  const fmt = comp.format || 'stableford';
  const roundsConfig = comp.rounds_config || [];
  const hcpOverrides = comp.hcp_overrides || {};
  const totalRounds = roundsConfig.length || 1;
  const posClass = ['gold', 'silver', 'bronze'];

  // Match rounds by date (DD/MM/YYYY in rounds_config) to player rounds
  const configDates = new Set(roundsConfig.map(rc => rc.date).filter(Boolean));

  const entries = (comp.players || []).map(name => {
    const playerData = state.gd.players?.[name];
    const allRounds = playerData?.rounds || [];
    // Match rounds: if config has dates, filter by those dates; otherwise include all rounds
    const compRounds = configDates.size > 0
      ? allRounds.filter(r => configDates.has(r.date))
      : allRounds;

    if (!compRounds.length) return { name, roundsPlayed: 0, aggregate: null, handicap: hcpOverrides[name] ?? playerData?.handicap ?? 0 };

    const handicap = hcpOverrides[name] ?? playerData?.handicap ?? 0;
    let aggregate = 0;

    if (fmt === 'stableford') {
      compRounds.forEach(r => {
        if (!r.scores || !r.pars) return;
        const s = calcStableford(r.scores, r.pars, handicap, r.slope, null);
        if (s != null) aggregate += s;
      });
    } else if (fmt === 'stroke_gross') {
      compRounds.forEach(r => { if (r.totalScore) aggregate += r.totalScore; });
    } else if (fmt === 'stroke_net') {
      compRounds.forEach(r => {
        if (!r.totalScore) return;
        const php = Math.round(handicap * (r.slope || 113) / 113);
        aggregate += r.totalScore - php;
      });
    } else {
      // matchplay fallback — show gross
      compRounds.forEach(r => { if (r.totalScore) aggregate += r.totalScore; });
    }

    return { name, roundsPlayed: compRounds.length, aggregate, handicap };
  });

  // Sort
  if (fmt === 'stableford') {
    entries.sort((a, b) => (b.aggregate ?? -1) - (a.aggregate ?? -1));
  } else {
    entries.sort((a, b) => {
      if (a.roundsPlayed === 0 && b.roundsPlayed === 0) return 0;
      if (a.roundsPlayed === 0) return 1;
      if (b.roundsPlayed === 0) return -1;
      return (a.aggregate ?? 999) - (b.aggregate ?? 999);
    });
  }

  // Round progress subtitle
  const completedRounds = configDates.size > 0
    ? [...configDates].filter(d => entries.some(e => e.roundsPlayed > 0 && state.gd.players?.[e.name]?.rounds?.some(r => r.date === d))).length
    : Math.max(...entries.map(e => e.roundsPlayed), 0);
  const subtitle = totalRounds > 1
    ? `<div style="font-size:10px;color:var(--dimmer);margin-bottom:10px">Round ${Math.min(completedRounds, totalRounds)} of ${totalRounds}</div>`
    : '';

  if (!entries.some(e => e.roundsPlayed > 0)) {
    el.innerHTML = subtitle + '<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px">No rounds submitted yet.</div>';
    return;
  }

  let metricLabel;
  if (fmt === 'stableford') metricLabel = 'pts';
  else if (fmt === 'stroke_net') metricLabel = 'net';
  else metricLabel = 'gross';

  el.innerHTML = subtitle + entries.map((e, i) => {
    const isMe = e.name === state.me;
    const pc = posClass[i] || '';
    let val, valColor;
    if (e.roundsPlayed === 0) {
      val = '—'; valColor = 'var(--dimmer)';
    } else if (fmt === 'stableford') {
      val = e.aggregate; valColor = 'var(--gold)';
    } else {
      val = e.aggregate; valColor = 'var(--cream)';
    }
    return `<div class="lb-row${isMe ? ' lb-me' : ''}">
      <div class="lb-pos ${pc}">${e.roundsPlayed > 0 ? i + 1 : ''}</div>
      ${avatarHtml(e.name, 36, isMe)}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px">
          <span class="lb-name" style="${isMe ? 'color:var(--gold)' : ''}">${e.name}</span>
          ${isMe ? '<span class="lb-you-badge">You</span>' : ''}
        </div>
        <div class="lb-meta">${e.roundsPlayed}/${totalRounds} round${totalRounds !== 1 ? 's' : ''} · HCP ${e.handicap}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="lb-score" style="color:${valColor}">${val}</div>
        <div style="font-size:9px;color:var(--dimmer);margin-top:1px">${metricLabel}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Admin panel ──────────────────────────────────────────────────

function renderCompAdmin() {
  const section = document.getElementById('comp-admin-section');
  if (!section) return;

  const comp = state.activeCompetition;
  if (!comp || !(comp.admin_players || []).includes(state.me)) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const hcpOverrides = comp.hcp_overrides || {};
  const players = comp.players || [];

  section.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" id="comp-admin-toggle">
      <div style="font-family:'DM Sans',sans-serif;font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase">Admin</div>
      <div style="font-size:12px;color:var(--dimmer)" id="comp-admin-chevron">&#9662;</div>
    </div>
    <div id="comp-admin-body" style="display:none;margin-top:12px">
      <!-- Player roster + handicap overrides -->
      <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Players &amp; Handicap Overrides</div>
      <div id="comp-admin-roster"></div>
      <button id="comp-admin-save-hcp" class="btn btn-ghost" style="font-size:11px;padding:6px 14px;margin-top:8px">Save Handicaps</button>
      <div id="comp-admin-hcp-msg" style="font-size:11px;color:var(--dim);margin-top:4px"></div>

      <!-- Share admin -->
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:14px">
        <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Share Admin Access</div>
        <div style="display:flex;gap:8px">
          <select id="comp-admin-add-sel" style="flex:1;font-size:12px">
            <option value="">— Select player —</option>
            ${players.filter(p => !(comp.admin_players || []).includes(p)).map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
          <button id="comp-admin-add-btn" class="btn" style="width:auto;padding:0 14px;font-size:12px">Make Admin</button>
        </div>
        <div id="comp-admin-add-msg" style="font-size:11px;color:var(--dim);margin-top:4px"></div>
      </div>
    </div>
  `;

  // Roster
  const roster = document.getElementById('comp-admin-roster');
  if (roster) {
    players.forEach(name => {
      const playerData = state.gd.players?.[name];
      const roundsPlayed = (playerData?.rounds || []).length;
      const hcp = hcpOverrides[name] ?? playerData?.handicap ?? 0;
      const isAdmin = (comp.admin_players || []).includes(name);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)';
      row.innerHTML = `
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--cream)">${name}${isAdmin ? ' <span style="font-size:9px;color:var(--gold)">(admin)</span>' : ''}</div>
          <div style="font-size:10px;color:var(--dimmer)">${roundsPlayed} round${roundsPlayed !== 1 ? 's' : ''}</div>
        </div>
        <input type="number" class="comp-hcp-input" data-player="${name}" value="${hcp}" style="width:50px;font-size:12px;text-align:center" step="0.1">
      `;
      roster.appendChild(row);
    });
  }

  // Toggle collapse
  document.getElementById('comp-admin-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('comp-admin-body');
    const chev = document.getElementById('comp-admin-chevron');
    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
    if (chev) chev.textContent = body?.style.display === 'none' ? '\u25BE' : '\u25B4';
  });

  // Save handicaps
  document.getElementById('comp-admin-save-hcp')?.addEventListener('click', async () => {
    const msg = document.getElementById('comp-admin-hcp-msg');
    const newOverrides = { ...hcpOverrides };
    document.querySelectorAll('.comp-hcp-input').forEach(inp => {
      newOverrides[inp.dataset.player] = parseFloat(inp.value) || 0;
    });
    try {
      await querySupabase('updateCompetition', {
        competitionId: comp.id,
        playerName: state.me,
        updates: { hcp_overrides: newOverrides }
      });
      comp.hcp_overrides = newOverrides;
      state.activeCompetition = comp;
      if (msg) msg.innerHTML = '<span style="color:var(--par)">Saved.</span>';
      renderCompetitionLeaderboard();
    } catch {
      if (msg) msg.textContent = 'Error saving. Try again.';
    }
  });

  // Make admin
  document.getElementById('comp-admin-add-btn')?.addEventListener('click', async () => {
    const sel = document.getElementById('comp-admin-add-sel');
    const msg = document.getElementById('comp-admin-add-msg');
    const newAdmin = sel?.value;
    if (!newAdmin) { if (msg) msg.textContent = 'Select a player.'; return; }
    const updated = [...(comp.admin_players || []), newAdmin];
    try {
      await querySupabase('updateCompetition', {
        competitionId: comp.id,
        playerName: state.me,
        updates: { admin_players: updated }
      });
      comp.admin_players = updated;
      state.activeCompetition = comp;
      if (msg) msg.innerHTML = `<span style="color:var(--par)">${newAdmin} is now an admin.</span>`;
      renderCompAdmin();
    } catch {
      if (msg) msg.textContent = 'Error. Try again.';
    }
  });
}

// ── AI Commentary ────────────────────────────────────────────────

function renderCommentaryCard(type, label, text, comp, isAdmin) {
  const regen = isAdmin ? `<button class="btn btn-ghost comp-regen-btn" data-type="${type}" style="font-size:10px;padding:4px 12px;margin-top:8px">Regenerate</button>` : '';
  const copy = `<button class="comp-copy-btn" style="background:none;border:none;color:var(--gold);font-size:10px;cursor:pointer;margin-top:8px;margin-left:8px" data-text="${text.replace(/"/g, '&quot;')}">Copy to share</button>`;
  return `<div style="border:1px solid rgba(201,168,76,.3);border-radius:14px;padding:16px;margin-bottom:10px;background:rgba(201,168,76,.04)">
    <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">${label}</div>
    <div style="font-size:13px;color:var(--cream);line-height:1.6">${text}</div>
    <div style="display:flex;align-items:center">${regen}${copy}</div>
  </div>`;
}

function renderCompCommentary() {
  const el = document.getElementById('comp-commentary');
  if (!el) return;
  const comp = state.activeCompetition;
  if (!comp) { el.innerHTML = ''; return; }

  const commentary = comp.commentary || {};
  const isAdmin = (comp.admin_players || []).includes(state.me);
  let html = '';

  if (commentary.preview) html += renderCommentaryCard('preview', 'Preview', commentary.preview, comp, isAdmin);
  if (commentary.halftime) html += renderCommentaryCard('halftime', 'Half-time', commentary.halftime, comp, isAdmin);
  if (commentary.final) html += renderCommentaryCard('final', 'Final Summary', commentary.final, comp, isAdmin);

  // Admin-only: Generate preview button (only if no preview exists yet)
  if (isAdmin && !commentary.preview) {
    html += `<button class="btn btn-ghost" id="comp-gen-preview-btn" style="width:100%;font-size:12px;margin-bottom:10px">Generate Preview Card</button>`;
  }

  el.innerHTML = html;

  // Wire regenerate buttons
  el.querySelectorAll('.comp-regen-btn').forEach(btn => {
    btn.addEventListener('click', async () => { await triggerCommentary(btn.dataset.type); });
  });
  // Wire copy buttons
  el.querySelectorAll('.comp-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(btn.dataset.text).then(() => { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy to share'; }, 2000); });
    });
  });
  // Wire generate preview
  document.getElementById('comp-gen-preview-btn')?.addEventListener('click', async () => { await triggerCommentary('preview'); });
}

async function triggerCommentary(type) {
  if (!_compCommentaryGenerators) return;
  const comp = state.activeCompetition;
  if (!comp) return;

  const el = document.getElementById('comp-commentary');
  if (el) {
    const existing = el.innerHTML;
    el.innerHTML = `<div style="text-align:center;padding:16px;font-size:12px;color:var(--dim)"><span class="spin"></span> Generating ${type} commentary...</div>` + existing;
  }

  let text = '';
  try {
    if (type === 'preview') {
      text = await _compCommentaryGenerators.preview(comp);
    } else {
      // Build standings for halftime/final
      const standings = getCompStandings(comp);
      if (type === 'halftime') text = await _compCommentaryGenerators.halftime(comp, standings);
      else text = await _compCommentaryGenerators.final(comp, standings);
    }
  } catch { text = 'Commentary generation failed.'; }

  if (!text) text = 'No commentary generated.';

  // Save to competition
  const commentary = { ...(comp.commentary || {}), [type]: text };
  try {
    await querySupabase('updateCompetition', {
      competitionId: comp.id,
      playerName: state.me,
      updates: { commentary }
    });
    comp.commentary = commentary;
    state.activeCompetition = comp;
  } catch { /* save failed — still show locally */ }

  renderCompCommentary();
}

// Build standings array for commentary prompts
function getCompStandings(comp) {
  const fmt = comp.format || 'stableford';
  const roundsConfig = comp.rounds_config || [];
  const hcpOverrides = comp.hcp_overrides || {};
  const configDates = new Set(roundsConfig.map(rc => rc.date).filter(Boolean));

  const entries = (comp.players || []).map(name => {
    const playerData = state.gd.players?.[name];
    const allRounds = playerData?.rounds || [];
    const compRounds = configDates.size > 0 ? allRounds.filter(r => configDates.has(r.date)) : allRounds;
    const handicap = hcpOverrides[name] ?? playerData?.handicap ?? 0;
    let aggregate = 0;

    if (fmt === 'stableford') {
      compRounds.forEach(r => {
        if (!r.scores || !r.pars) return;
        const s = calcStableford(r.scores, r.pars, handicap, r.slope, null);
        if (s != null) aggregate += s;
      });
    } else if (fmt === 'stroke_net') {
      compRounds.forEach(r => {
        if (!r.totalScore) return;
        aggregate += r.totalScore - Math.round(handicap * (r.slope || 113) / 113);
      });
    } else {
      compRounds.forEach(r => { if (r.totalScore) aggregate += r.totalScore; });
    }

    return { name, roundsPlayed: compRounds.length, aggregate, handicap };
  });

  if (fmt === 'stableford') entries.sort((a, b) => (b.aggregate ?? -1) - (a.aggregate ?? -1));
  else entries.sort((a, b) => {
    if (a.roundsPlayed === 0) return 1; if (b.roundsPlayed === 0) return -1;
    return (a.aggregate ?? 999) - (b.aggregate ?? 999);
  });

  return entries;
}

// Auto-trigger halftime/final commentary when conditions are met
async function checkAutoCommentary() {
  const comp = state.activeCompetition;
  if (!comp || !_compCommentaryGenerators) return;
  if (!(comp.admin_players || []).includes(state.me)) return;

  const roundsConfig = comp.rounds_config || [];
  if (roundsConfig.length < 2) return;

  const commentary = comp.commentary || {};
  const standings = getCompStandings(comp);
  const playersWithRounds = standings.filter(s => s.roundsPlayed > 0);

  // Halftime: all players completed round 1, no one started round 2, no halftime yet
  const allDoneR1 = playersWithRounds.length === (comp.players || []).length && playersWithRounds.every(s => s.roundsPlayed >= 1);
  const noR2Yet = playersWithRounds.every(s => s.roundsPlayed <= 1);
  if (allDoneR1 && noR2Yet && !commentary.halftime) {
    await triggerCommentary('halftime');
  }

  // Final: all players completed all rounds, no final yet
  const allDone = playersWithRounds.length === (comp.players || []).length && playersWithRounds.every(s => s.roundsPlayed >= roundsConfig.length);
  if (allDone && !commentary.final) {
    await triggerCommentary('final');
  }
}

// ── Today's leaderboard (existing) ───────────────────────────────

function renderActivityFeed() {
  const el = document.getElementById('comp-feed');
  if (!el) return;
  if (!_feed.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px;line-height:1.5">No activity yet today.<br>Submitted rounds will appear here.</div>';
    return;
  }
  el.innerHTML = _feed.map(evt => {
    let icon, label, detail, iconColor;
    if (evt.type === 'eagle') {
      icon = EAGLE_SVG; iconColor = 'var(--eagle)';
      label = 'Eagle'; detail = `Hole ${evt.hole}`;
    } else if (evt.type === 'birdie') {
      icon = BIRDIE_SVG; iconColor = 'var(--birdie)';
      label = 'Birdie'; detail = `Hole ${evt.hole}`;
    } else {
      icon = CHECK_SVG; iconColor = 'var(--par)';
      const dStr = evt.diff != null ? (evt.diff >= 0 ? ' (+' + evt.diff + ')' : ' (' + evt.diff + ')') : '';
      label = 'Round submitted' + dStr;
      const shortCourse = (evt.course || '').replace(' Golf Club','').replace(' Golf Course','').replace(' Golf Links','');
      detail = shortCourse;
    }
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;color:${iconColor};flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--cream);font-weight:500">${evt.player}</div>
        <div style="font-size:11px;color:var(--dim)">${label}${detail ? ' · ' + detail : ''}</div>
      </div>
      <div style="font-size:10px;color:var(--dimmer);flex-shrink:0">${timeAgo(evt.ts)}</div>
    </div>`;
  }).join('');
}

// ── Group Match Leaderboard ──────────────────────────────────────

export function getMatchLeaderboard(matchId) {
  const match = state.gd.matches?.[matchId];
  if (!match) return [];

  const entries = (match.players || []).map(p => {
    const scoreData = match.scores?.[p.name];
    return {
      name: p.name,
      netTotal: scoreData?.holesPlayed > 0 ? scoreData.netTotal : null,
      holesPlayed: scoreData?.holesPlayed ?? 0,
      isMe: p.name === state.me
    };
  });

  entries.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
    if (a.holesPlayed === 0) return 1;
    if (b.holesPlayed === 0) return -1;
    return (a.netTotal ?? 999) - (b.netTotal ?? 999);
  });

  let pos = 1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].holesPlayed === 0) {
      entries[i].position = null;
    } else {
      if (i > 0 && entries[i - 1].holesPlayed > 0 && entries[i].netTotal === entries[i - 1].netTotal) {
        entries[i].position = entries[i - 1].position;
      } else {
        entries[i].position = pos;
      }
      pos++;
    }
  }

  return entries;
}

function renderCompLeaderboard() {
  const el = document.getElementById('comp-lb');
  if (!el) return;
  const today = todayGB();
  const posClass = ['gold', 'silver', 'bronze'];

  const entries = Object.entries(state.gd.players || {}).map(([name, player]) => {
    const todayRounds = (player.rounds || []).filter(r => r.date === today);
    if (!todayRounds.length) return null;
    const r = todayRounds.reduce((a, b) => ((b.id || 0) > (a.id || 0) ? b : a));
    let stab = null;
    if (r.scores && r.pars) {
      const course = getCourseByRef(r.course);
      const si = course?.tees?.[r.tee]?.si || null;
      stab = calcStableford(r.scores, r.pars, player.handicap || 0, r.slope, si);
    }
    return { name, score: r.totalScore, diff: r.diff, totalPar: r.totalPar, stab, birdies: r.birdies || 0, handicap: player.handicap || 0, round: r };
  }).filter(Boolean);

  if (!entries.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px;line-height:1.5">No rounds submitted today yet.<br>Scores will appear here once submitted.</div>';
    return;
  }

  if (_format === 'stableford') {
    entries.sort((a, b) => (b.stab ?? -1) - (a.stab ?? -1));
  } else {
    entries.sort((a, b) => (a.diff ?? 99) - (b.diff ?? 99) || (a.score ?? 999) - (b.score ?? 999));
  }

  el.innerHTML = entries.map((e, i) => {
    const isMe = e.name === state.me;
    const pc = posClass[i] || '';
    let metricHtml;
    if (_format === 'stableford') {
      const diff36 = e.stab != null ? e.stab - 36 : null;
      const diff36Str = diff36 != null ? (diff36 >= 0 ? '+' + diff36 : String(diff36)) : '';
      const diff36Color = diff36 != null && diff36 >= 0 ? 'var(--birdie)' : 'var(--bogey)';
      metricHtml = `<div style="text-align:right;flex-shrink:0">
        <div class="lb-score" style="color:var(--gold)">${e.stab ?? '—'}</div>
        <div style="font-size:9px;color:${diff36Color};margin-top:1px">${diff36Str ? diff36Str + ' vs 36' : 'pts'}</div>
      </div>`;
    } else {
      const dStr = e.diff != null ? (e.diff >= 0 ? '+' + e.diff : String(e.diff)) : '—';
      const dColor = e.diff < 0 ? 'var(--birdie)' : e.diff === 0 ? 'var(--par)' : 'var(--bogey)';
      metricHtml = `<div style="text-align:right;flex-shrink:0">
        <div class="lb-score" style="color:${dColor}">${dStr}</div>
        <div style="font-size:9px;color:var(--dimmer);margin-top:1px">${e.score} gross</div>
      </div>`;
    }

    const birdieNote = e.birdies > 0 ? ` · ${e.birdies} birdie${e.birdies !== 1 ? 's' : ''}` : '';
    return `<div class="lb-row${isMe ? ' lb-me' : ''}">
      <div class="lb-pos ${pc}">${i + 1}</div>
      ${avatarHtml(e.name, 36, isMe)}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px">
          <span class="lb-name" style="${isMe ? 'color:var(--gold)' : ''}">${e.name}</span>
          ${isMe ? '<span class="lb-you-badge">You</span>' : ''}
        </div>
        <div class="lb-meta">HCP ${e.handicap}${birdieNote}</div>
      </div>
      ${metricHtml}
    </div>`;
  }).join('');
}
