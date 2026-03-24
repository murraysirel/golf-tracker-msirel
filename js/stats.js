// ─────────────────────────────────────────────────────────────────
// STATS + CHARTS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { TC } from './constants.js';
import { pushGist } from './api.js';
import { initials } from './players.js';

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
    totCells += `<td><span style="color:var(--gold);font-weight:700">${tot}</span> <span style="font-size:10px;color:${scoreColor(diff)}">${dStr}</span></td>`;
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

export function toggleHcpEdit() {
  const row = document.getElementById('hcp-edit-row');
  const showing = row.style.display !== 'none' && row.style.display !== '';
  row.style.display = showing ? 'none' : 'flex';
  if (!showing) {
    const inp = document.getElementById('hcp-input');
    const cur = state.gd.players[state.me]?.handicap;
    if (cur) inp.value = cur;
    inp.focus();
  }
}

export function saveHandicap() {
  const v = parseFloat(document.getElementById('hcp-input').value);
  if (isNaN(v) || v < 0 || v > 54) { alert('Please enter a valid handicap between 0 and 54.'); return; }
  if (!state.gd.players[state.me]) state.gd.players[state.me] = { handicap: v, rounds: [] };
  else state.gd.players[state.me].handicap = v;
  pushGist();
  document.getElementById('hcp-edit-row').style.display = 'none';
  renderStats();
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
  const hcpVal = p.handicap > 0 ? p.handicap : '—';
  const seasonCount = seasonRounds.length;
  if (greetEl) greetEl.textContent = greeting + ', ' + firstName;
  if (metaEl) metaEl.textContent = `HCP ${hcpVal} · ${seasonCount} round${seasonCount !== 1 ? 's' : ''} this season`;
  const avatarEl = document.getElementById('hdr-avatar-initials');
  if (avatarEl) avatarEl.textContent = initials(state.me);

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
  function par4GIRRaw(rounds) {
    let hits = 0, poss = 0;
    rounds.forEach(r => {
      (r.pars || []).forEach((p, i) => {
        const g = (r.gir || [])[i];
        if (p === 4 && (g === 'Yes' || g === 'No')) { poss++; if (g === 'Yes') hits++; }
      });
    });
    return poss ? hits / poss * 100 : null;
  }

  // ── Card 1: Avg vs par — delta vs season avg ─────────────────
  const avgParEl = document.getElementById('h-avg-par');
  const avgParDeltaEl = document.getElementById('h-avg-par-delta');
  const validDiff = d => d !== undefined && d !== null && !isNaN(d);
  const last5Diffs = last5.map(r => r.diff).filter(validDiff);
  const N = last5Diffs.length; // actual rounds used (up to 5)
  const avgVsPar = N ? last5Diffs.reduce((a, b) => a + b, 0) / N : null;
  if (avgParEl) avgParEl.textContent = avgVsPar !== null ? (avgVsPar >= 0 ? '+' : '') + avgVsPar.toFixed(1) : '—';
  if (avgParDeltaEl) {
    if (N === 0) {
      avgParDeltaEl.textContent = '';
    } else if (N < 5) {
      // Fewer than 5 rounds — show value but label clearly
      avgParDeltaEl.textContent = `last ${N} round${N !== 1 ? 's' : ''}`;
      avgParDeltaEl.style.color = 'var(--dim)';
    } else {
      const seasonDiffs = seasonRounds.map(r => r.diff).filter(validDiff);
      const seasonAvg = seasonDiffs.length ? seasonDiffs.reduce((a, b) => a + b, 0) / seasonDiffs.length : null;
      if (avgVsPar !== null && seasonAvg !== null) {
        const delta = avgVsPar - seasonAvg;
        if (delta < 0) { avgParDeltaEl.textContent = '↓ ' + Math.abs(delta).toFixed(1) + ' vs season'; avgParDeltaEl.style.color = 'var(--par)'; }
        else if (delta > 0) { avgParDeltaEl.textContent = '↑ ' + delta.toFixed(1) + ' vs season'; avgParDeltaEl.style.color = 'var(--bogey)'; }
        else { avgParDeltaEl.textContent = '→ on season avg'; avgParDeltaEl.style.color = 'var(--dim)'; }
      } else { avgParDeltaEl.textContent = ''; }
    }
  }

  // ── Card 2: Best round this season — course + date two lines ─
  const bestEl = document.getElementById('h-best');
  const bestMetaEl = document.getElementById('h-best-meta');
  const seasonWithScore = seasonRounds.filter(r => r.totalScore);
  const bestRound = seasonWithScore.length ? seasonWithScore.reduce((min, r) => r.totalScore < min.totalScore ? r : min) : null;
  if (bestEl) bestEl.textContent = bestRound ? bestRound.totalScore : '—';
  if (bestMetaEl) {
    if (bestRound) {
      const fullName = (bestRound.course || '').replace(' Golf Club', '').replace(' Golf Course', '').replace(' Golf Links', '');
      const shortC = fullName.length > 16 ? fullName.slice(0, 16) + '…' : fullName;
      const dp = bestRound.date?.split('/');
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      // dp[0]=DD, dp[1]=MM, dp[2]=YYYY — use parseDateGB-compatible indexing
      const dateStr = dp && dp.length === 3 ? MONTHS[parseInt(dp[1], 10) - 1] + ' ' + parseInt(dp[0], 10) : '';
      bestMetaEl.innerHTML =
        `<span style="display:block;font-size:11px;color:var(--dim)">${shortC}</span>` +
        `<span style="display:block;font-size:11px;color:var(--dim)">${dateStr}</span>`;
    } else {
      bestMetaEl.innerHTML = '';
    }
  }

  // ── Card 3: Birdies — two delta lines (vs last month, vs last year) ──
  const birdiesEl = document.getElementById('h-birdies');
  const birdiesDeltaEl = document.getElementById('h-birdies-delta');
  const seasonBirdies = seasonRounds.reduce((a, r) => a + (r.birdies || 0), 0);
  if (birdiesEl) birdiesEl.textContent = seasonBirdies;

  if (birdiesDeltaEl) {
    // Last month range — derive from JS Date, compare via date string parts
    const lastMonthNum = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth() is 0-indexed; Jan→0 wraps to Dec=12
    const lastMonthStr = String(lastMonthNum).padStart(2, '0');
    const lastMonthYear = now.getMonth() === 0 ? String(now.getFullYear() - 1) : currentYear;
    const lastYear = String(now.getFullYear() - 1);

    const thisMonthRounds = rs.filter(r => { const dp = r.date?.split('/'); return dp && dp[1] === currentMonth && dp[2] === currentYear; });
    const lastMonthRounds = rs.filter(r => { const dp = r.date?.split('/'); return dp && dp[1] === lastMonthStr && dp[2] === lastMonthYear; });
    const lastYearRounds  = rs.filter(r => { const dp = r.date?.split('/'); return dp && dp[2] === lastYear; });

    const thisMonthB = thisMonthRounds.reduce((a, r) => a + (r.birdies || 0), 0);
    const lastMonthB = lastMonthRounds.reduce((a, r) => a + (r.birdies || 0), 0);

    function birdieMonthLine() {
      if (!lastMonthRounds.length) return `<span style="color:var(--dim)">— no data last month</span>`;
      const d = thisMonthB - lastMonthB;
      if (d > 0) return `<span style="color:var(--par)">↑ ${d} vs last month</span>`;
      if (d < 0) return `<span style="color:var(--bogey)">↓ ${Math.abs(d)} vs last month</span>`;
      return `<span style="color:var(--dim)">→ same as last month</span>`;
    }
    birdiesDeltaEl.style.cssText = 'font-size:10px';
    birdiesDeltaEl.innerHTML = birdieMonthLine();
  }

  // ── Card 4: GIR / FIR — delta vs season avg ──────────────────
  const girPctEl  = document.getElementById('h-gir-pct');
  const firPctEl  = document.getElementById('h-fir-pct');
  const girDeltaEl = document.getElementById('h-gir-delta');
  const firDeltaEl = document.getElementById('h-fir-delta');

  const last5GIR   = par4GIRRaw(last5);
  const last5FIR   = firRaw(last5);
  const seasonGIR  = par4GIRRaw(seasonRounds);
  const seasonFIR  = firRaw(seasonRounds);

  if (girPctEl) girPctEl.textContent = last5GIR !== null ? Math.round(last5GIR) + '%' : '—';
  if (firPctEl) firPctEl.textContent = last5FIR !== null ? Math.round(last5FIR) + '%' : '—';

  function renderGIRFIRDelta(el, last5Val, seasonVal) {
    if (!el) return;
    if (last5Val !== null && seasonVal !== null) {
      const delta = last5Val - seasonVal;
      if (delta > 0) { el.textContent = '↑ ' + Math.abs(delta).toFixed(1) + '%'; el.style.color = 'var(--par)'; }
      else if (delta < 0) { el.textContent = '↓ ' + Math.abs(delta).toFixed(1) + '%'; el.style.color = 'var(--bogey)'; }
      else { el.textContent = '→ avg'; el.style.color = 'var(--dim)'; }
    } else { el.textContent = ''; }
  }
  renderGIRFIRDelta(girDeltaEl, last5GIR, seasonGIR);
  renderGIRFIRDelta(firDeltaEl, last5FIR, seasonFIR);

  // ── Recent rounds ────────────────────────────────────────────
  const recent = document.getElementById('home-recent');
  if (!rs.length) {
    recent.innerHTML = '<div class="empty"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg></div>No rounds yet \u2014 add your first!</div>';
    return;
  }
  recent.innerHTML = '';
  const recentSorted = [...rs].sort((a, b) => parseDateGB(b.date) - parseDateGB(a.date)).slice(0, 3);
  recentSorted.forEach(r => {
    const diff = r.diff;
    const dv = diff >= 0 ? '+' + diff : '' + diff;
    const diffColor = diff <= -3 ? 'var(--birdie)' : diff <= 3 ? 'var(--par)' : diff <= 10 ? 'var(--bogey)' : 'var(--double)';
    const dot = TC[r.tee]?.d || '#888';
    const shortCourse = (r.course || '').replace(' Golf Club', '').replace(' Golf Course', '').replace(' Golf Links', '');
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:var(--wa-03);border:1px solid var(--wa-07);border-radius:12px;margin-bottom:8px;transition:border-color .2s,background .2s;cursor:pointer';
    d.addEventListener('mouseenter', () => { d.style.background = 'rgba(201,168,76,.04)'; d.style.borderColor = 'rgba(201,168,76,.2)'; });
    d.addEventListener('mouseleave', () => { d.style.background = 'var(--wa-03)'; d.style.borderColor = 'var(--wa-07)'; });
    d.addEventListener('click', () => openScorecardModal(r));
    d.innerHTML = `
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:500;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${shortCourse}</span>
          <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;display:inline-block"></span>
        </div>
        <div style="font-size:11px;color:var(--dim);margin-top:3px">${r.date} \u00B7 Par ${r.totalPar}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;color:var(--gold);line-height:1">${r.totalScore}</div>
        <div style="font-size:12px;font-weight:600;color:${diffColor}">${dv}</div>
      </div>`;
    recent.appendChild(d);
  });
}

function populateRoundSelector() {
  const sel = document.getElementById('ai-round-sel');
  if (!sel) return;
  const rs = (state.gd.players[state.me]?.rounds || []);
  if (!rs.length) { sel.innerHTML = '<option>No rounds yet</option>'; return; }
  const sorted = [...rs.map((r, i) => ({ r, i }))].sort((a, b) => parseDateGB(b.r.date) - parseDateGB(a.r.date)).slice(0, 5);
  const complete = sorted.filter(({ r }) => {
    const puttsOk = (r.putts || []).some(v => v != null && v !== '' && !isNaN(v));
    const firOk = (r.fir || []).some(v => v === 'Yes' || v === 'No' || v === 'N/A');
    const girOk = (r.gir || []).some(v => v === 'Yes' || v === 'No');
    return puttsOk && firOk && girOk;
  });
  const roundOpts = complete.map(({ r, i }) => `<option value="${i}">${r.date} \u2014 ${r.course} (${r.diff >= 0 ? '+' : ''}${r.diff})</option>`).join('');
  const incompleteNote = complete.length < sorted.length ? `<option disabled value="">\u2014 ${sorted.length - complete.length} round(s) incomplete (missing putts/FIR/GIR) \u2014</option>` : '';
  const qualifyingRounds = (state.gd.players[state.me]?.rounds || []).filter(r => {
    const puttsOk = (r.putts || []).some(v => v != null && v !== '' && !isNaN(v));
    const firOk = (r.fir || []).some(v => v === 'Yes' || v === 'No' || v === 'N/A');
    const girOk = (r.gir || []).some(v => v === 'Yes' || v === 'No');
    return puttsOk && firOk && girOk;
  });
  const has5 = qualifyingRounds.length >= 5;
  sel.innerHTML = roundOpts + incompleteNote + (has5 ? '<option value="last5">\u2014 Analyse last 5 qualifying rounds \u2014</option>' : '');
}

export function renderStats() {
  const p = state.gd.players[state.me];
  if (!p) return;
  const allRounds = p.rounds || [];

  const hcp = p.handicap;
  const hcpEl = document.getElementById('st-hcp-display');
  if (hcpEl) hcpEl.textContent = hcp != null && hcp > 0 ? hcp : '—';

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
  if (allRounds.length > 0) populateRoundSelector();

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
  if (!allSorted.length) { hist.innerHTML = '<div class="empty">No rounds yet</div>'; return; }
  hist.innerHTML = '';
  const histRounds = [...allSorted].reverse();
  const displayRounds = roundHistExpanded ? histRounds : histRounds.slice(0, 5);
  displayRounds.forEach(r => {
    const dv = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
    const dot = TC[r.tee]?.d || '#888';
    const d = document.createElement('div');
    d.className = 'hi';
    d.style.cursor = 'pointer';
    d.innerHTML = `<div><div class="hc">${r.course}</div><div class="hm"><span class="tdot" style="background:${dot}"></span>${(r.tee || '').charAt(0).toUpperCase() + (r.tee || '').slice(1)} \u00B7 ${r.date} \u00B7 ${r.parsCount || 0}P \u00B7 ${r.bogeys || 0}Bog${r.birdies > 0 ? ` \u00B7 <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>${r.birdies}` : ''}</div></div><div style="text-align:right"><div class="hs">${r.totalScore}</div><div class="hd">${dv} (Par ${r.totalPar})</div></div>`;
    d.addEventListener('click', () => openScorecardModal(r));
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
  const php = handicapIndex > 0 ? Math.round(handicapIndex * (slope || 113) / 113) : 0;
  const shots = Array(18).fill(0);
  if (si && si.length === 18) {
    for (let h = 0; h < 18; h++) {
      const extraRounds = Math.floor(php / 18);
      const remainder = php % 18;
      shots[h] = extraRounds + (si[h] <= remainder ? 1 : 0);
    }
  } else {
    for (let i = 0; i < php; i++) shots[i % 18]++;
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

export function isBufferOrBetter(round, handicap) {
  if (!round.totalScore || !round.totalPar) return false;
  const slope = round.slope || 113;
  const playingHcp = Math.round((handicap * (slope / 113)));
  const nettScore = round.totalScore - playingHcp;
  const nettDiff = nettScore - round.totalPar;
  return nettDiff <= 2;
}
