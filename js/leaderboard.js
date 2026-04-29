// ─────────────────────────────────────────────────────────────────
// LEADERBOARD — unified podium + list layout
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { COURSES } from './constants.js';
import { getCourseByRef } from './courses.js';
import { initials, avatarHtml } from './players.js';
import { parseDateGB, calcStableford, isBufferOrBetter, calcScoringPointsNet } from './stats.js';
import { pushData, querySupabase, loadGroupData } from './api.js';
import { removeGroupFromList, normaliseBoardIds } from './group.js';
import { goTo } from './nav.js';
import { getAllowedBoardIds } from './subscription.js';

let _emptyState = null;
function _es(icon, headline, sub, ctaText, ctaAction) {
  if (_emptyState === null) { import('./empty-states.js').then(m => { _emptyState = m.emptyState; }).catch(() => { _emptyState = false; }); }
  return typeof _emptyState === 'function' ? _emptyState(icon, headline, sub, ctaText, ctaAction) : null;
}

// ── Active view state ────────────────────────────────────────────
let _activeView = 'stableford';
let _computedPlayers = [];   // cached from last renderLeaderboard
let _filterRoundsFn = null;  // cached filterRounds closure

// View definitions: label, sort fn, metric value/label/unit, bar colour
const VIEWS = [
  { id: 'stableford',        label: 'Stableford',        field: 'avgStab',         unit: 'pts avg',    sort: (a,b) => (b.avgStab ?? -1) - (a.avgStab ?? -1),                 barCol: 'rgba(201,168,76,0.7)',  higherBetter: true },
  { id: 'net_score',         label: 'Net score',          field: 'avgNet',          unit: 'avg net',    sort: (a,b) => (a.avgNet ?? 999) - (b.avgNet ?? 999),                 barCol: 'rgba(201,168,76,0.7)',  higherBetter: false },
  { id: 'buffer',            label: 'Buffer+',            field: 'bufferCount',     unit: 'rounds',     sort: (a,b) => (b.bufferCount ?? -1) - (a.bufferCount ?? -1),         barCol: 'rgba(46,204,113,0.7)',  higherBetter: true },
  { id: 'pts_scoring',       label: 'Pts scoring',        field: 'netPts',          unit: 'net pts',    sort: (a,b) => (b.netPts ?? -1) - (a.netPts ?? -1),                   barCol: 'rgba(201,168,76,0.7)',  higherBetter: true },
  { id: 'best_round',        label: 'Best round',         field: 'best',            unit: 'gross',      sort: (a,b) => (a.best ?? 999) - (b.best ?? 999),                     barCol: 'rgba(201,168,76,0.7)',  higherBetter: false },
  { id: 'fewest_doubles',    label: 'Fewest doubles',     field: 'avgDoubles',      unit: 'per round',  sort: (a,b) => (a.avgDoubles ?? 99) - (b.avgDoubles ?? 99),           barCol: 'rgba(231,76,60,0.5)',   higherBetter: false, invertBar: true },
  { id: 'most_birdies',      label: 'Most birdies',       field: 'bestBirdies',     unit: 'in a round', sort: (a,b) => (b.bestBirdies ?? -1) - (a.bestBirdies ?? -1),         barCol: 'rgba(52,152,219,0.7)',  higherBetter: true },
  { id: 'most_net_birdies',  label: 'Most net birdies',   field: 'bestNetBirdies',  unit: 'in a round', sort: (a,b) => (b.bestNetBirdies ?? -1) - (a.bestNetBirdies ?? -1),   barCol: 'rgba(52,152,219,0.7)',  higherBetter: true },
  { id: 'avg_putts',         label: 'Avg putts/hole',     field: 'avgPutts',        unit: 'per hole',   sort: (a,b) => (a.avgPutts ?? 99) - (b.avgPutts ?? 99),               barCol: 'rgba(46,204,113,0.7)',  higherBetter: false, invertBar: true },
];
// Hidden views (code kept for backward compat / future re-enable)
// { id: 'birdies',     label: 'Birdies',     field: 'birdies',  unit: 'total',    sort: (a,b) => b.birdies - a.birdies,             barCol: 'rgba(52,152,219,0.7)',  higherBetter: true },
// { id: 'net_birdies', label: 'Net birdies', field: 'netPts',   unit: 'net pts',  sort: (a,b) => (b.netPts ?? -1) - (a.netPts ?? -1), barCol: 'rgba(52,152,219,0.7)',  higherBetter: true },

const VIEW_EXPLAINERS = {
  pts_scoring: '3 points for a net eagle · 1 point for a net birdie',
  net_score: 'Your best net score of the season counts',
  avg_putts: 'Putts only count when taken on the green — chips and pitches from off the green are not putts',
};

// ── Fetch group membership + config, then render ─────────────────
export async function initLeaderboard() {
  // Render immediately with cached data — don't wait for API
  if (state.gd.group) {
    renderGroupSwitcher();
    renderLeaderboard();
  }
  // Refresh group data in background
  if (state.me && state.gd.activeGroupCode) {
    const res = await querySupabase('getGroupByCode', {
      code: state.gd.activeGroupCode,
      playerName: state.me
    });
    if (res?.found && res.isMember) {
      state.gd.group = res.group;
      if (!state.gd.groupMeta) state.gd.groupMeta = {};
      if (res.group.name) state.gd.groupMeta[state.gd.activeGroupCode] = { name: res.group.name };
    } else {
      state.gd.group = null;
    }
  } else {
    state.gd.group = null;
  }
  // Fetch other group names in background (non-blocking)
  const allCodes = state.gd.groupCodes || [];
  Promise.all(allCodes.map(async code => {
    if (code === state.gd.activeGroupCode) return;
    if (state.gd.groupMeta?.[code]?.name) return;
    try {
      const r = await querySupabase('getGroupByCode', { code, playerName: state.me || '' });
      if (r?.found && r.group?.name) {
        if (!state.gd.groupMeta) state.gd.groupMeta = {};
        state.gd.groupMeta[code] = { name: r.group.name };
      }
    } catch (_) {}
  })).then(() => renderGroupSwitcher());
  // Re-render with fresh data
  renderGroupSwitcher();
  renderLeaderboard();
}

export async function switchActiveGroup(code) {
  if (state.gd.activeGroupCode === code) return;
  localStorage.setItem('gt_activegroup', code);
  state.gd.group = null;
  await loadGroupData(code);
  if (state.me) {
    const res = await querySupabase('getGroupByCode', { code, playerName: state.me });
    if (res?.found && res.isMember) {
      state.gd.group = res.group;
      if (!state.gd.groupMeta) state.gd.groupMeta = {};
      if (res.group.name) state.gd.groupMeta[code] = { name: res.group.name };
    }
  }
  renderGroupSwitcher();
  renderLeaderboard();
}

function renderGroupSwitcher() {
  const ctxLabel = document.getElementById('lb-ctx-label');
  const ctxSeason = document.getElementById('lb-ctx-season');
  const codes = state.gd.groupCodes || (state.gd.activeGroupCode ? [state.gd.activeGroupCode] : []);
  const activeMeta = state.gd.groupMeta?.[state.gd.activeGroupCode];
  if (ctxLabel) ctxLabel.textContent = activeMeta?.name || state.gd.activeGroupCode || 'No group';
  const seasonSel = document.getElementById('lb-season-sel');
  if (ctxSeason && seasonSel) ctxSeason.textContent = seasonSel.value === 'all' ? 'All time' : seasonSel.value + ' Season';

  const ctxBtn = document.getElementById('lb-ctx-btn');
  const ctxPanel = document.getElementById('lb-ctx-panel');
  if (ctxBtn && ctxPanel) {
    ctxBtn.onclick = () => { ctxPanel.style.display = ctxPanel.style.display === 'block' ? 'none' : 'block'; };
  }

  const groupsEl = document.getElementById('lb-ctx-groups');
  if (groupsEl) {
    groupsEl.innerHTML = '';
    codes.forEach(code => {
      const meta = state.gd.groupMeta?.[code];
      const label = meta?.name || code;
      const isActive = code === state.gd.activeGroupCode;
      const pill = document.createElement('button');
      pill.className = 'fpill' + (isActive ? ' active' : '');
      pill.textContent = label;
      pill.style.cssText = 'font-size:11px;padding:5px 12px';
      pill.addEventListener('click', () => { if (ctxPanel) ctxPanel.style.display = 'none'; switchActiveGroup(code); });
      groupsEl.appendChild(pill);
    });
  }

  const seasonsEl = document.getElementById('lb-ctx-seasons');
  if (seasonsEl) {
    seasonsEl.innerHTML = '';
    const allYearsSet = new Set();
    Object.values(state.gd.players).forEach(p => (p.rounds || []).forEach(r => {
      const yr = parseDateGB(r.date).toString().slice(0, 4);
      if (yr && yr !== 'NaN') allYearsSet.add(yr);
    }));
    const sortedYears = ['all', ...[...allYearsSet].sort().reverse()];
    const currentVal = seasonSel?.value || 'all';
    sortedYears.forEach(yr => {
      const pill = document.createElement('button');
      pill.className = 'fpill' + (yr === currentVal ? ' active' : '');
      pill.textContent = yr === 'all' ? 'All time' : yr;
      pill.style.cssText = 'font-size:11px;padding:5px 12px';
      pill.addEventListener('click', () => {
        if (seasonSel) seasonSel.value = yr;
        if (ctxPanel) ctxPanel.style.display = 'none';
        renderGroupSwitcher();
        renderLeaderboard();
      });
      seasonsEl.appendChild(pill);
    });
  }

  const bar = document.getElementById('group-switcher');
  if (bar) bar.style.display = 'none';
}

// ── setLeaderboardView — switch active view pill ─────────────────
export function setLeaderboardView(viewId) {
  _activeView = viewId;
  document.querySelectorAll('.lb-vpill').forEach(p => p.classList.toggle('active', p.dataset.view === viewId));
  renderViewContent();
}

// ── Main render entry ────────────────────────────────────────────
export function renderLeaderboard() {
  const group = state.gd.group || null;
  const isInGroup = !!group;
  const isAdmin = isInGroup && group.admin_id === state.me;

  // Header — show league name prominently
  const titleEl = document.getElementById('lb-tab-title');
  if (titleEl) {
    const activeMeta = state.gd.groupMeta?.[state.gd.activeGroupCode];
    titleEl.textContent = (isInGroup && activeMeta?.name) ? activeMeta.name : 'The board';
  }
  const gearBtn = document.getElementById('lb-settings-btn');
  if (gearBtn) {
    gearBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    gearBtn.onclick = () => { import('./group.js').then(m => m.initGroupSettings()); };
    // Pending member badge on gear icon
    let dot = gearBtn.querySelector('.pending-dot');
    if (isAdmin && state._pendingMemberCount > 0) {
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'pending-dot';
        dot.style.cssText = 'position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;border-radius:8px;background:#e74c3c;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px;font-family:"DM Sans",sans-serif';
        gearBtn.style.position = 'relative';
        gearBtn.appendChild(dot);
      }
      dot.textContent = state._pendingMemberCount;
      dot.style.display = 'flex';
    } else if (dot) {
      dot.style.display = 'none';
    }
  }
  // Pending member banner below title
  let pendingBanner = document.getElementById('lb-pending-banner');
  if (isAdmin && state._pendingMemberCount > 0) {
    if (!pendingBanner) {
      pendingBanner = document.createElement('div');
      pendingBanner.id = 'lb-pending-banner';
      pendingBanner.style.cssText = 'padding:10px 14px;margin:0 0 12px;border-radius:10px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);cursor:pointer;display:flex;align-items:center;gap:8px;-webkit-tap-highlight-color:transparent';
      const titleParent = document.getElementById('lb-tab-title')?.parentElement?.parentElement;
      if (titleParent) titleParent.insertAdjacentElement('afterend', pendingBanner);
    }
    const n = state._pendingMemberCount;
    pendingBanner.innerHTML = `<span style="font-size:12px;font-weight:600;color:var(--gold)">${n} player${n > 1 ? 's' : ''} waiting for approval</span><span style="font-size:11px;color:var(--dim);margin-left:auto">Review →</span>`;
    pendingBanner.onclick = () => { import('./group.js').then(m => m.initGroupSettings()); };
    pendingBanner.style.display = 'flex';
  } else if (pendingBanner) {
    pendingBanner.style.display = 'none';
  }
  const membersBtn = document.getElementById('lb-members-btn');
  if (membersBtn) {
    membersBtn.style.display = isInGroup ? 'inline-block' : 'none';
    membersBtn.onclick = async () => {
      const popup = document.getElementById('lb-members-popup');
      if (!popup) return;
      if (popup.style.display === 'block') { popup.style.display = 'none'; return; }
      popup.innerHTML = '<div style="padding:12px;font-size:11px;color:var(--dim)"><span class="spin"></span> Loading...</div>';
      popup.style.display = 'block';
      try {
        const res = await querySupabase('getGroupMembers', { groupId: group.id });
        const members = res?.members || [];
        if (!members.length) { popup.innerHTML = '<div class="card" style="font-size:12px;color:var(--dimmer);text-align:center;padding:16px">No members yet.</div>'; return; }
        popup.innerHTML = `<div class="card"><div style="font-family:'DM Sans',sans-serif;font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:10px">Players in this League</div>` +
          members.map(m => {
            const isMe = m.playerId === state.me;
            return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--wa-06)">
              ${avatarHtml(m.playerId, 32, isMe)}
              <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:${isMe ? '600' : '400'};color:${isMe ? 'var(--gold)' : 'var(--cream)'}">${m.playerId}${isMe ? ' <span style="font-size:9px;color:var(--dim)">(you)</span>' : ''}</div></div>
              <div style="font-size:11px;color:var(--dim)">HCP ${m.handicap ?? '?'}</div>
            </div>`;
          }).join('') + '</div>';
      } catch { popup.innerHTML = '<div class="card" style="font-size:12px;color:var(--dimmer);text-align:center;padding:16px">Could not load members.</div>'; }
    };
  }

  // Solo prompt
  const soloPrompt = document.getElementById('lb-solo-prompt');
  if (soloPrompt) {
    const heading = soloPrompt.querySelector('.lb-solo-heading');
    const subtext = soloPrompt.querySelector('.lb-solo-subtext');
    const atCap = (state.gd.groupCodes || []).length >= 5;
    if (isInGroup) {
      // Compact mode at bottom — evenly spaced short buttons
      soloPrompt.style.cssText = 'display:block;margin:0 16px 14px;padding:10px 14px;border:1px solid var(--border);border-left:none;border-radius:10px;background:var(--mid)';
      if (heading) heading.style.display = 'none';
      if (subtext) subtext.style.display = 'none';
      const btnWrap = soloPrompt.querySelector('div:last-child');
      if (btnWrap) btnWrap.style.cssText = 'display:flex;gap:12px;margin-top:0';
      soloPrompt.querySelectorAll('button').forEach(b => { b.style.cssText = 'flex:1;border-radius:20px;font-size:11px;padding:6px 0'; b.disabled = atCap; });
    } else {
      soloPrompt.style.cssText = 'display:block;margin:0 16px 14px;border-left:4px solid var(--gold)';
      if (heading) { heading.style.display = ''; heading.textContent = 'Invite your mates to compete on these boards'; }
      if (subtext) { subtext.style.display = ''; subtext.textContent = ''; }
      soloPrompt.querySelectorAll('button').forEach(b => { b.style.cssText = 'flex:1;border-radius:20px;font-size:12px;padding:8px 0'; b.disabled = false; });
    }
  }

  // Group code card (retired — code now shown at bottom via lb-group-code-bottom)
  const gcCard = document.getElementById('lb-group-code-card');
  const hasActiveCode = !!state.gd.activeGroupCode;
  const isLegacyGroup = hasActiveCode && !isInGroup;
  if (gcCard) {
    gcCard.style.display = 'none';
    let legacyBanner = gcCard.querySelector('.lb-legacy-banner');
    if (isLegacyGroup) {
      if (!legacyBanner) { legacyBanner = document.createElement('div'); legacyBanner.className = 'lb-legacy-banner'; gcCard.appendChild(legacyBanner); }
      legacyBanner.innerHTML = `<div style="font-size:12px;color:var(--bogey);font-weight:600;margin-bottom:3px">Legacy group code</div>
        <button id="lb-remove-legacy-btn" style="padding:7px 14px;border-radius:20px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.35);color:#e74c3c;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer">Remove this code</button>`;
      document.getElementById('lb-remove-legacy-btn')?.addEventListener('click', () => {
        if (confirm(`Remove group code ${state.gd.activeGroupCode} from your list?`)) removeGroupFromList(state.gd.activeGroupCode);
      });
    } else if (legacyBanner) { legacyBanner.remove(); }
  }
  if (state.gd.activeGroupCode) {
    const gcEl = document.getElementById('lb-group-code');
    if (gcEl) gcEl.textContent = state.gd.activeGroupCode;
  }

  // ── Group code card at bottom ──
  const gcBottom = document.getElementById('lb-group-code-bottom');
  if (gcBottom && isInGroup && state.gd.activeGroupCode) {
    const code = state.gd.activeGroupCode;
    const activeMeta = state.gd.groupMeta?.[code];
    const leagueName = activeMeta?.name || code;
    gcBottom.innerHTML = `<div style="margin:0 16px 14px;background:var(--mid);border:1px solid var(--border);border-radius:12px;padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:10px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:var(--dim)">League code</div>
        <div style="font-size:10px;color:var(--dimmer)">${leagueName}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;font-size:18px;font-weight:700;letter-spacing:2px;color:var(--cream);font-family:'DM Sans',sans-serif">${code}</div>
        <button id="lb-copy-code-btn" style="background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);border-radius:8px;padding:6px 12px;color:var(--gold);font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap">Copy</button>
      </div>
      <div style="font-size:10px;color:var(--dimmer);margin-top:8px;line-height:1.4">Share this code with friends so they can join your league</div>
    </div>`;
    document.getElementById('lb-copy-code-btn')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(code)
        .then(() => { const b = document.getElementById('lb-copy-code-btn'); if (b) { b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy'; }, 2000); } })
        .catch(() => {});
    });
  } else if (gcBottom) {
    gcBottom.innerHTML = '';
  }

  // ── Season selector (populate hidden select for filterRounds) ──
  const seasonSel = document.getElementById('lb-season-sel');
  const currentSeason = seasonSel?.value || 'all';
  const allYears = new Set();
  Object.values(state.gd.players).forEach(p => (p.rounds || []).forEach(r => {
    const yr = parseDateGB(r.date).toString().slice(0, 4);
    if (yr && yr !== 'NaN') allYears.add(yr);
  }));
  if (seasonSel) {
    const sortedYears = [...allYears].sort().reverse();
    const existing = [...seasonSel.options].map(o => o.value);
    sortedYears.forEach(yr => {
      if (!existing.includes(yr)) {
        const o = document.createElement('option'); o.value = yr; o.textContent = yr + ' Season';
        seasonSel.appendChild(o);
      }
    });
    if (currentSeason && currentSeason !== 'all') seasonSel.value = currentSeason;
  }

  // ── filterRounds (preserved logic) ─────────────────────────────
  function filterRounds(rounds, playerName) {
    let filtered = rounds;
    const joinedAt = state.gd.players?.[playerName]?.joinedAt;
    if (joinedAt) {
      const jd = new Date(joinedAt);
      const joinInt = jd.getFullYear() * 10000 + (jd.getMonth() + 1) * 100 + jd.getDate();
      filtered = filtered.filter(r => parseDateGB(r.date) >= joinInt);
    }
    if (!seasonSel || seasonSel.value === 'all') return filtered;
    const val = seasonSel.value;
    if (val.startsWith('season:')) {
      const sname = val.slice(7);
      const season = (state.gd.seasons || []).find(s => s.name === sname);
      if (!season) return filtered;
      return filtered.filter(r => parseDateGB(r.date).toString().startsWith(season.year));
    }
    return filtered.filter(r => parseDateGB(r.date).toString().startsWith(val));
  }
  _filterRoundsFn = filterRounds;

  // ── Compute player stats (preserved logic) ─────────────────────
  _computedPlayers = Object.entries(state.gd.players).map(([name, p]) => {
    const allRs = p.rounds || [];
    const rs = filterRounds(allRs, name);
    if (!rs.length) return null;
    // Use per-round handicap snapshot (frozen at time of play), fall back to current for legacy rounds
    const currentHcp = p.handicap || 0;
    const hcpFor = r => r.handicap ?? currentHcp;
    const sc = rs.map(r => r.totalScore).filter(Boolean);
    const diffs = rs.map(r => r.diff).filter(v => v != null);
    const eagles = rs.reduce((a, r) => a + (r.eagles || 0), 0);
    const birdies = rs.reduce((a, r) => a + (r.birdies || 0), 0);
    const doubles = rs.reduce((a, r) => a + (r.doubles || 0), 0);
    const pts = (eagles * 3) + (birdies * 1);
    const avgDoubles = rs.length ? +(doubles / rs.length).toFixed(1) : null;

    const stabRounds = rs.filter(r => r.scores && r.pars);
    const stabTotals = stabRounds.map(r => {
      const course = getCourseByRef(r.course) || Object.values(COURSES || []).find(c => c.name === r.course);
      const si = course?.tees?.[r.tee]?.si || null;
      return calcStableford(r.scores, r.pars, hcpFor(r), r.slope, si);
    }).filter(v => v != null);
    const avgStab = stabTotals.length ? +(stabTotals.reduce((a, b) => a + b, 0) / stabTotals.length).toFixed(1) : null;

    const netPtsRounds = rs.filter(r => r.scores && r.pars);
    let netPtsTotal = 0, netPtsEagles = 0, netPtsBirdies = 0, bestNetBirdies = 0;
    netPtsRounds.forEach(r => {
      const course = getCourseByRef(r.course) || Object.values(COURSES || []).find(c => c.name === r.course);
      const si = course?.tees?.[r.tee]?.si || null;
      const res = calcScoringPointsNet(r.scores, r.pars, hcpFor(r), r.slope, si);
      if (res) { netPtsTotal += res.total; netPtsEagles += res.netEagles; netPtsBirdies += res.netBirdies; if (res.netBirdies > bestNetBirdies) bestNetBirdies = res.netBirdies; }
    });
    const netPts = netPtsRounds.length ? netPtsTotal : null;

    const netRounds = rs.filter(r => r.totalScore && r.totalPar);
    const netScores = netRounds.map(r => {
      const slope = r.slope || 113;
      const playingHcp = Math.round(hcpFor(r) * (slope / 113));
      return r.totalScore - playingHcp;
    });
    const avgNet = netScores.length ? +(netScores.reduce((a, b) => a + b, 0) / netScores.length).toFixed(1) : null;

    const bufferCount = currentHcp > 0 ? rs.filter(r => isBufferOrBetter(r, hcpFor(r))).length : null;

    // Best birdies in a single round
    let bestBirdies = 0;
    rs.forEach(r => { if ((r.birdies || 0) > bestBirdies) bestBirdies = r.birdies; });

    // Average putts per hole (only rounds with putt data)
    const puttsRounds = rs.filter(r => (r.putts || []).some(v => v != null && v > 0));
    const avgPutts = puttsRounds.length
      ? +(puttsRounds.reduce((a, r) => a + (r.putts || []).reduce((s, v) => s + (v || 0), 0) / 18, 0) / puttsRounds.length).toFixed(2)
      : null;

    return {
      name, rounds: rs.length, handicap: currentHcp,
      best: sc.length ? Math.min(...sc) : null,
      avg: sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null,
      avgDiff: diffs.length ? +(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1) : null,
      birdies, eagles, doubles, pts, avgDoubles,
      avgStab, stabCount: stabTotals.length,
      netPts, netPtsEagles, netPtsBirdies, bestNetBirdies,
      avgNet, netCount: netScores.length,
      bufferCount, bestBirdies, avgPutts
    };
  }).filter(Boolean);

  // ── Render view pills (ordered by admin's active_boards) ───────
  const pillsEl = document.getElementById('lb-view-pills');
  if (pillsEl) {
    pillsEl.innerHTML = '';
    const activeOrder = normaliseBoardIds(state.gd.group?.active_boards);
    const orderedViews = activeOrder.map(id => VIEWS.find(v => v.id === id)).filter(Boolean);
    // If no admin config, show all views
    let viewsToShow = orderedViews.length ? orderedViews : VIEWS;
    // Premium board filter (no-op when PREMIUM_ENABLED=false)
    const allowedIds = getAllowedBoardIds();
    if (allowedIds) viewsToShow = viewsToShow.filter(v => allowedIds.includes(v.id));
    // Ensure active view is valid
    if (!viewsToShow.find(v => v.id === _activeView)) _activeView = viewsToShow[0]?.id || 'stableford';
    viewsToShow.forEach(v => {
      const pill = document.createElement('button');
      pill.className = 'lb-vpill' + (v.id === _activeView ? ' active' : '');
      pill.dataset.view = v.id;
      pill.textContent = v.label;
      pill.addEventListener('click', () => setLeaderboardView(v.id));
      pillsEl.appendChild(pill);
    });
  }

  // ── Render active view content ─────────────────────────────────
  renderViewContent();

  // ── H2H ────────────────────────────────────────────────────────
  renderH2H(filterRounds);

  // ── Board Leaders summary ──────────────────────────────────────
  renderBoardLeaders();
}

// ── Render podium + list + spotlight for active view ─────────────
function renderViewContent() {
  const view = VIEWS.find(v => v.id === _activeView) || VIEWS[0];
  const players = [..._computedPlayers];

  // Filter out players without data for this view
  const qualified = players.filter(p => p[view.field] != null);
  qualified.sort(view.sort);

  const podiumEl = document.getElementById('lb-podium');
  const listEl = document.getElementById('lb-player-list');
  const spotEl = document.getElementById('lb-spotlight');

  if (!qualified.length) {
    const emptyMsg = _es('trophy', 'Leaderboard is waiting', 'No rounds recorded yet for the current season.', 'Record a round', "import('./nav.js').then(m=>m.goTo('round'))")
      || '<div style="padding:24px 0;text-align:center;font-size:13px;color:var(--dimmer)">No data yet</div>';
    if (podiumEl) podiumEl.innerHTML = emptyMsg;
    if (listEl) listEl.innerHTML = '';
    if (spotEl) spotEl.innerHTML = '';
    return;
  }

  const fmtVal = (p) => {
    const v = p[view.field];
    return v != null ? String(v) : '—';
  };

  // ── 1c. Podium ─────────────────────────────────────────────────
  if (podiumEl) {
    const top3 = qualified.slice(0, 3);
    // Straight order: 1st → 2nd → 3rd, tallest to shortest
    const ordered = top3;
    const heights = [74, 54, 38];
    const sizes = [42, 34, 34];
    const positions = top3.map((_, i) => i);

    podiumEl.innerHTML = `<div style="display:flex;align-items:flex-end;gap:6px;justify-content:center">` +
      ordered.map((p, vi) => {
        const pos = positions[vi];
        const isFirst = pos === 0;
        const isMe = p.name === state.me;
        const sz = sizes[pos];
        const ht = heights[pos];
        const borderStyle = isFirst ? 'border:2px solid var(--gold)' : 'border:1px solid var(--border)';
        const avatarColor = isFirst ? 'color:var(--gold);background:rgba(201,168,76,0.1)' : 'color:var(--dim);background:var(--mid)';
        const blockBg = isFirst ? 'background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.3);color:var(--gold)' : 'background:var(--mid);border:1px solid var(--border);color:var(--dimmer)';
        const avatarImg = state.gd.players?.[p.name]?.avatarImg;
        const avatarEl = avatarImg
          ? `<img src="${avatarImg}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;${borderStyle}">`
          : `<div style="width:${sz}px;height:${sz}px;border-radius:50%;${borderStyle};${avatarColor};display:flex;align-items:center;justify-content:center;font-size:${isFirst ? 15 : 12}px;font-weight:700;font-family:'DM Sans',sans-serif">${initials(p.name)}</div>`;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
          ${avatarEl}
          <div style="font-size:11px;color:var(--dim);text-align:center;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}${isMe ? ' <span style="color:var(--gold);font-size:10px">you</span>' : ''}</div>
          <div style="font-size:12px;font-weight:700;color:var(--gold)">${fmtVal(p)}</div>
          <div style="width:100%;height:${ht}px;border-radius:6px 6px 0 0;${blockBg};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700">${pos + 1}</div>
        </div>`;
      }).join('') + '</div>';
    // Make podium entries tappable
    podiumEl.querySelectorAll('[style*="flex-direction:column"]').forEach((el, i) => {
      if (top3[i]) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          import('./players.js').then(m => m.showPlayerProfile(top3[i].name));
        });
      }
    });
  }

  // ── View explainer (between podium and list) ───────────────────
  const explainer = VIEW_EXPLAINERS[view.id];
  if (explainer && podiumEl) {
    podiumEl.innerHTML += `<div style="font-size:11px;color:var(--dim);text-align:center;padding:6px 0 2px">${explainer}</div>`;
  }

  // ── 1d. Remaining players list (4th+) ──────────────────────────
  if (listEl) {
    const rest = qualified.slice(3);
    listEl.innerHTML = '';
    rest.forEach((p, i) => {
      const pos = i + 4;
      const isMe = p.name === state.me;
      const row = document.createElement('div');
      const meBg = isMe ? 'background:rgba(201,168,76,0.05);border-radius:8px;padding:9px 8px;margin:0 -8px;' : '';
      row.style.cssText = `display:flex;align-items:center;gap:8px;padding:9px 0;${i < rest.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}${meBg}`;
      row.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:var(--dimmer);width:16px;text-align:center">${pos}</div>
        <div style="width:30px;height:30px;border-radius:50%;border:1px solid var(--border);background:var(--mid);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--dim);font-family:'DM Sans',sans-serif;flex-shrink:0">${initials(p.name)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--cream)">${p.name}</div>
          <div style="font-size:10px;color:var(--dim)">${p.rounds} round${p.rounds !== 1 ? 's' : ''}</div>
        </div>
        <div style="font-size:10px;font-weight:700;color:var(--dimmer);padding:2px 5px;border-radius:4px">–</div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:700;color:var(--cream)">${fmtVal(p)}</div>
          <div style="font-size:10px;color:var(--dim)">${view.unit}</div>
        </div>`;
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        import('./players.js').then(m => m.showPlayerProfile(p.name));
      });
      listEl.appendChild(row);
    });
  }

  // ── 1e. Stat spotlight card ────────────────────────────────────
  if (spotEl) {
    const seasonLabel = document.getElementById('lb-season-sel')?.value || 'all';
    const seasonName = seasonLabel === 'all' ? 'All time' : seasonLabel + ' Season';
    const maxVal = Math.max(...qualified.map(p => Math.abs(p[view.field] ?? 0)), 1);

    let barHtml = '';
    qualified.forEach((p, i) => {
      const val = Math.abs(p[view.field] ?? 0);
      let pct;
      if (view.invertBar) {
        pct = maxVal > 0 ? (1 - val / maxVal) * 100 : 0;
      } else {
        pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
      }
      pct = Math.max(pct, 8); // minimum visible bar
      const shortName = p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name;
      barHtml += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <div style="font-size:11px;color:var(--dimmer);width:12px;flex-shrink:0;text-align:right">${i + 1}</div>
        <div style="flex:1;height:16px;background:var(--navy);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${view.barCol};border-radius:3px;display:flex;align-items:center;padding-left:6px">
            <span style="font-size:10px;font-weight:600;color:var(--cream);white-space:nowrap">${shortName}</span>
          </div>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--cream);min-width:28px;text-align:right;flex-shrink:0">${fmtVal(p)}</div>
      </div>`;
    });

    spotEl.innerHTML = `<div style="background:var(--mid);border:1px solid var(--border);border-radius:12px;padding:12px 14px">
      <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">${view.label} leaders · ${seasonName}</div>
      ${barHtml}
    </div>`;
  }
}

// ── Board Leaders — who leads the most categories ───────────────
function renderBoardLeaders() {
  const el = document.getElementById('lb-board-leaders');
  if (!el) return;
  if (!_computedPlayers.length) { el.innerHTML = ''; return; }

  // For each view, find who's #1
  const wins = {};
  VIEWS.forEach(view => {
    const qualified = _computedPlayers.filter(p => p[view.field] != null);
    if (!qualified.length) return;
    const sorted = [...qualified].sort(view.sort);
    const winner = sorted[0];
    if (winner) { wins[winner.name] = (wins[winner.name] || 0) + 1; }
  });

  // Sort by most wins
  const ranked = Object.entries(wins).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!ranked.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Board leaders</div>` +
    ranked.map(([name, count], i) => {
      const isMe = name === state.me;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;${i < ranked.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="font-size:12px;font-weight:700;color:${i === 0 ? 'var(--gold)' : 'var(--dimmer)'};width:16px;text-align:center">${i + 1}</div>
        ${avatarHtml(name, 26, isMe)}
        <div style="flex:1;font-size:12px;${isMe ? 'color:var(--gold);font-weight:600' : 'color:var(--cream)'}">${name}</div>
        <div style="font-size:13px;font-weight:700;color:var(--gold)">${count}</div>
        <div style="font-size:9px;color:var(--dimmer)">#1${count !== 1 ? 's' : ''}</div>
      </div>`;
    }).join('');
}

// ── H2H (preserved) ─────────────────────────────────────────────
function renderH2H(filterRounds) {
  const el = document.getElementById('lb-h2h');
  if (!el) return;
  // Restore collapsed state
  const body = document.getElementById('h2h-body');
  const chev = document.getElementById('h2h-chevron');
  if (body && localStorage.getItem('looper_h2h_collapsed') === 'true') {
    body.style.display = 'none';
    if (chev) chev.style.transform = 'rotate(-90deg)';
  }
  el.innerHTML = '';

  const playerNames = Object.keys(state.gd.players);
  if (playerNames.length < 2) {
    el.innerHTML = '<div style="font-size:12px;color:var(--dimmer);padding:8px 0">Need at least 2 players with shared rounds</div>';
    return;
  }

  const records = [];
  for (let i = 0; i < playerNames.length; i++) {
    for (let j = i + 1; j < playerNames.length; j++) {
      const pA = playerNames[i], pB = playerNames[j];
      const rsA = filterRounds(state.gd.players[pA]?.rounds || [], pA);
      const rsB = filterRounds(state.gd.players[pB]?.rounds || [], pB);
      let wA = 0, wB = 0, h = 0, hasMatchData = false, sharedRounds = 0;

      rsA.forEach(rA => {
        const rB = rsB.find(r => r.date === rA.date && r.course === rA.course);
        if (!rB) return;
        sharedRounds++;
        if (rA.matchOutcome) {
          hasMatchData = true;
          const mo = rA.matchOutcome;
          if (mo.result === 'won') { if (mo.leader === pA) wA++; else wB++; }
          else if (mo.result === 'halved') h++;
        } else if (rB.matchOutcome) {
          hasMatchData = true;
          const mo = rB.matchOutcome;
          if (mo.result === 'won') { if (mo.leader === pB) wB++; else wA++; }
          else if (mo.result === 'halved') h++;
        } else {
          if (rA.diff < rB.diff) wA++;
          else if (rB.diff < rA.diff) wB++;
          else h++;
        }
      });
      if (!sharedRounds) continue;
      records.push({ pA, pB, wA, wB, h, hasMatchData, sharedRounds });
    }
  }

  if (!records.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--dimmer);padding:8px 0">No shared rounds found — rounds on same date and course will appear here</div>';
    return;
  }

  records.forEach(({ pA, pB, wA, wB, h, hasMatchData, sharedRounds }) => {
    const isAMe = pA === state.me, isBMe = pB === state.me;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)';
    const label = hasMatchData ? '' : '<span style="font-size:9px;color:var(--dimmer);margin-left:4px">(gross form)</span>';
    row.innerHTML = `
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--cream);display:flex;align-items:center;gap:4px">
          <span style="${isAMe ? 'color:var(--gold);font-weight:600' : ''}">${pA}</span>
          <span style="color:var(--dimmer);font-size:10px">vs</span>
          <span style="${isBMe ? 'color:var(--gold);font-weight:600' : ''}">${pB}</span>
          ${label}
        </div>
        <div style="font-size:10px;color:var(--dim);margin-top:3px">${sharedRounds} shared round${sharedRounds !== 1 ? 's' : ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:14px;font-weight:600;color:var(--cream)">${wA}–${wB}–${h}</div>
        <div style="font-size:9px;color:var(--dimmer);margin-top:1px">W–L–H</div>
      </div>`;
    el.appendChild(row);
  });
}
