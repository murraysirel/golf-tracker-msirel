// ─────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { COURSES } from './constants.js';
import { getCourseByRef } from './courses.js';
import { initials, avatarHtml } from './players.js';
import { parseDateGB, calcStableford, isBufferOrBetter, calcScoringPointsNet } from './stats.js';
import { pushData, querySupabase, loadGroupData } from './api.js';
import { removeGroupFromList } from './group.js';
import { goTo } from './nav.js';

// Maps CREATE_BOARDS ids → their wrapping card's data-board-id attribute
const TOGGLEABLE_BOARD_IDS = ['season', 'scoring_gross', 'scoring_net', 'stableford', 'net_score', 'buffer', 'best_gross', 'fewest_doubles'];

// Fetch group membership + config, then render
export async function initLeaderboard() {
  if (state.me && state.gd.activeGroupCode) {
    const res = await querySupabase('getGroupByCode', {
      code: state.gd.activeGroupCode,
      playerName: state.me
    });
    if (res?.found && res.isMember) {
      state.gd.group = res.group; // { id, name, code, admin_id, active_boards }
      // Cache the name for the switcher pill
      if (!state.gd.groupMeta) state.gd.groupMeta = {};
      if (res.group.name) state.gd.groupMeta[state.gd.activeGroupCode] = { name: res.group.name };
    } else {
      state.gd.group = null;
    }
  } else {
    state.gd.group = null;
  }
  // Fetch names for all other groups in the switcher (fire in parallel, non-blocking)
  const allCodes = state.gd.groupCodes || [];
  await Promise.all(allCodes.map(async code => {
    if (code === state.gd.activeGroupCode) return; // already fetched above
    if (state.gd.groupMeta?.[code]?.name) return; // already have it
    try {
      const r = await querySupabase('getGroupByCode', { code, playerName: state.me || '' });
      if (r?.found && r.group?.name) {
        if (!state.gd.groupMeta) state.gd.groupMeta = {};
        state.gd.groupMeta[code] = { name: r.group.name };
      }
    } catch (_) {}
  }));
  renderGroupSwitcher();
  renderLeaderboard();
}

export async function switchActiveGroup(code) {
  if (state.gd.activeGroupCode === code) return;
  localStorage.setItem('gt_activegroup', code);
  state.gd.group = null;
  // Reload all player/round data scoped to the new group
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
  const bar = document.getElementById('group-switcher');
  if (!bar) return;
  const codes = state.gd.groupCodes || (state.gd.activeGroupCode ? [state.gd.activeGroupCode] : []);
  if (codes.length <= 1) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = '';
  codes.forEach(code => {
    const meta = state.gd.groupMeta?.[code];
    const label = meta?.name ? meta.name : code;
    const isActive = code === state.gd.activeGroupCode;
    const pill = document.createElement('button');
    pill.className = 'group-pill' + (isActive ? ' active' : '');
    pill.textContent = label;
    pill.addEventListener('click', () => switchActiveGroup(code));
    bar.appendChild(pill);
  });
}

// Per-panel expanded state (persists across re-renders within the session)
const leaderboardExpanded = {};

function applyLBExpand(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = container.querySelectorAll('.lb-row');
  if (rows.length <= 3) return;
  if (!leaderboardExpanded[containerId]) {
    rows.forEach((r, i) => { r.style.display = i >= 3 ? 'none' : ''; });
  } else {
    rows.forEach(r => { r.style.display = ''; });
  }
  // Remove any existing expand link before adding a fresh one
  container.querySelector('.lb-expand-link')?.remove();
  const link = document.createElement('div');
  link.className = 'lb-expand-link';
  link.style.cssText = 'font-size:13px;color:var(--gold);padding:8px 0 2px;cursor:pointer;text-align:left';
  link.textContent = leaderboardExpanded[containerId] ? 'Collapse ↑' : `See full board →`;
  link.addEventListener('click', () => {
    leaderboardExpanded[containerId] = !leaderboardExpanded[containerId];
    renderLeaderboard();
  });
  container.appendChild(link);
}

export function renderLeaderboard() {
  // ── Part A/B/C/D: group state ──────────────────────────────────────
  const group = state.gd.group || null;
  const isInGroup = !!group;
  const activeBoards = group?.active_boards || [];
  const isAdmin = isInGroup && group.admin_id === state.me;

  // Stamp data-board-id onto each toggleable card (idempotent)
  const BOARD_ID_MAP = {
    'lb-list': 'season',
    'lb-birdies': 'scoring_gross',
    'lb-scoring-net': 'scoring_net',
    'lb-stableford': 'stableford',
    'lb-net': 'net_score',
    'lb-buffer': 'buffer',
    'lb-best-round': 'best_gross',
    'lb-doubles': 'fewest_doubles',
  };
  Object.entries(BOARD_ID_MAP).forEach(([elId, boardId]) => {
    const el = document.getElementById(elId);
    if (el?.parentElement) el.parentElement.dataset.boardId = boardId;
  });

  // Header: title + gear icon
  const titleEl = document.getElementById('lb-tab-title');
  if (titleEl) titleEl.textContent = isInGroup ? group.name : 'Leagues';
  const gearBtn = document.getElementById('lb-settings-btn');
  if (gearBtn) {
    gearBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    gearBtn.onclick = () => {
      import('./group.js').then(m => m.initGroupSettings());
    };
  }

  // Solo prompt: shown when not in a group
  // Join/create prompt — always visible so you can join/create additional groups
  const soloPrompt = document.getElementById('lb-solo-prompt');
  if (soloPrompt) {
    soloPrompt.style.display = 'block';
    const heading = soloPrompt.querySelector('.lb-solo-heading');
    const subtext = soloPrompt.querySelector('.lb-solo-subtext');
    const atCap = (state.gd.groupCodes || []).length >= 5;
    if (atCap) {
      if (heading) heading.textContent = 'League limit reached';
      if (subtext) subtext.textContent = 'You are in 5 leagues — the maximum. Leave a league to join or create another.';
      soloPrompt.querySelectorAll('button').forEach(b => { b.disabled = true; b.title = 'Max 5 leagues reached'; });
    } else if (isInGroup) {
      if (heading) heading.textContent = 'Add another group';
      if (subtext) subtext.textContent = 'Join or create a new group for separate leaderboards.';
      soloPrompt.querySelectorAll('button').forEach(b => { b.disabled = false; b.title = ''; });
    } else {
      if (heading) heading.textContent = 'Invite your mates to compete on these boards';
      if (subtext) subtext.textContent = '';
      soloPrompt.querySelectorAll('button').forEach(b => { b.disabled = false; b.title = ''; });
    }
  }

  // Group code card: shown when in a registered group OR when a legacy code exists
  const gcCard = document.getElementById('lb-group-code-card');
  const hasActiveCode = !!state.gd.activeGroupCode;
  const isLegacyGroup = hasActiveCode && !isInGroup;
  if (gcCard) {
    gcCard.style.display = (isInGroup || isLegacyGroup) ? 'block' : 'none';
    // Show a callout for legacy/unregistered codes
    let legacyBanner = gcCard.querySelector('.lb-legacy-banner');
    if (isLegacyGroup) {
      if (!legacyBanner) {
        legacyBanner = document.createElement('div');
        legacyBanner.className = 'lb-legacy-banner';
        legacyBanner.style.cssText = 'margin-top:12px;padding:10px 12px;border-radius:8px;background:rgba(230,126,34,.08);border:1px solid rgba(230,126,34,.3)';
        gcCard.appendChild(legacyBanner);
      }
      legacyBanner.innerHTML = `
        <div style="font-size:12px;color:var(--bogey);font-weight:600;margin-bottom:3px">Legacy group code</div>
        <div style="font-size:12px;color:var(--dim);margin-bottom:10px">This code isn't connected to a registered Looper group. Remove it to keep things tidy, or create a new group.</div>
        <button id="lb-remove-legacy-btn" style="padding:7px 14px;border-radius:20px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.35);color:#e74c3c;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">Remove this code</button>
      `;
      document.getElementById('lb-remove-legacy-btn')?.addEventListener('click', () => {
        if (confirm(`Remove group code ${state.gd.activeGroupCode} from your list?`)) {
          removeGroupFromList(state.gd.activeGroupCode);
        }
      });
    } else if (legacyBanner) {
      legacyBanner.remove();
    }
  }

  // Board card visibility (only filtered when in a group)
  TOGGLEABLE_BOARD_IDS.forEach(id => {
    const card = document.querySelector(`[data-board-id="${id}"]`);
    if (!card) return;
    card.style.display = (!isInGroup || activeBoards.includes(id)) ? '' : 'none';
  });

  const lb = document.getElementById('lb-list');
  const posClass = ['gold','silver','bronze'];

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
        const o = document.createElement('option');
        o.value = yr;
        o.textContent = yr + ' Season';
        seasonSel.appendChild(o);
      }
    });
    if (currentSeason && currentSeason !== 'all') seasonSel.value = currentSeason;
  }
  if (state.gd.activeGroupCode) {
    const gcEl = document.getElementById('lb-group-code');
    if (gcEl) gcEl.textContent = state.gd.activeGroupCode;
  }

  function filterRounds(rounds, playerName) {
    let filtered = rounds;
    // Exclude rounds before the player joined this group
    const joinedAt = state.gd.players?.[playerName]?.joinedAt;
    if (joinedAt) {
      const joinDate = new Date(joinedAt);
      filtered = filtered.filter(r => parseDateGB(r.date) >= joinDate);
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

  const players = Object.entries(state.gd.players).map(([name, p]) => {
    const allRs = p.rounds || [];
    const rs = filterRounds(allRs, name);
    if (!rs.length) return null;
    const handicap = p.handicap || 0;
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
      return calcStableford(r.scores, r.pars, handicap, r.slope, si);
    }).filter(v => v != null);
    const avgStab = stabTotals.length ? +(stabTotals.reduce((a, b) => a + b, 0) / stabTotals.length).toFixed(1) : null;

    const netPtsRounds = rs.filter(r => r.scores && r.pars);
    let netPtsTotal = 0, netPtsEagles = 0, netPtsBirdies = 0;
    netPtsRounds.forEach(r => {
      const course = getCourseByRef(r.course) || Object.values(COURSES || []).find(c => c.name === r.course);
      const si = course?.tees?.[r.tee]?.si || null;
      const res = calcScoringPointsNet(r.scores, r.pars, handicap, r.slope, si);
      if (res) { netPtsTotal += res.total; netPtsEagles += res.netEagles; netPtsBirdies += res.netBirdies; }
    });
    const netPts = netPtsRounds.length ? netPtsTotal : null;

    const netRounds = rs.filter(r => r.totalScore && r.totalPar);
    const netScores = netRounds.map(r => {
      const slope = r.slope || 113;
      const playingHcp = Math.round(handicap * (slope / 113));
      return r.totalScore - playingHcp;
    });
    const avgNet = netScores.length ? +(netScores.reduce((a, b) => a + b, 0) / netScores.length).toFixed(1) : null;
    const bestNet = netScores.length ? Math.min(...netScores) : null;

    const bufferCount = handicap > 0 ? rs.filter(r => isBufferOrBetter(r, handicap)).length : null;
    const bufferPct = bufferCount != null && rs.length ? Math.round(bufferCount / rs.length * 100) : null;

    return {
      name, rounds: rs.length, handicap,
      best: sc.length ? Math.min(...sc) : null,
      avg: sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null,
      avgDiff: diffs.length ? +(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1) : null,
      birdies, eagles, doubles, pts, avgDoubles,
      avgStab, stabCount: stabTotals.length,
      netPts, netPtsEagles, netPtsBirdies,
      avgNet, bestNet, netCount: netScores.length,
      bufferCount, bufferPct
    };
  }).filter(Boolean).sort((a, b) => (a.avgDiff ?? 99) - (b.avgDiff ?? 99));

  const emptyMsg = '<div class="empty" style="padding:24px 0"><div style="font-size:28px;margin-bottom:8px">\u2014</div><div style="font-size:13px">No rounds this season yet</div></div>';

  if (!players.length) {
    ['lb-list','lb-birdies','lb-scoring-net','lb-stableford','lb-net','lb-buffer','lb-best-stab','lb-best-birdies','lb-best-round','lb-doubles'].forEach(id => {
      const el = document.getElementById(id); if (el) el.innerHTML = emptyMsg;
    });
    return;
  }

  const lbRow = (p, i, metricHtml) => {
    const d = document.createElement('div');
    const isMe = p.name === state.me;
    d.className = 'lb-row' + (isMe ? ' lb-me' : '');
    const pc = posClass[i] || '';
    d.innerHTML = `<div class="lb-pos ${pc}">${i+1}</div>
      ${avatarHtml(p.name, 36, isMe)}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px">
          <span class="lb-name" style="${isMe ? 'color:var(--gold)' : ''}">${p.name}</span>
          ${isMe ? '<span class="lb-you-badge">You</span>' : ''}
        </div>
        <div class="lb-meta">${p.meta || ''}</div>
      </div>
      ${metricHtml}`;
    return d;
  };

  // 1. Avg vs par
  lb.innerHTML = '';
  players.forEach((p, i) => {
    const diff = p.avgDiff != null ? (p.avgDiff >= 0 ? '+' + p.avgDiff : p.avgDiff.toString()) : '—';
    const diffColor = p.avgDiff != null && p.avgDiff < 0 ? 'var(--birdie)' : p.avgDiff === 0 ? 'var(--par)' : 'var(--bogey)';
    p.meta = `${p.rounds} round${p.rounds !== 1 ? 's' : ''} \u00B7 Best ${p.best ?? '—'} \u00B7 Avg ${p.avg ?? '—'}`;
    lb.appendChild(lbRow(p, i, `<div style="text-align:right;flex-shrink:0">
      <div class="lb-score" style="color:${diffColor}">${diff}</div>
      <div style="font-size:9px;color:var(--dimmer);margin-top:1px">avg vs par</div>
    </div>`));
  });

  applyLBExpand('lb-list');

  // 2. Scoring points
  const byPts = [...players].sort((a, b) => b.pts - a.pts);
  const bl = document.getElementById('lb-birdies'); bl.innerHTML = '';
  byPts.forEach((p, i) => {
    p.meta = `${p.eagles} eagle${p.eagles !== 1 ? "s" : ""} \u00B7 <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg> ${p.birdies} birdie${p.birdies !== 1 ? "s" : ""}`;
    bl.appendChild(lbRow(p, i, `<div style="text-align:right;flex-shrink:0">
      <div class="lb-score" style="color:var(--eagle)">${p.pts}</div>
      <div style="font-size:9px;color:var(--dimmer);margin-top:1px">points total</div>
    </div>`));
  });

  applyLBExpand('lb-birdies');

  // 2b. Scoring Points (Net)
  const byNetPts = [...players].filter(p => p.netPts != null).sort((a, b) => b.netPts - a.netPts);
  const snl = document.getElementById('lb-scoring-net'); if (snl) snl.innerHTML = '';
  if (snl && !byNetPts.length) {
    snl.innerHTML = '<div style="font-size:12px;color:var(--dimmer);padding:10px 0">Net scoring points calculated once hole-by-hole scores are available</div>';
  }
  byNetPts.forEach((p, i) => {
    p.meta = `${p.netPtsEagles} net eagle${p.netPtsEagles !== 1 ? 's' : ''} \u00B7 ${p.netPtsBirdies} net birdie${p.netPtsBirdies !== 1 ? 's' : ''}`;
    if (snl) snl.appendChild(lbRow(p, i, `<div style="text-align:right;flex-shrink:0">
      <div class="lb-score" style="color:var(--eagle)">${p.netPts}</div>
      <div style="font-size:9px;color:var(--dimmer);margin-top:1px">net pts total</div>
    </div>`));
  });
  if (snl) applyLBExpand('lb-scoring-net');

  // 3. Avg Stableford
  const bySt = [...players].filter(p => p.avgStab != null).sort((a, b) => b.avgStab - a.avgStab);
  const sl = document.getElementById('lb-stableford'); sl.innerHTML = '';
  if (!bySt.length) { sl.innerHTML = '<div style="font-size:12px;color:var(--dimmer);padding:10px 0">Stableford calculated once hole-by-hole scores are available</div>'; }
  bySt.forEach((p, i) => {
    const diff = +(p.avgStab - 36).toFixed(1);
    const diffStr = diff >= 0 ? '+' + diff : '' + diff;
    const color = diff >= 0 ? 'var(--birdie)' : diff >= -4 ? 'var(--bogey)' : 'var(--double)';
    p.meta = `${p.stabCount} round${p.stabCount !== 1 ? 's' : ''} \u00B7 HCP ${p.handicap || '—'}`;
    sl.appendChild(lbRow(p, i, `<div style="text-align:right;flex-shrink:0">
      <div class="lb-score" style="color:var(--gold)">${p.avgStab}</div>
      <div style="font-size:9px;color:${color};margin-top:1px">${diffStr} vs 36</div>
    </div>`));
  });

  applyLBExpand('lb-stableford');

  // 4. Avg Net Score
  const byNet = [...players].filter(p => p.avgNet != null).sort((a, b) => a.avgNet - b.avgNet);
  const nl = document.getElementById('lb-net'); nl.innerHTML = '';
  if (!byNet.length) { nl.innerHTML = '<div style="font-size:12px;color:var(--dimmer);padding:10px 0">Set your handicap in Stats to enable net scoring</div>'; }
  byNet.forEach((p, i) => {
    p.meta = `HCP ${p.handicap} \u00B7 Best net ${p.bestNet ?? '—'} \u00B7 ${p.netCount} round${p.netCount !== 1 ? 's' : ''}`;
    nl.appendChild(lbRow(p, i, `<div style="text-align:right;flex-shrink:0">
      <div class="lb-score" style="color:var(--cream)">${p.avgNet}</div>
      <div style="font-size:9px;color:var(--dimmer);margin-top:1px">avg net</div>
    </div>`));
  });

  applyLBExpand('lb-net');

  // 5. Buffer or Better
  const byBuf = [...players].filter(p => p.bufferCount != null).sort((a, b) => b.bufferCount - a.bufferCount);
  const bbl = document.getElementById('lb-buffer'); bbl.innerHTML = '';
  if (!byBuf.length) { bbl.innerHTML = '<div style="font-size:12px;color:var(--dimmer);padding:10px 0">Set your handicap in Stats to track buffer or better rounds</div>'; }
  byBuf.forEach((p, i) => {
    p.meta = `${p.bufferPct}% of ${p.rounds} round${p.rounds !== 1 ? 's' : ''} \u00B7 HCP ${p.handicap}`;
    bbl.appendChild(lbRow(p, i, `<div style="text-align:right;flex-shrink:0">
      <div class="lb-score" style="color:var(--birdie)">${p.bufferCount}</div>
      <div style="font-size:9px;color:var(--dimmer);margin-top:1px">rounds buffer+</div>
    </div>`));
  });

  // 7. Best single-round Stableford
  const bestStabPlayers = Object.entries(state.gd.players).map(([name, p]) => {
    const rs = filterRounds(p.rounds || [], name).filter(r => r.scores && r.pars);
    if (!rs.length) return null;
    const handicap = p.handicap || 0;
    let best = null, bestR = null;
    rs.forEach(r => {
      const course = getCourseByRef(r.course) || Object.values(COURSES || []).find(c => c.name === r.course);
      const si = course?.tees?.[r.tee]?.si || null;
      const s = calcStableford(r.scores, r.pars, handicap, r.slope, si);
      if (s != null && (best == null || s > best)) { best = s; bestR = r; }
    });
    if (best == null) return null;
    return { name, bestStab: best, round: bestR };
  }).filter(Boolean).sort((a, b) => b.bestStab - a.bestStab);

  const bsl = document.getElementById('lb-best-stab'); bsl.innerHTML = '';
  if (!bestStabPlayers.length) { bsl.innerHTML = emptyMsg; }
  bestStabPlayers.forEach((p, i) => {
    const diff = +(p.bestStab - 36).toFixed(0);
    const diffStr = diff >= 0 ? '+' + diff : '' + diff;
    const color = diff >= 0 ? 'var(--birdie)' : diff >= -4 ? 'var(--bogey)' : 'var(--double)';
    const d = document.createElement('div');
    const isMe = p.name === state.me;
    d.className = 'lb-row' + (isMe ? ' lb-me' : '');
    const pc = posClass[i] || '';
    d.innerHTML = `<div class="lb-pos ${pc}">${i+1}</div>
      ${avatarHtml(p.name, 36, isMe)}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px">
          <span class="lb-name" style="${isMe ? 'color:var(--gold)' : ''}">${p.name}</span>
          ${isMe ? '<span class="lb-you-badge">You</span>' : ''}
        </div>
        <div class="lb-meta">${p.round.course} \u00B7 ${p.round.date}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="lb-score" style="color:var(--gold)">${p.bestStab}</div>
        <div style="font-size:9px;color:${color};margin-top:1px">${diffStr} vs 36</div>
      </div>`;
    bsl.appendChild(d);
  });
  applyLBExpand('lb-best-stab');

  // 8. Most birdies in a single round
  const bestBirdiePlayers = Object.entries(state.gd.players).map(([name, p]) => {
    const rs = filterRounds(p.rounds || [], name);
    if (!rs.length) return null;
    let best = 0, bestR = null;
    rs.forEach(r => { if ((r.birdies || 0) > best) { best = r.birdies; bestR = r; } });
    if (!bestR) return null;
    return { name, bestBirdies: best, round: bestR };
  }).filter(Boolean).sort((a, b) => b.bestBirdies - a.bestBirdies);

  const bbl2 = document.getElementById('lb-best-birdies'); bbl2.innerHTML = '';
  if (!bestBirdiePlayers.length) { bbl2.innerHTML = emptyMsg; }
  bestBirdiePlayers.forEach((p, i) => {
    const isMe = p.name === state.me;
    const d = document.createElement('div');
    d.className = 'lb-row' + (isMe ? ' lb-me' : '');
    const pc = posClass[i] || '';
    d.innerHTML = `<div class="lb-pos ${pc}">${i+1}</div>
      ${avatarHtml(p.name, 36, isMe)}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px">
          <span class="lb-name" style="${isMe ? 'color:var(--gold)' : ''}">${p.name}</span>
          ${isMe ? '<span class="lb-you-badge">You</span>' : ''}
        </div>
        <div class="lb-meta">${p.round.course} \u00B7 ${p.round.date} \u00B7 ${p.round.totalScore} gross</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="lb-score" style="color:var(--birdie)">${p.bestBirdies}</div>
        <div style="font-size:9px;color:var(--dimmer);margin-top:1px">birdies in round</div>
      </div>`;
    bbl2.appendChild(d);
  });
  applyLBExpand('lb-best-birdies');

  // 9. Best gross round
  const bestRoundPlayers = Object.entries(state.gd.players).map(([name, p]) => {
    const rs = filterRounds(p.rounds || [], name).filter(r => r.totalScore);
    if (!rs.length) return null;
    const bestR = rs.reduce((a, b) => b.totalScore < a.totalScore ? b : a);
    return { name, score: bestR.totalScore, diff: bestR.diff, round: bestR };
  }).filter(Boolean).sort((a, b) => a.diff - b.diff || a.score - b.score);

  const brl = document.getElementById('lb-best-round'); brl.innerHTML = '';
  if (!bestRoundPlayers.length) { brl.innerHTML = emptyMsg; }
  bestRoundPlayers.forEach((p, i) => {
    const isMe = p.name === state.me;
    const d = document.createElement('div');
    d.className = 'lb-row' + (isMe ? ' lb-me' : '');
    const pc = posClass[i] || '';
    const dStr = p.diff >= 0 ? '+' + p.diff : '' + p.diff;
    const dCol = p.diff < 0 ? 'var(--birdie)' : p.diff === 0 ? 'var(--par)' : p.diff <= 3 ? 'var(--bogey)' : 'var(--double)';
    d.innerHTML = `<div class="lb-pos ${pc}">${i+1}</div>
      ${avatarHtml(p.name, 36, isMe)}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px">
          <span class="lb-name" style="${isMe ? 'color:var(--gold)' : ''}">${p.name}</span>
          ${isMe ? '<span class="lb-you-badge">You</span>' : ''}
        </div>
        <div class="lb-meta">${p.round.course} \u00B7 ${p.round.date}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="lb-score" style="color:var(--gold)">${p.score}</div>
        <div style="font-size:9px;color:${dCol};margin-top:1px">${dStr} par</div>
      </div>`;
    brl.appendChild(d);
  });
  applyLBExpand('lb-best-round');

  // H2H
  renderH2H(filterRounds);

  // 6. Fewest doubles
  const byDoubles = [...players].sort((a, b) => (a.avgDoubles ?? 99) - (b.avgDoubles ?? 99));
  const dl = document.getElementById('lb-doubles'); dl.innerHTML = '';
  byDoubles.forEach((p, i) => {
    p.meta = `${p.doubles} total \u00B7 ${p.rounds} round${p.rounds !== 1 ? 's' : ''}`;
    dl.appendChild(lbRow(p, i, `<div style="text-align:right;flex-shrink:0">
      <div class="lb-score" style="color:var(--par)">${p.avgDoubles ?? '—'}</div>
      <div style="font-size:9px;color:var(--dimmer);margin-top:1px">per round</div>
    </div>`));
  });
  applyLBExpand('lb-doubles');
}

function renderH2H(filterRounds) {
  const el = document.getElementById('lb-h2h');
  if (!el) return;
  el.innerHTML = '';

  const playerNames = Object.keys(state.gd.players);
  if (playerNames.length < 2) {
    el.innerHTML = '<div style="font-size:12px;color:var(--dimmer);padding:8px 0">Need at least 2 players with shared rounds</div>';
    return;
  }

  // Build H2H records for all pairs
  const records = [];
  for (let i = 0; i < playerNames.length; i++) {
    for (let j = i + 1; j < playerNames.length; j++) {
      const pA = playerNames[i], pB = playerNames[j];
      const rsA = filterRounds(state.gd.players[pA]?.rounds || [], pA);
      const rsB = filterRounds(state.gd.players[pB]?.rounds || [], pB);

      // Find shared rounds (same date + course)
      let wA = 0, wB = 0, h = 0;
      let hasMatchData = false;
      let sharedRounds = 0;

      rsA.forEach(rA => {
        const rB = rsB.find(r => r.date === rA.date && r.course === rA.course);
        if (!rB) return;
        sharedRounds++;

        // Check for real match outcome data first
        if (rA.matchOutcome) {
          hasMatchData = true;
          const mo = rA.matchOutcome;
          if (mo.result === 'won') {
            if (mo.leader === pA) wA++;
            else wB++;
          } else if (mo.result === 'halved') {
            h++;
          }
        } else if (rB.matchOutcome) {
          hasMatchData = true;
          const mo = rB.matchOutcome;
          if (mo.result === 'won') {
            if (mo.leader === pB) wB++;
            else wA++;
          } else if (mo.result === 'halved') {
            h++;
          }
        } else {
          // Virtual: lower gross wins
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
