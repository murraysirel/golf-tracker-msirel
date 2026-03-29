// ─────────────────────────────────────────────────────────────────
// STATS + CHARTS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { TC } from './constants.js';
import { pushData, pushSupabase } from './api.js';
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
      const wt = wh ? (wh.loneWolf ? '🐺' : wh.winner ? initials(wh.winner) : '') : '';
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
    totCells += `<td><span style="color:var(--gold);font-weight:700;font-family:'Cormorant Garamond',serif">${tot}</span> <span style="font-size:10px;color:${scoreColor(diff)}">${dStr}</span></td>`;
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
    <div class="home-kpi-val">${tile.val}</div>
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
function renderMatesFeed() {
  const section = document.getElementById('home-mates-section');
  const matesEl = document.getElementById('home-mates-list');
  if (!section || !matesEl) return;
  const allPlayers = Object.entries(state.gd.players || {});
  if (allPlayers.length <= 1) { section.style.display = 'none'; return; }
  section.style.display = '';

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const currentYear = String(new Date().getFullYear());
  const events = [];

  for (const [name, p] of allPlayers) {
    const seasonRounds = (p.rounds || []).filter(r => r.date?.split('/')?.[2] === currentYear);
    for (const r of seasonRounds) {
      const rd = parseDateGB(r.date);
      if (!rd || isNaN(rd)) continue;
      if (now - rd.getTime() > sevenDays) continue;

      const ago = Math.floor((now - rd.getTime()) / 86400000);
      const when = ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + 'd ago';
      const course = r.course?.split(' — ')?.[0] || r.course || '';

      // Eagles
      if (r.eagles > 0) {
        events.push({ ts: rd, icon: '🦅', text: `${name} made ${r.eagles} eagle${r.eagles > 1 ? 's' : ''} at ${course}`, when, color: 'var(--eagle)' });
      }
      // Birdies (2+)
      if (r.birdies >= 2) {
        events.push({ ts: rd, icon: '🐦', text: `${name} made ${r.birdies} birdies at ${course}`, when, color: 'var(--birdie)' });
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
          events.push({ ts: rd, icon: '⭐', text: `${name} made ${netEagles} net eagle${netEagles > 1 ? 's' : ''} at ${course}`, when, color: 'var(--gold)' });
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
          events.push({ ts: rd, icon: '🏆', text: `${name} shot their best net round of the season (${fmtNet}) at ${course}`, when, color: 'var(--gold2)' });
        }
      }
      // Stableford > 36
      const stab = calcStableford(r.scores, r.pars, p.handicap || 0, r.slope, null);
      if (stab != null && stab > 36) {
        events.push({ ts: rd, icon: '🚨', text: `${name} scored ${stab} stableford points! Check their handicap is cut!`, when, color: 'var(--bogey)' });
      }
    }
  }

  events.sort((a, b) => b.ts - a.ts);
  const capped = events.slice(0, 3);
  matesEl.innerHTML = '';

  if (!capped.length) {
    matesEl.innerHTML = _es('👥', 'Quiet out there', 'When your group posts rounds, birdies and milestones appear here.', 'See the leaderboard', "import('./nav.js').then(m=>m.goTo('leaderboard'))")
      || '<div style="background:var(--mid);border-radius:12px;padding:14px;font-size:10px;color:var(--dimmer);text-align:center">No group activity yet — rounds will appear here</div>';
    return;
  }

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--mid);border-radius:12px;padding:10px 14px';

  capped.forEach((ev, i) => {
    // Determine dot colour
    let dotColor = 'var(--dim)';
    if (ev.text.includes('birdie')) dotColor = 'var(--birdie)';
    else if (ev.text.includes('eagle')) dotColor = 'var(--birdie)';
    else if (ev.text.includes('stableford')) dotColor = 'var(--gold)';
    else if (ev.text.includes('best') || ev.text.includes('net')) dotColor = 'var(--par)';

    // Extract player name (first word before space or " made" / " scored" / " shot")
    const nameMatch = ev.text.match(/^(.+?) (?:made|scored|shot)/);
    const playerName = nameMatch ? nameMatch[1] : '';
    const restText = playerName ? ev.text.slice(playerName.length) : ev.text;

    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;padding:7px 0${i < capped.length - 1 ? ';border-bottom:1px solid var(--border)' : ''}`;
    row.innerHTML = `
      <div style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
      <div style="flex:1;min-width:0;font-size:10px;color:var(--dim);line-height:1.4"><span style="color:var(--cream);font-weight:600">${playerName}</span>${restText}</div>
      <div style="font-size:9px;color:var(--dimmer);flex-shrink:0">${ev.when}</div>`;
    card.appendChild(row);
  });

  matesEl.appendChild(card);
}

export function renderHomeStats() {
  const p = state.gd.players[state.me];
  if (!p) return;
  const rs = p.rounds || [];

  // ── Slim header greeting + meta ──────────────────────────────
  const hr = new Date().getHours();
  const firstName = state.me.split(' ')[0];
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.getElementById('home-greeting');
  const metaEl = document.getElementById('home-hdr-meta');
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  // Use parseDateGB-compatible split to get year/month — never new Date() on DD/MM/YYYY strings
  const seasonRounds = rs.filter(r => { const dp = r.date?.split('/'); return dp && dp[2] === currentYear; });
  const hcpVal = fmtHcp(p.handicap);
  const seasonCount = seasonRounds.length;
  if (greetEl) greetEl.textContent = greeting + ', ' + firstName;
  if (metaEl) metaEl.textContent = `HCP ${hcpVal} · ${seasonCount} round${seasonCount !== 1 ? 's' : ''} this season`;
  refreshAvatarUI();

  // ── Sorted rounds, last 5 ────────────────────────────────────
  const sorted = [...rs].sort((a, b) => parseDateGB(a.date) - parseDateGB(b.date));
  const last5 = sorted.slice(-5);

  // ── Raw GIR/FIR helpers (return floats for delta precision) ──
  function girRaw(rounds) {
    const hits = rounds.reduce((a, r) => a + (r.gir || []).filter(v => v === 'Yes').length, 0);
    const poss = rounds.reduce((a, r) => a + (r.gir || []).length, 0);
    return poss ? hits / poss * 100 : null;
  }
  function firRaw(rounds) {
    let hits = 0, poss = 0;
    rounds.forEach(r => { (r.fir || []).forEach((v, h) => { if ((r.pars?.[h]) !== 3) { poss++; if (v === 'Yes') hits++; } }); });
    return poss ? hits / poss * 100 : null;
  }
  // ── Dynamic KPI grid ─────────────────────────────────────────
  const tileCtx = { p, rs, sorted, last5, seasonRounds, currentYear, currentMonth, now, girRaw, firRaw };
  renderKpiGrid(tileCtx);

  // ── Mates board feed ─────────────────────────────────────────
  renderMatesFeed();

  // ── Recent rounds (2 most recent) ────────────────────────────
  const recent = document.getElementById('home-recent');
  if (!recent) return;
  if (!rs.length) {
    recent.innerHTML = _es('⛳', 'No rounds yet', 'Play your first round and your stats will build up here automatically.', 'Record a round', "import('./nav.js').then(m=>m.goTo('round'))")
      || '<div style="font-size:12px;color:var(--dimmer);padding:12px 0;text-align:center">No rounds yet — add your first!</div>';
    return;
  }
  recent.innerHTML = '';
  const recentSorted = [...rs].sort((a, b) => parseDateGB(b.date) - parseDateGB(a.date)).slice(0, 2);
  recentSorted.forEach(r => {
    const diff = r.diff;
    const dv = diff >= 0 ? '+' + diff : '' + diff;
    const diffColor = diff <= -2 ? 'var(--birdie)' : diff === 0 ? 'var(--par)' : diff <= 3 ? 'var(--bogey)' : 'var(--double)';
    const dot = TC[r.tee]?.d || '#888';
    const shortCourse = (r.course || '').replace(' Golf Club', '').replace(' Golf Course', '').replace(' Golf Links', '');
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--mid);border-radius:10px;margin-bottom:6px;cursor:pointer';
    d.addEventListener('click', () => openScorecardModal(r));
    d.innerHTML = `
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${shortCourse}</div>
        <div style="font-size:10px;color:var(--dim);margin-top:2px"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dot};margin-right:4px;vertical-align:middle"></span>${r.tee || ''} · ${r.date}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:18px;font-weight:700;color:var(--cream);line-height:1">${r.totalScore}</div>
        <div style="font-size:10px;font-weight:600;color:${diffColor};margin-top:1px">${dv}</div>
      </div>`;
    recent.appendChild(d);
  });
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
    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end">
      <span style="font-size:11px;color:var(--dim);white-space:nowrap">Delete this round?</span>
      <button class="btn btn-ghost" style="width:auto;padding:4px 10px;font-size:11px;border-color:rgba(231,76,60,.4);color:var(--double)" data-del-yes>Yes, delete</button>
      <button class="btn btn-ghost" style="width:auto;padding:4px 10px;font-size:11px" data-del-no>Cancel</button>
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
  const girPoss = fullR.length * 18;
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
    document.getElementById('bd-pills').innerHTML = `
      <div class="bd"><span class="bv ec">${tE}</span><span class="bl">Eagle</span></div>
      <div class="bd"><span class="bv bc">${tB}</span><span class="bl">Birdie</span></div>
      <div class="bd"><span class="bv prc">${tP}</span><span class="bl">Par</span></div>
      <div class="bd"><span class="bv bgc">${tBo}</span><span class="bl">Bogey</span></div>
      <div class="bd"><span class="bv dc">${tD}</span><span class="bl">Dbl+</span></div>`;
    dc('donut');
    CH.donut = new Chart(document.getElementById('ch-donut'), {
      type: 'doughnut',
      data: { labels: ['Eagle','Birdie','Par','Bogey','Double+'], datasets: [{ data: [tE,tB,tP,tBo,tD], backgroundColor: ['#f1c40f','#3498db','#2ecc71','#e67e22','#e74c3c'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: cc('--chart-tick'), font: { size: 10 }, boxWidth: 11, padding: 10 } } } }
    });
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

    const avgDiffRaw = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
    const bestDiff = diffs.length ? Math.min(...diffs) : null;
    renderInsightGrid(document.getElementById('trend-insight-grid'), [
      { val: avgDiffRaw, label: `Avg score vs par (${rs.length} rounds)`, type: 'score', fmt: v => (v >= 0 ? '+' : '') + v.toFixed(1) },
      { val: bestDiff,   label: 'Best score vs par (this period)', type: 'score', fmt: v => (v >= 0 ? '+' : '') + v }
    ]);
  }

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
            data: ptData,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52,152,219,.08)',
            pointBackgroundColor: '#c9a84c',
            pointRadius: 5, pointHoverRadius: 8, hitRadius: 20, pointBorderWidth: 0,
            tension: .3, fill: true
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
      const totalPuttsSum = ptData.reduce((a, b) => a + b, 0);
      const avgPuttsRound = totalPuttsSum / ptData.length;
      const avgPuttsHole = avgPuttsRound / 18;
      renderInsightGrid(document.getElementById('putts-insight-grid'), [
        { val: avgPuttsHole,  label: `Avg putts per hole (${puttsRounds.length} rounds)`, type: 'putts', fmt: v => v.toFixed(2) },
        { val: avgPuttsRound, label: `Avg total putts per round`,                          type: null,    fmt: v => v.toFixed(1) }
      ]);
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
            }
          ]
        },
        options: {
          ...co(),
          plugins: {
            legend: { display: true, position: 'top', labels: { color: cc('--chart-tick'), font: { size: 10 }, boxWidth: 10, padding: 8 } },
            tooltip: { callbacks: {
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
      const validFir = firData.filter(v => v !== null);
      const validGir = girData.filter(v => v !== null);
      const avgFir = validFir.length ? validFir.reduce((a, b) => a + b, 0) / validFir.length : null;
      const avgGir = validGir.length ? validGir.reduce((a, b) => a + b, 0) / validGir.length : null;
      renderInsightGrid(document.getElementById('fg-insight-grid'), [
        { val: avgFir, label: 'Avg FIR % — fairways hit',      type: 'fir', fmt: v => Math.round(v) + '%' },
        { val: avgGir, label: 'Avg GIR % — greens in reg.',     type: 'gir', fmt: v => Math.round(v) + '%' }
      ]);
    }
  }

  const hist = document.getElementById('st-hist');
  if (!allSorted.length) {
    hist.innerHTML = _es('⛳', 'No rounds yet', 'Play your first round and your stats will build up here automatically.', 'Record a round', "import('./nav.js').then(m=>m.goTo('round'))")
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
