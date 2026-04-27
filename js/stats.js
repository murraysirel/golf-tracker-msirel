// ─────────────────────────────────────────────────────────────────
// STATS + CHARTS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { TC, getBenchmark } from './constants.js';
import { pushData, pushSupabase, querySupabase } from './api.js';
import { initials, refreshAvatarUI, avatarHtml } from './players.js';

// Empty state — lazy-loaded on first use (no top-level await)
let _emptyState = null;
function _es(icon, headline, sub, ctaText, ctaAction) {
  if (_emptyState === null) { import('./empty-states.js').then(m => { _emptyState = m.emptyState; }).catch(() => { _emptyState = false; }); }
  return typeof _emptyState === 'function' ? _emptyState(icon, headline, sub, ctaText, ctaAction) : null;
}

// Chart instances container
const CH = {};

// Round history expanded state
let roundHistExpanded = false;

// ── Scorecard history modal ───────────────────────────────────────
function scoreColor(d) {
  if (d <= -2) return 'var(--eagle)';
  if (d === -1) return 'var(--birdie)';
  if (d === 0)  return 'var(--par)';
  if (d === 1)  return 'var(--bogey)';
  return 'var(--double)';
}

function findGroupRounds(round) {
  const results = [];
  for (const [name, pdata] of Object.entries(state.gd?.players || {})) {
    for (const r of (pdata.rounds || [])) {
      if (r.date === round.date && r.course === round.course) {
        results.push({ name, round: r });
      }
    }
  }
  results.sort((a, b) => {
    if (a.name === round.player) return -1;
    if (b.name === round.player) return 1;
    return a.name.localeCompare(b.name);
  });
  return results;
}

function buildScorecardTable(primaryRound, group) {
  const hasWolf = !!primaryRound.wolfResult;
  const pars = primaryRound.pars || Array(18).fill(4);

  let thead = '<th>Hole</th><th>Par</th>';
  for (const { name } of group) thead += `<th>${initials(name)}</th>`;
  if (hasWolf) thead += '<th style="color:var(--gold)">W</th>';

  function buildRow(i) {
    const par = pars[i];
    let cells = `<td>${i + 1}</td><td style="color:var(--dim)">${par || '—'}</td>`;
    for (const { round: r } of group) {
      const sc = r.scores?.[i];
      const d = sc != null && par ? sc - par : null;
      cells += `<td style="color:${d != null ? scoreColor(d) : 'var(--dimmer)'};font-weight:600">${sc != null ? sc : '—'}</td>`;
    }
    if (hasWolf) {
      const wh = primaryRound.wolfResult.holes?.[i];
      const wt = wh ? (wh.loneWolf ? 'W' : wh.winner ? initials(wh.winner) : '') : '';
      cells += `<td style="font-size:10px;color:var(--dim)">${wt}</td>`;
    }
    return `<tr>${cells}</tr>`;
  }

  function buildSubRow(label, sliceStart, sliceEnd) {
    const sp = pars.slice(sliceStart, sliceEnd).reduce((a, b) => a + (b || 0), 0);
    let cells = `<td style="color:var(--cream)">${label}</td><td style="color:var(--dim)">${sp}</td>`;
    for (const { round: r } of group) {
      const t = r.scores?.slice(sliceStart, sliceEnd).reduce((a, b) => a + (b || 0), 0) || 0;
      cells += `<td style="color:var(--cream)">${t || '—'}</td>`;
    }
    if (hasWolf) cells += '<td></td>';
    return `<tr class="sc-sub">${cells}</tr>`;
  }

  const totalPar = pars.reduce((a, b) => a + (b || 0), 0);
  let totCells = `<td style="color:var(--cream)">Total</td><td style="color:var(--dim)">${totalPar}</td>`;
  for (const { round: r } of group) {
    const tot = r.totalScore || r.scores?.reduce((a, b) => a + (b || 0), 0) || 0;
    const diff = tot - totalPar;
    const dStr = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : '' + diff);
    totCells += `<td><span style="color:var(--gold);font-weight:700;font-family:'DM Sans',sans-serif">${tot}</span> <span style="font-size:10px;color:${scoreColor(diff)}">${dStr}</span></td>`;
  }
  if (hasWolf) {
    const w = primaryRound.wolfResult.winner || '';
    totCells += `<td style="font-size:10px;color:var(--gold)">${w ? initials(w) : ''}</td>`;
  }

  let html = `<table class="sc-hist-table">
    <thead><tr>${thead}</tr></thead>
    <tbody>`;
  for (let i = 0; i < 9; i++) html += buildRow(i);
  html += buildSubRow('OUT', 0, 9);
  for (let i = 9; i < 18; i++) html += buildRow(i);
  html += buildSubRow('IN', 9, 18);
  html += `<tr class="sc-tot">${totCells}</tr>`;
  html += '</tbody></table>';

  if (primaryRound.matchResult?.result) {
    html += `<div style="text-align:center;padding:14px 0 4px;font-size:13px;color:var(--gold)">${primaryRound.matchResult.result}</div>`;
  }
  if (primaryRound.sixesResult) {
    const sr = primaryRound.sixesResult;
    const standings = sr.standings || [];
    const winner = sr.winner || standings[0]?.name || '';
    const medals = ['🥇', '🥈', '🥉'];
    html += `<div style="text-align:center;padding:14px 0 4px;border-top:1px solid var(--border);margin-top:8px">
      <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Sixes Result</div>
      <div style="display:flex;justify-content:center;gap:20px">
        ${standings.map((s, i) => `<div style="text-align:center"><div style="font-size:18px">${medals[i] || ''}</div><div style="font-size:13px;font-weight:600;color:${i === 0 ? 'var(--gold)' : 'var(--cream)'}">${s.name?.split(' ')[0] || ''}</div><div style="font-size:11px;color:var(--dim)">${s.points || 0} pts</div></div>`).join('')}
      </div>
      ${winner ? `<div style="font-size:12px;color:var(--gold);margin-top:8px">${winner.split(' ')[0]} wins!</div>` : ''}
    </div>`;
  }
  return html;
}

export function openScorecardModal(round) {
  const modal = document.getElementById('sc-hist-modal');
  const body  = document.getElementById('sc-hist-body');
  if (!modal || !body) return;
  const group = findGroupRounds(round);
  body.innerHTML = buildScorecardTable(round, group);
  document.getElementById('sc-hist-course').textContent = round.course || '';
  const tee = round.tee ? ` · ${round.tee.charAt(0).toUpperCase() + round.tee.slice(1)} tees` : '';
  document.getElementById('sc-hist-meta').textContent = (round.date || '') + tee;
  modal.classList.add('open');
}

export function dc(k) {
  if (CH[k]) { CH[k].destroy(); delete CH[k]; }
}

// Read a CSS custom property value (for Chart.js which needs raw strings)
function cc(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

export function co() {
  const tick = cc('--chart-tick');
  const grid = cc('--chart-grid');
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tick, font: { size: 11, family: "'DM Sans',sans-serif" } }, grid: { color: grid } },
      y: { ticks: { color: tick, font: { size: 11, family: "'DM Sans',sans-serif" } }, grid: { color: grid } }
    }
  };
}
// Legacy alias kept for any external spread usage (resolved at call time)
export const CO = {};

// ── Insight card helpers ──────────────────────────────────────────
function rateInsight(type, value) {
  if (value === null || isNaN(value)) return 'avg';
  if (type === 'fir')   return value >= 50 ? 'good' : value >= 35 ? 'avg' : 'bad';
  if (type === 'gir')   return value >= 40 ? 'good' : value >= 25 ? 'avg' : 'bad';
  if (type === 'putts') return value <= 1.8 ? 'good' : value <= 2.0 ? 'avg' : 'bad';
  if (type === 'score') return value <= 0  ? 'good' : value <= 5   ? 'avg' : 'bad';
  return 'avg';
}
function insightBorder(rating) {
  if (rating === 'good') return 'var(--par)';
  if (rating === 'avg')  return 'var(--bogey)';
  return 'var(--double)';
}
function renderInsightGrid(el, cards) {
  if (!el) return;
  el.className = 'insight-grid';
  el.innerHTML = cards.map(({ val, label, type, fmt }) => {
    const rating = rateInsight(type, val);
    const display = val !== null && !isNaN(val) ? fmt(val) : '—';
    return `<div class="insight-card" style="border-left-color:${insightBorder(rating)}">
      <div class="insight-val">${display}</div>
      <div class="insight-lbl">${label}</div>
    </div>`;
  }).join('');
}

export function setFilter(f) {
  state.statsFilter = f;
  document.querySelectorAll('.fpill').forEach(b => b.classList.toggle('active', b.dataset.f === f));
  const courseRow = document.getElementById('filter-course-row');
  if (courseRow) courseRow.style.display = f === 'course' ? 'block' : 'none';
  renderStats();
}

export function parseDateGB(d) {
  if (!d) return 0;
  const p = d.split('/');
  if (p.length !== 3) return 0;
  return parseInt(p[2] + p[1].padStart(2, '0') + p[0].padStart(2, '0'));
}

export function getFilteredRounds(allRounds) {
  const sorted = [...allRounds].sort((a, b) => parseDateGB(a.date) - parseDateGB(b.date));
  if (state.statsFilter === '5') return sorted.slice(-5);
  if (state.statsFilter === '10') return sorted.slice(-10);
  if (state.statsFilter === 'all') return sorted;
  if (state.statsFilter === 'month') {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear());
    return sorted.filter(r => {
      const p = r.date?.split('/');
      return p && p[1] === mm && p[2] === yy;
    });
  }
  if (state.statsFilter === 'course') {
    const sel = document.getElementById('filter-course-sel');
    const chosen = sel?.value || '';
    return chosen ? sorted.filter(r => r.course === chosen) : sorted;
  }
  return sorted;
}

export function populateCourseFilter(allRounds) {
  const sel = document.getElementById('filter-course-sel');
  if (!sel) return;
  const courses = [...new Set(allRounds.map(r => r.course).filter(Boolean))].sort();
  const cur = sel.value;
  sel.innerHTML = courses.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${c}</option>`).join('');
}

// ── Handicap display helper ───────────────────────────────────────
// Plus handicaps are stored as negative numbers (e.g. +1.2 = −1.2).
// fmtHcp() converts: −1.2 → "+1.2", 9.8 → "9.8", 0/null → "—"
function fmtHcp(h) {
  if (h == null) return '—';
  return h < 0 ? '+' + Math.abs(h) : String(h);
}

export function toggleHcpEdit() {
  const row = document.getElementById('hcp-edit-row');
  const showing = row.style.display !== 'none' && row.style.display !== '';
  row.style.display = showing ? 'none' : 'flex';
  if (!showing) {
    const inp = document.getElementById('hcp-input');
    const cur = state.gd.players[state.me]?.handicap;
    if (cur != null) inp.value = cur;
    inp.focus();
  }
}

export function saveHandicap() {
  const v = parseFloat(document.getElementById('hcp-input').value);
  if (isNaN(v) || v < -10 || v > 54) { alert('Please enter a valid handicap between −10 and 54. Use a negative number for a plus handicap (e.g. −1.2 = +1.2).'); return; }
  if (!state.gd.players[state.me]) state.gd.players[state.me] = { handicap: v, rounds: [] };
  else state.gd.players[state.me].handicap = v;
  pushData();
  pushSupabase('updateHandicap', { playerName: state.me, handicap: v });
  document.getElementById('hcp-edit-row').style.display = 'none';
  renderStats();
}

// ── KPI Tile System ───────────────────────────────────────────────
const KPI_TILE_LS = 'rr_kpi_tiles';
const KPI_TILE_DEFAULT = ['avgPar', 'bestRound'];
const TILE_META = {
  avgPar:       'AVG VS PAR',
  bestRound:    'BEST ROUND',
  birdies:      'BIRDIES',
  girFir:       'GIR / FIR',
  stableford:   'STABLEFORD',
  eagles:       'EAGLES',
  roundsPlayed: 'ROUNDS',
  bufferBetter: 'BUFFER %',
};

function getKpiTiles() {
  try {
    const s = JSON.parse(localStorage.getItem(KPI_TILE_LS));
    if (Array.isArray(s) && s.length === 2 && s.every(id => TILE_META[id])) return s;
  } catch (_) {}
  return [...KPI_TILE_DEFAULT];
}

export function saveKpiTiles(tiles) {
  localStorage.setItem(KPI_TILE_LS, JSON.stringify(tiles));
}

// ── Tile builder functions ────────────────────────────────────────
// Each receives ctx and returns { val, lbl, deltaHtml, iconHtml? }
// or { split:true, top:{val,lbl,deltaHtml}, bot:{val,lbl,deltaHtml} }

const BIRDIE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--birdie)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>`;
const EAGLE_SVG  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--eagle)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/></svg>`;

function buildTile_avgPar(ctx) {
  const { rs, now } = ctx;
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
  const last30 = rs.filter(r => {
    const dp = r.date?.split('/');
    if (!dp || dp.length !== 3) return false;
    return new Date(+dp[2], +dp[1] - 1, +dp[0]) >= cutoff;
  });
  const diffs = last30.map(r => r.diff).filter(v => v != null && !isNaN(v));
  const avg = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
  const val = avg !== null ? (avg >= 0 ? '+' : '') + avg.toFixed(1) : '—';
  const delta = diffs.length === 0
    ? `<span style="color:var(--dim)">no rounds in 30 days</span>`
    : `<span style="color:var(--dim)">last ${diffs.length} round${diffs.length !== 1 ? 's' : ''} · 30d</span>`;
  return { val, lbl: 'AVG VS PAR', deltaHtml: delta };
}

function buildTile_bestRound(ctx) {
  const { seasonRounds } = ctx;
  const withScore = seasonRounds.filter(r => r.totalScore);
  const best = withScore.length ? withScore.reduce((m, r) => r.totalScore < m.totalScore ? r : m) : null;
  let deltaHtml = '';
  if (best) {
    const fullName = (best.course || '').replace(/ Golf Club| Golf Course| Golf Links/g, '');
    const shortC = fullName.length > 16 ? fullName.slice(0, 16) + '…' : fullName;
    const dp = best.date?.split('/');
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = dp?.length === 3 ? MONTHS[+dp[1] - 1] + ' ' + +dp[0] : '';
    deltaHtml = `<span style="display:block;font-size:11px;color:var(--dim)">${shortC}</span><span style="display:block;font-size:11px;color:var(--dim)">${dateStr}</span>`;
  }
  return { val: best ? String(best.totalScore) : '—', lbl: 'BEST ROUND', deltaHtml };
}

function buildTile_birdies(ctx) {
  const { seasonRounds, rs, currentMonth, currentYear, now } = ctx;
  const seasonBirdies = seasonRounds.reduce((a, r) => a + (r.birdies || 0), 0);
  const lastMonthNum = now.getMonth() === 0 ? 12 : now.getMonth();
  const lastMonthStr = String(lastMonthNum).padStart(2, '0');
  const lastMonthYear = now.getMonth() === 0 ? String(now.getFullYear() - 1) : currentYear;
  const thisMonthB = rs.filter(r => { const dp = r.date?.split('/'); return dp && dp[1] === currentMonth && dp[2] === currentYear; }).reduce((a, r) => a + (r.birdies || 0), 0);
  const lastMonthRounds = rs.filter(r => { const dp = r.date?.split('/'); return dp && dp[1] === lastMonthStr && dp[2] === lastMonthYear; });
  const lastMonthB = lastMonthRounds.reduce((a, r) => a + (r.birdies || 0), 0);
  let deltaHtml;
  if (!lastMonthRounds.length) {
    deltaHtml = `<span style="color:var(--dim)">— no data last month</span>`;
  } else {
    const d = thisMonthB - lastMonthB;
    deltaHtml = d > 0 ? `<span style="color:var(--par)">↑ ${d} vs last month</span>`
              : d < 0 ? `<span style="color:var(--bogey)">↓ ${Math.abs(d)} vs last month</span>`
              : `<span style="color:var(--dim)">→ same as last month</span>`;
  }
  return { val: String(seasonBirdies), lbl: 'BIRDIES', deltaHtml, iconHtml: BIRDIE_SVG };
}

function buildTile_girFir(ctx) {
  const { last5, seasonRounds, girRaw, firRaw } = ctx;
  const l5GIR = girRaw(last5), l5FIR = firRaw(last5);
  const sGIR = girRaw(seasonRounds), sFIR = firRaw(seasonRounds);
  function deltaHtml(l5, s) {
    if (l5 !== null && s !== null) {
      const d = l5 - s;
      if (d > 0) return `<span style="color:var(--par)">↑ ${Math.abs(d).toFixed(1)} pp</span>`;
      if (d < 0) return `<span style="color:var(--bogey)">↓ ${Math.abs(d).toFixed(1)} pp</span>`;
      return `<span style="color:var(--dim)">→ avg</span>`;
    }
    return '';
  }
  return {
    split: true,
    top: { val: l5GIR !== null ? Math.round(l5GIR) + '%' : '—', lbl: 'GIR', deltaHtml: deltaHtml(l5GIR, sGIR) },
    bot: { val: l5FIR !== null ? Math.round(l5FIR) + '%' : '—', lbl: 'FIR', deltaHtml: deltaHtml(l5FIR, sFIR) },
  };
}

function buildTile_stableford(ctx) {
  const { seasonRounds, p } = ctx;
  const hcp = p.handicap || 0;
  const totals = seasonRounds.filter(r => r.scores && r.pars).map(r => {
    const si = r.si || null;
    return calcStableford(r.scores, r.pars, hcp, r.slope, si);
  }).filter(v => v != null);
  const avg = totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1) : null;
  const delta = totals.length ? `<span style="color:var(--dim)">${totals.length} round${totals.length !== 1 ? 's' : ''} this season</span>` : '';
  return { val: avg !== null ? avg + ' pts' : '—', lbl: 'STABLEFORD', deltaHtml: delta };
}

function buildTile_eagles(ctx) {
  const { seasonRounds, rs, currentYear, now } = ctx;
  const seasonEagles = seasonRounds.reduce((a, r) => a + (r.eagles || 0), 0);
  const lastYear = String(now.getFullYear() - 1);
  const lastYearEagles = rs.filter(r => r.date?.split('/')?.[2] === lastYear).reduce((a, r) => a + (r.eagles || 0), 0);
  let deltaHtml;
  const d = seasonEagles - lastYearEagles;
  if (!rs.some(r => r.date?.split('/')?.[2] === lastYear)) {
    deltaHtml = `<span style="color:var(--dim)">this season</span>`;
  } else {
    deltaHtml = d > 0 ? `<span style="color:var(--par)">↑ ${d} vs last year</span>`
              : d < 0 ? `<span style="color:var(--bogey)">↓ ${Math.abs(d)} vs last year</span>`
              : `<span style="color:var(--dim)">→ same as last year</span>`;
  }
  return { val: String(seasonEagles), lbl: 'EAGLES', deltaHtml, iconHtml: EAGLE_SVG };
}

function buildTile_roundsPlayed(ctx) {
  const { seasonRounds, sorted } = ctx;
  const count = seasonRounds.length;
  let deltaHtml = '';
  if (sorted.length) {
    const last = sorted[sorted.length - 1];
    const dp = last.date?.split('/');
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = dp?.length === 3 ? MONTHS[+dp[1] - 1] + ' ' + +dp[0] : '';
    deltaHtml = `<span style="color:var(--dim)">last: ${dateStr}</span>`;
  }
  return { val: String(count), lbl: 'ROUNDS', deltaHtml };
}

function buildTile_bufferBetter(ctx) {
  const { seasonRounds, p } = ctx;
  const hcp = p.handicap || 0;
  if (hcp <= 0 || !seasonRounds.length) {
    return { val: '—', lbl: 'BUFFER %', deltaHtml: `<span style="color:var(--dim)">need a handicap</span>` };
  }
  const buf = seasonRounds.filter(r => isBufferOrBetter(r, hcp)).length;
  const pct = Math.round(buf / seasonRounds.length * 100);
  const delta = `<span style="color:var(--dim)">${buf} of ${seasonRounds.length} rounds</span>`;
  return { val: pct + '%', lbl: 'BUFFER %', deltaHtml: delta };
}

const TILE_BUILDERS = {
  avgPar: buildTile_avgPar,
  bestRound: buildTile_bestRound,
  birdies: buildTile_birdies,
  girFir: buildTile_girFir,
  stableford: buildTile_stableford,
  eagles: buildTile_eagles,
  roundsPlayed: buildTile_roundsPlayed,
  bufferBetter: buildTile_bufferBetter,
};

function buildTileEl(tileId, ctx) {
  const builder = TILE_BUILDERS[tileId];
  if (!builder) return null;
  const tile = builder(ctx);
  const card = document.createElement('div');
  card.className = 'home-kpi-card';
  // Compact card: value, label, one meta line
  const metaLine = tile.deltaHtml || '';
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px">
      ${tile.iconHtml || ''}
      <div class="home-kpi-val">${tile.val}</div>
    </div>
    <div class="home-kpi-lbl">${tile.lbl}</div>
    <div style="font-size:10px;color:var(--dim);margin-top:3px">${metaLine}</div>`;
  return card;
}

function renderGirFirCard(ctx) {
  const el = document.getElementById('home-gir-fir');
  if (!el) return;
  const tile = buildTile_girFir(ctx);
  if (!tile.split) { el.innerHTML = ''; return; }
  el.innerHTML = `<div style="background:var(--mid);border-radius:14px;padding:14px 16px;display:flex;align-items:center">
    <div style="flex:1;text-align:center">
      <div class="home-kpi-val">${tile.top.val}</div>
      <div class="home-kpi-lbl">${tile.top.lbl}</div>
      <div class="home-kpi-delta">${tile.top.deltaHtml || ''}</div>
    </div>
    <div style="width:1px;height:40px;background:var(--border);margin:0 12px"></div>
    <div style="flex:1;text-align:center">
      <div class="home-kpi-val">${tile.bot.val}</div>
      <div class="home-kpi-lbl">${tile.bot.lbl}</div>
      <div class="home-kpi-delta">${tile.bot.deltaHtml || ''}</div>
    </div>
  </div>`;
}

function renderKpiGrid(ctx) {
  const grid = document.getElementById('home-kpis');
  if (!grid) return;
  grid.innerHTML = '';
  // Only render first 2 customisable tiles (skip girFir — rendered separately)
  const tiles = getKpiTiles().filter(id => id !== 'girFir').slice(0, 2);
  tiles.forEach(id => {
    const el = buildTileEl(id, ctx);
    if (el) grid.appendChild(el);
  });
  // Fixed GIR/FIR wide card
  renderGirFirCard(ctx);
}

// ── Tile picker ───────────────────────────────────────────────────
let _pickerSelected = [];

export function openKpiPicker() {
  _pickerSelected = [...getKpiTiles()].filter(id => id !== 'girFir').slice(0, 2);
  const optionsEl = document.getElementById('kpi-tile-options');
  if (!optionsEl) return;
  optionsEl.innerHTML = '';
  Object.entries(TILE_META).forEach(([id, label]) => {
    if (id === 'girFir') return; // GIR/FIR is fixed — not customisable
    const chip = document.createElement('div');
    const isSel = _pickerSelected.includes(id);
    chip.className = 'kpi-tile-chip' + (isSel ? ' selected' : '') + (!isSel && _pickerSelected.length >= 2 ? ' disabled' : '');
    chip.dataset.id = id;
    chip.textContent = label;
    chip.addEventListener('click', () => {
      if (_pickerSelected.includes(id)) {
        _pickerSelected = _pickerSelected.filter(x => x !== id);
        chip.classList.remove('selected');
      } else if (_pickerSelected.length < 2) {
        _pickerSelected.push(id);
        chip.classList.add('selected');
      }
      document.querySelectorAll('.kpi-tile-chip').forEach(c => {
        const cId = c.dataset.id;
        c.classList.toggle('disabled', !_pickerSelected.includes(cId) && _pickerSelected.length >= 2);
      });
    });
    optionsEl.appendChild(chip);
  });
  const sheet = document.getElementById('kpi-picker-sheet');
  if (sheet) sheet.style.display = 'flex';
}

export function closeKpiPicker(save) {
  const sheet = document.getElementById('kpi-picker-sheet');
  if (sheet) sheet.style.display = 'none';
  if (save && _pickerSelected.length === 2) {
    saveKpiTiles(_pickerSelected);
    renderHomeStats();
  }
}

// ── Mates activity feed — recent highlights ─────────────────────
let _matesFeedCache = { html: '', ts: 0, playerCount: 0 };

function renderMatesFeed() {
  const section = document.getElementById('home-mates-section');
  const matesEl = document.getElementById('home-mates-list');
  if (!section || !matesEl) return;
  // Serve cached HTML if fresh (60s) and player count unchanged
  const pc = Object.keys(state.gd.players || {}).length;
  if (_matesFeedCache.html && Date.now() - _matesFeedCache.ts < 60000 && _matesFeedCache.playerCount === pc) {
    section.style.display = '';
    matesEl.innerHTML = _matesFeedCache.html;
    matesEl.querySelector('.card')?.addEventListener('click', () => { import('./nav.js').then(m => m.goTo('feed')); });
    return;
  }
  const allPlayers = Object.entries(state.gd.players || {});
  section.style.display = '';
  if (allPlayers.length <= 1) {
    matesEl.innerHTML = '<div style="background:var(--mid);border-radius:12px;padding:16px;text-align:center"><div style="margin-bottom:4px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--dim)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v14"/><path d="M4 2l9 3.5L4 9"/></svg></div><div style="font-size:11px;color:var(--dimmer);line-height:1.5">Nobody has gone low yet — birdies, eagles and milestones from your group will show up here.</div></div>';
    return;
  }

  const today = new Date();
  const currentYear = String(today.getFullYear());
  const events = [];

  for (const [name, p] of allPlayers) {
    const seasonRounds = (p.rounds || []).filter(r => r.date?.split('/')?.[2] === currentYear);
    for (const r of seasonRounds) {
      const rd = parseDateGB(r.date);
      if (!rd) continue;

      // Parse to real Date for day diff
      const dp = r.date?.split('/');
      const realDate = dp?.length === 3 ? new Date(+dp[2], +dp[1] - 1, +dp[0]) : null;
      const ago = realDate ? Math.floor((today - realDate) / 86400000) : 0;
      const when = ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + 'd ago';
      const course = (r.course || '').replace(/ Golf Club| Golf Course| Golf Links/g, '');

      // Round played — always include
      const diff = r.diff;
      const dv = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : '' + diff);
      const stab = calcStableford(r.scores, r.pars, p.handicap || 0, r.slope, null);
      events.push({ ts: rd, id: r.id || 0, icon: 'round', name, text: `${name} played ${course}`, when, color: 'var(--dim)', badge: 'Round', round: r, score: `${r.totalScore || '—'} (${dv})`, pts: stab });

      // Eagles
      if (r.eagles > 0) {
        events.push({ ts: rd, id: r.id || 0, icon: 'eagle', name, text: `${name} made ${r.eagles} eagle${r.eagles > 1 ? 's' : ''} at ${course}`, when, color: 'var(--eagle)', badge: 'Eagle' });
      }
      // Birdies (2+)
      if (r.birdies >= 2) {
        events.push({ ts: rd, id: r.id || 0, icon: 'birdie', name, text: `${name} made ${r.birdies} birdies at ${course}`, when, color: 'var(--birdie)', badge: 'Birdie' });
      }
      // Net eagles — count holes where (score - par - hcpStrokes) <= -2
      if (r.scores && r.pars) {
        const hcp = p.handicap || 0;
        const slope = r.slope || 113;
        const php = Math.round(hcp * slope / 113);
        let netEagles = 0;
        for (let h = 0; h < 18; h++) {
          if (r.scores[h] == null || r.pars[h] == null) continue;
          const strokes = Math.floor(php / 18) + ((h + 1) <= (php % 18) ? 1 : 0);
          if (r.scores[h] - r.pars[h] - strokes <= -2) netEagles++;
        }
        if (netEagles > 0) {
          events.push({ ts: rd, id: r.id || 0, icon: 'star', name, text: `${name} made ${netEagles} net eagle${netEagles > 1 ? 's' : ''} at ${course}`, when, color: 'var(--gold)', badge: 'Net Eagle' });
        }
      }
      // Season-best net round
      const netDiff = r.diff != null ? r.diff - Math.round((p.handicap || 0) * (r.slope || 113) / 113) : null;
      if (netDiff != null) {
        const otherNets = seasonRounds.filter(o => o !== r && o.diff != null).map(o =>
          o.diff - Math.round((p.handicap || 0) * (o.slope || 113) / 113)
        );
        if (otherNets.length > 0 && netDiff < Math.min(...otherNets)) {
          const fmtNet = netDiff === 0 ? 'level par net' : (netDiff > 0 ? '+' + netDiff : netDiff) + ' net';
          events.push({ ts: rd, id: r.id || 0, icon: 'trophy', name, text: `${name} shot their best net round of the season (${fmtNet}) at ${course}`, when, color: 'var(--gold2)', badge: 'PB' });
        }
      }
      // Stableford > 36
      if (stab != null && stab > 36) {
        events.push({ ts: rd, id: r.id || 0, icon: 'alert', name, text: `${name} scored ${stab} stableford points! Check their handicap is cut!`, when, color: 'var(--bogey)', badge: 'Round' });
      }
      // Sixes result
      if (r.sixesResult?.winner && r.sixesResult.winner === name) {
        const standings = r.sixesResult.standings || [];
        const losers = standings.filter(s => s.name !== name).map(s => s.name?.split(' ')[0]).join(' and ');
        const winPts = standings.find(s => s.name === name)?.points || 0;
        const runnerPts = standings.filter(s => s.name !== name).map(s => s.points || 0);
        const margin = winPts - Math.max(...runnerPts, 0);
        events.push({ ts: rd, id: r.id || 0, icon: 'trophy', name, text: `${name} beat ${losers} by ${margin} points in a game of Sixes at ${course}`, when, color: 'var(--par)', badge: 'Sixes' });
      }
    }
  }

  events.sort((a, b) => b.ts - a.ts || (b.id - a.id));

  // Deduplicate: keep one per player+date+type, prioritise special events over round
  const seen = new Set();
  const deduped = [];
  for (const ev of events) {
    const key = `${ev.name}-${ev.ts}-${ev.icon}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ev);
  }

  const capped = deduped.slice(0, 5);
  matesEl.innerHTML = '';

  if (!capped.length) {
    matesEl.innerHTML = _es('people', 'Quiet out there', 'When your group posts rounds, birdies and milestones appear here.', 'See the leaderboard', "import('./nav.js').then(m=>m.goTo('leaderboard'))")
      || '<div style="background:var(--mid);border-radius:12px;padding:16px;text-align:center"><div style="margin-bottom:4px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--dim)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v14"/><path d="M4 2l9 3.5L4 9"/></svg></div><div style="font-size:11px;color:var(--dimmer);line-height:1.5">Nobody has gone low yet — birdies, eagles and milestones from your group will show up here.</div></div>';
    return;
  }

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--mid);border-radius:12px;padding:10px 14px';

  capped.forEach((ev, i) => {
    // Determine badge colour
    let badgeColor = 'var(--dim)';
    if (ev.icon === 'birdie') badgeColor = 'var(--birdie)';
    else if (ev.icon === 'eagle') badgeColor = 'var(--eagle)';
    else if (ev.icon === 'star') badgeColor = 'var(--gold)';
    else if (ev.icon === 'trophy') badgeColor = 'var(--par)';
    else if (ev.icon === 'alert') badgeColor = 'var(--bogey)';

    // Extract player name
    const nameMatch = ev.text.match(/^(.+?) (?:made|scored|shot|played|beat)/);
    const playerName = nameMatch ? nameMatch[1] : '';
    const restText = playerName ? ev.text.slice(playerName.length) : ev.text;

    // Score detail line for round events
    const scoreLine = ev.icon === 'round' && ev.score
      ? `<div style="font-size:10px;color:var(--cream);margin-top:2px">${ev.score}${ev.pts != null ? ' · <span style="color:var(--gold)">' + ev.pts + ' pts</span>' : ''}</div>`
      : '';

    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;padding:7px 0${i < capped.length - 1 ? ';border-bottom:1px solid var(--border)' : ''}`;
    row.innerHTML = `
      ${avatarHtml(playerName, 28, playerName === state.me)}
      <div style="flex:1;min-width:0;font-size:10px;color:var(--dim);line-height:1.4"><span style="color:var(--cream);font-weight:600">${playerName}</span>${restText}${scoreLine}<div style="font-size:9px;color:var(--dimmer);margin-top:1px">${ev.when}</div></div>
      <div style="font-size:9px;padding:2px 8px;border-radius:10px;border:1px solid ${badgeColor};color:${badgeColor};white-space:nowrap;flex-shrink:0">${ev.badge || 'Round'}</div>`;
    card.appendChild(row);
  });

  matesEl.appendChild(card);
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    import('./nav.js').then(m => m.goTo('feed'));
  });
  _matesFeedCache = { html: matesEl.innerHTML, ts: Date.now(), playerCount: Object.keys(state.gd.players || {}).length };
}

// ── Activity feed page — full Strava-style feed ─────────────────
let _feedLikes = {}; // { roundId: [liker1, liker2, ...] }

export async function renderFeedPage() {
  const feedEl = document.getElementById('feed-list');
  if (!feedEl) return;

  const allPlayers = Object.entries(state.gd.players || {});
  const today = new Date();
  const currentYear = String(today.getFullYear());
  const events = [];

  // Look back 30 days for richer feed
  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  const cutoffInt = cutoffDate.getFullYear() * 10000 + (cutoffDate.getMonth() + 1) * 100 + cutoffDate.getDate();

  for (const [name, p] of allPlayers) {
    const seasonRounds = (p.rounds || []).filter(r => r.date?.split('/')?.[2] === currentYear);
    for (const r of seasonRounds) {
      const rd = parseDateGB(r.date);
      if (!rd || rd < cutoffInt) continue;

      const dp = r.date?.split('/');
      const realDate = dp?.length === 3 ? new Date(+dp[2], +dp[1] - 1, +dp[0]) : null;
      const ago = realDate ? Math.floor((today - realDate) / 86400000) : 0;
      const when = ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : ago + ' days ago';
      const course = (r.course || '').replace(/ Golf Club| Golf Course| Golf Links/g, '');

      // Round played — always show
      const diff = r.diff;
      const dv = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : '' + diff);
      const stab = calcStableford(r.scores, r.pars, p.handicap || 0, r.slope, null);
      events.push({
        ts: rd, id: r.id || 0, name, type: 'round',
        text: `played ${course}`,
        detail: `${r.totalScore} (${dv}) · ${stab ?? '—'} pts`,
        when, course, round: r, player: p,
        color: 'var(--cream)', badge: dv
      });

      // Eagles
      if (r.eagles > 0) {
        events.push({ ts: rd, id: r.id || 0, name, type: 'eagle',
          text: `made ${r.eagles} eagle${r.eagles > 1 ? 's' : ''} at ${course}`,
          when, color: 'var(--eagle)', badge: 'Eagle', round: r });
      }
      // Birdies (2+)
      if (r.birdies >= 2) {
        events.push({ ts: rd, id: r.id || 0, name, type: 'birdie',
          text: `made ${r.birdies} birdies at ${course}`,
          when, color: 'var(--birdie)', badge: `${r.birdies} Birdies`, round: r });
      }
      // Season-best net round
      const netDiff = r.diff != null ? r.diff - Math.round((p.handicap || 0) * (r.slope || 113) / 113) : null;
      if (netDiff != null) {
        const otherNets = seasonRounds.filter(o => o !== r && o.diff != null).map(o =>
          o.diff - Math.round((p.handicap || 0) * (o.slope || 113) / 113));
        if (otherNets.length > 0 && netDiff < Math.min(...otherNets)) {
          const fmtNet = netDiff === 0 ? 'level par net' : (netDiff > 0 ? '+' + netDiff : netDiff) + ' net';
          events.push({ ts: rd, id: r.id || 0, name, type: 'pb',
            text: `shot their season best (${fmtNet}) at ${course}`,
            when, color: 'var(--gold)', badge: 'PB', round: r });
        }
      }
      // Match play / Sixes / Wolf results
      if (r.matchOutcome?.result || r.matchResult?.result) {
        const result = r.matchOutcome?.result || r.matchResult?.result;
        events.push({ ts: rd, id: r.id || 0, name, type: 'match',
          text: `${result} at ${course}`,
          when, color: 'var(--gold)', badge: 'Match', round: r });
      }
      if (r.wolfResult?.winner) {
        const isWinner = r.wolfResult.winner === name;
        events.push({ ts: rd, id: r.id || 0, name, type: 'wolf',
          text: isWinner ? `won Wolf at ${course}` : `played Wolf at ${course}`,
          when, color: 'var(--gold)', badge: 'Wolf', round: r });
      }
      if (r.sixesResult?.winner) {
        const isWinner = r.sixesResult.winner === name;
        events.push({ ts: rd, id: r.id || 0, name, type: 'sixes',
          text: isWinner ? `won Sixes at ${course}` : `played Sixes at ${course}`,
          when, color: 'var(--par)', badge: 'Sixes', round: r });
      }
    }
  }

  // Sort by date desc, then by ID desc
  events.sort((a, b) => b.ts - a.ts || (b.id - a.id));

  // Deduplicate: for each player+date combo, keep round card + special events only (skip redundant round if special event exists)
  const seen = new Set();
  const deduped = [];
  for (const ev of events) {
    const key = `${ev.name}-${ev.ts}-${ev.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ev);
  }

  if (!deduped.length) {
    feedEl.innerHTML = '<div style="text-align:center;padding:40px 20px;font-size:13px;color:var(--dim)">No activity in the last 30 days. Play a round to get things started.</div>';
    return;
  }

  // Load likes, photos, and comment counts for all round IDs
  const roundIds = deduped.filter(e => e.round?.id).map(e => e.round.id);
  let _feedPhotos = {};
  let _feedCommentCounts = {};
  let _feedCommentPreviews = {};
  if (roundIds.length) {
    try {
      const [likesRes, photosRes, commentsRes] = await Promise.all([
        querySupabase('getLikes', { roundIds }),
        querySupabase('getRoundPhotos', { roundIds }),
        querySupabase('getCommentCounts', { roundIds }),
      ]);
      _feedLikes = likesRes?.likes || {};
      _feedPhotos = photosRes?.photos || {};
      _feedCommentCounts = commentsRes?.counts || {};
      _feedCommentPreviews = commentsRes?.previews || {};
    } catch { _feedLikes = {}; _feedPhotos = {}; _feedCommentCounts = {}; _feedCommentPreviews = {}; }
  }

  // Group by date
  let lastDateStr = '';
  let html = '';
  for (const ev of deduped) {
    // Date header
    const dateKey = String(ev.ts);
    if (dateKey !== lastDateStr) {
      lastDateStr = dateKey;
      html += `<div style="font-size:9px;color:var(--dimmer);text-transform:uppercase;letter-spacing:1.5px;padding:14px 0 6px;font-weight:600">${ev.when}</div>`;
    }

    const isMe = ev.name === state.me;
    const badgeColor = { eagle:'var(--eagle)', birdie:'var(--birdie)', pb:'var(--gold)', match:'var(--gold)', wolf:'var(--gold)', sixes:'var(--par)', round:'var(--dim)' }[ev.type] || 'var(--dim)';

    if (ev.type === 'round') {
      // Rich round card
      const diff = ev.round.diff;
      const diffCol = diff <= -2 ? 'var(--birdie)' : diff === 0 ? 'var(--par)' : diff <= 1 ? 'var(--bogey)' : 'var(--double)';
      const roundId = ev.round?.id || 0;
      const likedByMe = _feedLikes[roundId]?.includes(state.me);
      const likeCount = _feedLikes[roundId]?.length || 0;
      html += `<div class="feed-card" data-round-idx="${deduped.indexOf(ev)}" data-round-id="${roundId}" data-round-player="${ev.name}" style="background:var(--mid);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:6px;cursor:pointer">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          ${avatarHtml(ev.name, 30, isMe)}
          <div style="flex:1;min-width:0">
            <div class="feed-player-name" data-player="${ev.name}" style="font-size:13px;font-weight:600;color:${isMe ? 'var(--gold)' : 'var(--cream)'}">${ev.name}</div>
            <div style="font-size:10px;color:var(--dim)">${ev.text}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-around;text-align:center;padding:6px 0;border-top:1px solid var(--border)">
          <div><div style="font-size:16px;font-weight:700;color:${diffCol}">${ev.badge}</div><div style="font-size:8px;color:var(--dim);text-transform:uppercase;margin-top:1px">vs par</div></div>
          <div><div style="font-size:16px;font-weight:700;color:var(--cream)">${ev.round.totalScore || '—'}</div><div style="font-size:8px;color:var(--dim);text-transform:uppercase;margin-top:1px">score</div></div>
          <div><div style="font-size:16px;font-weight:700;color:var(--gold)">${ev.detail?.split('·')[1]?.trim() || '—'}</div><div style="font-size:8px;color:var(--dim);text-transform:uppercase;margin-top:1px">pts</div></div>
          <div><div style="font-size:16px;font-weight:700;color:var(--birdie)">${ev.round.birdies || 0}</div><div style="font-size:8px;color:var(--dim);text-transform:uppercase;margin-top:1px">birdies</div></div>
        </div>
        ${_feedPhotos[roundId] ? `<div style="margin-top:6px"><img src="${_feedPhotos[roundId]}" style="width:100%;border-radius:8px;max-height:200px;object-fit:cover;cursor:pointer" onclick="var m=document.getElementById('avatar-zoom-modal'),i=document.getElementById('avatar-zoom-img');if(m&&i){i.src=this.src;m.style.display='flex'}"></div>` : ''}
        <div style="display:flex;align-items:center;gap:12px;padding:6px 0 0;border-top:1px solid var(--border);margin-top:6px">
          <button class="feed-like-btn" data-round-id="${roundId}" data-player="${ev.name}" data-course="${ev.course || ''}" data-date="${ev.round?.date || ''}" style="background:none;border:none;cursor:pointer;font-size:12px;color:${likedByMe ? 'var(--double)' : 'var(--dim)'};font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:4px;padding:2px 0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${likedByMe ? 'var(--double)' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span class="like-count">${likeCount > 0 ? likeCount : ''}</span></button>
          <button class="feed-comment-btn" data-round-id="${roundId}" data-player="${ev.name}" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--dim);font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:4px;padding:2px 0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Comment${_feedCommentCounts[roundId] ? ' <span style="color:var(--cream);font-weight:600">(' + _feedCommentCounts[roundId] + ')</span>' : ''}</button>
          ${isMe && !_feedPhotos[roundId] ? `<label class="feed-photo-btn" data-round-id="${roundId}" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--dim);font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:4px;padding:2px 0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>Photo<input type="file" accept="image/*" class="feed-photo-input" data-round-id="${roundId}" style="display:none"></label>` : ''}
        </div>
        ${(_feedCommentPreviews[roundId]?.length) ? `<div style="padding-top:6px;border-top:1px solid var(--border);margin-top:4px">${_feedCommentPreviews[roundId].map(c => `<div style="display:flex;gap:6px;padding:3px 0"><div style="flex:1;min-width:0"><div style="font-size:10px"><span style="color:var(--cream);font-weight:600">${(c.commenter || '').split(' ')[0]}</span> <span style="color:var(--dim)">${c.text}</span></div></div></div>`).join('')}${_feedCommentCounts[roundId] > 2 ? `<div style="font-size:9px;color:var(--dimmer);padding:2px 0;cursor:pointer" class="feed-view-all-comments" data-round-id="${roundId}">View all ${_feedCommentCounts[roundId]} comments</div>` : ''}</div>` : ''}
        <div class="feed-comments-area" data-round-id="${roundId}" style="display:none;padding-top:6px;border-top:1px solid var(--border);margin-top:4px"></div>
      </div>`;
    } else {
      // Event row (birdie, eagle, PB, match, wolf, sixes)
      html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
        ${avatarHtml(ev.name, 28, isMe)}
        <div style="flex:1;min-width:0;font-size:11px;color:var(--dim);line-height:1.4">
          <span style="color:var(--cream);font-weight:600">${ev.name}</span> ${ev.text}
        </div>
        <div style="font-size:9px;padding:2px 8px;border-radius:10px;border:1px solid ${badgeColor};color:${badgeColor};white-space:nowrap;flex-shrink:0">${ev.badge}</div>
      </div>`;
    }
  }

  feedEl.innerHTML = html;

  // Wire player name taps → open profile
  feedEl.querySelectorAll('.feed-player-name').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      import('./players.js').then(m => m.showPlayerProfile(el.dataset.player));
    });
  });

  // Wire round card taps to open scorecard modal
  feedEl.querySelectorAll('.feed-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't open scorecard if clicking like/comment buttons or player name
      if (e.target.closest('.feed-like-btn') || e.target.closest('.feed-comment-btn') || e.target.closest('.feed-comments-area') || e.target.closest('.feed-player-name') || e.target.closest('input') || e.target.closest('button')) return;
      const idx = parseInt(card.dataset.roundIdx);
      const ev = deduped[idx];
      if (ev?.round) openScorecardModal(ev.round);
    });
  });

  // Wire like buttons
  feedEl.querySelectorAll('.feed-like-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const roundId = parseInt(btn.dataset.roundId);
      const player = btn.dataset.player;
      const course = btn.dataset.course || '';
      const date = btn.dataset.date || '';
      const alreadyLiked = _feedLikes[roundId]?.includes(state.me);
      if (alreadyLiked) {
        await querySupabase('unlikeRound', { playerName: state.me, roundId });
        _feedLikes[roundId] = (_feedLikes[roundId] || []).filter(n => n !== state.me);
      } else {
        await querySupabase('likeRound', { playerName: state.me, roundId, roundPlayer: player, roundCourse: course, roundDate: date });
        if (!_feedLikes[roundId]) _feedLikes[roundId] = [];
        _feedLikes[roundId].push(state.me);
      }
      // Update button visually
      const liked = _feedLikes[roundId]?.includes(state.me);
      const count = _feedLikes[roundId]?.length || 0;
      btn.style.color = liked ? 'var(--double)' : 'var(--dim)';
      btn.querySelector('svg').setAttribute('fill', liked ? 'var(--double)' : 'none');
      const countText = count > 0 ? count : '';
      const countEl = btn.querySelector('.like-count');
      if (countEl) countEl.textContent = countText;
    });
  });

  // Wire comment buttons
  feedEl.querySelectorAll('.feed-comment-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const roundId = parseInt(btn.dataset.roundId);
      const player = btn.dataset.player;
      const area = feedEl.querySelector(`.feed-comments-area[data-round-id="${roundId}"]`);
      if (!area) return;
      if (area.style.display !== 'none') { area.style.display = 'none'; return; }
      area.style.display = 'block';
      area.innerHTML = '<div style="font-size:10px;color:var(--dimmer);padding:4px 0">Loading...</div>';
      try {
        const res = await querySupabase('getComments', { roundId });
        const comments = res?.comments || [];
        area.innerHTML = comments.map(c => `
          <div style="display:flex;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">
            ${avatarHtml(c.commenter, 20, c.commenter === state.me)}
            <div style="flex:1;min-width:0">
              <div style="font-size:10px"><span style="color:var(--cream);font-weight:600">${c.commenter?.split(' ')[0]}</span> <span style="color:var(--dim)">${c.text}</span></div>
            </div>
          </div>`).join('') +
          `<div style="display:flex;gap:6px;margin-top:6px">
            <input type="text" class="feed-comment-input" data-round-id="${roundId}" data-player="${player}" placeholder="Write a comment..." style="flex:1;padding:6px 10px;background:var(--navy);color:var(--cream);border:1px solid var(--border);border-radius:8px;font-size:11px;font-family:'DM Sans',sans-serif;outline:none">
            <button class="feed-comment-send" data-round-id="${roundId}" data-player="${player}" style="background:var(--gold);border:none;border-radius:8px;padding:6px 12px;color:var(--navy);font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">Send</button>
          </div>`;
        // Wire send buttons
        area.querySelectorAll('.feed-comment-send').forEach(sendBtn => {
          sendBtn.addEventListener('click', async () => {
            const input = area.querySelector(`.feed-comment-input[data-round-id="${roundId}"]`);
            const text = input?.value?.trim();
            if (!text) return;
            sendBtn.disabled = true; sendBtn.textContent = '...';
            await querySupabase('addComment', { playerName: state.me, roundId, roundPlayer: player, text });
            input.value = '';
            sendBtn.disabled = false; sendBtn.textContent = 'Send';
            // Reload comments
            const r2 = await querySupabase('getComments', { roundId });
            const c2 = r2?.comments || [];
            const commentsHtml = c2.map(c => `
              <div style="display:flex;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">
                ${avatarHtml(c.commenter, 20, c.commenter === state.me)}
                <div style="flex:1;min-width:0"><div style="font-size:10px"><span style="color:var(--cream);font-weight:600">${c.commenter?.split(' ')[0]}</span> <span style="color:var(--dim)">${c.text}</span></div></div>
              </div>`).join('');
            area.querySelector('.feed-comment-input').closest('div').insertAdjacentHTML('beforebegin', commentsHtml.slice(commentsHtml.lastIndexOf('<div style="display:flex;gap:6px;padding:4px 0')));
          });
        });
        // Enter key to send
        area.querySelectorAll('.feed-comment-input').forEach(input => {
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') area.querySelector(`.feed-comment-send[data-round-id="${roundId}"]`)?.click(); });
        });
      } catch {
        area.innerHTML = '<div style="font-size:10px;color:var(--dimmer);padding:4px 0">Could not load comments</div>';
      }
    });
  });

  // Wire "View all comments" links
  feedEl.querySelectorAll('.feed-view-all-comments').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      const roundId = parseInt(link.dataset.roundId);
      const commentBtn = feedEl.querySelector(`.feed-comment-btn[data-round-id="${roundId}"]`);
      if (commentBtn) commentBtn.click();
    });
  });

  // Wire photo upload
  feedEl.querySelectorAll('.feed-photo-input').forEach(input => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const roundId = parseInt(input.dataset.roundId);
      const label = input.closest('.feed-photo-btn');
      if (label) label.innerHTML = '<span style="font-size:10px;color:var(--dim)">Uploading...</span>';
      try {
        // Resize to max 800px wide
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.src = url;
        await new Promise(r => { img.onload = r; });
        const canvas = document.createElement('canvas');
        const maxW = 800;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        const res = await querySupabase('uploadRoundPhoto', { playerName: state.me, roundId, photoBase64: base64, mimeType: 'image/jpeg' });
        if (res?.photoUrl) {
          // Insert photo above the action bar
          const card = input.closest('.feed-card');
          if (card) {
            const photoDiv = document.createElement('div');
            photoDiv.style.cssText = 'margin-top:6px';
            photoDiv.innerHTML = `<img src="${res.photoUrl}" style="width:100%;border-radius:8px;max-height:200px;object-fit:cover">`;
            const actionBar = card.querySelector('[style*="display:flex;align-items:center;gap:12px"]');
            if (actionBar) actionBar.parentElement.insertBefore(photoDiv, actionBar);
          }
          if (label) label.style.display = 'none';
        }
      } catch (e) {
        console.error('[photo upload]', e);
        if (label) label.innerHTML = '<span style="font-size:10px;color:var(--double)">Failed</span>';
      }
    });
  });
}

let _homeStatsCache = { ts: 0, roundCount: 0 };

export function renderHomeStats() {
  const p = state.gd.players[state.me];
  if (!p) {
    console.warn('[renderHomeStats] No player data for', state.me, '— players:', Object.keys(state.gd.players || {}));
    return;
  }
  const rs = p.rounds || [];
  // Skip full recompute if data hasn't changed (same round count, within 60s)
  const rc = rs.length;
  if (_homeStatsCache.roundCount === rc && Date.now() - _homeStatsCache.ts < 60000 && rc > 0) return;
  _homeStatsCache = { ts: Date.now(), roundCount: rc };

  // ── 3a. Hero header ──────────────────────────────────────────
  const hr = new Date().getHours();
  const firstName = state.me.split(' ')[0];
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const seasonRounds = rs.filter(r => { const dp = r.date?.split('/'); return dp && dp[2] === currentYear; });
  const hcpVal = fmtHcp(p.handicap);

  const greetEl = document.getElementById('home-greeting');
  if (greetEl) greetEl.textContent = greeting;
  const nameEl = document.getElementById('home-player-name');
  if (nameEl) nameEl.textContent = firstName;
  const hcpEl = document.getElementById('home-hcp-val');
  if (hcpEl) hcpEl.textContent = hcpVal;
  const avatarEl = document.getElementById('home-avatar');
  if (avatarEl) avatarEl.innerHTML = avatarHtml(state.me, 46, true);
  refreshAvatarUI();
  // Populate app shell header bar
  const hdrGreet = document.getElementById('hdr-greeting');
  if (hdrGreet) hdrGreet.textContent = greeting + ', ' + firstName;
  const hdrMeta = document.getElementById('hdr-meta');
  if (hdrMeta) hdrMeta.textContent = `HCP ${hcpVal} \u00B7 ${seasonRounds.length} round${seasonRounds.length !== 1 ? 's' : ''} this season`;

  // ── Sorted rounds, last 5 (tiebreak by ID so most recently entered wins) ──
  const sorted = [...rs].sort((a, b) => parseDateGB(a.date) - parseDateGB(b.date) || (a.id || 0) - (b.id || 0));
  const last5 = sorted.slice(-5);

  // ── Raw GIR/FIR helpers ──────────────────────────────────────
  function girRaw(rounds) {
    const hits = rounds.reduce((a, r) => a + (r.gir || []).filter(v => v === 'Yes').length, 0);
    const poss = rounds.reduce((a, r) => a + (r.gir || []).filter(v => v === 'Yes' || v === 'No').length, 0);
    return poss ? hits / poss * 100 : null;
  }
  function firRaw(rounds) {
    let hits = 0, poss = 0;
    rounds.forEach(r => { (r.fir || []).forEach((v, h) => { if ((r.pars?.[h]) !== 3) { poss++; if (v === 'Yes') hits++; } }); });
    return poss ? hits / poss * 100 : null;
  }

  // ── Pulse stats row (customisable KPIs) ───────────────────────
  const pulseEl = document.getElementById('home-pulse');
  if (pulseEl) {
    const last10 = sorted.slice(-5);
    const prev10 = sorted.slice(-10, -5);

    const _upArrow = '<svg width="10" height="10" viewBox="0 0 10 10" style="vertical-align:middle"><path d="M5 1L9 6H1Z" fill="currentColor"/></svg>';
    const _dnArrow = '<svg width="10" height="10" viewBox="0 0 10 10" style="vertical-align:middle"><path d="M5 9L1 4H9Z" fill="currentColor"/></svg>';
    function deltaStr(cur, prev, inverted) {
      if (cur === null || prev === null) return '';
      const d = cur - prev;
      if (Math.abs(d) < 0.1) return '<span style="color:var(--dim)">—</span>';
      // inverted=true → lower is better (avg score, putts, doubles)
      // inverted=false → higher is better (FIR%, GIR%, birdies, stableford)
      const improved = inverted ? d < 0 : d > 0;
      const arrow = d > 0 ? _upArrow : _dnArrow;
      return `<span class="${improved ? 'delta-up' : 'delta-dn'}">${arrow} ${Math.abs(d).toFixed(1)}</span>`;
    }

    function avgPuttsPerHole(rounds) {
      // Only include rounds with actual putt data (matches stats page filter)
      const withPutts = rounds.filter(r => (r.putts || []).some(v => v != null && v > 0));
      if (!withPutts.length) return null;
      const vals = withPutts.map(r => (r.putts || []).reduce((s, v) => s + (v || 0), 0) / 18);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    function avgBirdiesPerRound(rounds) {
      if (!rounds.length) return null;
      return rounds.reduce((a, r) => a + (r.birdies || 0), 0) / rounds.length;
    }
    function avgDoublesPerRound(rounds) {
      if (!rounds.length) return null;
      return rounds.reduce((a, r) => a + (r.doubles || 0), 0) / rounds.length;
    }
    function avgStableford(rounds) {
      const hcp = p.handicap || 0;
      const vals = rounds.filter(r => r.scores && r.pars).map(r => calcStableford(r.scores, r.pars, hcp, r.slope, null)).filter(v => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    function avgDiffFn(rounds) {
      const d = rounds.map(r => r.diff).filter(v => v != null && !isNaN(v));
      return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
    }

    const KPI_DEFS = {
      avg_score:  { label: 'Avg score',     fn: avgDiffFn,           fmt: v => (v >= 0 ? '+' : '') + v.toFixed(1), inverted: true,  accent: 'var(--gold)' },
      stableford: { label: 'Avg points',     fn: avgStableford,       fmt: v => v.toFixed(1),                       inverted: false, accent: 'var(--gold)' },
      fir:        { label: 'FIR %',         fn: r => firRaw(r),      fmt: v => Math.round(v) + '%',                inverted: false, accent: 'var(--gold)' },
      gir:        { label: 'GIR %',         fn: r => girRaw(r),      fmt: v => Math.round(v) + '%',                inverted: false, accent: '#3498db' },
      putts:      { label: 'Putts/hole',    fn: avgPuttsPerHole,     fmt: v => v.toFixed(1),                       inverted: true,  accent: '#2ecc71' },
      birdies:    { label: 'Birdies/round', fn: avgBirdiesPerRound,  fmt: v => v.toFixed(1),                       inverted: false, accent: '#3498db' },
      doubles:    { label: 'Doubles/round', fn: avgDoublesPerRound,  fmt: v => v.toFixed(1),                       inverted: true,  accent: '#e74c3c' },
      putts_round:{ label: 'Putts/round',  fn: (rounds) => { const withPutts = rounds.filter(r => (r.putts || []).some(v => v != null && v > 0)); if (!withPutts.length) return null; const t = withPutts.reduce((a, r) => a + (r.putts || []).reduce((s, v) => s + (v || 0), 0), 0); return t / withPutts.length; }, fmt: v => v.toFixed(0), inverted: true, accent: '#2ecc71' },
    };

    const HOME_KPI_LS = 'looper_home_kpis';
    const HOME_KPI_DEFAULT = ['avg_score', 'fir', 'gir'];
    function getHomeKpis() {
      try {
        const s = JSON.parse(localStorage.getItem(HOME_KPI_LS));
        if (Array.isArray(s) && s.length === 3 && s.every(id => KPI_DEFS[id])) return s;
      } catch (_) {}
      return [...HOME_KPI_DEFAULT];
    }

    const activeKpis = getHomeKpis();

    let cellsHtml = '<div style="grid-column:1/-1;font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:-2px">Your stats <span style="text-transform:none;letter-spacing:0;color:var(--dimmer)">· last 5 rounds</span></div>';
    activeKpis.forEach(kpiId => {
      const def = KPI_DEFS[kpiId];
      if (!def) return;
      const cur = def.fn(last10);
      const prev = def.fn(prev10);
      const valStr = cur !== null ? def.fmt(cur) : '—';
      cellsHtml += `<div class="pulse-cell">
        <div class="pulse-val">${valStr}</div>
        <div class="pulse-lbl">${def.label}</div>
        <div class="pulse-delta">${deltaStr(cur, prev, def.inverted)}</div>
        <div class="pulse-accent" style="background:${def.accent}"></div>
      </div>`;
    });

    // Edit icon
    cellsHtml += `<div id="pulse-edit-trigger" style="position:absolute;top:4px;right:4px;cursor:pointer;padding:4px"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="var(--dim)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 2.5a2 2 0 0 1 2.8 2.8L7 14.5l-4 1 1-4z"/></svg></div>`;

    pulseEl.style.position = 'relative';
    pulseEl.innerHTML = cellsHtml;

    // Picker toggle
    document.getElementById('pulse-edit-trigger')?.addEventListener('click', () => {
      let picker = document.getElementById('pulse-kpi-picker');
      if (picker) { picker.style.display = picker.style.display === 'none' ? 'block' : 'none'; return; }

      picker = document.createElement('div');
      picker.id = 'pulse-kpi-picker';
      picker.style.cssText = 'background:var(--mid);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin:8px 16px 0';
      let selected = [...activeKpis];

      function renderPicker() {
        picker.innerHTML = `<div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Choose 3 stats</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${Object.entries(KPI_DEFS).map(([id, def]) => {
            const sel = selected.includes(id);
            return `<button data-kpi="${id}" class="fpill${sel ? ' active' : ''}" style="font-size:11px;padding:5px 12px">${def.label}</button>`;
          }).join('')}</div>
          <button id="pulse-kpi-done" class="btn" style="width:100%;font-size:12px;padding:8px">Done</button>`;

        picker.querySelectorAll('[data-kpi]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.kpi;
            if (selected.includes(id)) {
              if (selected.length <= 3) return; // minimum 3
              selected = selected.filter(x => x !== id);
            } else {
              if (selected.length >= 3) selected.shift(); // remove oldest
              selected.push(id);
            }
            renderPicker();
          });
        });

        picker.querySelector('#pulse-kpi-done')?.addEventListener('click', () => {
          localStorage.setItem(HOME_KPI_LS, JSON.stringify(selected));
          picker.style.display = 'none';
          renderHomeStats();
        });
      }

      renderPicker();
      pulseEl.parentElement.insertBefore(picker, pulseEl.nextSibling);
    });
  }

  // ── 3d. Last round card ──────────────────────────────────────
  const lastRoundEl = document.getElementById('home-last-round');
  if (lastRoundEl) {
    if (!sorted.length) {
      lastRoundEl.innerHTML = _es('flag', 'No rounds yet', 'Play your first round and your stats will build up here automatically.', 'Record a round', "import('./nav.js').then(m=>m.goTo('round'))")
        || '<div style="font-size:12px;color:var(--dimmer);padding:12px 0;text-align:center">No rounds yet</div>';
    } else {
      const r = sorted[sorted.length - 1];
      const diff = r.diff;
      const dv = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : '' + diff);
      const diffCol = diff <= -2 ? 'var(--birdie)' : diff === 0 ? 'var(--par)' : diff <= 1 ? 'var(--bogey)' : 'var(--double)';
      const dot = TC[r.tee]?.d || '#888';
      const shortCourse = (r.course || '').replace(/ Golf Club| Golf Course| Golf Links/g, '');
      const hcp = p.handicap || 0;
      const pts = calcStableford(r.scores, r.pars, hcp, r.slope, null);

      // Net birdies toggle
      const netToggle = localStorage.getItem('looper_net_birdies') === 'true';
      let birdieCount = r.birdies || 0;
      if (netToggle && r.scores && r.pars) {
        const slope = r.slope || 113;
        const php = Math.round(hcp * slope / 113);
        birdieCount = 0;
        for (let h = 0; h < 18; h++) {
          if (r.scores[h] == null || r.pars[h] == null) continue;
          const str = Math.floor(php / 18) + ((h + 1) <= (php % 18) ? 1 : 0);
          if ((r.scores[h] - str) - r.pars[h] === -1) birdieCount++;
        }
      }

      const puttsArr = (r.putts || []).filter(v => v != null && !isNaN(v));
      const avgPutts = puttsArr.length ? (puttsArr.reduce((a, b) => a + b, 0) / puttsArr.length).toFixed(1) : '—';

      lastRoundEl.innerHTML = `
        <div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Latest round</div>
        <div style="background:var(--mid);border:1px solid var(--border);border-radius:14px;padding:14px 16px;cursor:pointer" id="home-last-round-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-size:14px;font-weight:600;color:var(--cream)">${shortCourse}</div>
            <div style="font-size:10px;color:var(--dim)">${r.date} · <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dot};vertical-align:middle"></span> ${r.tee || ''}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;text-align:center;gap:0">
            <div style="border-right:1px solid var(--border);padding:4px 0">
              <div style="font-size:18px;font-weight:700;color:${diffCol}">${dv}</div>
              <div style="font-size:9px;color:var(--dim);text-transform:uppercase;margin-top:2px">vs par</div>
            </div>
            <div style="border-right:1px solid var(--border);padding:4px 0">
              <div style="font-size:18px;font-weight:700;color:var(--gold)">${pts ?? '—'}</div>
              <div style="font-size:9px;color:var(--dim);text-transform:uppercase;margin-top:2px">pts</div>
            </div>
            <div style="border-right:1px solid var(--border);padding:4px 0">
              <div style="font-size:18px;font-weight:700;color:var(--birdie)">${birdieCount}</div>
              <div style="font-size:9px;color:var(--dim);text-transform:uppercase;margin-top:2px">${netToggle ? 'net' : ''} birdies</div>
            </div>
            <div style="padding:4px 0">
              <div style="font-size:18px;font-weight:700;color:var(--cream)">${avgPutts}</div>
              <div style="font-size:9px;color:var(--dim);text-transform:uppercase;margin-top:2px">putts/hole</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
            <div style="font-size:11px;color:var(--gold);cursor:pointer" id="home-view-review">View AI review →</div>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:10px;color:var(--dim)">Net birdies
              <span id="home-net-toggle" style="display:inline-block;width:22px;height:12px;border-radius:6px;background:${netToggle ? 'var(--gold)' : 'var(--border)'};position:relative;cursor:pointer;transition:background .2s"><span style="position:absolute;top:1px;${netToggle ? 'left:11px' : 'left:1px'};width:10px;height:10px;border-radius:50%;background:var(--cream);transition:left .2s"></span></span>
            </label>
          </div>
        </div>`;

      document.getElementById('home-last-round-card')?.addEventListener('click', e => {
        if (e.target.closest('#home-view-review') || e.target.closest('#home-net-toggle') || e.target.closest('label')) return;
        openScorecardModal(r);
      });
      document.getElementById('home-view-review')?.addEventListener('click', e => {
        e.stopPropagation();
        import('./nav.js').then(m => m.goTo('stats'));
      });
      document.getElementById('home-net-toggle')?.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        const cur = localStorage.getItem('looper_net_birdies') === 'true';
        localStorage.setItem('looper_net_birdies', !cur);
        renderHomeStats();
      });
    }
  }

  // ── 3e. Group activity feed ──────────────────────────────────
  renderMatesFeed();

  // "See more" link → activity feed
  document.getElementById('home-see-all-activity')?.addEventListener('click', () => {
    import('./nav.js').then(m => m.goTo('feed'));
  });

  // ── 3f. Start a round CTA subtitle ───────────────────────────
  const ctaSub = document.getElementById('home-cta-sub');
  if (ctaSub && sorted.length) {
    const last = sorted[sorted.length - 1];
    const shortC = (last.course || '').replace(/ Golf Club| Golf Course| Golf Links/g, '');
    ctaSub.textContent = shortC ? `Last played ${shortC}` : '';
  }

  // ── 3g. Weather forecast card ───────────────────────────────
  import('./weather.js').then(m => m.renderWeatherCard('weather-container')).catch(() => {});
}

function isRoundComplete(r) {
  const puttsOk = (r.putts || []).some(v => v != null && v !== '' && !isNaN(v));
  const firOk = (r.fir || []).some(v => v === 'Yes' || v === 'No' || v === 'N/A');
  const girOk = (r.gir || []).some(v => v === 'Yes' || v === 'No');
  return puttsOk && firOk && girOk;
}

function populateRoundSelector() {
  const sel = document.getElementById('ai-round-sel');
  if (!sel) return;
  const rs = (state.gd.players[state.me]?.rounds || []);
  if (!rs.length) { sel.innerHTML = '<option>No rounds yet</option>'; return; }
  const sorted = [...rs.map((r, i) => ({ r, i }))].sort((a, b) => parseDateGB(b.r.date) - parseDateGB(a.r.date)).slice(0, 10);
  const roundOpts = sorted.map(({ r, i }) => {
    const complete = isRoundComplete(r);
    const label = `${r.date} \u2014 ${r.course} (${r.diff >= 0 ? '+' : ''}${r.diff})${complete ? '' : ' \u26a0 limited data'}`;
    return `<option value="${i}">${label}</option>`;
  }).join('');
  const qualifyingRounds = rs.filter(isRoundComplete);
  const has5 = qualifyingRounds.length >= 5;
  sel.innerHTML = roundOpts + (has5 ? '<option value="last5">\u2014 Analyse last 5 qualifying rounds \u2014</option>' : '');
}

function renderPastAIReviews() {
  const wrap = document.getElementById('ai-past-reviews');
  const list = document.getElementById('ai-past-list');
  if (!wrap || !list) return;
  const rs = (state.gd.players[state.me]?.rounds || []);
  const withReviews = [...rs]
    .filter(r => r.aiReview && (r.aiReview.positive || r.aiReview.negative || r.aiReview.drill))
    .sort((a, b) => parseDateGB(b.date) - parseDateGB(a.date))
    .slice(0, 5);
  if (!withReviews.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  list.innerHTML = withReviews.map((r, idx) => {
    const shortCourse = (r.course || '').replace(' Golf Club', '').replace(' Golf Course', '').replace(' Golf Links', '');
    const id = `apr-${idx}`;
    return `<div style="border:1px solid var(--wa-07);border-radius:10px;overflow:hidden;margin-bottom:8px">
      <div onclick="document.getElementById('${id}').style.display=document.getElementById('${id}').style.display==='none'?'block':'none'" style="padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:var(--wa-03)">
        <span style="font-size:12px;font-weight:500;color:var(--cream)">${shortCourse}</span>
        <span style="font-size:11px;color:var(--dim)">${r.date}</span>
      </div>
      <div id="${id}" style="display:none;padding:12px;background:rgba(201,168,76,.04)">
        ${r.aiReview.positive ? `<div style="margin-bottom:8px"><div style="font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--par);margin-bottom:4px">What you did well</div><div style="font-size:12px;color:var(--cream);line-height:1.6">${r.aiReview.positive}</div></div>` : ''}
        ${r.aiReview.negative ? `<div style="margin-bottom:8px;border-top:1px solid var(--wa-07);padding-top:8px"><div style="font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--bogey);margin-bottom:4px">Area to improve</div><div style="font-size:12px;color:var(--cream);line-height:1.6">${r.aiReview.negative}</div></div>` : ''}
        ${r.aiReview.drill ? `<div style="border-top:1px solid var(--wa-07);padding-top:8px"><div style="font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--birdie);margin-bottom:4px">Practice drill</div><div style="font-size:12px;color:var(--cream);line-height:1.6">${r.aiReview.drill}</div></div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Self-service round deletion ───────────────────────────────────
// Deletion only removes the round from the deleting player's own profile.
// Other players' round objects are completely untouched — do not search or
// modify any other player's rounds array.

const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V6"/><path d="M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

function bindDeleteZone(delZone, r) {
  delZone.innerHTML = `<button class="btn btn-ghost" style="width:auto;padding:6px 8px" title="Delete round">${TRASH_SVG}</button>`;
  delZone.querySelector('button').addEventListener('click', e => {
    e.stopPropagation();
    showDeleteConfirmInline(delZone, r);
  });
}

function showDeleteConfirmInline(delZone, r) {
  delZone.innerHTML = `
    <div style="display:flex;align-items:center;gap:4px;white-space:nowrap">
      <span style="font-size:10px;color:var(--dim)">Delete?</span>
      <button class="btn btn-ghost" style="width:auto;padding:3px 8px;font-size:10px;border-color:rgba(231,76,60,.4);color:var(--double)" data-del-yes>Yes</button>
      <button class="btn btn-ghost" style="width:auto;padding:3px 8px;font-size:10px" data-del-no>No</button>
    </div>`;
  delZone.querySelector('[data-del-yes]').addEventListener('click', e => {
    e.stopPropagation();
    showDeleteRoundModal(r);
  });
  delZone.querySelector('[data-del-no]').addEventListener('click', e => {
    e.stopPropagation();
    bindDeleteZone(delZone, r);
  });
}

function showDeleteRoundModal(r) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.65)';
  const sheet = document.createElement('div');
  sheet.style.cssText = 'background:var(--mid);border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.5)';
  sheet.innerHTML = `
    <div style="font-size:9px;letter-spacing:2px;color:var(--double);text-transform:uppercase;margin-bottom:12px">Delete Round</div>
    <div style="font-size:13px;color:var(--dim);line-height:1.6;margin-bottom:20px">
      Permanently delete your <strong style="color:var(--cream)">${r.course}</strong> round on <strong style="color:var(--cream)">${r.date}</strong>?
      <br><br>This cannot be undone and only affects your data — other players who played that day keep their own rounds.
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost" data-cancel style="flex:1">Cancel</button>
      <button class="btn" data-confirm style="flex:1;background:var(--double);color:#fff;border-color:var(--double)">Delete permanently</button>
    </div>`;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  sheet.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
  sheet.querySelector('[data-confirm]').addEventListener('click', () => {
    overlay.remove();
    deletePlayerRound(r);
  });
}

function deletePlayerRound(r) {
  const player = state.gd.players[state.me];
  if (!player) return;
  const idx = player.rounds.findIndex(round => round.id === r.id);
  if (idx === -1) return;
  if (!state.gd.deletionLog) state.gd.deletionLog = [];
  state.gd.deletionLog.push({
    deletedBy: state.me,
    player: state.me,
    course: r.course,
    date: r.date,
    score: r.totalScore,
    diff: r.diff,
    deletedAt: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  });
  player.rounds.splice(idx, 1);
  pushData(); // single call per deletion
  pushSupabase('deleteRound', { roundId: r.id }); // fire-and-forget Supabase sync
  renderStats();
}

export function renderStats() {
  const p = state.gd.players[state.me];
  if (!p) return;
  const allRounds = p.rounds || [];

  const hcp = p.handicap;
  const hcpEl = document.getElementById('st-hcp-display');
  if (hcpEl) hcpEl.textContent = fmtHcp(hcp);

  // 4a. Page header — player name
  const nameEl = document.getElementById('st-player-name');
  if (nameEl) nameEl.textContent = state.me + "'s game";

  populateCourseFilter(allRounds);

  const rs = getFilteredRounds(allRounds);
  const allSorted = [...allRounds].sort((a, b) => parseDateGB(a.date) - parseDateGB(b.date));
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const sc = rs.map(r => r.totalScore).filter(Boolean);
  const diffs = rs.map(r => r.diff).filter(v => v != null);

  document.getElementById('st-rounds').textContent = allRounds.length;
  document.getElementById('st-avg').textContent = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : '—';
  const avgDiff = diffs.length ? +(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1) : null;
  const avgDiffEl = document.getElementById('st-avg-diff');
  if (avgDiffEl) {
    avgDiffEl.textContent = avgDiff != null ? (avgDiff >= 0 ? '+' + avgDiff : avgDiff.toString()) : '—';
    avgDiffEl.style.color = avgDiff < 0 ? 'var(--birdie)' : avgDiff > 0 ? 'var(--bogey)' : 'var(--cream)';
  }
  document.getElementById('st-best').textContent = sc.length ? Math.min(...sc) : '—';

  const fullR = rs.filter(r => (r.scores || []).filter(Boolean).length === 18);
  const girTot = fullR.reduce((a, r) => a + (r.gir || []).filter(v => v === 'Yes').length, 0);
  const girPoss = fullR.reduce((a, r) => a + (r.gir || []).filter(v => v === 'Yes' || v === 'No').length, 0);
  document.getElementById('st-gir').textContent = girPoss ? Math.round(girTot / girPoss * 100) + '%' : '—';

  const has = rs.length > 0;
  document.getElementById('c-bd').style.display = has ? 'block' : 'none';
  document.getElementById('c-trend').style.display = rs.length > 1 ? 'block' : 'none';
  document.getElementById('c-holes').style.display = fullR.length > 0 ? 'block' : 'none';
  const aiCard = document.getElementById('c-ai-review');
  if (aiCard) { aiCard.style.display = allRounds.length > 0 ? 'block' : 'none'; }
  if (allRounds.length > 0) { populateRoundSelector(); renderPastAIReviews(); }

  const statsCard = document.getElementById('c-ai-stats');
  if (statsCard) {
    const totalRounds = (state.gd.players[state.me]?.rounds || []).length;
    statsCard.style.display = totalRounds >= 5 ? 'block' : 'none';
    if (totalRounds >= 5) {
      const label = document.getElementById('ai-stats-label');
      if (label) label.textContent = `Based on last 5 of ${totalRounds} rounds`;
      const saved = state.gd.players[state.me]?.statsAnalysis;
      if (saved) {
        document.getElementById('ai-stats-positive').textContent = saved.positive || '';
        document.getElementById('ai-stats-negative').textContent = saved.negative || '';
        document.getElementById('ai-stats-drill').textContent = saved.drill || '';
        document.getElementById('ai-stats-handicap').textContent = saved.handicap || '';
        document.getElementById('ai-stats-output').style.display = 'block';
        const date = state.gd.players[state.me]?.statsAnalysisDate;
        if (date) document.getElementById('ai-stats-msg').innerHTML = `<div style="font-size:10px;color:var(--dimmer);margin-top:6px">Last analysed ${date}</div>`;
      }
    }
  }
  // c-putts and c-fg visibility controlled within their respective chart blocks below

  if (has) {
    const tE = rs.reduce((a, r) => a + (r.eagles || 0), 0);
    const tB = rs.reduce((a, r) => a + (r.birdies || 0), 0);
    const tP = rs.reduce((a, r) => a + (r.parsCount || 0), 0);
    const tBo = rs.reduce((a, r) => a + (r.bogeys || 0), 0);
    const tD = rs.reduce((a, r) => a + (r.doubles || 0), 0);
    const total = tE + tB + tP + tBo + tD;
    const maxCount = Math.max(tE, tB, tP, tBo, tD, 1);
    const holesPlayed = fullR.length * 18;

    // 4b. Proportional bars
    const bdPills = document.getElementById('bd-pills');
    if (bdPills) {
      const bars = [
        { count: tE, label: 'Eagle', color: 'var(--eagle)' },
        { count: tB, label: 'Birdie', color: 'var(--birdie)' },
        { count: tP, label: 'Par', color: 'var(--par)' },
        { count: tBo, label: 'Bogey', color: 'var(--bogey)' },
        { count: tD, label: 'Dbl+', color: 'var(--double)' },
      ];
      const maxBarH = 70; // max bar height in px
      bdPills.innerHTML = bars.map(b => {
        const h = maxCount > 0 ? Math.max(Math.round(b.count / maxCount * maxBarH), 4) : 4;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;justify-content:flex-end">
          <div style="font-size:11px;font-weight:600;color:${b.color}">${b.count}</div>
          <div style="width:100%;height:${h}px;background:${b.color};border-radius:4px"></div>
          <div style="font-size:8px;color:var(--dim);text-transform:uppercase">${b.label}</div>
        </div>`;
      }).join('');
    }
    const bdMeta = document.getElementById('bd-meta');
    if (bdMeta) bdMeta.textContent = `${rs.length} rounds · ${holesPlayed} holes`;

    // Callouts: avg pts, avg vs par, handicap
    const stabPts = rs.filter(r => r.scores && r.pars).map(r => calcStableford(r.scores, r.pars, hcp || 0, r.slope, null)).filter(v => v != null);
    const avgStab = stabPts.length ? (stabPts.reduce((a, b) => a + b, 0) / stabPts.length).toFixed(1) : '—';
    const avgDiffDisp = avgDiff != null ? (avgDiff >= 0 ? '+' + avgDiff : '' + avgDiff) : '—';
    const bdCallouts = document.getElementById('bd-callouts');
    if (bdCallouts) {
      bdCallouts.innerHTML = `
        <div class="chart-callout"><div class="chart-callout-val" style="color:var(--gold)">${avgStab}</div><div class="chart-callout-lbl">avg pts</div></div>
        <div class="chart-callout"><div class="chart-callout-val" style="color:var(--bogey)">${avgDiffDisp}</div><div class="chart-callout-lbl">avg vs par</div></div>
        <div class="chart-callout"><div class="chart-callout-val" style="color:#3498db">${fmtHcp(hcp)}</div><div class="chart-callout-lbl">handicap</div></div>`;
    }
    dc('donut');
  }

  if (rs.length > 1) {
    dc('trend');
    const trendGrid = cc('--chart-grid');

    // Season average (precise float for line + point colouring)
    const avgDiffPrecise = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;

    // Colour each point: below avg = good (green), above avg = bad (red), on avg = gold
    const ptColors = rs.map(r => {
      if (avgDiffPrecise === null || r.diff == null) return '#c9a84c';
      if (r.diff < avgDiffPrecise) return '#2ecc71';   // var(--par)
      if (r.diff > avgDiffPrecise) return '#e74c3c';   // var(--double)
      return '#c9a84c';                                  // var(--gold) — exactly on avg
    });

    CH.trend = new Chart(document.getElementById('ch-trend'), {
      type: 'line',
      data: {
        labels: rs.map(r => { const dp = r.date?.split('/'); return dp ? dp[0] + '/' + dp[1] : r.date?.slice(0, 5); }),
        datasets: [
          {
            label: 'Score',
            data: rs.map(r => r.diff),
            borderColor: '#c9a84c',
            backgroundColor: 'rgba(201,168,76,.08)',
            tension: .35,
            pointBackgroundColor: ptColors,
            pointRadius: 5, pointHoverRadius: 8, hitRadius: 25, pointBorderWidth: 0, fill: true
          },
          {
            label: 'Season avg',
            data: avgDiffPrecise !== null ? rs.map(() => avgDiffPrecise) : [],
            borderColor: cc('--gold'),
            borderDash: [6, 4],
            backgroundColor: 'transparent',
            pointRadius: 0, pointHoverRadius: 0, hitRadius: 0,
            tension: 0, fill: false
          },
          {
            label: 'Hcp avg',
            data: rs.map(() => getBenchmark(hcp).avgVsPar),
            borderColor: 'rgba(255,255,255,0.2)',
            borderDash: [6, 4],
            backgroundColor: 'transparent',
            pointRadius: 0, pointHoverRadius: 0, hitRadius: 0,
            tension: 0, fill: false
          }
        ]
      },
      options: {
        ...co(),
        plugins: {
          legend: { display: true, position: 'top', labels: { color: cc('--chart-tick'), font: { size: 10 }, boxWidth: 10, padding: 8 } },
          tooltip: {
            filter: item => item.datasetIndex === 0,
            callbacks: {
              title: items => rs[items[0].dataIndex]?.course || '',
              label: c => {
                const r = rs[c.dataIndex];
                const sign = r.diff >= 0 ? '+' : '';
                return [`Score: ${r.totalScore ?? '—'}`, `${sign}${r.diff} vs par`];
              },
              labelTextColor: c => {
                const d = rs[c.dataIndex]?.diff;
                return d < 0 ? '#2ecc71' : d > 0 ? '#e74c3c' : '#c9a84c';
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: cc('--chart-tick'), font: { size: 11 } }, grid: { color: trendGrid } },
          y: { ticks: { color: cc('--chart-tick'), font: { size: 11 }, stepSize: 1, callback: v => { if (!Number.isInteger(v)) return null; return (v > 0 ? '+' : '') + v; } }, grid: { color: trendGrid } }
        }
      }
    });

    // 4c. Callout row below trend chart
    const bestDiff = diffs.length ? Math.min(...diffs) : null;
    const avgDiffRaw = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
    const trendInsight = document.getElementById('trend-insight-grid');
    if (trendInsight) {
      const bestCol = bestDiff != null && bestDiff < 0 ? 'var(--birdie)' : 'var(--cream)';
      const avgCol = avgDiffRaw != null ? (avgDiffRaw < 0 ? 'var(--birdie)' : avgDiffRaw > 3 ? 'var(--double)' : 'var(--bogey)') : 'var(--cream)';
      const bm = getBenchmark(hcp);
      trendInsight.className = 'chart-callout-row';
      trendInsight.innerHTML = `
        <div class="chart-callout"><div class="chart-callout-val" style="color:${bestCol}">${bestDiff != null ? (bestDiff >= 0 ? '+' : '') + bestDiff : '—'}</div><div class="chart-callout-lbl">Best round this period</div></div>
        <div class="chart-callout"><div class="chart-callout-val" style="color:${avgCol}">${avgDiffRaw != null ? (avgDiffRaw >= 0 ? '+' : '') + avgDiffRaw.toFixed(1) : '—'}</div><div class="chart-callout-lbl">Avg vs par</div></div>
        <div class="chart-callout"><div class="chart-callout-val" style="color:var(--dimmer)">+${bm.avgVsPar}</div><div class="chart-callout-lbl" title="Average for a ${fmtHcp(hcp)} handicap golfer — source: USGA/R&A research data">Hcp avg</div></div>`;
    }
  }

  // Defer below-fold charts so the page is interactive immediately
  setTimeout(() => { _renderDeferredCharts(fullR, rs, allSorted, hcp, MONTHS_SHORT); }, 50);

function _renderDeferredCharts(fullR, rs, allSorted, hcp, MONTHS_SHORT) {
  if (fullR.length) {
    const hA = Array.from({ length: 18 }, (_, h) => { const vs = fullR.map(r => r.scores[h] - r.pars[h]); return +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2); });
    dc('holes');
    const holesGrid = cc('--chart-grid');
    CH.holes = new Chart(document.getElementById('ch-holes'), {
      type: 'bar',
      data: { labels: Array.from({ length: 18 }, (_, i) => i + 1), datasets: [{ data: hA, backgroundColor: hA.map(v => v <= -2 ? '#f1c40f' : v < 0 ? '#3498db' : v === 0 ? '#2ecc71' : v <= 1 ? '#e67e22' : '#e74c3c'), borderRadius: 3 }] },
      options: {
        ...co(),
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: items => `Hole ${items[0].label}`,
            label: c => `Avg: ${c.raw >= 0 ? '+' : ''}${c.raw} vs par (${fullR.length} rounds)`
          }}
        },
        scales: {
          x: { ticks: { color: cc('--chart-tick'), font: { size: 11 } }, grid: { color: holesGrid } },
          y: { ticks: { color: cc('--chart-tick'), font: { size: 11 }, stepSize: 0.5, callback: v => { if (Math.round(v * 2) !== v * 2) return null; const f = parseFloat(v.toFixed(1)); return (v > 0 ? '+' : '') + f; } }, grid: { color: holesGrid } }
        }
      }
    });

    // Putting trend chart — total putts per round (last 10 rounds with any putts data)
    const puttsRounds = allSorted.filter(r => (r.putts || []).some(v => v != null && v > 0)).slice(-10);
    document.getElementById('c-putts').style.display = puttsRounds.length > 0 ? 'block' : 'none';
    if (puttsRounds.length > 0) {
      const ptLabels = puttsRounds.map(r => {
        const dp = r.date?.split('/');
        return dp && dp.length === 3 ? MONTHS_SHORT[parseInt(dp[1], 10) - 1] + ' ' + parseInt(dp[0], 10) : r.date?.slice(0, 5) || '';
      });
      const ptData = puttsRounds.map(r => (r.putts || []).reduce((a, v) => a + (v || 0), 0));
      const ptMax = Math.max(...ptData) + 2;
      dc('putts');
      const puttsGrid = cc('--chart-grid');
      CH.putts = new Chart(document.getElementById('ch-putts'), {
        type: 'line',
        data: {
          labels: ptLabels,
          datasets: [{
            label: 'Total putts',
            data: ptData,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52,152,219,.08)',
            pointBackgroundColor: '#c9a84c',
            pointRadius: 5, pointHoverRadius: 8, hitRadius: 20, pointBorderWidth: 0,
            tension: .3, fill: true
          },
          {
            label: 'Hcp avg',
            data: puttsRounds.map(() => Math.round(getBenchmark(hcp).puttsPerHole * 18)),
            borderColor: 'rgba(255,255,255,0.2)', borderDash: [6, 4],
            backgroundColor: 'transparent', pointRadius: 0, pointHoverRadius: 0, hitRadius: 0,
            tension: 0, fill: false
          }]
        },
        options: {
          ...co(),
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              title: items => { const r = puttsRounds[items[0].dataIndex]; return [r.date, r.course || '']; },
              label: c => c.raw + ' putts'
            }}
          },
          scales: {
            x: { ticks: { color: cc('--chart-tick'), font: { size: 11 } }, grid: { color: puttsGrid } },
            y: { min: 20, max: ptMax, ticks: { color: cc('--chart-tick'), font: { size: 11 }, stepSize: 1, callback: v => Number.isInteger(v) ? v : null }, grid: { color: puttsGrid } }
          }
        }
      });
      // 4e. Putts callout row
      const totalPuttsSum = ptData.reduce((a, b) => a + b, 0);
      const avgPuttsRound = totalPuttsSum / ptData.length;
      const avgPuttsHole = avgPuttsRound / 18;
      const puttsInsight = document.getElementById('putts-insight-grid');
      if (puttsInsight) {
        const pBm = getBenchmark(hcp);
        puttsInsight.className = 'chart-callout-row';
        puttsInsight.innerHTML = `
          <div class="chart-callout"><div class="chart-callout-val" style="color:var(--par)">${avgPuttsHole.toFixed(2)}</div><div class="chart-callout-lbl">Avg putts / hole</div></div>
          <div class="chart-callout"><div class="chart-callout-val" style="color:var(--cream)">${avgPuttsRound.toFixed(1)}</div><div class="chart-callout-lbl">Avg putts / round</div></div>
          <div class="chart-callout"><div class="chart-callout-val" style="color:var(--dimmer)">${pBm.puttsPerHole}</div><div class="chart-callout-lbl" title="Average for a ${fmtHcp(hcp)} handicap golfer — source: USGA/R&A research data">Hcp avg</div></div>`;
      }
    }

    // ── 3d. Birdies & doubles trend chart ───────────────────────────
    const bdRounds = allSorted.filter(r => r.birdies != null || r.doubles != null).slice(-10);
    const cBd = document.getElementById('c-birdies-doubles');
    if (cBd) cBd.style.display = bdRounds.length > 0 ? 'block' : 'none';
    dc('birdiesDoubles');
    if (bdRounds.length > 0) {
      const bdLabels = bdRounds.map(r => {
        const dp = r.date?.split('/');
        return dp && dp.length === 3 ? MONTHS_SHORT[parseInt(dp[1], 10) - 1] + ' ' + parseInt(dp[0], 10) : r.date?.slice(0, 5) || '';
      });
      const bdBirdies = bdRounds.map(r => r.birdies || 0);
      const bdDoubles = bdRounds.map(r => r.doubles || 0);
      const bdBm = getBenchmark(hcp);
      const bdGrid = cc('--chart-grid');

      // Update header values
      const bdHdr = document.getElementById('bd-hdr-vals');
      if (bdHdr) {
        const avgB = bdBirdies.length ? (bdBirdies.reduce((a, b) => a + b, 0) / bdBirdies.length).toFixed(1) : '—';
        const avgD = bdDoubles.length ? (bdDoubles.reduce((a, b) => a + b, 0) / bdDoubles.length).toFixed(1) : '—';
        bdHdr.innerHTML = `<span style="color:#3498db">${avgB}</span> <span style="color:var(--dimmer)">/</span> <span style="color:#e74c3c">${avgD}</span>`;
      }

      CH.birdiesDoubles = new Chart(document.getElementById('ch-birdies-doubles'), {
        type: 'line',
        data: {
          labels: bdLabels,
          datasets: [
            {
              label: 'Birdies',
              data: bdBirdies,
              borderColor: '#3498db', pointBackgroundColor: '#3498db',
              tension: 0.35, pointRadius: 4, pointHoverRadius: 7, hitRadius: 20, pointBorderWidth: 0,
              fill: false
            },
            {
              label: 'Doubles',
              data: bdDoubles,
              borderColor: '#e74c3c', pointBackgroundColor: '#e74c3c',
              borderDash: [4, 3],
              tension: 0.35, pointRadius: 4, pointHoverRadius: 7, hitRadius: 20, pointBorderWidth: 0,
              fill: false
            },
            {
              label: 'Hcp birdie avg',
              data: bdRounds.map(() => bdBm.birdiesPerRound),
              borderColor: 'rgba(52,152,219,0.2)', borderDash: [6, 4],
              backgroundColor: 'transparent', pointRadius: 0, pointHoverRadius: 0, hitRadius: 0,
              tension: 0, fill: false
            },
            {
              label: 'Hcp double avg',
              data: bdRounds.map(() => bdBm.doublesPerRound),
              borderColor: 'rgba(231,76,60,0.2)', borderDash: [6, 4],
              backgroundColor: 'transparent', pointRadius: 0, pointHoverRadius: 0, hitRadius: 0,
              tension: 0, fill: false
            }
          ]
        },
        options: {
          ...co(),
          plugins: {
            legend: { display: true, position: 'top', labels: { color: cc('--chart-tick'), font: { size: 10 }, boxWidth: 10, padding: 8 } },
            tooltip: {
              filter: item => item.datasetIndex < 2,
              callbacks: {
                title: items => { const r = bdRounds[items[0].dataIndex]; return [r.date, r.course || '']; },
                label: c => c.dataset.label + ': ' + c.raw
              }
            }
          },
          scales: {
            x: { ticks: { color: cc('--chart-tick'), font: { size: 11 } }, grid: { color: bdGrid } },
            y: { min: 0, ticks: { color: cc('--chart-tick'), font: { size: 11 }, stepSize: 1 }, grid: { color: bdGrid } }
          }
        }
      });

      // Callout row
      const bdCallout = document.getElementById('bd-trend-callout');
      if (bdCallout) {
        const avgBR = bdBirdies.reduce((a, b) => a + b, 0) / bdBirdies.length;
        const avgDR = bdDoubles.reduce((a, b) => a + b, 0) / bdDoubles.length;
        bdCallout.innerHTML = `
          <div class="chart-callout"><div class="chart-callout-val" style="color:#3498db">${avgBR.toFixed(1)}</div><div class="chart-callout-lbl">Avg birdies / round</div></div>
          <div class="chart-callout"><div class="chart-callout-val" style="color:#e74c3c">${avgDR.toFixed(1)}</div><div class="chart-callout-lbl">Avg doubles / round</div></div>
          <div class="chart-callout"><div class="chart-callout-val" style="color:var(--dimmer)">${bdBm.birdiesPerRound}</div><div class="chart-callout-lbl" title="Average for a ${fmtHcp(hcp)} handicap golfer — source: USGA/R&A research data">Hcp birdie avg</div></div>
          <div class="chart-callout"><div class="chart-callout-val" style="color:var(--dimmer)">${bdBm.doublesPerRound}</div><div class="chart-callout-lbl" title="Average for a ${fmtHcp(hcp)} handicap golfer — source: USGA/R&A research data">Hcp double avg</div></div>`;
      }
    }

  }

  // ── Combined FIR & GIR dual trend line chart (ch-fg) ─────────────
  {
    const fgRounds = allSorted.filter(r =>
      (r.fir || []).some(v => v === 'Yes' || v === 'No') ||
      (r.gir || []).some(v => v === 'Yes' || v === 'No')
    ).slice(-10);
    const cFg = document.getElementById('c-fg');
    if (cFg) cFg.style.display = fgRounds.length > 0 ? 'block' : 'none';
    dc('fg');
    if (fgRounds.length > 0) {
      const fgLabels = fgRounds.map(r => {
        const dp = r.date?.split('/');
        return dp && dp.length === 3 ? dp[0] + '/' + dp[1] : r.date?.slice(0, 5) || '';
      });
      const firData = fgRounds.map(r => {
        const fir = r.fir || [];
        const poss = fir.filter(v => v === 'Yes' || v === 'No').length;
        if (!poss) return null;
        return +(fir.filter(v => v === 'Yes').length / poss * 100).toFixed(1);
      });
      const girData = fgRounds.map(r => {
        const gir = r.gir || [];
        const poss = gir.filter(v => v === 'Yes' || v === 'No').length;
        if (!poss) return null;
        return +(gir.filter(v => v === 'Yes').length / poss * 100).toFixed(1);
      });
      const fgGrid = cc('--chart-grid');
      CH.fg = new Chart(document.getElementById('ch-fg'), {
        type: 'line',
        data: {
          labels: fgLabels,
          datasets: [
            {
              label: 'FIR %',
              data: firData,
              borderColor: '#3498db', backgroundColor: 'transparent',
              tension: 0.3, pointRadius: 5, pointHoverRadius: 8, hitRadius: 20,
              pointBackgroundColor: '#3498db', pointBorderWidth: 0,
              fill: false, spanGaps: false
            },
            {
              label: 'GIR %',
              data: girData,
              borderColor: '#2ecc71', backgroundColor: 'transparent',
              tension: 0.3, pointRadius: 5, pointHoverRadius: 8, hitRadius: 20,
              pointBackgroundColor: '#2ecc71', pointBorderWidth: 0,
              fill: false, spanGaps: false
            },
            {
              label: 'Hcp FIR',
              data: fgRounds.map(() => getBenchmark(hcp).fir),
              borderColor: 'rgba(201,168,76,0.2)', borderDash: [6, 4],
              backgroundColor: 'transparent', pointRadius: 0, pointHoverRadius: 0, hitRadius: 0,
              tension: 0, fill: false
            },
            {
              label: 'Hcp GIR',
              data: fgRounds.map(() => getBenchmark(hcp).gir),
              borderColor: 'rgba(52,152,219,0.2)', borderDash: [6, 4],
              backgroundColor: 'transparent', pointRadius: 0, pointHoverRadius: 0, hitRadius: 0,
              tension: 0, fill: false
            }
          ]
        },
        options: {
          ...co(),
          plugins: {
            legend: { display: true, position: 'top', labels: { color: cc('--chart-tick'), font: { size: 10 }, boxWidth: 10, padding: 8 } },
            tooltip: {
              filter: item => item.datasetIndex < 2,
              callbacks: {
              title: items => { const r = fgRounds[items[0].dataIndex]; return [r.date, r.course || '']; },
              label: c => c.dataset.label + ': ' + (c.raw !== null ? c.raw + '%' : '—')
            }}
          },
          scales: {
            x: { ticks: { color: cc('--chart-tick'), font: { size: 11 } }, grid: { color: fgGrid } },
            y: { min: 0, max: 100, ticks: { color: cc('--chart-tick'), font: { size: 11 }, stepSize: 25, callback: v => v + '%' }, grid: { color: fgGrid } }
          }
        }
      });
      // FIR/GIR callout row with benchmark
      const validFir = firData.filter(v => v !== null);
      const validGir = girData.filter(v => v !== null);
      const avgFir = validFir.length ? validFir.reduce((a, b) => a + b, 0) / validFir.length : null;
      const avgGir = validGir.length ? validGir.reduce((a, b) => a + b, 0) / validGir.length : null;
      const fgBm = getBenchmark(hcp);
      const fgInsight = document.getElementById('fg-insight-grid');
      if (fgInsight) {
        fgInsight.className = 'chart-callout-row';
        fgInsight.innerHTML = `
          <div class="chart-callout"><div class="chart-callout-val" style="color:var(--gold)">${avgFir != null ? Math.round(avgFir) + '%' : '—'}</div><div class="chart-callout-lbl">Avg FIR</div></div>
          <div class="chart-callout"><div class="chart-callout-val" style="color:#3498db">${avgGir != null ? Math.round(avgGir) + '%' : '—'}</div><div class="chart-callout-lbl">Avg GIR</div></div>
          <div class="chart-callout"><div class="chart-callout-val" style="color:var(--dimmer)">${fgBm.fir}% / ${fgBm.gir}%</div><div class="chart-callout-lbl" title="Average for a ${fmtHcp(hcp)} handicap golfer — source: USGA/R&A research data">Hcp avg FIR / GIR</div></div>`;
      }
    }
  }
} // end _renderDeferredCharts

  // 4f. Front 9 vs Back 9 card (default: net, toggle for gross)
  const f9b9Card = document.getElementById('c-f9b9');
  if (f9b9Card) {
    f9b9Card.style.display = fullR.length > 0 ? 'block' : 'none';
    if (fullR.length > 0) {
      const f9b9Gross = localStorage.getItem('looper_f9b9_gross') === 'true';
      const f9b9Label = document.getElementById('f9b9-toggle-label');
      if (f9b9Label) f9b9Label.textContent = f9b9Gross ? 'Gross' : 'Net';
      const f9b9Pill = document.getElementById('f9b9-toggle-pill');
      if (f9b9Pill) { f9b9Pill.style.background = f9b9Gross ? 'var(--gold)' : 'var(--border)'; const dot = f9b9Pill.querySelector('span'); if (dot) dot.style.left = f9b9Gross ? '11px' : '1px'; }
      const playerHcp = hcp || 0;

      let f9Sum = 0, b9Sum = 0, f9ParSum = 0, b9ParSum = 0;
      fullR.forEach(r => {
        const slope = r.slope || 113;
        const php = f9b9Gross ? 0 : Math.round(playerHcp * slope / 113);
        // Distribute handicap strokes across holes (front 9 gets ~half)
        const f9Strokes = f9b9Gross ? 0 : Math.round(php * 9 / 18);
        const b9Strokes = f9b9Gross ? 0 : php - f9Strokes;
        let f9 = 0, b9 = 0;
        for (let h = 0; h < 9; h++) { f9 += (r.scores[h] || 0); f9ParSum += (r.pars[h] || 0); }
        for (let h = 9; h < 18; h++) { b9 += (r.scores[h] || 0); b9ParSum += (r.pars[h] || 0); }
        f9Sum += f9 - f9Strokes;
        b9Sum += b9 - b9Strokes;
      });
      const f9Avg = (f9Sum / fullR.length).toFixed(1);
      const b9Avg = (b9Sum / fullR.length).toFixed(1);
      const f9Diff = (f9Sum - f9ParSum) / fullR.length;
      const b9Diff = (b9Sum - b9ParSum) / fullR.length;
      const f9DiffStr = f9Diff === 0 ? 'E' : (f9Diff > 0 ? '+' : '') + f9Diff.toFixed(1);
      const b9DiffStr = b9Diff === 0 ? 'E' : (b9Diff > 0 ? '+' : '') + b9Diff.toFixed(1);
      const f9Col = f9Diff < 0 ? 'var(--birdie)' : f9Diff <= 2 ? 'var(--bogey)' : 'var(--double)';
      const b9Col = b9Diff < 0 ? 'var(--birdie)' : b9Diff <= 2 ? 'var(--bogey)' : 'var(--double)';

      // Proportional visual bars
      const maxDiff = Math.max(Math.abs(f9Diff), Math.abs(b9Diff), 0.1);
      const f9BarW = Math.round(Math.abs(f9Diff) / maxDiff * 100);
      const b9BarW = Math.round(Math.abs(b9Diff) / maxDiff * 100);

      const halvesEl = document.getElementById('f9b9-halves');
      if (halvesEl) {
        halvesEl.innerHTML = `
          <div style="flex:1">
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;font-weight:600;color:var(--cream)">Front 9</span>
              <span style="font-size:10px;color:var(--dim)">avg ${f9Avg}</span>
            </div>
            <div style="height:18px;background:var(--navy);border-radius:3px;overflow:hidden;margin-bottom:2px">
              <div style="height:100%;width:${f9BarW}%;background:${f9Col};border-radius:3px;display:flex;align-items:center;padding-left:6px;min-width:24px">
                <span style="font-size:10px;font-weight:700;color:var(--cream)">${f9DiffStr}</span>
              </div>
            </div>
          </div>
          <div style="width:16px"></div>
          <div style="flex:1">
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;font-weight:600;color:var(--cream)">Back 9</span>
              <span style="font-size:10px;color:var(--dim)">avg ${b9Avg}</span>
            </div>
            <div style="height:18px;background:var(--navy);border-radius:3px;overflow:hidden;margin-bottom:2px">
              <div style="height:100%;width:${b9BarW}%;background:${b9Col};border-radius:3px;display:flex;align-items:center;padding-left:6px;min-width:24px">
                <span style="font-size:10px;font-weight:700;color:var(--cream)">${b9DiffStr}</span>
              </div>
            </div>
          </div>`;
      }

      const insightEl = document.getElementById('f9b9-insight');
      const textEl = document.getElementById('f9b9-text');
      if (insightEl && textEl) {
        insightEl.style.display = 'flex';
        const gap = f9Diff - b9Diff;
        const modeLabel = f9b9Gross ? 'gross' : 'net';
        if (gap > 1.5) {
          textEl.innerHTML = `Your ${modeLabel} scoring is <b>${gap.toFixed(1)} shots better</b> on the back 9 — try arriving earlier to warm up properly.`;
        } else if (gap < -1.5) {
          textEl.innerHTML = `Your ${modeLabel} scoring tends to <b>fade on the back 9</b> by <b>${Math.abs(gap).toFixed(1)} shots</b> — focus on staying patient after the turn.`;
        } else {
          textEl.innerHTML = `Your ${modeLabel} scoring is <b>consistent across both halves</b> (${Math.abs(gap).toFixed(1)} shot difference) — a good sign of sustained focus.`;
        }
      }
    }
  }

  // ── Birdie counter (personal, current year) ─────────────────────
  const birdieCard = document.getElementById('c-birdie-counter');
  const birdieContent = document.getElementById('birdie-counter-content');
  if (birdieCard && birdieContent) {
    const currentYear = String(new Date().getFullYear());
    const yearRounds = allRounds.filter(r => r.date?.split('/')?.[2] === currentYear);
    const totalBirdies = yearRounds.reduce((sum, r) => sum + (r.birdies || 0), 0);
    const totalEagles = yearRounds.reduce((sum, r) => sum + (r.eagles || 0), 0);
    const roundCount = yearRounds.length;
    const perRound = roundCount ? (totalBirdies / roundCount).toFixed(1) : '0';

    if (roundCount) {
      birdieCard.style.display = 'block';
      birdieContent.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-around;text-align:center;padding:4px 0">
          <div>
            <div style="font-size:28px;font-weight:700;color:var(--birdie)">${totalBirdies}</div>
            <div style="font-size:10px;color:var(--dim);margin-top:2px">Birdies</div>
          </div>
          <div style="width:1px;height:36px;background:var(--border)"></div>
          <div>
            <div style="font-size:28px;font-weight:700;color:var(--eagle)">${totalEagles}</div>
            <div style="font-size:10px;color:var(--dim);margin-top:2px">Eagles</div>
          </div>
          <div style="width:1px;height:36px;background:var(--border)"></div>
          <div>
            <div style="font-size:28px;font-weight:700;color:var(--cream)">${perRound}</div>
            <div style="font-size:10px;color:var(--dim);margin-top:2px">Per round</div>
          </div>
        </div>
        <div style="font-size:10px;color:var(--dimmer);text-align:center;margin-top:8px">${roundCount} round${roundCount !== 1 ? 's' : ''} in ${currentYear}</div>`;
    } else {
      birdieCard.style.display = 'none';
    }
  }

  const hist = document.getElementById('st-hist');
  if (!allSorted.length) {
    hist.innerHTML = _es('flag', 'No rounds yet', 'Play your first round and your stats will build up here automatically.', 'Record a round', "import('./nav.js').then(m=>m.goTo('round'))")
      || '<div class="empty">No rounds yet</div>';
    return;
  }
  hist.innerHTML = '';
  const histRounds = [...allSorted].reverse();
  const displayRounds = roundHistExpanded ? histRounds : histRounds.slice(0, 5);
  displayRounds.forEach(r => {
    const dv = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
    const dot = TC[r.tee]?.d || '#888';
    const d = document.createElement('div');
    d.className = 'hi';

    // Clickable section — info left, score right — opens scorecard modal
    const clickable = document.createElement('div');
    clickable.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex:1;cursor:pointer;min-width:0';
    clickable.innerHTML = `
      <div style="min-width:0">
        <div class="hc">${r.course}</div>
        <div class="hm"><span class="tdot" style="background:${dot}"></span>${(r.tee || '').charAt(0).toUpperCase() + (r.tee || '').slice(1)} \u00B7 ${r.date} \u00B7 ${r.parsCount || 0}P \u00B7 ${r.bogeys || 0}Bog${r.birdies > 0 ? ` \u00B7 <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>${r.birdies}` : ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;padding-left:8px">
        <div class="hs">${r.totalScore}</div>
        <div class="hd">${dv} (Par ${r.totalPar})</div>
      </div>`;
    clickable.addEventListener('click', () => openScorecardModal(r));
    d.appendChild(clickable);

    // Delete zone — only shown for state.me's own rounds
    if (r.player === state.me) {
      const delZone = document.createElement('div');
      delZone.style.cssText = 'flex-shrink:0;padding-left:8px';
      bindDeleteZone(delZone, r);
      d.appendChild(delZone);
    }

    hist.appendChild(d);
  });
  if (histRounds.length > 5) {
    const link = document.createElement('div');
    link.style.cssText = 'font-size:13px;color:var(--gold);padding:10px 0 2px;cursor:pointer;text-decoration:none';
    link.textContent = roundHistExpanded ? 'Show less ↑' : `See all ${histRounds.length} rounds →`;
    link.addEventListener('click', () => { roundHistExpanded = !roundHistExpanded; renderStats(); });
    hist.appendChild(link);
  }

  // Match record
  renderMatchRecord();
}

function renderMatchRecord() {
  const card = document.getElementById('c-match-record');
  const list = document.getElementById('match-record-list');
  if (!card || !list) return;

  const myRounds = state.gd.players[state.me]?.rounds || [];
  const opponents = Object.keys(state.gd.players).filter(n => n !== state.me);
  const rows = [];

  opponents.forEach(opp => {
    const theirRounds = state.gd.players[opp]?.rounds || [];
    let wMe = 0, wOpp = 0, h = 0, hasMatchData = false, shared = 0;

    myRounds.forEach(rMe => {
      const rOpp = theirRounds.find(r => r.date === rMe.date && r.course === rMe.course);
      if (!rOpp) return;
      shared++;
      if (rMe.matchOutcome) {
        hasMatchData = true;
        const mo = rMe.matchOutcome;
        if (mo.result === 'won') { if (mo.leader === state.me) wMe++; else wOpp++; }
        else if (mo.result === 'halved') h++;
      } else if (rOpp.matchOutcome) {
        hasMatchData = true;
        const mo = rOpp.matchOutcome;
        if (mo.result === 'won') { if (mo.leader === opp) wOpp++; else wMe++; }
        else if (mo.result === 'halved') h++;
      } else {
        if (rMe.diff < rOpp.diff) wMe++;
        else if (rOpp.diff < rMe.diff) wOpp++;
        else h++;
      }
    });

    if (!shared) return;
    rows.push({ opp, wMe, wOpp, h, hasMatchData, shared });
  });

  if (!rows.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  list.innerHTML = '';
  rows.forEach(({ opp, wMe, wOpp, h, hasMatchData, shared }) => {
    const label = hasMatchData ? '' : ' <span style="font-size:9px;color:var(--dimmer)">(gross form)</span>';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--wa-05)';
    row.innerHTML = `
      <div>
        <div style="font-size:13px;color:var(--cream)">vs ${opp}${label}</div>
        <div style="font-size:10px;color:var(--dim);margin-top:2px">${shared} shared round${shared !== 1 ? 's' : ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;font-weight:600;color:var(--gold)">${wMe}–${wOpp}–${h}</div>
        <div style="font-size:9px;color:var(--dimmer)">W–L–H</div>
      </div>`;
    list.appendChild(row);
  });
}

export function calcStableford(scores, pars, handicapIndex, slope, si) {
  if (!scores || !pars) return null;
  const php = Math.round(handicapIndex * (slope || 113) / 113);
  const shots = Array(18).fill(0);
  if (si && si.length === 18) {
    if (php >= 0) {
      const extraRounds = Math.floor(php / 18);
      const remainder = php % 18;
      for (let h = 0; h < 18; h++) shots[h] = extraRounds + (si[h] <= remainder ? 1 : 0);
    } else {
      // Plus handicapper: give strokes back on easiest holes (highest SI)
      const absPhp = Math.abs(php);
      const extraRounds = Math.floor(absPhp / 18);
      const remainder = absPhp % 18;
      for (let h = 0; h < 18; h++) shots[h] = -(extraRounds + (si[h] > (18 - remainder) ? 1 : 0));
    }
  } else {
    if (php >= 0) {
      for (let i = 0; i < php; i++) shots[i % 18]++;
    } else {
      const absPhp = Math.abs(php);
      for (let i = 0; i < absPhp; i++) shots[17 - (i % 18)]--;
    }
  }
  let pts = 0, holes = 0;
  for (let h = 0; h < 18; h++) {
    const s = scores[h]; const p = pars[h];
    if (s == null || p == null) continue;
    const netScore = s - shots[h];
    const d = netScore - p;
    if (d <= -3) pts += 5;
    else if (d === -2) pts += 4;
    else if (d === -1) pts += 3;
    else if (d === 0) pts += 2;
    else if (d === 1) pts += 1;
    holes++;
  }
  return holes > 0 ? pts : null;
}

export function calcScoringPointsNet(scores, pars, hcp, slope, si) {
  if (!scores || !pars) return null;
  const playingHcp = Math.round(hcp * (slope || 113) / 113);

  // SI fallback: linear 1–18 if missing or incomplete
  const effectiveSI = (si && si.length === 18) ? si : Array.from({ length: 18 }, (_, h) => h + 1);

  // Strokes per hole
  const strokes = Array(18).fill(0);
  if (playingHcp >= 0) {
    for (let h = 0; h < 18; h++) {
      if (effectiveSI[h] <= playingHcp) strokes[h] = 1;
      if (playingHcp > 18 && effectiveSI[h] <= (playingHcp - 18)) strokes[h] += 1;
    }
  } else {
    // Plus handicapper: give strokes back on easiest holes (highest SI)
    const absPhp = Math.abs(playingHcp);
    const extraRounds = Math.floor(absPhp / 18);
    const remainder = absPhp % 18;
    for (let h = 0; h < 18; h++) {
      strokes[h] = -(extraRounds + (effectiveSI[h] > (18 - remainder) ? 1 : 0));
    }
  }

  let total = 0, netEagles = 0, netBirdies = 0, holes = 0;
  for (let h = 0; h < 18; h++) {
    if (scores[h] == null || pars[h] == null) continue;
    const diff = (scores[h] - strokes[h]) - pars[h];
    if (diff <= -2) { total += 3; netEagles++; }
    else if (diff === -1) { total += 1; netBirdies++; }
    holes++;
  }
  return holes > 0 ? { total, netEagles, netBirdies } : null;
}

export function isBufferOrBetter(round, handicap) {
  if (!round.totalScore || !round.totalPar) return false;
  const slope = round.slope || 113;
  const playingHcp = Math.round((handicap * (slope / 113)));
  const nettScore = round.totalScore - playingHcp;
  const nettDiff = nettScore - round.totalPar;
  return nettDiff <= 2;
}
