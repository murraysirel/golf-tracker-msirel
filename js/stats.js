// ─────────────────────────────────────────────────────────────────
// STATS + CHARTS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { TC } from './constants.js';
import { pushGist } from './api.js';
import { initials } from './players.js';

// Chart instances container
const CH = {};

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
      x: { ticks: { color: tick, font: { size: 9, family: "'DM Sans',sans-serif" } }, grid: { color: grid } },
      y: { ticks: { color: tick, font: { size: 9, family: "'DM Sans',sans-serif" } }, grid: { color: grid } }
    }
  };
}
// Legacy alias kept for any external spread usage (resolved at call time)
export const CO = {};

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
  const currentYear = String(new Date().getFullYear());
  const seasonRounds = rs.filter(r => r.date?.split('/')?.[2] === currentYear);
  const hcpVal = p.handicap > 0 ? p.handicap : '—';
  const seasonCount = seasonRounds.length;
  if (greetEl) greetEl.textContent = greeting + ', ' + firstName;
  if (metaEl) metaEl.textContent = `HCP ${hcpVal} · ${seasonCount} round${seasonCount !== 1 ? 's' : ''} this season`;
  const avatarEl = document.getElementById('hdr-avatar-initials');
  if (avatarEl) avatarEl.textContent = initials(state.me);

  // ── Sorted rounds, last 5 and prev 5 ────────────────────────
  const sorted = [...rs].sort((a, b) => parseDateGB(a.date) - parseDateGB(b.date));
  const last5 = sorted.slice(-5);
  const prev5 = sorted.slice(-10, -5);

  // ── Card 1: Avg vs par ───────────────────────────────────────
  const last5Diffs = last5.map(r => r.diff).filter(d => d !== undefined && d !== null && !isNaN(d));
  const avgVsPar = last5Diffs.length ? (last5Diffs.reduce((a, b) => a + b, 0) / last5Diffs.length) : null;
  const prev5Diffs = prev5.map(r => r.diff).filter(d => d !== undefined && d !== null && !isNaN(d));
  const prevAvgVsPar = prev5Diffs.length ? prev5Diffs.reduce((a, b) => a + b, 0) / prev5Diffs.length : null;
  const avgParEl = document.getElementById('h-avg-par');
  const avgParDeltaEl = document.getElementById('h-avg-par-delta');
  if (avgParEl) avgParEl.textContent = avgVsPar !== null ? (avgVsPar >= 0 ? '+' : '') + avgVsPar.toFixed(1) : '—';
  if (avgParDeltaEl) {
    if (avgVsPar !== null && prevAvgVsPar !== null) {
      const d = avgVsPar - prevAvgVsPar;
      const improving = d < 0;
      avgParDeltaEl.textContent = (improving ? '↓' : '↑') + ' ' + Math.abs(d).toFixed(1) + ' vs prev 5';
      avgParDeltaEl.style.color = improving ? 'var(--par)' : 'var(--bogey)';
    } else { avgParDeltaEl.textContent = ''; }
  }

  // ── Card 2: Best round this season ──────────────────────────
  const bestEl = document.getElementById('h-best');
  const bestMetaEl = document.getElementById('h-best-meta');
  const seasonWithScore = seasonRounds.filter(r => r.totalScore);
  const bestRound = seasonWithScore.length ? seasonWithScore.reduce((min, r) => r.totalScore < min.totalScore ? r : min) : null;
  if (bestEl) bestEl.textContent = bestRound ? bestRound.totalScore : '—';
  if (bestMetaEl && bestRound) {
    const shortC = (bestRound.course || '').replace(' Golf Club', '').replace(' Golf Course', '').replace(' Golf Links', '');
    const dp = bestRound.date?.split('/');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = dp && dp.length === 3 ? months[parseInt(dp[1]) - 1] + ' ' + dp[0] : '';
    bestMetaEl.textContent = shortC + (dateStr ? ', ' + dateStr : '');
  } else if (bestMetaEl) { bestMetaEl.textContent = ''; }

  // ── Card 3: Birdies this season ──────────────────────────────
  const birdiesEl = document.getElementById('h-birdies');
  const birdiesDeltaEl = document.getElementById('h-birdies-delta');
  const seasonBirdies = seasonRounds.reduce((a, r) => a + (r.birdies || 0), 0);
  const last5Birdies = last5.reduce((a, r) => a + (r.birdies || 0), 0);
  const prev5Birdies = prev5.reduce((a, r) => a + (r.birdies || 0), 0);
  if (birdiesEl) birdiesEl.textContent = seasonBirdies;
  if (birdiesDeltaEl) {
    if (prev5.length) {
      const bd = last5Birdies - prev5Birdies;
      const improving = bd > 0;
      birdiesDeltaEl.textContent = (bd >= 0 ? '+' : '') + bd + ' vs prev 5';
      birdiesDeltaEl.style.color = improving ? 'var(--par)' : bd < 0 ? 'var(--bogey)' : 'var(--dim)';
    } else { birdiesDeltaEl.textContent = ''; }
  }

  // ── Card 4: GIR / FIR from last 5 with delta vs prev 5 ──────
  function calcGIR(rounds) {
    const hits = rounds.reduce((a, r) => a + (r.gir || []).filter(v => v === 'Yes').length, 0);
    const poss = rounds.reduce((a, r) => a + (r.gir || []).length, 0);
    return poss ? Math.round(hits / poss * 100) : null;
  }
  function calcFIR(rounds) {
    let hits = 0, poss = 0;
    rounds.forEach(r => { (r.fir || []).forEach((v, h) => { if ((r.pars?.[h]) !== 3) { poss++; if (v === 'Yes') hits++; } }); });
    return poss ? Math.round(hits / poss * 100) : null;
  }
  const girPct = calcGIR(last5);
  const firPct = calcFIR(last5);
  const prevGirPct = calcGIR(prev5);
  const prevFirPct = calcFIR(prev5);
  const girDelta = girPct !== null && prevGirPct !== null ? girPct - prevGirPct : null;
  const firDelta = firPct !== null && prevFirPct !== null ? firPct - prevFirPct : null;
  const girPctEl = document.getElementById('h-gir-pct');
  const firPctEl = document.getElementById('h-fir-pct');
  const girDeltaEl = document.getElementById('h-gir-delta');
  const firDeltaEl = document.getElementById('h-fir-delta');
  if (girPctEl) girPctEl.textContent = girPct !== null ? girPct + '%' : '—';
  if (firPctEl) firPctEl.textContent = firPct !== null ? firPct + '%' : '—';
  if (girDeltaEl) {
    girDeltaEl.textContent = girDelta !== null ? (girDelta >= 0 ? '↑' : '↓') + ' ' + Math.abs(girDelta) + '% vs last 5' : '';
    girDeltaEl.style.color = girDelta !== null && girDelta > 0 ? 'var(--par)' : 'var(--bogey)';
  }
  if (firDeltaEl) {
    firDeltaEl.textContent = firDelta !== null ? (firDelta >= 0 ? '↑' : '↓') + ' ' + Math.abs(firDelta) + '% vs last 5' : '';
    firDeltaEl.style.color = firDelta !== null && firDelta > 0 ? 'var(--par)' : 'var(--bogey)';
  }

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
  document.getElementById('c-putts').style.display = fullR.length > 0 ? 'block' : 'none';
  document.getElementById('c-fg').style.display = fullR.length > 0 ? 'block' : 'none';

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
    CH.trend = new Chart(document.getElementById('ch-trend'), {
      type: 'line',
      data: { labels: rs.map(r => r.date.slice(0, 5)), datasets: [{ data: rs.map(r => r.diff), borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,.08)', tension: .35, pointBackgroundColor: rs.map(r => r.diff < 0 ? '#3498db' : r.diff === 0 ? '#2ecc71' : '#e67e22'), pointRadius: 5, pointBorderWidth: 0, fill: true }] },
      options: { ...co(), plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.raw >= 0 ? '+' : ''}${c.raw} vs par` } } }, scales: { x: { ticks: { color: cc('--chart-tick'), font: { size: 9 } }, grid: { color: cc('--chart-grid') } }, y: { ticks: { color: cc('--chart-tick'), font: { size: 9 }, stepSize: 1, callback: v => { if (!Number.isInteger(v)) return null; return (v > 0 ? '+' : '') + v; } }, grid: { color: cc('--chart-grid') } } } }
    });
  }

  if (fullR.length) {
    const hA = Array.from({ length: 18 }, (_, h) => { const vs = fullR.map(r => r.scores[h] - r.pars[h]); return +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2); });
    dc('holes');
    CH.holes = new Chart(document.getElementById('ch-holes'), {
      type: 'bar',
      data: { labels: Array.from({ length: 18 }, (_, i) => i + 1), datasets: [{ data: hA, backgroundColor: hA.map(v => v <= -2 ? '#f1c40f' : v < 0 ? '#3498db' : v === 0 ? '#2ecc71' : v <= 1 ? '#e67e22' : '#e74c3c'), borderRadius: 3 }] },
      options: { ...co(), plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.raw >= 0 ? '+' : ''}${c.raw} avg` } } }, scales: { x: { ticks: { color: cc('--chart-tick'), font: { size: 9 } }, grid: { color: cc('--chart-grid') } }, y: { ticks: { color: cc('--chart-tick'), font: { size: 9 }, stepSize: 0.5, callback: v => { if (Math.round(v * 2) !== v * 2) return null; const f = parseFloat(v.toFixed(1)); return (v > 0 ? '+' : '') + f; } }, grid: { color: cc('--chart-grid') } } } }
    });

    const pR = fullR.filter(r => (r.putts || []).filter(Boolean).length >= 9);
    if (pR.length) {
      const pA = Array.from({ length: 18 }, (_, h) => { const vs = pR.map(r => r.putts[h]).filter(Boolean); return vs.length ? +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2) : null; });
      dc('putts');
      CH.putts = new Chart(document.getElementById('ch-putts'), {
        type: 'bar',
        data: { labels: Array.from({ length: 18 }, (_, i) => i + 1), datasets: [{ data: pA, backgroundColor: 'rgba(201,168,76,.6)', borderRadius: 3 }] },
        options: { ...co(), scales: { x: { ticks: { color: cc('--chart-tick'), font: { size: 9 } }, grid: { color: cc('--chart-grid') } }, y: { min: 0, ticks: { color: cc('--chart-tick'), font: { size: 9 }, stepSize: 0.5, callback: v => Math.round(v * 2) === v * 2 ? parseFloat(v.toFixed(1)) : null }, grid: { color: cc('--chart-grid') } } } }
      });
    }

    const firP = Array.from({ length: 18 }, (_, h) => {
      if (fullR[0]?.pars[h] === 3) return null;
      const y = fullR.filter(r => r.fir && r.fir[h] === 'Yes').length;
      return Math.round(y / fullR.length * 100);
    });
    const girP = Array.from({ length: 18 }, (_, h) => {
      const y = fullR.filter(r => r.gir && r.gir[h] === 'Yes').length;
      return Math.round(y / fullR.length * 100);
    });
    dc('fg');
    CH.fg = new Chart(document.getElementById('ch-fg'), {
      type: 'bar',
      data: { labels: Array.from({ length: 18 }, (_, i) => i + 1), datasets: [{ label: 'FIR%', data: firP, backgroundColor: 'rgba(46,204,113,.6)', borderRadius: 2 }, { label: 'GIR%', data: girP, backgroundColor: 'rgba(52,152,219,.6)', borderRadius: 2 }] },
      options: { ...co(), plugins: { legend: { display: true, position: 'top', labels: { color: cc('--chart-tick'), font: { size: 10 }, boxWidth: 10, padding: 8 } } }, scales: { x: { ticks: { color: cc('--chart-tick'), font: { size: 9 } }, grid: { color: cc('--chart-grid') } }, y: { min: 0, max: 100, ticks: { color: cc('--chart-tick'), font: { size: 9 }, callback: v => v + '%' }, grid: { color: cc('--chart-grid') } } } }
    });
  }

  const hist = document.getElementById('st-hist');
  if (!allSorted.length) { hist.innerHTML = '<div class="empty">No rounds yet</div>'; return; }
  hist.innerHTML = '';
  [...allSorted].reverse().forEach(r => {
    const dv = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
    const dot = TC[r.tee]?.d || '#888';
    const d = document.createElement('div');
    d.className = 'hi';
    d.innerHTML = `<div><div class="hc">${r.course}</div><div class="hm"><span class="tdot" style="background:${dot}"></span>${(r.tee || '').charAt(0).toUpperCase() + (r.tee || '').slice(1)} \u00B7 ${r.date} \u00B7 ${r.parsCount || 0}P \u00B7 ${r.bogeys || 0}Bog${r.birdies > 0 ? ` \u00B7 <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>${r.birdies}` : ''}</div></div><div style="text-align:right"><div class="hs">${r.totalScore}</div><div class="hd">${dv} (Par ${r.totalPar})</div></div>`;
    hist.appendChild(d);
  });

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
