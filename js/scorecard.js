// ─────────────────────────────────────────────────────────────────
// SCORECARD
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { getCourseByRef } from './courses.js';
import { pushGist } from './api.js';

export function scoreClass(d) {
  if (d <= -2) return 's-eagle';
  if (d === -1) return 's-birdie';
  if (d === 0) return 's-par';
  if (d === 1) return 's-bogey';
  if (d === 2) return 's-double';
  return 's-triple';
}

export function scoreCol(d) {
  if (d <= -2) return 'var(--eagle)';
  if (d === -1) return 'var(--birdie)';
  if (d === 0) return 'var(--par)';
  if (d === 1) return 'var(--bogey)';
  return 'var(--double)';
}

export function buildSC(pf, pp) {
  const tb = document.getElementById('sc-body');
  tb.innerHTML = '';
  const ci = document.getElementById('course-sel')?.value;
  const course = ci !== '' ? getCourseByRef(ci) : null;
  const teeData = course?.tees?.[state.stee];
  const hYards = teeData?.hy || null;
  const siArr = teeData?.si || (state.scannedSI?.some(v => v != null) ? state.scannedSI : null);
  let op = 0, ip = 0, oY = 0, iY = 0;
  for (let h = 0; h < 18; h++) {
    if (h === 9) {
      const s = document.createElement('tr');
      s.className = 'sub';
      const yDisp = oY ? `<td style="font-size:10px;color:var(--dim)">${oY}</td>` : `<td>—</td>`;
      s.innerHTML = `<td colspan="2" style="text-align:left;padding-left:7px;font-size:10px;letter-spacing:1px">OUT</td>${yDisp}<td style="font-size:10px;color:var(--dimmer)">—</td><td id="out-s" style="color:var(--gold)">—</td><td colspan="3">${op}</td>`;
      tb.appendChild(s);
    }
    const r = document.createElement('tr');
    if (h % 2 === 1) r.className = 'alt';
    const sv = pf ? (pf[h] != null ? pf[h] : '') : '';
    const pv = pp ? (pp[h] != null ? pp[h] : '') : '';
    const isP3 = state.cpars[h] === 3;
    const yd = hYards?.[h];
    const ydCell = yd ? `<td style="font-size:10px;color:var(--dim)">${yd}</td>` : `<td style="font-size:10px;color:var(--dimmer)">—</td>`;
    const siVal = siArr?.[h];
    const siCell = siVal != null ? `<td style="font-size:10px;color:var(--dim)">${siVal}</td>` : `<td style="font-size:10px;color:var(--dimmer)">—</td>`;
    const firOpts = isP3 ? '<option value="N/A">N/A</option>' : '<option value="">—</option><option value="Yes">Yes</option><option value="No">No</option>';
    r.innerHTML = `<td class="hn">${h+1}</td><td class="pc">${state.cpars[h]}</td>${ydCell}${siCell}<td><input type="number" id="h${h}" min="1" max="15" value="${sv}" placeholder="—" data-hole="${h}" style="width:36px"></td><td><input type="number" id="p${h}" min="0" max="6" value="${pv}" placeholder="—" style="width:36px"></td><td><select id="fir${h}" style="font-size:10px;padding:3px 1px;min-width:42px">${firOpts}</select></td><td><select id="gir${h}" style="font-size:10px;padding:3px 1px;min-width:42px"><option value="">—</option><option value="Yes">Yes</option><option value="No">No</option></select></td>`;
    tb.appendChild(r);
    if (h < 9) { op += state.cpars[h]; if (yd) oY += yd; }
    else { ip += state.cpars[h]; if (yd) iY += yd; }
  }
  const is = document.createElement('tr');
  is.className = 'sub';
  const iYDisp = iY ? `<td style="font-size:10px;color:var(--dim)">${iY}</td>` : `<td>—</td>`;
  is.innerHTML = `<td colspan="2" style="text-align:left;padding-left:7px;font-size:10px;letter-spacing:1px">IN</td>${iYDisp}<td style="font-size:10px;color:var(--dimmer)">—</td><td id="in-s" style="color:var(--gold)">—</td><td colspan="3">${ip}</td>`;
  tb.appendChild(is);
  document.getElementById('tot-bar').style.display = 'flex';
  recalc();

  // Bind score input events after building
  for (let h = 0; h < 18; h++) {
    const inp = document.getElementById('h' + h);
    if (inp) {
      inp.addEventListener('input', () => { recalc(); autoAdv(h); });
    }
  }
}

export function recalc() {
  let tot = 0, out = 0, inp = 0, par = 0, n = 0;
  for (let h = 0; h < 18; h++) {
    const v = parseInt(document.getElementById('h' + h)?.value);
    par += state.cpars[h];
    if (!isNaN(v)) { tot += v; n++; if (h < 9) out += v; else inp += v; }
  }
  const oe = document.getElementById('out-s'), ie = document.getElementById('in-s');
  if (oe) oe.textContent = out || '—';
  if (ie) ie.textContent = inp || '—';
  if (!n) {
    document.getElementById('tot-s').textContent = '—';
    document.getElementById('tot-vp').textContent = '—';
    return;
  }
  document.getElementById('tot-s').textContent = tot;
  document.getElementById('tot-out').textContent = out || '—';
  document.getElementById('tot-in').textContent = inp || '—';
  const d = tot - par;
  const vp = d === 0 ? 'E' : (d > 0 ? '+' + d : '' + d);
  const el = document.getElementById('tot-vp');
  el.textContent = vp + ' (Par ' + par + ')';
  el.style.color = d < 0 ? 'var(--birdie)' : d > 0 ? 'var(--bogey)' : 'var(--dim)';
}

export function autoAdv(h) {
  const inp = document.getElementById('h' + h);
  if (!inp) return;
  const v = parseInt(inp.value);
  if (isNaN(v) || v < 1 || v > 12) return;
  const raw = inp.value;
  if (raw.length >= 2 || (raw.length === 1 && v >= 1)) {
    setTimeout(() => {
      const next = document.getElementById('h' + (h + 1));
      if (next) { next.focus(); next.select(); }
    }, 60);
  }
}

export async function saveRound() {
  const ci = document.getElementById('course-sel').value;
  if (!ci) { alert('Please select a course.'); return; }
  if (!state.stee) { alert('Please select a tee colour.'); return; }
  const c = getCourseByRef(ci);
  const t = c.tees[state.stee];
  const sc = [], pt = [], fi = [], gi = [];
  for (let h = 0; h < 18; h++) {
    sc.push(parseInt(document.getElementById('h' + h)?.value) || null);
    pt.push(parseInt(document.getElementById('p' + h)?.value) || null);
    fi.push(document.getElementById('fir' + h)?.value || '');
    gi.push(document.getElementById('gir' + h)?.value || '');
  }
  const vs = sc.filter(Boolean);
  const ts = vs.reduce((a, b) => a + b, 0);
  const tp = state.cpars.reduce((a, b) => a + b, 0);
  const d = ts - tp;
  const target = state.scoringFor || state.me;
  const rnd = {
    id: Date.now(), player: target, course: c.name, loc: c.loc || c.location || '', tee: state.stee,
    date: document.getElementById('r-date').value,
    notes: document.getElementById('r-notes').value,
    pars: [...state.cpars], scores: sc, putts: pt, fir: fi, gir: gi,
    totalScore: ts, totalPar: tp, diff: d,
    birdies: sc.filter((s, i) => s && s < state.cpars[i]).length,
    parsCount: sc.filter((s, i) => s && s === state.cpars[i]).length,
    bogeys: sc.filter((s, i) => s && s === state.cpars[i] + 1).length,
    doubles: sc.filter((s, i) => s && s >= state.cpars[i] + 2).length,
    eagles: sc.filter((s, i) => s && s <= state.cpars[i] - 2).length,
    penalties: parseInt(document.getElementById('r-pen')?.value) || 0,
    bunkers: parseInt(document.getElementById('r-bun')?.value) || 0,
    chips: parseInt(document.getElementById('r-chip')?.value) || 0,
    rating: t.r, slope: t.s
  };
  if (!state.gd.players[target]) state.gd.players[target] = { handicap: 0, rounds: [] };
  state.gd.players[target].rounds.push(rnd);
  const ok = await pushGist();
  if (ok) localStorage.removeItem('rr_live_backup');
  const syncMsg = ok ? '\u2705 Saved & synced!' : '\u26A0\uFE0F Saved locally \u2014 will sync when connection resumes';
  alert(`${syncMsg}\n\n${c.name} \u00B7 ${state.stee} tees\n${ts} (${d >= 0 ? '+' : ''}${d} vs Par ${tp})`);

  // Show match context sheet if other players exist (non-blocking — round already saved)
  const otherPlayers = Object.keys(state.gd.players).filter(p => p !== target);
  if (ok && otherPlayers.length > 0) {
    import('./players.js').then(({ showMatchContextSheet }) => showMatchContextSheet(target, rnd.id));
  }
  // Clear form
  document.getElementById('course-sel').value = '';
  document.getElementById('tee-wrap').style.display = 'none';
  if (document.getElementById('tee-info')) document.getElementById('tee-info').textContent = '';
  if (document.getElementById('r-notes')) document.getElementById('r-notes').value = '';
  if (document.getElementById('r-pen')) document.getElementById('r-pen').value = '';
  if (document.getElementById('r-bun')) document.getElementById('r-bun').value = '';
  if (document.getElementById('r-chip')) document.getElementById('r-chip').value = '';
  document.getElementById('r-date').value = new Date().toLocaleDateString('en-GB');
  if (document.getElementById('sc-body')) document.getElementById('sc-body').innerHTML = '';
  if (document.getElementById('tot-bar')) document.getElementById('tot-bar').style.display = 'none';
  // Reset live round state
  state.liveState = {
    hole: 0, scores: Array(18).fill(null), putts: Array(18).fill(null),
    fir: Array(18).fill(''), gir: Array(18).fill(''), notes: Array(18).fill(''),
    group: [], groupScores: {}, groupPutts: {}, groupFir: {}, groupGir: {},
    matchPlay: false, matchFormat: 'singles', matchResult: null, hcpOverrides: {}
  };
  state.cpars = Array(18).fill(4);
  state.stee = '';
  import('./nav.js').then(({ goTo }) => {
    import('./stats.js').then(({ renderHomeStats }) => {
      renderHomeStats();
      goTo('stats');
    });
  });
}

export function toggleSCExtras() {
  const table = document.querySelector('.scorecard-table');
  const toggle = document.getElementById('sc-extras-toggle');
  if (!table) return;
  const visible = table.classList.toggle('sc-extras-visible');
  if (toggle) toggle.textContent = visible ? 'Less −' : 'More +';
}
