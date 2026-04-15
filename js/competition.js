// ─────────────────────────────────────────────────────────────────
// COMPETITION MODE — Tabbed hub: Overview · Schedule · Leaderboard · Activity
// Also exports getMatchLeaderboard for group match standings
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { loadAppData, querySupabase } from './api.js';
import { calcStableford, parseDateGB } from './stats.js';
import { initials, avatarHtml } from './players.js';
import { getCourseByRef } from './courses.js';
import { API_BASE } from './config.js';

let _compCommentaryGenerators = null;
import('./competition-setup.js').then(m => {
  _compCommentaryGenerators = { preview: m.generateCompPreview, halftime: m.generateHalftimeSummary, final: m.generateFinalSummary };
}).catch(() => {});

let _lastSnapshot = null;
let _pollInterval = null;
let _feed = [];
let _format = 'stableford';
let _lastPollTime = null;
let _activeTab = 'overview';

const BIRDIE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>`;
const EAGLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/></svg>`;
const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

function todayGB() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
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
    const oldIds = new Set((oldSnap?.players?.[name]?.rounds || []).map(r => r.id));
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
  }
}

async function pollAndUpdate() {
  if (state.demoMode) return;
  const { getStoredSession } = await import('./auth.js');
  const session = getStoredSession();
  await loadAppData(session?.playerName || '', state.gd?.activeGroupCode || '');
  const newEvents = diffSnapshots(_lastSnapshot, state.gd);
  if (newEvents.length) { _feed = [...newEvents, ..._feed].slice(0, 50); }
  _lastSnapshot = JSON.parse(JSON.stringify(state.gd));
  _lastPollTime = Date.now();
  renderActiveTab();
  updatePollStatus();
}

// ── Main entry point ─────────────────────────────────────────────
export async function initCompetition() {
  if (!_lastSnapshot) _lastSnapshot = JSON.parse(JSON.stringify(state.gd));
  _lastPollTime = Date.now();

  // If we have an active competition, render the hub
  if (state.activeCompetitionId && state.activeCompetition) {
    renderCompHub();
  } else {
    // No competition selected — show the selector / Group Activity
    renderCompSelector();
  }

  if (!_pollInterval) _pollInterval = setInterval(pollAndUpdate, 45000);
}

export function stopCompetitionPolling() {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
}

// ── Competition selector (when no comp is selected) ──────────────
async function renderCompSelector() {
  const pg = document.getElementById('pg-competition');
  if (!pg) return;

  let comps = [];
  try {
    const res = await querySupabase('getMyCompetitions', { playerName: state.me });
    comps = res?.competitions || [];
  } catch {}

  // If a comp was clicked from the My Competitions list, load it
  if (state.activeCompetitionId && !state.activeCompetition) {
    const found = comps.find(c => c.id === state.activeCompetitionId);
    if (found) {
      state.activeCompetition = found;
      renderCompHub();
      return;
    }
  }

  // Show selector + Group Activity
  pg.innerHTML = `
    <div style="padding:10px 16px 8px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:2px">Live</div>
          <div style="font-size:18px;font-weight:700;color:var(--cream)">Competition</div>
        </div>
        <div id="comp-poll-status" style="font-size:10px;color:var(--dimmer)"></div>
      </div>
      ${comps.length ? `<div style="margin-top:10px;display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none" id="comp-sel-pills"></div>` : ''}
      <div style="display:flex;gap:5px;margin-top:8px">
        <button class="fpill active" id="comp-fmt-stab" data-fmt="stableford">Stableford</button>
        <button class="fpill" id="comp-fmt-gross" data-fmt="gross">Gross</button>
      </div>
    </div>
    <div class="card" style="margin:12px 16px"><div id="comp-lb"></div></div>
    <div class="card" style="margin:0 16px 12px"><div style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:10px">Activity Feed</div><div id="comp-feed"></div></div>`;

  // Wire format toggle
  document.getElementById('comp-fmt-stab')?.addEventListener('click', () => { _format = 'stableford'; renderGroupActivityLB(); document.getElementById('comp-fmt-stab')?.classList.add('active'); document.getElementById('comp-fmt-gross')?.classList.remove('active'); });
  document.getElementById('comp-fmt-gross')?.addEventListener('click', () => { _format = 'gross'; renderGroupActivityLB(); document.getElementById('comp-fmt-gross')?.classList.add('active'); document.getElementById('comp-fmt-stab')?.classList.remove('active'); });

  // Render comp pills
  if (comps.length) {
    const pillsEl = document.getElementById('comp-sel-pills');
    if (pillsEl) {
      pillsEl.innerHTML = `<button class="fpill active" data-comp-id="">Group Activity</button>` +
        comps.map(c => `<button class="fpill" data-comp-id="${c.id}">${c.name}</button>`).join('');
      pillsEl.querySelectorAll('.fpill').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.compId || null;
          if (id) {
            state.activeCompetitionId = id;
            state.activeCompetition = comps.find(c => c.id === id) || null;
            renderCompHub();
          } else {
            pillsEl.querySelectorAll('.fpill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          }
        });
      });
    }
  }

  renderGroupActivityLB();
  renderActivityFeed();
  updatePollStatus();
}

// ── Competition Hub (tabbed view) ────────────────────────────────
function renderCompHub() {
  const pg = document.getElementById('pg-competition');
  if (!pg) return;
  const comp = state.activeCompetition;
  if (!comp) { renderCompSelector(); return; }

  const isAdmin = (comp.admin_players || []).includes(state.me);
  const fmtNames = { stableford: 'Stableford', stableford_gross: 'Stableford (Gross)', stroke_gross: 'Stroke (Gross)', stroke_net: 'Stroke (Net)', matchplay: 'Match Play' };
  const statusLabels = { setup: 'Setting up', active: 'Live', complete: 'Complete' };
  const statusColors = { setup: 'var(--dim)', active: 'var(--par)', complete: 'var(--gold)' };

  pg.innerHTML = `
    <div style="padding:12px 16px 0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <button id="comp-back-btn" style="background:none;border:none;color:var(--dim);font-size:13px;cursor:pointer;padding:0;font-family:'DM Sans',sans-serif">← Back</button>
        <div style="flex:1"></div>
        <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.05);color:${statusColors[comp.status] || 'var(--dim)'}">${statusLabels[comp.status] || comp.status}</span>
        ${isAdmin ? `<button id="comp-admin-gear" style="background:none;border:none;color:var(--dim);cursor:pointer;padding:2px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="2.5"/><path d="M14.5 9a5.5 5.5 0 0 0-.1-.8l1.3-1-.7-1.2-1.5.5a5.5 5.5 0 0 0-1.2-.7L12 4.5h-1.4l-.3 1.3a5.5 5.5 0 0 0-1.2.7l-1.5-.5-.7 1.2 1.3 1a5.5 5.5 0 0 0 0 1.6l-1.3 1 .7 1.2 1.5-.5c.4.3.7.5 1.2.7l.3 1.3H12l.3-1.3c.4-.2.8-.4 1.2-.7l1.5.5.7-1.2-1.3-1a5.5 5.5 0 0 0 .1-.8z"/></svg></button>` : ''}
      </div>
      <div style="font-size:22px;font-weight:700;color:var(--cream);margin-bottom:2px">${comp.name}</div>
      <div style="font-size:11px;color:var(--dim);margin-bottom:12px">${fmtNames[comp.format] || comp.format} · ${(comp.players || []).length} players · Code: <span style="color:var(--gold);letter-spacing:1px">${comp.code}</span></div>
    </div>

    <!-- Tab pills -->
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 16px;margin-bottom:0" id="comp-tab-bar">
      <button class="comp-tab active" data-tab="overview" style="flex:1">Overview</button>
      <button class="comp-tab" data-tab="schedule" style="flex:1">Schedule</button>
      <button class="comp-tab" data-tab="leaderboard" style="flex:1">Leaderboard</button>
      <button class="comp-tab" data-tab="activity" style="flex:1">Activity</button>
    </div>

    <!-- Tab content -->
    <div id="comp-tab-content" style="padding:12px 16px"></div>

    <!-- Admin panel (hidden) -->
    <div id="comp-admin-section" style="display:none;padding:0 16px 16px"></div>

    <div id="comp-poll-status" style="font-size:10px;color:var(--dimmer);text-align:center;padding:8px 0"></div>
  `;

  // Wire back button
  document.getElementById('comp-back-btn')?.addEventListener('click', () => {
    state.activeCompetitionId = null;
    state.activeCompetition = null;
    _activeTab = 'overview';
    renderCompSelector();
  });

  // Wire admin gear
  document.getElementById('comp-admin-gear')?.addEventListener('click', () => {
    const section = document.getElementById('comp-admin-section');
    if (section) section.style.display = section.style.display === 'none' ? 'block' : 'none';
    renderCompAdmin();
  });

  // Wire tab pills
  document.querySelectorAll('.comp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      document.querySelectorAll('.comp-tab').forEach(b => b.classList.toggle('active', b === btn));
      renderActiveTab();
    });
  });

  renderActiveTab();
  updatePollStatus();
}

function renderActiveTab() {
  const el = document.getElementById('comp-tab-content');
  if (!el) return;
  const comp = state.activeCompetition;
  if (!comp) return;

  if (_activeTab === 'overview') renderOverviewTab(el, comp);
  else if (_activeTab === 'schedule') renderScheduleTab(el, comp);
  else if (_activeTab === 'leaderboard') renderLeaderboardTab(el, comp);
  else if (_activeTab === 'activity') renderActivityTab(el, comp);
}

// ── Overview tab ─────────────────────────────────────────────────
function renderOverviewTab(el, comp) {
  const roundsConfig = comp.rounds_config || [];
  const teeGroups = comp.tee_groups || {};
  const myRounds = state.gd.players?.[state.me]?.rounds || [];

  // Find my tee group for the next round
  let nextRound = null, nextRoundIdx = -1, myGroup = null;
  for (let i = 0; i < roundsConfig.length; i++) {
    const rc = roundsConfig[i];
    if (!rc.date) continue;
    const played = myRounds.some(r => r.date === rc.date);
    if (!played) { nextRound = rc; nextRoundIdx = i; break; }
  }
  if (nextRound) {
    const roundGroups = teeGroups[`round_${nextRoundIdx + 1}`] || [];
    myGroup = roundGroups.find(g => (g.players || []).includes(state.me));
  }

  // Top 3 preview
  const standings = getCompStandings(comp);
  const top3 = standings.filter(s => s.roundsPlayed > 0).slice(0, 3);

  let html = '';

  // Next round card
  if (nextRound) {
    const shortCourse = (nextRound.course || '').replace(/ Golf Club| Golf Course| Golf Links/g, '');
    html += `<div style="background:var(--mid);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:6px">Next Round</div>
      <div style="font-size:15px;font-weight:600;color:var(--cream)">${shortCourse || 'Course TBD'}</div>
      <div style="font-size:11px;color:var(--dim);margin-top:2px">${nextRound.date || 'Date TBD'}${nextRound.tee ? ' · ' + nextRound.tee + ' tees' : ''}</div>
      ${myGroup ? `<div style="font-size:11px;color:var(--dim);margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">Your tee group: ${myGroup.teeTime || ''} · ${(myGroup.players || []).join(', ')}</div>` : ''}
      <button id="comp-start-scoring" class="btn" style="width:100%;border-radius:40px;margin-top:12px">Start scoring →</button>
    </div>`;
  } else if (roundsConfig.length) {
    html += `<div style="background:var(--mid);border-radius:14px;padding:14px 16px;margin-bottom:12px;text-align:center">
      <div style="font-size:12px;color:var(--dim)">All rounds completed</div>
    </div>`;
  }

  // Quick leaderboard preview
  if (top3.length) {
    html += `<div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Standings</div>`;
    top3.forEach((e, i) => {
      const isMe = e.name === state.me;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;${i < top3.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="font-size:12px;font-weight:700;color:${i === 0 ? 'var(--gold)' : 'var(--dimmer)'};width:16px;text-align:center">${i + 1}</div>
        ${avatarHtml(e.name, 30, isMe)}
        <div style="flex:1;font-size:13px;${isMe ? 'color:var(--gold);font-weight:600' : 'color:var(--cream)'}">${e.name}</div>
        <div style="font-size:14px;font-weight:700;color:var(--gold)">${e.aggregate ?? '—'}</div>
      </div>`;
    });
    html += `<div style="margin-top:8px"><button class="btn btn-ghost" style="width:100%;font-size:12px" id="comp-view-lb">View full leaderboard →</button></div>`;
  }

  // Commentary
  html += `<div id="comp-commentary" style="margin-top:12px"></div>`;

  el.innerHTML = html;

  // Wire start scoring
  document.getElementById('comp-start-scoring')?.addEventListener('click', () => startCompetitionRound(comp));
  // Wire view leaderboard
  document.getElementById('comp-view-lb')?.addEventListener('click', () => {
    _activeTab = 'leaderboard';
    document.querySelectorAll('.comp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'leaderboard'));
    renderActiveTab();
  });

  renderCompCommentary();
}

// ── Schedule tab ─────────────────────────────────────────────────
function renderScheduleTab(el, comp) {
  const roundsConfig = comp.rounds_config || [];
  const teeGroups = comp.tee_groups || {};
  const isAdmin = (comp.admin_players || []).includes(state.me);

  if (!roundsConfig.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px 0;color:var(--dimmer);font-size:12px">No rounds configured yet.</div>';
    return;
  }

  // Round pills
  let html = `<div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none" id="sched-round-pills"></div>`;
  html += `<div id="sched-round-content"></div>`;
  el.innerHTML = html;

  const pillsEl = document.getElementById('sched-round-pills');
  let activeRoundIdx = 0;

  function renderRoundPills() {
    pillsEl.innerHTML = roundsConfig.map((_, i) =>
      `<button class="lb-vpill${i === activeRoundIdx ? ' active' : ''}" data-ri="${i}">Round ${i + 1}</button>`
    ).join('');
    pillsEl.querySelectorAll('.lb-vpill').forEach(btn => {
      btn.addEventListener('click', () => { activeRoundIdx = parseInt(btn.dataset.ri); renderRoundPills(); renderRoundDetail(); });
    });
  }

  function renderRoundDetail() {
    const contentEl = document.getElementById('sched-round-content');
    if (!contentEl) return;
    const rc = roundsConfig[activeRoundIdx];
    const roundKey = `round_${activeRoundIdx + 1}`;
    const groups = teeGroups[roundKey] || [];
    const shortCourse = (rc.course || '').replace(/ Golf Club| Golf Course| Golf Links/g, '');

    let h = `<div style="text-align:center;margin-bottom:14px">
      <div style="font-size:15px;font-weight:600;color:var(--cream)">${shortCourse || 'Course TBD'}</div>
      <div style="font-size:11px;color:var(--dim)">${rc.date || 'Date TBD'}</div>
    </div>`;

    if (!groups.length && !isAdmin) {
      h += `<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px">Tee groups not yet assigned. Ask the admin to set them up.</div>`;
    } else {
      groups.forEach((g, gi) => {
        h += `<div style="background:var(--mid);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px">
          <div style="text-align:center;margin-bottom:8px">
            <div style="font-size:13px;font-weight:600;color:var(--cream)">Starting Hole: ${g.startHole || 1}</div>
            <div style="font-size:11px;color:var(--dim)">${g.teeTime || 'TBD'}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${(g.players || []).map(name => {
              const p = state.gd.players?.[name];
              const hcp = comp.hcp_overrides?.[name] ?? p?.handicap ?? '?';
              return `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--navy);border-radius:8px;border:1px solid var(--border)">
                ${avatarHtml(name, 32, name === state.me)}
                <div style="min-width:0">
                  <div style="font-size:12px;font-weight:600;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
                  <div style="font-size:10px;color:var(--dim)">HCP ${hcp}</div>
                </div>
              </div>`;
            }).join('')}
            ${isAdmin && (g.players || []).length < 4 ? `<button class="comp-add-player-slot" data-ri="${activeRoundIdx}" data-gi="${gi}" style="display:flex;align-items:center;justify-content:center;padding:8px;background:rgba(201,168,76,.08);border-radius:8px;border:1px dashed rgba(201,168,76,.3);color:var(--gold);font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">+ Player</button>` : ''}
          </div>
        </div>`;
      });

      if (isAdmin) {
        h += `<button id="sched-add-group" class="btn btn-ghost" style="width:100%;font-size:12px;margin-top:4px">+ Add tee group</button>`;
      }
    }

    contentEl.innerHTML = h;

    // Wire add tee group
    document.getElementById('sched-add-group')?.addEventListener('click', async () => {
      const roundKey = `round_${activeRoundIdx + 1}`;
      const updated = { ...(comp.tee_groups || {}) };
      if (!updated[roundKey]) updated[roundKey] = [];
      updated[roundKey].push({ id: 'tg' + Date.now(), startHole: 1, teeTime: '', players: [] });
      try {
        await querySupabase('updateCompetition', { competitionId: comp.id, playerName: state.me, updates: { tee_groups: updated } });
        comp.tee_groups = updated;
        state.activeCompetition = comp;
        renderRoundDetail();
      } catch { /* ignore */ }
    });

    // Wire add player to slot
    contentEl.querySelectorAll('.comp-add-player-slot').forEach(btn => {
      btn.addEventListener('click', () => {
        const ri = parseInt(btn.dataset.ri);
        const gi = parseInt(btn.dataset.gi);
        showPlayerPicker(comp, ri, gi, () => renderRoundDetail());
      });
    });
  }

  renderRoundPills();
  renderRoundDetail();
}

// Player picker for tee group assignment
function showPlayerPicker(comp, roundIdx, groupIdx, onDone) {
  const roundKey = `round_${roundIdx + 1}`;
  const groups = (comp.tee_groups || {})[roundKey] || [];
  const assigned = new Set(groups.flatMap(g => g.players || []));
  const available = (comp.players || []).filter(n => !assigned.has(n));

  if (!available.length) { alert('All players are already assigned to tee groups for this round.'); return; }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.65)';
  const sheet = document.createElement('div');
  sheet.style.cssText = 'background:var(--mid);border-radius:16px;padding:20px;max-width:340px;width:100%';
  sheet.innerHTML = `<div style="font-size:14px;font-weight:600;color:var(--cream);margin-bottom:12px">Add player to tee group</div>` +
    available.map(name => {
      const hcp = state.gd.players?.[name]?.handicap ?? '?';
      return `<div class="picker-row" data-name="${name}" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer">
        ${avatarHtml(name, 32, false)}
        <div style="flex:1"><div style="font-size:13px;color:var(--cream)">${name}</div><div style="font-size:10px;color:var(--dim)">HCP ${hcp}</div></div>
      </div>`;
    }).join('') +
    `<button class="btn btn-ghost" style="width:100%;margin-top:12px;font-size:12px" id="picker-cancel">Cancel</button>`;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  sheet.querySelector('#picker-cancel')?.addEventListener('click', () => overlay.remove());

  sheet.querySelectorAll('.picker-row').forEach(row => {
    row.addEventListener('click', async () => {
      const name = row.dataset.name;
      const updated = { ...(comp.tee_groups || {}) };
      if (!updated[roundKey]) updated[roundKey] = [];
      if (updated[roundKey][groupIdx]) {
        updated[roundKey][groupIdx].players = [...(updated[roundKey][groupIdx].players || []), name];
      }
      try {
        await querySupabase('updateCompetition', { competitionId: comp.id, playerName: state.me, updates: { tee_groups: updated } });
        comp.tee_groups = updated;
        state.activeCompetition = comp;
      } catch {}
      overlay.remove();
      if (onDone) onDone();
    });
  });
}

// ── Leaderboard tab ──────────────────────────────────────────────
function renderLeaderboardTab(el, comp) {
  const roundsConfig = comp.rounds_config || [];
  const standings = getCompStandings(comp);
  const totalRounds = roundsConfig.length || 1;
  const configDates = roundsConfig.map(rc => rc.date).filter(Boolean);

  // Round pills
  let roundFilter = 'overall';
  let html = `<div style="display:flex;gap:6px;margin-bottom:10px;overflow-x:auto;scrollbar-width:none" id="lb-round-pills">
    <button class="lb-vpill active" data-rf="overall">Overall</button>
    ${roundsConfig.map((_, i) => `<button class="lb-vpill" data-rf="round_${i+1}">Round ${i+1}</button>`).join('')}
  </div>`;
  html += `<div id="comp-lb-rows"></div>`;
  el.innerHTML = html;

  function renderRows() {
    const rowsEl = document.getElementById('comp-lb-rows');
    if (!rowsEl) return;

    let entries;
    if (roundFilter === 'overall') {
      entries = standings;
    } else {
      // Filter to specific round
      const roundIdx = parseInt(roundFilter.split('_')[1]) - 1;
      const roundDate = configDates[roundIdx];
      entries = (comp.players || []).map(name => {
        const pd = state.gd.players?.[name];
        const hcp = comp.hcp_overrides?.[name] ?? pd?.handicap ?? 0;
        const roundMatch = roundDate ? (pd?.rounds || []).find(r => r.date === roundDate) : null;
        if (!roundMatch) return { name, roundsPlayed: 0, aggregate: null, handicap: hcp };
        let agg = 0;
        if (comp.format === 'stableford' || comp.format === 'stableford_gross') {
          const s = calcStableford(roundMatch.scores, roundMatch.pars, comp.format === 'stableford' ? hcp : 0, roundMatch.slope, null);
          agg = s ?? 0;
        } else {
          agg = roundMatch.totalScore || 0;
        }
        return { name, roundsPlayed: 1, aggregate: agg, handicap: hcp };
      });
      if (comp.format?.includes('stableford')) entries.sort((a, b) => (b.aggregate ?? -1) - (a.aggregate ?? -1));
      else entries.sort((a, b) => (a.aggregate ?? 999) - (b.aggregate ?? 999));
    }

    if (!entries.some(e => e.roundsPlayed > 0)) {
      rowsEl.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px">No rounds submitted yet.</div>';
      return;
    }

    // Build per-round columns
    const perRound = {};
    configDates.forEach((date, ri) => {
      (comp.players || []).forEach(name => {
        const pd = state.gd.players?.[name];
        const hcp = comp.hcp_overrides?.[name] ?? pd?.handicap ?? 0;
        const r = (pd?.rounds || []).find(r2 => r2.date === date);
        if (!perRound[name]) perRound[name] = {};
        if (r && r.scores && r.pars) {
          perRound[name][`r${ri+1}`] = calcStableford(r.scores, r.pars, hcp, r.slope, null) ?? '';
        } else {
          perRound[name][`r${ri+1}`] = '';
        }
      });
    });

    const roundHeaders = configDates.map((_, i) => `<div style="width:36px;text-align:center;font-size:10px;color:var(--dimmer)">R${i+1}</div>`).join('');

    rowsEl.innerHTML = `<div style="display:flex;padding:0 0 4px;margin-bottom:4px;border-bottom:1px solid var(--border)">
      <div style="width:28px;font-size:10px;color:var(--dimmer)">PO</div>
      <div style="flex:1;font-size:10px;color:var(--dimmer)">PLAYERS</div>
      ${roundHeaders}
      <div style="width:44px;text-align:right;font-size:10px;color:var(--dimmer)">TOT</div>
    </div>` +
    entries.map((e, i) => {
      const isMe = e.name === state.me;
      const rCols = configDates.map((_, ri) => {
        const val = perRound[e.name]?.[`r${ri+1}`];
        return `<div style="width:36px;text-align:center;font-size:12px;color:var(--dim)">${val !== '' ? val : ''}</div>`;
      }).join('');
      const hcp = e.handicap != null ? ` (${e.handicap})` : '';
      return `<div style="display:flex;align-items:center;padding:10px 0;${i < entries.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}${isMe ? ';background:rgba(201,168,76,.05);border-radius:8px;padding:10px 4px;margin:0 -4px' : ''}">
        <div style="width:28px;font-size:13px;font-weight:600;color:var(--dimmer);text-align:center">${e.roundsPlayed > 0 ? i + 1 : ''}</div>
        <div style="flex:1;min-width:0;display:flex;align-items:center;gap:6px">
          ${avatarHtml(e.name, 30, isMe)}
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:600;${isMe ? 'color:var(--gold)' : 'color:var(--cream)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.name}${hcp}</div>
          </div>
        </div>
        ${rCols}
        <div style="width:44px;text-align:right;font-size:16px;font-weight:700;color:var(--gold)">${e.roundsPlayed > 0 ? e.aggregate : ''}</div>
      </div>`;
    }).join('');
  }

  renderRows();

  // Wire round pills
  document.querySelectorAll('#lb-round-pills .lb-vpill').forEach(btn => {
    btn.addEventListener('click', () => {
      roundFilter = btn.dataset.rf;
      document.querySelectorAll('#lb-round-pills .lb-vpill').forEach(b => b.classList.toggle('active', b === btn));
      renderRows();
    });
  });
}

// ── Activity tab ─────────────────────────────────────────────────
function renderActivityTab(el, comp) {
  el.innerHTML = `<div style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:10px">Activity Feed</div><div id="comp-feed"></div>`;
  renderActivityFeed();
}

// ── Standings calculation (preserved) ────────────────────────────
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
    if (fmt === 'stableford' || fmt === 'stableford_gross') {
      compRounds.forEach(r => {
        if (!r.scores || !r.pars) return;
        const s = calcStableford(r.scores, r.pars, fmt === 'stableford' ? handicap : 0, r.slope, null);
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

  if (fmt === 'stableford' || fmt === 'stableford_gross') entries.sort((a, b) => (b.aggregate ?? -1) - (a.aggregate ?? -1));
  else entries.sort((a, b) => {
    if (a.roundsPlayed === 0) return 1; if (b.roundsPlayed === 0) return -1;
    return (a.aggregate ?? 999) - (b.aggregate ?? 999);
  });
  return entries;
}

// ── Start competition round — routes to comp-score module ────────
async function startCompetitionRound(comp) {
  if (!comp) return;
  const roundsConfig = comp.rounds_config || [];
  const myRounds = state.gd.players?.[state.me]?.rounds || [];

  let nextRound = roundsConfig[0];
  let roundIdx = 0;
  for (let i = 0; i < roundsConfig.length; i++) {
    const rc = roundsConfig[i];
    if (!rc.date) continue;
    if (!myRounds.some(r => r.date === rc.date)) { nextRound = rc; roundIdx = i; break; }
  }

  // Pre-load the course
  if (nextRound?.courseId) {
    try {
      const res = await fetch(`${API_BASE}/.netlify/functions/courses?action=fetch&courseId=${encodeURIComponent(nextRound.courseId)}`);
      const data = await res.json();
      if (data?.course) {
        const { _applyCourse } = await import('./courses.js');
        if (typeof _applyCourse === 'function') _applyCourse(data.course);
      }
    } catch {}
    if (nextRound.tee) state.stee = nextRound.tee;
  }

  // Determine tee group for current user
  const teeGroups = comp.tee_groups || {};
  const roundKey = `round_${roundIdx + 1}`;
  const myGroup = (teeGroups[roundKey] || []).find(g => (g.players || []).includes(state.me));
  const groupPlayers = myGroup ? myGroup.players : (comp.players || []);

  // Ensure all players exist in state
  groupPlayers.forEach(name => {
    if (!state.gd.players[name]) state.gd.players[name] = { handicap: 0, rounds: [] };
  });

  // Prepare and navigate to comp-score
  const { prepareCompScore } = await import('./comp-score.js');
  prepareCompScore(comp, roundIdx, groupPlayers);

  const { goTo } = await import('./nav.js');
  goTo('comp-score');
}

// ── Admin panel (preserved) ──────────────────────────────────────
function renderCompAdmin() {
  const section = document.getElementById('comp-admin-section');
  if (!section) return;
  const comp = state.activeCompetition;
  if (!comp || !(comp.admin_players || []).includes(state.me)) { section.style.display = 'none'; return; }

  const hcpOverrides = comp.hcp_overrides || {};
  const players = comp.players || [];

  section.innerHTML = `
    <div class="card">
      <div style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:12px">Admin Panel</div>
      <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Players &amp; Handicap Overrides</div>
      <div id="comp-admin-roster"></div>
      <button id="comp-admin-save-hcp" class="btn btn-ghost" style="font-size:11px;padding:6px 14px;margin-top:8px">Save Handicaps</button>
      <div id="comp-admin-hcp-msg" style="font-size:11px;color:var(--dim);margin-top:4px"></div>
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
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:14px">
        <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Status</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost comp-status-btn" data-status="active" style="font-size:11px;padding:5px 12px">Set Live</button>
          <button class="btn btn-ghost comp-status-btn" data-status="complete" style="font-size:11px;padding:5px 12px">Mark Complete</button>
        </div>
      </div>
    </div>`;

  // Roster
  const roster = document.getElementById('comp-admin-roster');
  if (roster) {
    players.forEach(name => {
      const pd = state.gd.players?.[name];
      const hcp = hcpOverrides[name] ?? pd?.handicap ?? 0;
      const isAdm = (comp.admin_players || []).includes(name);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)';
      row.innerHTML = `<div style="flex:1"><div style="font-size:12px;color:var(--cream)">${name}${isAdm ? ' <span style="font-size:9px;color:var(--gold)">(admin)</span>' : ''}</div></div>
        <input type="number" class="comp-hcp-input" data-player="${name}" value="${hcp}" style="width:50px;font-size:12px;text-align:center" step="0.1">`;
      roster.appendChild(row);
    });
  }

  // Save handicaps
  document.getElementById('comp-admin-save-hcp')?.addEventListener('click', async () => {
    const msg = document.getElementById('comp-admin-hcp-msg');
    const newOverrides = { ...hcpOverrides };
    document.querySelectorAll('.comp-hcp-input').forEach(inp => { newOverrides[inp.dataset.player] = parseFloat(inp.value) || 0; });
    try {
      await querySupabase('updateCompetition', { competitionId: comp.id, playerName: state.me, updates: { hcp_overrides: newOverrides } });
      comp.hcp_overrides = newOverrides;
      state.activeCompetition = comp;
      if (msg) msg.innerHTML = '<span style="color:var(--par)">Saved.</span>';
    } catch { if (msg) msg.textContent = 'Error saving.'; }
  });

  // Make admin
  document.getElementById('comp-admin-add-btn')?.addEventListener('click', async () => {
    const sel = document.getElementById('comp-admin-add-sel');
    const msg = document.getElementById('comp-admin-add-msg');
    const newAdmin = sel?.value;
    if (!newAdmin) return;
    const updated = [...(comp.admin_players || []), newAdmin];
    try {
      await querySupabase('updateCompetition', { competitionId: comp.id, playerName: state.me, updates: { admin_players: updated } });
      comp.admin_players = updated;
      state.activeCompetition = comp;
      if (msg) msg.innerHTML = `<span style="color:var(--par)">${newAdmin} is now an admin.</span>`;
      renderCompAdmin();
    } catch { if (msg) msg.textContent = 'Error.'; }
  });

  // Status buttons
  document.querySelectorAll('.comp-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await querySupabase('updateCompetition', { competitionId: comp.id, playerName: state.me, updates: { status: btn.dataset.status } });
        comp.status = btn.dataset.status;
        state.activeCompetition = comp;
        renderCompHub();
      } catch {}
    });
  });
}

// ── AI Commentary (preserved) ────────────────────────────────────
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
  if (isAdmin && !commentary.preview) html += `<button class="btn btn-ghost" id="comp-gen-preview-btn" style="width:100%;font-size:12px;margin-bottom:10px">Generate Preview Card</button>`;
  el.innerHTML = html;
  el.querySelectorAll('.comp-regen-btn').forEach(btn => { btn.addEventListener('click', async () => { await triggerCommentary(btn.dataset.type); }); });
  el.querySelectorAll('.comp-copy-btn').forEach(btn => { btn.addEventListener('click', () => { navigator.clipboard?.writeText(btn.dataset.text).then(() => { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy to share'; }, 2000); }); }); });
  document.getElementById('comp-gen-preview-btn')?.addEventListener('click', async () => { await triggerCommentary('preview'); });
}

async function triggerCommentary(type) {
  if (!_compCommentaryGenerators) return;
  const comp = state.activeCompetition;
  if (!comp) return;
  let text = '';
  try {
    if (type === 'preview') text = await _compCommentaryGenerators.preview(comp);
    else {
      const standings = getCompStandings(comp);
      if (type === 'halftime') text = await _compCommentaryGenerators.halftime(comp, standings);
      else text = await _compCommentaryGenerators.final(comp, standings);
    }
  } catch { text = 'Commentary generation failed.'; }
  if (!text) text = 'No commentary generated.';
  const commentary = { ...(comp.commentary || {}), [type]: text };
  try {
    await querySupabase('updateCompetition', { competitionId: comp.id, playerName: state.me, updates: { commentary } });
    comp.commentary = commentary;
    state.activeCompetition = comp;
  } catch {}
  renderCompCommentary();
}

// ── Activity feed (preserved) ────────────────────────────────────
function renderActivityFeed() {
  const el = document.getElementById('comp-feed');
  if (!el) return;
  if (!_feed.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px;line-height:1.5">No activity yet today.<br>Submitted rounds will appear here.</div>';
    return;
  }
  el.innerHTML = _feed.map(evt => {
    let icon, label, detail, iconColor;
    if (evt.type === 'eagle') { icon = EAGLE_SVG; iconColor = 'var(--eagle)'; label = 'Eagle'; detail = `Hole ${evt.hole}`; }
    else if (evt.type === 'birdie') { icon = BIRDIE_SVG; iconColor = 'var(--birdie)'; label = 'Birdie'; detail = `Hole ${evt.hole}`; }
    else { icon = CHECK_SVG; iconColor = 'var(--par)'; const dStr = evt.diff != null ? (evt.diff >= 0 ? ' (+' + evt.diff + ')' : ' (' + evt.diff + ')') : ''; label = 'Round submitted' + dStr; detail = (evt.course || '').replace(/ Golf Club| Golf Course| Golf Links/g, ''); }
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;color:${iconColor};flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0"><div style="font-size:13px;color:var(--cream);font-weight:500">${evt.player}</div><div style="font-size:11px;color:var(--dim)">${label}${detail ? ' · ' + detail : ''}</div></div>
      <div style="font-size:10px;color:var(--dimmer);flex-shrink:0">${timeAgo(evt.ts)}</div>
    </div>`;
  }).join('');
}

// ── Group Activity leaderboard (today's rounds) ──────────────────
function renderGroupActivityLB() {
  const el = document.getElementById('comp-lb');
  if (!el) return;
  const today = todayGB();
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
    return { name, score: r.totalScore, diff: r.diff, stab, birdies: r.birdies || 0, handicap: player.handicap || 0 };
  }).filter(Boolean);

  if (!entries.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px">No rounds submitted today yet.</div>';
    return;
  }

  if (_format === 'stableford') entries.sort((a, b) => (b.stab ?? -1) - (a.stab ?? -1));
  else entries.sort((a, b) => (a.diff ?? 99) - (b.diff ?? 99));

  el.innerHTML = `<div style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:10px">Today's Standings</div>` +
    entries.map((e, i) => {
      const isMe = e.name === state.me;
      const posClass = ['gold', 'silver', 'bronze'][i] || '';
      let metricHtml;
      if (_format === 'stableford') {
        metricHtml = `<div class="lb-score" style="color:var(--gold)">${e.stab ?? '—'}</div>`;
      } else {
        const dStr = e.diff != null ? (e.diff >= 0 ? '+' + e.diff : String(e.diff)) : '—';
        metricHtml = `<div class="lb-score" style="color:${e.diff < 0 ? 'var(--birdie)' : 'var(--bogey)'}">${dStr}</div>`;
      }
      return `<div class="lb-row${isMe ? ' lb-me' : ''}">
        <div class="lb-pos ${posClass}">${i + 1}</div>
        ${avatarHtml(e.name, 36, isMe)}
        <div style="flex:1;min-width:0"><span class="lb-name" style="${isMe ? 'color:var(--gold)' : ''}">${e.name}</span><div class="lb-meta">HCP ${e.handicap}</div></div>
        <div style="text-align:right;flex-shrink:0">${metricHtml}</div>
      </div>`;
    }).join('');
}

// ── Group Match Leaderboard export (preserved) ───────────────────
export function getMatchLeaderboard(matchId) {
  const match = state.gd.matches?.[matchId];
  if (!match) return [];
  const entries = (match.players || []).map(p => ({
    name: p.name,
    netTotal: match.scores?.[p.name]?.holesPlayed > 0 ? match.scores[p.name].netTotal : null,
    holesPlayed: match.scores?.[p.name]?.holesPlayed ?? 0,
    isMe: p.name === state.me
  }));
  entries.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
    if (a.holesPlayed === 0) return 1; if (b.holesPlayed === 0) return -1;
    return (a.netTotal ?? 999) - (b.netTotal ?? 999);
  });
  let pos = 1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].holesPlayed === 0) { entries[i].position = null; }
    else { entries[i].position = (i > 0 && entries[i - 1].holesPlayed > 0 && entries[i].netTotal === entries[i - 1].netTotal) ? entries[i - 1].position : pos; pos++; }
  }
  return entries;
}
