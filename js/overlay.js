// ─────────────────────────────────────────────────────────────────
// MATCH OVERLAY — live leaderboard widget during a group match round
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { getMatchLeaderboard } from './competition.js';

// ── Module state ──────────────────────────────────────────────────
let _visible = false;
let _minimised = false;
let _showMe = false;
let _format = 'net'; // 'net' | 'stableford' (stableford TBD in future session)
let _overlayStyle = 'default'; // 'default' | 'frosted'

// ── Active match helper ───────────────────────────────────────────

function findActiveMatch() {
  if (!state.currentMatchId) return null;
  const match = state.gd.matches?.[state.currentMatchId];
  return (match && match.status === 'active') ? match : null;
}

// ── Position dot colours ──────────────────────────────────────────

const POS_COLORS = { 1: '#c9a84c', 2: '#a0aec0', 3: '#cd7f32' };

function _posDisplay(pos) {
  if (pos == null) return '<span class="match-pos" style="color:var(--dimmer)">—</span>';
  const color = POS_COLORS[pos] || 'var(--dim)';
  return `<span class="match-pos" style="color:${color}">${pos}</span>`;
}

function _scoreColor(net) {
  if (net == null) return 'var(--dimmer)';
  if (net < 0) return 'var(--birdie)';
  if (net === 0) return 'var(--par)';
  return 'var(--bogey)';
}

function _scoreStr(net) {
  if (net == null) return '—';
  if (net === 0) return 'E';
  return net > 0 ? '+' + net : String(net);
}

// ── Display entry selection ───────────────────────────────────────

function _getDisplayEntries(entries) {
  const played = entries.filter(e => e.holesPlayed > 0);

  if (!_showMe) {
    // Top 3 view — first 3 players with holes played (or all if fewer)
    return played.slice(0, 3);
  }

  // Show Me view — player above, me, player below
  const myIdx = entries.findIndex(e => e.isMe);
  if (myIdx === -1) return played.slice(0, 3);

  const above = myIdx > 0 ? entries[myIdx - 1] : null;
  const me = entries[myIdx];
  const below = myIdx < entries.length - 1 ? entries[myIdx + 1] : null;

  // Always return 3 slots (null = placeholder)
  return [above, me, below];
}

// ── Build a single row HTML ───────────────────────────────────────

function _rowHtml(entry) {
  if (!entry) {
    // Blank placeholder when player is 1st or last
    return '<div class="match-overlay-row" style="opacity:0;pointer-events:none"><span class="match-pos">—</span><span class="match-name">—</span><span class="match-score">—</span></div>';
  }
  const firstName = entry.name.split(' ')[0];
  const scColor = _scoreColor(entry.netTotal);
  const scStr = _scoreStr(entry.netTotal);
  return `<div class="match-overlay-row${entry.isMe ? ' is-me' : ''}">
    ${_posDisplay(entry.position)}
    <span class="match-name">${firstName}</span>
    <span class="match-score" style="color:${scColor}">${scStr}</span>
  </div>`;
}

// ── Render rows into the overlay ──────────────────────────────────

function _renderRows(entries) {
  const rowsEl = document.getElementById('match-overlay-rows');
  if (!rowsEl) return;

  // Update match name in header
  const nameEl = document.getElementById('match-overlay-name');
  const match = findActiveMatch();
  if (nameEl && match) nameEl.textContent = match.name;

  const display = _getDisplayEntries(entries);
  if (!display.length && !_showMe) {
    rowsEl.innerHTML = '<div style="font-size:11px;color:var(--dimmer);text-align:center;padding:6px 0">Waiting for scores…</div>';
    return;
  }

  rowsEl.innerHTML = display.map(_rowHtml).join('');
}

// ── Minimised pill update ─────────────────────────────────────────

function _updateMinPill(entries) {
  const pill = document.getElementById('match-min-pill');
  if (!pill) return;
  const me = entries.find(e => e.isMe);
  const posStr = me?.position != null ? '#' + me.position : '?';
  const scStr = me?.netTotal != null ? _scoreStr(me.netTotal) : '—';
  const textEl = document.getElementById('match-pill-text');
  if (textEl) textEl.textContent = posStr + '  ' + scStr;
}

// ── Apply visual style ────────────────────────────────────────────

function _applyStyle() {
  const overlay = document.getElementById('match-overlay');
  if (!overlay) return;
  overlay.classList.toggle('frosted', _overlayStyle === 'frosted');
}

// ── Show / Hide ───────────────────────────────────────────────────

export function showMatchOverlay() {
  if (!findActiveMatch()) return; // nothing to show if no active match
  _visible = true;
  _minimised = false;
  const overlay = document.getElementById('match-overlay');
  const pill = document.getElementById('match-min-pill');
  if (overlay) { overlay.style.display = 'block'; _applyStyle(); }
  if (pill) pill.style.display = 'none';
  refreshMatchOverlay();
}

export function hideMatchOverlay() {
  _visible = false;
  const overlay = document.getElementById('match-overlay');
  const pill = document.getElementById('match-min-pill');
  if (overlay) overlay.style.display = 'none';
  if (pill) pill.style.display = 'none';
}

// ── Refresh (called after every score change or Gist poll) ────────

export function refreshMatchOverlay() {
  if (!_visible) return;
  const match = findActiveMatch();
  if (!match) { hideMatchOverlay(); return; }

  const entries = getMatchLeaderboard(state.currentMatchId);

  if (_minimised) {
    _updateMinPill(entries);
  } else {
    _renderRows(entries);
  }
}

// ── End round confirmation ────────────────────────────────────────

export function showEndRoundConfirm() {
  // Lazily create the confirmation modal
  let modal = document.getElementById('end-round-confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'end-round-confirm-modal';
    modal.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.55)', 'z-index:1001',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:16px', 'box-sizing:border-box'
    ].join(';');
    modal.innerHTML = `
      <div style="background:var(--card);border-radius:16px;padding:24px 20px;
        border:1px solid var(--border);width:min(300px,100%);text-align:center">
        <div style="font-size:17px;font-weight:700;color:var(--cream);margin-bottom:6px;
          font-family:'Cormorant Garamond',serif">End this round?</div>
        <div style="font-size:13px;color:var(--dim);margin-bottom:20px;line-height:1.5">
          Your progress will not be saved.
        </div>
        <div style="display:flex;gap:8px">
          <button id="end-round-confirm-yes"
            style="flex:1;padding:13px;border-radius:10px;
              background:rgba(231,76,60,.18);border:1px solid rgba(231,76,60,.35);
              color:#e8a09a;font-size:14px;font-weight:600;
              font-family:'DM Sans',sans-serif;cursor:pointer">
            Yes, end it
          </button>
          <button id="end-round-confirm-no"
            style="flex:1;padding:13px;border-radius:10px;
              background:var(--mid);border:1px solid var(--border);
              color:var(--cream);font-size:14px;font-weight:600;
              font-family:'DM Sans',sans-serif;cursor:pointer">
            Keep going
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('end-round-confirm-no').addEventListener('click', () => {
      modal.style.display = 'none';
    });
    document.getElementById('end-round-confirm-yes').addEventListener('click', () => {
      modal.style.display = 'none';
      // Dynamic import avoids circular dep (overlay ↔ live)
      import('./live.js').then(({ cancelRound }) => cancelRound(true));
    });
  }
  modal.style.display = 'flex';
}

// ── Init (called once from app.js) ───────────────────────────────

export function initMatchOverlay() {
  _overlayStyle = localStorage.getItem('rr_overlay_style') || 'default';
  _applyStyle();

  // Style toggle (◑ button)
  document.getElementById('match-overlay-style-btn')?.addEventListener('click', () => {
    _overlayStyle = _overlayStyle === 'frosted' ? 'default' : 'frosted';
    localStorage.setItem('rr_overlay_style', _overlayStyle);
    _applyStyle();
  });

  // Minimise (− button)
  document.getElementById('match-overlay-min-btn')?.addEventListener('click', () => {
    _minimised = true;
    document.getElementById('match-overlay').style.display = 'none';
    const pill = document.getElementById('match-min-pill');
    if (pill) pill.style.display = 'flex';
    const entries = state.currentMatchId ? getMatchLeaderboard(state.currentMatchId) : [];
    _updateMinPill(entries);
  });

  // Minimised pill — tap to expand
  document.getElementById('match-min-pill')?.addEventListener('click', () => {
    _minimised = false;
    const overlay = document.getElementById('match-overlay');
    const pill = document.getElementById('match-min-pill');
    if (overlay) { overlay.style.display = 'block'; _applyStyle(); }
    if (pill) pill.style.display = 'none';
    refreshMatchOverlay();
  });

  // Show Me / Top 3 toggle
  document.getElementById('match-overlay-toggle-btn')?.addEventListener('click', () => {
    _showMe = !_showMe;
    const btn = document.getElementById('match-overlay-toggle-btn');
    if (btn) btn.textContent = _showMe ? 'Top 3' : 'Show me';
    if (_visible) refreshMatchOverlay();
  });

  // Format tabs: Net / Stableford
  document.getElementById('match-fmt-net')?.addEventListener('click', () => {
    _format = 'net';
    document.getElementById('match-fmt-net')?.classList.add('active');
    document.getElementById('match-fmt-stab')?.classList.remove('active');
    if (_visible) refreshMatchOverlay();
  });
  document.getElementById('match-fmt-stab')?.addEventListener('click', () => {
    _format = 'stableford';
    document.getElementById('match-fmt-stab')?.classList.add('active');
    document.getElementById('match-fmt-net')?.classList.remove('active');
    if (_visible) refreshMatchOverlay();
  });
}
