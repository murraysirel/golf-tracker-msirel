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
  const matchBtn = document.getElementById('fmt-match');
  const sixesBtn = document.getElementById('fmt-sixes');
  const wolfHint = document.getElementById('wolf-need-4');
  const matchHint = document.getElementById('match-need-2');
  const sixesHint = document.getElementById('sixes-need-3');

  const isWolf = state.gameMode === 'wolf';
  const isMatch = state.gameMode === 'match';
  const isSixes = state.gameMode === 'sixes';

  // Old hidden fpill buttons
  if (strokeBtn) strokeBtn.classList.toggle('active', !isWolf && !isMatch && !isSixes);
  if (wolfBtn) wolfBtn.classList.toggle('active', isWolf);
  if (matchBtn) matchBtn.classList.toggle('active', isMatch);
  if (sixesBtn) sixesBtn.classList.toggle('active', isSixes);

  if (wolfHint) wolfHint.style.display = isWolf ? 'block' : 'none';
  if (matchHint) matchHint.style.display = isMatch ? 'block' : 'none';
  if (sixesHint) sixesHint.style.display = isSixes ? 'block' : 'none';

  // Sync new format slider — for stroke mode, preserve user's visual choice (stroke vs stableford pill)
  let idx;
  if (isWolf) idx = 3;
  else if (isMatch) idx = 2;
  else if (isSixes) idx = 4;
  else idx = (typeof window._formatSliderIdx === 'function') ? window._formatSliderIdx() : 1;
  const glider = document.getElementById('format-glider');
  if (glider) glider.style.transform = `translateX(${idx * 100}%)`;
  document.querySelectorAll('#format-slider .format-option').forEach(o => {
    o.classList.toggle('active', parseInt(o.dataset.idx) === idx);
  });
  // Game info button visibility (wolf, sixes, match)
  const infoWrap = document.getElementById('game-info-btns');
  if (infoWrap) infoWrap.style.display = (isWolf || isSixes || isMatch) ? 'block' : 'none';
}

// ── State Init ────────────────────────────────────────────────────

export function initWolfState(group) {
  state.wolfState = {
    order: [...group],
    scores: Object.fromEntries(group.map(p => [p, 0])),
    sixPointerUsed: Object.fromEntries(group.map(p => [p, false])),
    wolfShotStarted: {},   // { holeIdx: true } — set when wolf first adjusts score
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
  const sixAvailable = !state.wolfState.sixPointerUsed[wolf];
  const shotStarted = state.wolfState.wolfShotStarted?.[holeIdx] || false;

  // Show/hide 6-pointer button; attach handler once via flag
  const sixBtn = document.getElementById('wolf-6pointer-btn');
  if (sixBtn) {
    const show6 = sixAvailable && !shotStarted && !(setup?.isSixPointer);
    sixBtn.style.display = show6 ? 'inline-block' : 'none';
    if (!sixBtn._wolfHandlerAttached) {
      sixBtn._wolfHandlerAttached = true;
      sixBtn.addEventListener('click', () => show6PointerModal(state.liveState.hole));
    }
  }

  let statusHtml = '';
  if (setup?.locked) {
    if (setup.isSixPointer) {
      statusHtml = '<span style="font-size:11px;color:var(--eagle)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px"><polygon points="10 1 4 10 9 10 8 17 14 8 9 8 10 1"/></svg>6-pointer</span>';
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

// ── 6-pointer declaration modal (Fix 3) ──────────────────────────

export function show6PointerModal(holeIdx) {
  const setup = getOrCreateSetup(holeIdx);
  if (setup.isSixPointer || setup.locked) return;

  const modal = document.getElementById('wolf-6pointer-modal');
  const inner = document.getElementById('wolf-6pointer-inner');
  if (!modal || !inner) return;

  inner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:16px;font-weight:700;color:var(--cream)">Declare Lone Wolf?</div>
      <button id="sp-close" style="background:none;border:none;color:var(--dim);cursor:pointer;line-height:1;padding:0 0 0 12px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/></svg></button>
    </div>
    <div style="font-size:13px;color:var(--dim);margin-bottom:20px;line-height:1.5">Win = 6 pts. Lose = 3 pts each to opponents. Once per round.</div>
    <button id="sp-yes" style="width:100%;padding:14px;border-radius:10px;background:var(--gold);border:none;color:var(--navy);font-size:15px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;margin-bottom:8px;display:block">Yes — stake it</button>
    <button id="sp-no" style="width:100%;padding:14px;border-radius:10px;background:var(--mid);border:1px solid var(--border);color:var(--dim);font-size:15px;font-family:'DM Sans',sans-serif;cursor:pointer;display:block">Not this hole</button>`;

  document.getElementById('sp-yes').addEventListener('click', () => {
    declareSixPointer(holeIdx);
    modal.style.display = 'none';
    updateWolfBanner(holeIdx);
  });
  document.getElementById('sp-no').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  document.getElementById('sp-close').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.style.display = 'block';
}

// ── Partner prompt modal (Fix 2) — single centred modal ──────────

export function showPartnerPrompt(holeIdx) {
  const setup = getOrCreateSetup(holeIdx);
  if (setup.locked) return;

  const modal = document.getElementById('wolf-partner-modal');
  const inner = document.getElementById('wolf-partner-inner');
  if (!modal || !inner) return;

  const wolf = setup.wolf;
  const nonWolf = getNonWolfOrder(holeIdx);

  const playerCards = nonWolf.map(name => `
    <button class="wp-pick-btn" data-player="${name}" style="width:100%;padding:14px;border-radius:10px;background:var(--mid);border:1px solid var(--border);color:var(--cream);font-size:15px;font-weight:500;font-family:'DM Sans',sans-serif;cursor:pointer;margin-bottom:8px;text-align:left;display:block">${name}</button>`).join('');

  inner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div style="font-size:16px;font-weight:700;color:var(--cream)">${wolf} — pick your partner</div>
      <button id="wp-close" style="background:none;border:none;color:var(--dim);cursor:pointer;line-height:1;padding:0 0 0 12px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/></svg></button>
    </div>
    ${playerCards}
    <button id="wp-lone-wolf" style="width:100%;padding:14px;border-radius:10px;background:var(--mid);border:1px solid var(--border);color:var(--bogey);font-size:15px;font-weight:500;font-family:'DM Sans',sans-serif;cursor:pointer;text-align:left;display:block">Go it alone — Lone Wolf</button>`;

  const close = (isLone) => {
    modal.style.display = 'none';
    if (isLone) setHoleLoneWolf(holeIdx);
    updateWolfBanner(holeIdx);
  };

  inner.querySelectorAll('.wp-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setHolePartner(holeIdx, btn.dataset.player);
      close(false);
    });
  });
  document.getElementById('wp-lone-wolf').addEventListener('click', () => close(true));
  document.getElementById('wp-close').addEventListener('click', () => close(true));

  modal.style.display = 'block';
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
      <div style="font-size:28px;font-weight:700;color:${posColors[i]}">${s.points}</div>
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
        <span style="font-size:20px;font-weight:700;color:var(--gold)">${total}</span>
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

// ── Order setup (Fix 1) — drag to reorder ────────────────────────

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
    <div class="card wolf-order-card" draggable="true" data-idx="${i}"
         style="margin-bottom:8px;display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:grab;touch-action:none;user-select:none;transition:opacity .15s,border-top .1s">
      <div style="color:var(--dimmer);font-size:20px;line-height:1;flex-shrink:0;letter-spacing:-1px">≡</div>
      <div style="width:28px;height:28px;border-radius:50%;background:var(--gold);color:var(--navy);font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
      <div style="flex:1;font-size:14px;font-weight:500;color:${name === state.me ? 'var(--gold)' : 'var(--cream)'}">${name}</div>
    </div>`).join('');

  const cards = Array.from(container.querySelectorAll('.wolf-order-card'));
  let dragIdx = null;

  // ── HTML5 Drag (desktop) ─────────────────────────────────────
  cards.forEach(card => {
    const idx = parseInt(card.dataset.idx);

    card.addEventListener('dragstart', e => {
      dragIdx = idx;
      card.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.style.opacity = '';
      cards.forEach(c => { c.style.borderTop = ''; });
      dragIdx = null;
    });

    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const toIdx = parseInt(card.dataset.idx);
      cards.forEach(c => { c.style.borderTop = ''; });
      if (toIdx !== dragIdx) card.style.borderTop = '2px solid var(--gold)';
    });

    card.addEventListener('drop', e => {
      e.preventDefault();
      const toIdx = parseInt(card.dataset.idx);
      if (dragIdx !== null && dragIdx !== toIdx) {
        const ord = state.wolfState._tempOrder;
        const [item] = ord.splice(dragIdx, 1);
        ord.splice(toIdx, 0, item);
        renderOrderCards();
      }
    });
  });

  // ── Touch (iOS Safari) ───────────────────────────────────────
  let touchDragIdx = null;

  cards.forEach(card => {
    const idx = parseInt(card.dataset.idx);

    card.addEventListener('touchstart', e => {
      touchDragIdx = idx;
      card.style.opacity = '0.4';
      e.preventDefault();
    }, { passive: false });

    card.addEventListener('touchmove', e => {
      e.preventDefault();
      const y = e.touches[0].clientY;
      cards.forEach(c => { c.style.borderTop = ''; });
      for (const c of cards) {
        const rect = c.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          const overIdx = parseInt(c.dataset.idx);
          if (overIdx !== touchDragIdx) c.style.borderTop = '2px solid var(--gold)';
          break;
        }
      }
    }, { passive: false });

    card.addEventListener('touchend', e => {
      const y = e.changedTouches[0].clientY;
      cards.forEach(c => { c.style.opacity = ''; c.style.borderTop = ''; });

      let dropIdx = null;
      for (const c of cards) {
        const rect = c.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          dropIdx = parseInt(c.dataset.idx);
          break;
        }
      }

      if (touchDragIdx !== null && dropIdx !== null && touchDragIdx !== dropIdx) {
        const ord = state.wolfState._tempOrder;
        const [item] = ord.splice(touchDragIdx, 1);
        ord.splice(dropIdx, 0, item);
        renderOrderCards();
      }
      touchDragIdx = null;
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

// ─────────────────────────────────────────────────────────────────
// SIXES GAME MODE ENGINE
// ─────────────────────────────────────────────────────────────────

export function initSixesState(group) {
  state.sixesState = {
    players: [...group],
  };
}

// How many handicap strokes a player receives on a given hole
function _sixesStrokesOnHole(hcp, siVal) {
  const base = Math.floor(hcp / 18);
  // Extra stroke on holes up to (hcp % 18) — SI is 1-based, so SI ≤ remainder
  const remainder = hcp % 18;
  const extra = remainder > 0 && siVal <= remainder ? 1 : 0;
  return base + extra;
}

// Calculate the points distribution for one hole from current state.
// Returns { playerName: pts } or null if any player's score is missing.
function _sixesHolePts(h, groupScores, hcpOverrides, si) {
  const ws = state.sixesState;
  if (!ws) return null;
  const siVal = si?.[h] ?? (h + 1);

  const netScores = ws.players.map(name => {
    const gross = groupScores[name]?.[h];
    if (gross == null) return null;
    const hcp = hcpOverrides?.[name] ?? 0;
    return { name, net: gross - _sixesStrokesOnHole(hcp, siVal) };
  });

  if (netScores.some(x => x === null)) return null; // incomplete hole

  const sorted = [...netScores].sort((a, b) => a.net - b.net);
  const [n0, n1, n2] = sorted.map(x => x.net);

  let ptsArr;
  if (n0 === n1 && n1 === n2)   ptsArr = [2, 2, 2];  // all tie
  else if (n0 === n1)           ptsArr = [3, 3, 0];  // two tie for first
  else if (n1 === n2)           ptsArr = [4, 1, 1];  // two tie for second
  else                          ptsArr = [4, 2, 0];  // all different

  return Object.fromEntries(sorted.map((x, i) => [x.name, ptsArr[i]]));
}

// Compute running standings across all 18 holes from current live state.
export function getSixesStandings() {
  const ws = state.sixesState;
  if (!ws) return [];
  const si = state.scannedSI?.some(v => v != null) ? state.scannedSI : null;
  const totals = Object.fromEntries(ws.players.map(p => [p, 0]));

  for (let h = 0; h < 18; h++) {
    const pts = _sixesHolePts(h, state.liveState.groupScores, state.liveState.hcpOverrides, si);
    if (pts) {
      for (const [name, p] of Object.entries(pts)) totals[name] += p;
    }
  }

  return [...ws.players]
    .map(name => ({ name, points: totals[name] }))
    .sort((a, b) => b.points - a.points);
}

// Return the points breakdown for a single hole (for current-hole display).
export function getSixesHolePts(h) {
  const si = state.scannedSI?.some(v => v != null) ? state.scannedSI : null;
  return _sixesHolePts(h, state.liveState.groupScores, state.liveState.hcpOverrides, si);
}

// Update the sixes live bar and inline player pts.
export function updateSixesBanner(h) {
  const bar = document.getElementById('sixes-live-bar');
  if (!bar || state.gameMode !== 'sixes') { if (bar) bar.style.display = 'none'; return; }
  const ws = state.sixesState;
  if (!ws) { bar.style.display = 'none'; return; }

  bar.style.display = 'block';

  const standings = getSixesStandings();
  const medals = ['🥇', '🥈', '🥉'];
  const standingsEl = document.getElementById('sixes-standings');
  if (standingsEl) {
    standingsEl.innerHTML = `<div style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap">` +
      standings.map((p, i) =>
        `<div style="text-align:center"><div style="font-size:18px;line-height:1">${medals[i] || ''}</div><div style="font-size:12px;font-weight:600;color:var(--cream);margin-top:2px">${p.name.split(' ')[0]}</div><div style="font-size:11px;color:var(--gold);font-weight:700">${p.points} pts</div></div>`
      ).join('') + '</div>';
  }

  const holePts = getSixesHolePts(h);
  const holeEl = document.getElementById('sixes-hole-pts');
  if (holeEl) {
    if (holePts) {
      const parts = Object.entries(holePts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, pts]) => `${name.split(' ')[0]}: ${pts}pts`);
      holeEl.innerHTML = '<div style="margin-top:8px;font-size:13px;font-weight:600;color:var(--cream)">This hole</div><div style="font-size:12px;color:var(--dim);margin-top:2px">' + parts.join(' · ') + '</div>';
    } else {
      holeEl.innerHTML = '<div style="font-size:11px;color:var(--dimmer);margin-top:6px">Enter all three scores to see hole result</div>';
    }
  }

  // Update inline pts labels inside each player row
  standings.forEach(p => {
    const el = document.querySelector(`.sixes-player-pts[data-player="${p.name}"]`);
    if (el) el.textContent = `${p.points}pts`;
  });
}

export function isSixesRound() {
  return state.gameMode === 'sixes' && !!(state.sixesState?.players?.length);
}

// Produce a save-friendly summary of the Sixes result.
export function sixesGetSaveData() {
  const standings = getSixesStandings();
  const ws = state.sixesState;
  if (!ws || !standings.length) return null;
  const si = state.scannedSI?.some(v => v != null) ? state.scannedSI : null;
  const holeBreakdown = Array.from({ length: 18 }, (_, h) =>
    _sixesHolePts(h, state.liveState.groupScores, state.liveState.hcpOverrides, si)
  );
  return {
    players: ws.players,
    standings,
    holeBreakdown,
    winner: standings[0]?.name || ''
  };
}
