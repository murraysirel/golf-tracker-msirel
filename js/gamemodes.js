// ─────────────────────────────────────────────────────────────────
// WOLF GAME MODE ENGINE
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';

// ── Format UI ─────────────────────────────────────────────────────

export function setGameMode(mode) {
  state.gameMode = mode;
  updateFormatUI();
}

export function updateFormatUI() {
  const wolfBtn = document.getElementById('fmt-wolf');
  const strokeBtn = document.getElementById('fmt-stroke');
  const hint = document.getElementById('wolf-need-4');
  if (!wolfBtn || !strokeBtn) return;

  const playerCount = Object.keys(state.gd?.players || {}).length;
  const canWolf = playerCount >= 4;

  wolfBtn.disabled = !canWolf;
  wolfBtn.style.opacity = canWolf ? '' : '0.45';
  wolfBtn.style.cursor = canWolf ? '' : 'not-allowed';
  wolfBtn.title = canWolf ? '' : 'Wolf requires exactly 4 players';
  if (hint) hint.style.display = !canWolf ? 'block' : 'none';

  const isWolf = state.gameMode === 'wolf';
  strokeBtn.classList.toggle('active', !isWolf);
  wolfBtn.classList.toggle('active', isWolf && canWolf);
  if (!canWolf && isWolf) state.gameMode = 'stroke';
}

// ── State Init ────────────────────────────────────────────────────

export function initWolfState(group) {
  state.wolfState = {
    order: [...group],
    scores: Object.fromEntries(group.map(p => [p, 0])),
    sixPointerUsed: Object.fromEntries(group.map(p => [p, false])),
    holeResults: [],
    holeSetup: {}
  };
}

// ── Rotation ──────────────────────────────────────────────────────

export function getWolfForHole(holeIdx) {
  const ws = state.wolfState;
  if (!ws?.order?.length) return null;
  if (holeIdx <= 15) return ws.order[holeIdx % 4];
  // Holes 17–18: second place in standings
  const standings = getWolfStandings();
  if (standings.length < 2) return ws.order[holeIdx % 4];
  const secondPts = standings[1].points;
  const tied = standings.filter(s => s.points === secondPts);
  // Earliest in original order wins tie
  let wolf = null, bestIdx = Infinity;
  tied.forEach(s => {
    const i = ws.order.indexOf(s.name);
    if (i < bestIdx) { bestIdx = i; wolf = s.name; }
  });
  return wolf;
}

export function getNonWolfOrder(holeIdx) {
  const ws = state.wolfState;
  const wolf = getWolfForHole(holeIdx);
  const wolfIdx = ws.order.indexOf(wolf);
  return [1, 2, 3].map(i => ws.order[(wolfIdx + i) % 4]);
}

// ── Standings ─────────────────────────────────────────────────────

export function getWolfStandings() {
  const ws = state.wolfState;
  if (!ws) return [];
  return ws.order
    .map(name => ({ name, points: ws.scores[name] || 0, usedSix: ws.sixPointerUsed[name] || false }))
    .sort((a, b) => b.points - a.points);
}

// ── Hole setup ────────────────────────────────────────────────────

function getOrCreateSetup(holeIdx) {
  if (!state.wolfState.holeSetup[holeIdx]) {
    state.wolfState.holeSetup[holeIdx] = {
      wolf: getWolfForHole(holeIdx),
      partner: null,
      isLoneWolf: false,
      isSixPointer: false,
      locked: false
    };
  }
  return state.wolfState.holeSetup[holeIdx];
}

export function isHoleSetupLocked(holeIdx) {
  return state.wolfState?.holeSetup?.[holeIdx]?.locked || false;
}

export function declareSixPointer(holeIdx) {
  const s = getOrCreateSetup(holeIdx);
  s.isSixPointer = true;
  s.isLoneWolf = true;
  s.partner = 'lone';
  s.locked = true;
  state.wolfState.sixPointerUsed[s.wolf] = true;
}

export function setHolePartner(holeIdx, partnerName) {
  const s = getOrCreateSetup(holeIdx);
  s.partner = partnerName;
  s.isLoneWolf = false;
  s.locked = true;
}

export function setHoleLoneWolf(holeIdx) {
  const s = getOrCreateSetup(holeIdx);
  s.partner = 'lone';
  s.isLoneWolf = true;
  s.locked = true;
}

// ── Points calculation ────────────────────────────────────────────

export function calcHolePoints(holeIdx, groupScores, pars) {
  const ws = state.wolfState;
  if (!ws) return null;
  const setup = ws.holeSetup[holeIdx];
  if (!setup?.locked) return null;

  const { wolf, partner, isLoneWolf, isSixPointer } = setup;
  const nonWolf = ws.order.filter(n => n !== wolf);
  const sc = name => groupScores[name]?.[holeIdx] ?? null;
  if (ws.order.some(n => sc(n) == null)) return null;

  const pts = Object.fromEntries(ws.order.map(n => [n, 0]));
  let description = '';

  const wolfScore = sc(wolf);

  if (isLoneWolf) {
    const minOpp = Math.min(...nonWolf.map(n => sc(n)));
    const winPts = isSixPointer ? 6 : 3;
    const losePts = isSixPointer ? 3 : 1;
    if (wolfScore < minOpp) {
      pts[wolf] = winPts;
      description = `${wolf} wins Lone Wolf (+${winPts})`;
    } else if (wolfScore > minOpp) {
      nonWolf.forEach(n => { pts[n] = losePts; });
      description = `Wolf loses — opponents +${losePts} each`;
    } else {
      description = 'Tied — no points';
    }
  } else {
    const partnerScore = sc(partner);
    const opponents = nonWolf.filter(n => n !== partner);
    const wolfPairBest = Math.min(wolfScore, partnerScore);
    const oppBest = Math.min(...opponents.map(n => sc(n)));
    if (wolfPairBest < oppBest) {
      pts[wolf] = 2; pts[partner] = 2;
      description = `${wolf} & ${partner} win (+2 each)`;
    } else if (oppBest < wolfPairBest) {
      opponents.forEach(n => { pts[n] = 3; });
      description = `${opponents.join(' & ')} win (+3 each)`;
    } else {
      description = 'Tied — no points';
    }
  }

  ws.order.forEach(n => { ws.scores[n] = (ws.scores[n] || 0) + pts[n]; });
  ws.holeResults.push({
    hole: holeIdx + 1, wolf, partner: isLoneWolf ? null : partner,
    isLoneWolf, isSixPointer, winner: description,
    pointsAwarded: { ...pts }
  });

  return { points: pts, description };
}

// ── Wolf banner ───────────────────────────────────────────────────

export function updateWolfBanner(holeIdx) {
  const bar = document.getElementById('wolf-live-bar');
  const banner = document.getElementById('wolf-hole-banner');
  if (!bar || !banner) return;

  if (!state.wolfState?.order?.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';

  const wolf = getWolfForHole(holeIdx);
  const setup = state.wolfState.holeSetup?.[holeIdx];

  let statusHtml = '';
  if (setup?.locked) {
    if (setup.isSixPointer) {
      statusHtml = '<span style="font-size:11px;color:var(--eagle)">⚡ 6-pointer</span>';
    } else if (setup.isLoneWolf) {
      statusHtml = '<span style="font-size:11px;color:var(--birdie)">Lone Wolf</span>';
    } else {
      statusHtml = `<span style="font-size:11px;color:var(--par)">+ ${setup.partner}</span>`;
    }
  } else {
    statusHtml = `<button id="wolf-setup-btn" style="font-size:11px;padding:4px 10px;border-radius:12px;border:1px solid var(--gold);background:rgba(201,168,76,.1);color:var(--gold);cursor:pointer;font-family:'DM Sans',sans-serif">Set up →</button>`;
  }

  banner.innerHTML = `
    <span style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--gold)">Wolf</span>
    <span style="font-size:14px;font-weight:600;color:var(--cream);margin:0 6px">${wolf}</span>
    <span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--gold);color:var(--navy);font-size:8px;font-weight:700">W</span>
    <span style="margin-left:10px">${statusHtml}</span>`;

  document.getElementById('wolf-setup-btn')?.addEventListener('click', () => showPartnerPrompt(holeIdx));
}

// ── Partner prompt modal ──────────────────────────────────────────

export function showPartnerPrompt(holeIdx) {
  const setup = getOrCreateSetup(holeIdx);
  if (setup.locked) return;
  const modal = document.getElementById('wolf-partner-modal');
  if (!modal) return;

  const wolf = setup.wolf;
  const nonWolf = getNonWolfOrder(holeIdx);
  const sixAvailable = !state.wolfState.sixPointerUsed[wolf];

  modal.style.display = 'flex';
  if (sixAvailable) {
    renderSixPointerOffer(holeIdx, wolf, nonWolf, modal);
  } else {
    renderPartnerStep(holeIdx, 0, wolf, nonWolf, modal);
  }
}

function renderSixPointerOffer(holeIdx, wolf, nonWolf, modal) {
  const inner = document.getElementById('wolf-partner-inner');
  if (!inner) return;
  inner.innerHTML = `
    <div style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:14px">Hole ${holeIdx + 1} — ${wolf} is the Wolf</div>
    <div style="font-size:15px;font-weight:500;color:var(--cream);margin-bottom:6px">Declare Lone Wolf?</div>
    <div style="font-size:12px;color:var(--dim);line-height:1.5;margin-bottom:20px">Win = <strong style="color:var(--cream)">+6 pts</strong> · Lose = opponents <strong style="color:var(--cream)">+3 each</strong>. One use per round.</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" id="wp-no-six" style="flex:1">No — play normal</button>
      <button class="btn" id="wp-yes-six" style="flex:1">⚡ Stake it</button>
    </div>`;
  document.getElementById('wp-yes-six').addEventListener('click', () => {
    declareSixPointer(holeIdx);
    modal.style.display = 'none';
    updateWolfBanner(holeIdx);
  });
  document.getElementById('wp-no-six').addEventListener('click', () => {
    renderPartnerStep(holeIdx, 0, wolf, nonWolf, modal);
  });
}

function renderPartnerStep(holeIdx, idx, wolf, nonWolf, modal) {
  const inner = document.getElementById('wolf-partner-inner');
  if (!inner) return;

  if (idx >= nonWolf.length) {
    setHoleLoneWolf(holeIdx);
    modal.style.display = 'none';
    updateWolfBanner(holeIdx);
    return;
  }

  const player = nonWolf[idx];
  inner.innerHTML = `
    <div style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:14px">Hole ${holeIdx + 1} — ${wolf} is the Wolf</div>
    <div style="font-size:15px;font-weight:500;color:var(--cream);margin-bottom:4px">${player} has teed off</div>
    <div style="font-size:12px;color:var(--dim);margin-bottom:20px">Call them as your partner?</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" id="wp-pass" style="flex:1">Pass</button>
      <button class="btn" id="wp-pick" style="flex:1">Partner! 🤝</button>
    </div>
    <div id="wp-undo" style="display:none;text-align:center;margin-top:12px"></div>`;

  document.getElementById('wp-pass').addEventListener('click', () => {
    renderPartnerStep(holeIdx, idx + 1, wolf, nonWolf, modal);
  });

  document.getElementById('wp-pick').addEventListener('click', () => {
    setHolePartner(holeIdx, player);
    const undoEl = document.getElementById('wp-undo');
    undoEl.style.display = 'block';
    let sec = 5;
    const render = () => {
      undoEl.innerHTML = `<button id="wp-undo-btn" style="background:none;border:1px solid var(--wa-1);border-radius:8px;padding:4px 12px;color:var(--dim);font-size:11px;cursor:pointer;font-family:'DM Sans',sans-serif">Undo (${sec}s)</button>`;
      document.getElementById('wp-undo-btn').addEventListener('click', () => {
        clearInterval(timer);
        state.wolfState.holeSetup[holeIdx].locked = false;
        state.wolfState.holeSetup[holeIdx].partner = null;
        renderPartnerStep(holeIdx, idx, wolf, nonWolf, modal);
      });
    };
    render();
    const timer = setInterval(() => {
      sec--;
      if (sec <= 0) { clearInterval(timer); modal.style.display = 'none'; updateWolfBanner(holeIdx); return; }
      render();
    }, 1000);
  });
}

// ── Scoreboard modal ──────────────────────────────────────────────

export function showWolfScoreboard() {
  const modal = document.getElementById('wolf-scoreboard-modal');
  const inner = document.getElementById('wolf-scoreboard-inner');
  if (!modal || !inner || !state.wolfState) return;

  const standings = getWolfStandings();
  const posColors = ['var(--gold)', 'var(--dim)', 'var(--dimmer)', 'var(--dimmer)'];
  inner.innerHTML = standings.map((s, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--wa-05)">
      <div style="width:26px;height:26px;border-radius:50%;background:${i === 0 ? 'var(--gold)' : 'var(--wa-06)'};color:${i === 0 ? 'var(--navy)' : 'var(--dim)'};font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:${s.name === state.me ? 'var(--gold)' : 'var(--cream)'}">${s.name}</div>
        ${s.usedSix ? '<div style="font-size:10px;color:var(--dimmer)">6-pointer used</div>' : ''}
      </div>
      <div style="font-family:\'Cormorant Garamond\',serif;font-size:28px;font-weight:700;color:${posColors[i]}">${s.points}</div>
    </div>`).join('');
  modal.style.display = 'flex';
}

// ── Hole result modal ─────────────────────────────────────────────

export function showHoleResult(result, holeIdx, onClose) {
  const modal = document.getElementById('wolf-result-modal');
  const inner = document.getElementById('wolf-result-inner');
  if (!modal || !inner) { if (onClose) onClose(); return; }
  if (!result) { if (onClose) onClose(); return; }

  const { points, description } = result;
  const ws = state.wolfState;
  const rows = ws.order.map(n => {
    const pts = points[n] || 0;
    const total = ws.scores[n] || 0;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--wa-04)">
      <span style="font-size:13px;color:${n === state.me ? 'var(--gold)' : 'var(--cream)'}">${n}</span>
      <span>
        <span style="font-size:13px;color:${pts > 0 ? 'var(--par)' : 'var(--dimmer)'};margin-right:10px">${pts > 0 ? '+' + pts : '—'}</span>
        <span style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--gold)">${total}</span>
      </span>
    </div>`;
  }).join('');

  inner.innerHTML = `
    <div style="font-size:14px;font-weight:500;color:var(--cream);margin-bottom:14px">${description}</div>
    ${rows}
    <div style="font-size:10px;color:var(--dimmer);text-align:center;margin-top:14px">Tap anywhere to continue</div>`;

  modal.style.display = 'flex';
  const close = () => { clearTimeout(autoTimer); modal.style.display = 'none'; modal.onclick = null; if (onClose) onClose(); };
  const autoTimer = setTimeout(close, 4000);
  modal.onclick = close;
}

// ── Order setup ───────────────────────────────────────────────────

export function showWolfOrderSetup(group) {
  document.getElementById('live-group-setup').style.display = 'none';
  document.getElementById('live-hole-view').style.display = 'none';
  const orderSetup = document.getElementById('wolf-order-setup');
  if (!orderSetup) return;
  orderSetup.style.display = 'block';
  if (!state.wolfState) state.wolfState = {};
  state.wolfState._tempOrder = [...group];
  renderOrderCards();
}

function renderOrderCards() {
  const container = document.getElementById('wolf-order-cards');
  if (!container) return;
  const order = state.wolfState._tempOrder;
  container.innerHTML = order.map((name, i) => `
    <div class="card" style="margin-bottom:8px;display:flex;align-items:center;gap:12px;padding:12px 14px">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--gold);color:var(--navy);font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
      <div style="flex:1;font-size:14px;font-weight:500;color:${name === state.me ? 'var(--gold)' : 'var(--cream)'}">${name}</div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button data-move="${i}" data-dir="-1" class="btn btn-ghost" style="width:auto;padding:4px 10px;font-size:14px;min-height:0" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button data-move="${i}" data-dir="1" class="btn btn-ghost" style="width:auto;padding:4px 10px;font-size:14px;min-height:0" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
      </div>
    </div>`).join('');
  container.querySelectorAll('[data-move]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.move);
      const dir = parseInt(btn.dataset.dir);
      const newIdx = idx + dir;
      const ord = state.wolfState._tempOrder;
      if (newIdx < 0 || newIdx >= ord.length) return;
      [ord[idx], ord[newIdx]] = [ord[newIdx], ord[idx]];
      renderOrderCards();
    });
  });
}

export async function confirmWolfOrder() {
  const order = state.wolfState._tempOrder;
  if (!order?.length) return;
  initWolfState(order);
  document.getElementById('wolf-order-setup').style.display = 'none';
  document.getElementById('live-hole-view').style.display = 'block';
  const { liveRenderPips, liveGoto } = await import('./live.js');
  liveRenderPips();
  liveGoto(0);
}

// ── Save data ─────────────────────────────────────────────────────

export function wolfGetSaveData() {
  const ws = state.wolfState;
  if (!ws?.order?.length) return null;
  return {
    order: ws.order,
    finalScores: { ...ws.scores },
    holeResults: ws.holeResults,
    winner: getWolfStandings()[0]?.name || ''
  };
}

export function isWolfRound() {
  return state.gameMode === 'wolf' && !!(state.wolfState?.order?.length);
}
