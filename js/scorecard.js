// ─────────────────────────────────────────────────────────────────
// SCORECARD
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { getCourseByRef, clearCourseSelection } from './courses.js';
import { pushData, pushSupabase, updateUnsyncedBadge, ss } from './api.js';

function _handleSaveError(context, error, roundData) {
  console.error(`[saveRound] ${context}:`, error);
  if (window.Sentry) {
    Sentry.withScope(scope => {
      scope.setContext('round', {
        player: roundData?.player,
        course: roundData?.course,
        date:   roundData?.date,
        score:  roundData?.totalScore,
      });
      scope.setTag('failure_context', context);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  }
  const toast = window._looperToast || ((msg) => alert(msg));
  if (context === 'validation') {
    toast(error.message, 'error', 6000);
  } else {
    toast('Round saved locally — will sync when connection returns.', 'info', 7000);
  }
}

// Convert YYYY-MM-DD (native date input) → DD/MM/YYYY (stored format)
function toGBDate(isoDate) {
  if (!isoDate) return new Date().toLocaleDateString('en-GB');
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate; // already DD/MM/YYYY or unknown
  return d + '/' + m + '/' + y;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

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
  const hYards = state.activeHoleYards?.length === 18 ? state.activeHoleYards : null;
  const siArr  = state.scannedSI?.some(v => v != null) ? state.scannedSI : null;
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

  // Bind score/putts input events after building
  // Flow: score → putts (same hole) → next hole score → ...
  let scoreAdvTimer = null, puttsAdvTimer = null;
  for (let h = 0; h < 18; h++) {
    const scoreInp = document.getElementById('h' + h);
    const puttsInp = document.getElementById('p' + h);
    const girSel   = document.getElementById('gir' + h);

    // Auto-populate GIR when score and putts are both known.
    // GIR = on green in (par - 2) strokes or fewer → (score - putts) <= (par - 2)
    function autoGir() {
      if (!girSel) return;
      const score = parseInt(scoreInp?.value);
      const putts = parseInt(puttsInp?.value);
      if (isNaN(score) || isNaN(putts)) return;
      const par = state.cpars[h];
      girSel.value = (score - putts) <= (par - 2) ? 'Yes' : 'No';
    }

    if (scoreInp) {
      scoreInp.addEventListener('focus', function() { this.select(); });
      scoreInp.addEventListener('touchstart', function() { setTimeout(() => this.select(), 0); }, { passive: true });
      scoreInp.addEventListener('input', () => {
        recalc();
        autoGir();
        clearTimeout(scoreAdvTimer);
        const v = parseInt(scoreInp.value);
        // Only auto-advance on single-digit input (mobile style)
        if (scoreInp.value.length === 1 && !isNaN(v) && v >= 1 && v <= 9) {
          scoreAdvTimer = setTimeout(() => {
            if (puttsInp) { puttsInp.focus(); puttsInp.select(); }
          }, 300);
        }
      });
    }
    if (puttsInp) {
      puttsInp.addEventListener('focus', function() { this.select(); });
      puttsInp.addEventListener('touchstart', function() { setTimeout(() => this.select(), 0); }, { passive: true });
      puttsInp.addEventListener('blur', function() {
        const scoreEl = document.getElementById('h' + h);
        const maxPutts = parseInt(scoreEl?.value);
        if (!isNaN(maxPutts) && parseInt(this.value) > maxPutts) this.value = maxPutts;
      });
      puttsInp.addEventListener('input', () => {
        autoGir();
        clearTimeout(puttsAdvTimer);
        const v = parseInt(puttsInp.value);
        if (puttsInp.value.length === 1 && !isNaN(v) && v >= 0 && v <= 9) {
          puttsAdvTimer = setTimeout(() => {
            if (h < 17) {
              const nextScore = document.getElementById('h' + (h + 1));
              if (nextScore) { nextScore.focus(); nextScore.select(); }
            } else {
              document.getElementById('save-round-btn')?.focus();
            }
          }, 300);
        }
      });
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

export function saveRound() {
  if (state.demoMode) { alert('Round saving is disabled in demo mode.'); return; }

  // ── Validation ─────────────────────────────────────────────────
  const c = getCourseByRef();
  if (!c) { _handleSaveError('validation', new Error('Please select a course before saving.'), null); return; }
  if (!state.stee) { _handleSaveError('validation', new Error('Please select a tee colour before saving.'), null); return; }

  const sc = [], pt = [], fi = [], gi = [];
  for (let h = 0; h < 18; h++) {
    sc.push(parseInt(document.getElementById('h' + h)?.value) || null);
    pt.push(parseInt(document.getElementById('p' + h)?.value) || null);
    fi.push(document.getElementById('fir' + h)?.value || '');
    gi.push(document.getElementById('gir' + h)?.value || '');
  }
  const vs = sc.filter(Boolean);
  if (!vs.length) { _handleSaveError('validation', new Error('Enter at least one hole score before saving.'), null); return; }

  // ── Build round object ─────────────────────────────────────────
  let rnd;
  try {
    const tees = Array.isArray(c.tees) ? c.tees : [];
    const t = tees.find(tee => tee.colour === state.stee) || tees[0] || {};
    const ts = vs.reduce((a, b) => a + b, 0);
    const tp = state.cpars.reduce((a, b) => a + b, 0);
    const d = ts - tp;
    const target = state.scoringFor || state.me;
    rnd = {
      id: Date.now(), player: target, course: c.name, loc: c.loc || c.location || '', tee: state.stee,
      date: toGBDate(document.getElementById('r-date')?.value),
      notes: document.getElementById('r-notes')?.value || '',
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
      rating: t.rating, slope: t.slope
    };

    // ── Append to state ──────────────────────────────────────────
    if (!state.gd.players[target]) state.gd.players[target] = { handicap: 0, rounds: [] };
    state.gd.players[target].rounds.push(rnd);

    // ── Write to localStorage FIRST (before any network call) ────
    try {
      localStorage.setItem('gt_localdata', JSON.stringify(state.gd));
    } catch (lsErr) {
      _handleSaveError('localStorage', lsErr, rnd);
      // Don't return — round is in state.gd, continue to try network sync
    }

    // ── Success toast immediately ────────────────────────────────
    const toast = window._looperToast;
    if (toast) toast('Round saved! Syncing to cloud\u2026', 'success', 3000);

    // ── Network sync — fire-and-forget ───────────────────────────
    pushData().catch(err => _handleSaveError('pushData', err, rnd));

    const playerData = {
      name: target,
      email: state.gd.players[target]?.email || null,
      dob: state.gd.players[target]?.dob || null,
      handicap: state.gd.players[target]?.handicap || 0,
      matchCode: state.gd.players[target]?.matchCode || null
    };
    pushSupabase('saveRound', { round: rnd, playerData }).catch(err => _handleSaveError('pushSupabase', err, rnd));

    // ── Post-save: match context, putts nudge (non-blocking) ─────
    const otherPlayers = Object.keys(state.gd.players).filter(p => p !== target);
    if (otherPlayers.length > 0) {
      import('./players.js').then(({ showMatchContextSheet }) => showMatchContextSheet(target, rnd.id)).catch(() => {});
    }

    const hasPutts = (rnd.putts || []).some(v => v != null && v > 0);
    if (!hasPutts) {
      const dismissed = JSON.parse(localStorage.getItem('rr_putts_dismissed') || '[]');
      if (!dismissed.includes(rnd.id)) showPuttsNudge(rnd);
    }

  } catch (err) {
    _handleSaveError('unexpected', err, rnd || null);
    return;
  }

  // ── Clear form ─────────────────────────────────────────────────
  clearCourseSelection();
  document.getElementById('tee-wrap').style.display = 'none';
  if (document.getElementById('tee-info')) document.getElementById('tee-info').textContent = '';
  if (document.getElementById('r-notes')) document.getElementById('r-notes').value = '';
  if (document.getElementById('r-pen')) document.getElementById('r-pen').value = '';
  if (document.getElementById('r-bun')) document.getElementById('r-bun').value = '';
  if (document.getElementById('r-chip')) document.getElementById('r-chip').value = '';
  document.getElementById('r-date').value = todayISO();
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

// ── Post-round putts nudge (Fix 8) ───────────────────────────────

function showPuttsNudge(rnd) {
  let banner = document.getElementById('putts-nudge-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'putts-nudge-banner';
    banner.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0',
      'background:var(--mid)', 'border-top:1px solid var(--gold)',
      'padding:12px 16px', 'z-index:9000',
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'gap:12px', 'font-family:"DM Sans",sans-serif'
    ].join(';');
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <span style="font-size:13px;color:var(--cream);flex:1">Add your putts for richer stats</span>
    <button id="pn-add" style="padding:8px 16px;border-radius:20px;background:var(--gold);border:none;color:var(--navy);font-size:13px;font-weight:600;cursor:pointer">Add putts</button>
    <button id="pn-skip" style="padding:8px 14px;border-radius:20px;background:transparent;border:1px solid var(--border);color:var(--dim);font-size:12px;cursor:pointer">Skip</button>`;
  banner.style.display = 'flex';

  document.getElementById('pn-skip').addEventListener('click', () => {
    const dismissed = JSON.parse(localStorage.getItem('rr_putts_dismissed') || '[]');
    dismissed.push(rnd.id);
    localStorage.setItem('rr_putts_dismissed', JSON.stringify(dismissed));
    banner.style.display = 'none';
  });

  document.getElementById('pn-add').addEventListener('click', () => {
    banner.style.display = 'none';
    showPuttsOnlyEntry(rnd);
  });
}

function showPuttsOnlyEntry(rnd) {
  let modal = document.getElementById('putts-entry-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'putts-entry-modal';
    modal.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9100',
      'background:var(--navy)', 'overflow-y:auto',
      'font-family:"DM Sans",sans-serif', 'padding:16px'
    ].join(';');
    document.body.appendChild(modal);
  }

  const pars = rnd.pars || Array(18).fill(4);
  const rows = rnd.scores.map((sc, h) => {
    const scCol = sc != null ? scoreCol(sc - pars[h]) : 'var(--dim)';
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--wa-06)">
        <span style="font-size:12px;color:var(--dim);width:44px">Hole ${h + 1}</span>
        <span style="font-size:20px;font-weight:700;color:${scCol};width:32px;text-align:center">${sc != null ? sc : '—'}</span>
        <span style="font-size:11px;color:var(--dimmer);flex:1">putts</span>
        <input type="number" id="pe-p${h}" min="0" max="${sc || 6}" value="0"
          style="width:52px;text-align:center;font-size:16px;padding:6px;border-radius:8px;
            background:var(--mid);border:1px solid var(--border);color:var(--cream)">
      </div>`;
  }).join('');

  modal.innerHTML = `
    <div style="font-size:18px;font-weight:700;color:var(--cream);margin-bottom:4px">Add putts</div>
    <div style="font-size:12px;color:var(--dim);margin-bottom:16px">${rnd.course} · ${rnd.date}</div>
    ${rows}
    <button id="pe-save" style="width:100%;padding:14px;border-radius:10px;background:var(--gold);border:none;
      color:var(--navy);font-size:15px;font-weight:700;cursor:pointer;margin-top:16px">Save putts</button>
    <button id="pe-cancel" style="width:100%;padding:10px;margin-top:8px;border-radius:10px;background:transparent;
      border:1px solid var(--border);color:var(--dim);font-size:13px;cursor:pointer">Cancel</button>`;

  // Select-on-focus + cap at score + auto-advance
  for (let h = 0; h < 18; h++) {
    const inp = document.getElementById('pe-p' + h);
    if (!inp) continue;
    inp.addEventListener('focus', function() { this.select(); });
    inp.addEventListener('touchstart', function() { setTimeout(() => this.select(), 0); }, { passive: true });
    inp.addEventListener('blur', function() {
      const maxV = rnd.scores[h] || 6;
      if (parseInt(this.value) > maxV) this.value = maxV;
    });
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const next = document.getElementById('pe-p' + (h + 1));
        if (next) { next.focus(); next.select(); }
        else document.getElementById('pe-save')?.focus();
      }
    });
  }

  document.getElementById('pe-cancel').addEventListener('click', () => { modal.style.display = 'none'; });

  document.getElementById('pe-save').addEventListener('click', async () => {
    const newPutts = Array.from({ length: 18 }, (_, h) => parseInt(document.getElementById('pe-p' + h)?.value) || 0);
    const target = rnd.player || state.me;
    const playerRounds = state.gd.players[target]?.rounds || [];
    const idx = playerRounds.findIndex(r => r.id === rnd.id);
    if (idx !== -1) {
      const r = playerRounds[idx];
      r.putts = newPutts;
      // Derive GIR from the now-known putts + existing scores/pars
      r.gir = Array.from({ length: 18 }, (_, h) => {
        const sc = r.scores?.[h];
        const pt = newPutts[h];
        const par = (r.pars?.[h]) ?? 4;
        if (sc == null || pt == null) return r.gir?.[h] || '';
        return (sc - pt) <= (par - 2) ? 'Yes' : 'No';
      });
      await pushData();
    }
    modal.style.display = 'none';
    // Clear nudge dismissed entry since putts are now added
    const dismissed = JSON.parse(localStorage.getItem('rr_putts_dismissed') || '[]');
    const filtered = dismissed.filter(id => id !== rnd.id);
    localStorage.setItem('rr_putts_dismissed', JSON.stringify(filtered));
  });

  modal.style.display = 'block';
}

export function toggleSCExtras() {
  const table = document.querySelector('.scorecard-table');
  const toggle = document.getElementById('sc-extras-toggle');
  if (!table) return;
  const visible = table.classList.toggle('sc-extras-visible');
  if (toggle) toggle.textContent = visible ? 'Less −' : 'More +';
}
