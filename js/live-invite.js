// ─────────────────────────────────────────────────────────────────
// LIVE INVITE — invite detection, viewer overlay, edit mode
// Viewer side only. Host-side publishing is in live.js.
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { querySupabase, pushSupabase } from './api.js';
import { haversineYards } from './gps.js';
import { IS_NATIVE } from './config.js';

let _invitePollTimer = null;
let _livePollTimer   = null;
let _viewerGpsWatchId = null;

// ── Invite polling ────────────────────────────────────────────────

export function startInvitePolling() {
  if (_invitePollTimer) return;
  _invitePollTimer = setInterval(_checkForInvites, 12000);
}

export function stopInvitePolling() {
  clearInterval(_invitePollTimer);
  _invitePollTimer = null;
}

async function _checkForInvites() {
  // Don't show invites while hosting a round or already watching one
  if (state.roundActive || state.liveInvite.currentRoundId) return;
  if (!state.me || !state.gd?.activeGroupCode) return;

  const res = await querySupabase('pollGroupInvites', {});
  if (!res?.rounds) return;

  const invite = res.rounds.find(r =>
    Array.isArray(r.players) &&
    r.players.includes(state.me) &&
    r.host !== state.me &&
    !state.liveInvite.seenIds.has(String(r.id))
  );
  if (invite) _showInviteToast(invite);
}

function _showInviteToast(round) {
  const toast = document.getElementById('live-invite-toast');
  const msg   = document.getElementById('live-invite-msg');
  if (!toast || !msg) return;
  msg.textContent = `${round.host} is playing at ${round.course || 'Unknown course'} — hole ${(round.hole || 0) + 1} of 18`;
  toast.style.display = 'block';
  toast._roundId = String(round.id);
  toast._round   = round;
}

export function dismissInviteToast() {
  const toast = document.getElementById('live-invite-toast');
  if (!toast) return;
  if (toast._roundId) state.liveInvite.seenIds.add(toast._roundId);
  toast.style.display = 'none';
  toast._roundId = null;
  toast._round   = null;
}

// ── Joining ───────────────────────────────────────────────────────

export function joinLiveRound(mode) {
  const toast = document.getElementById('live-invite-toast');
  const round = toast?._round;
  if (!round) return;
  state.liveInvite.currentRoundId = String(round.id);
  state.liveInvite.mode = mode;
  state.liveInvite.data = round;
  state.liveInvite.minimised = false;
  dismissInviteToast();
  _openOverlay(round);
  _startLivePoll();
}

// ── Live polling ──────────────────────────────────────────────────

function _startLivePoll() {
  clearInterval(_livePollTimer);
  _livePollTimer = setInterval(_refreshLiveView, 10000);
}

function _stopLivePoll() {
  clearInterval(_livePollTimer);
  _livePollTimer = null;
}

async function _refreshLiveView() {
  if (!state.liveInvite.currentRoundId) { _stopLivePoll(); return; }
  const res = await querySupabase('fetchLiveRound', { roundId: Number(state.liveInvite.currentRoundId) });
  if (!res) return;
  if (!res.round || !res.round.players) { _handleRoundEnded(); return; }
  state.liveInvite.data = res.round;
  try { _renderScores(res.round); } catch (_) { /* malformed round data — skip render */ }
  const upd = document.getElementById('lv-updated');
  if (upd) upd.textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ── Rendering ─────────────────────────────────────────────────────

function _openOverlay(round) {
  const overlay = document.getElementById('live-view-overlay');
  if (overlay) overlay.style.display = 'flex';
  _renderScores(round);
  _startViewerGps(round);
}

async function _startViewerGps(round) {
  if (_viewerGpsWatchId != null) return;
  const courseName = round?.course || '';
  const gpsCard = document.getElementById('lv-gps-card');
  const greens = state.gd?.greenCoords?.[courseName];
  if (!greens) return;
  if (gpsCard) gpsCard.style.display = 'block';

  const onPos = (pos) => {
    if (!pos) return;
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const hole0 = state.liveInvite.data?.hole ?? 0;
    const green = greens[hole0];
    if (!green) return;
    const unit = localStorage.getItem('looper_dist_unit') || 'yards';
    const fmt = (y) => unit === 'metres' ? Math.round(y / 1.09361) : y;
    ['front','mid','back'].forEach(t => {
      const tgt = green[t];
      const el = document.getElementById('lv-dist-' + t);
      if (el && tgt) el.textContent = fmt(haversineYards(lat, lng, tgt.lat, tgt.lng));
      else if (el) el.textContent = '—';
    });
  };

  // Clear any existing watch before starting a new one
  await _stopViewerGps();

  if (IS_NATIVE) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      let perm = await Geolocation.checkPermissions();
      if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') {
        perm = await Geolocation.requestPermissions({ permissions: ['location'] });
      }
      if (perm.location !== 'granted') return;
      _viewerGpsWatchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true },
        onPos
      );
    } catch (e) {
      console.warn('[live-invite] GPS failed:', e.message);
      return;
    }
  } else {
    if (!navigator.geolocation) return;
    _viewerGpsWatchId = navigator.geolocation.watchPosition(
      onPos, () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }
}

async function _stopViewerGps() {
  if (_viewerGpsWatchId != null) {
    if (IS_NATIVE) {
      const { Geolocation } = await import('@capacitor/geolocation');
      await Geolocation.clearWatch({ id: _viewerGpsWatchId });
    } else {
      navigator.geolocation.clearWatch(_viewerGpsWatchId);
    }
    _viewerGpsWatchId = null;
  }
  const gpsCard = document.getElementById('lv-gps-card');
  if (gpsCard) gpsCard.style.display = 'none';
}

function _renderScores(round) {
  const title = document.getElementById('lv-title');
  const holeNum = document.getElementById('lv-hole-num');
  const parEl   = document.getElementById('lv-par');
  if (title)   title.textContent = round.course || '—';
  if (holeNum) holeNum.textContent = (round.hole || 0) + 1;
  if (parEl)   parEl.textContent  = (round.pars || [])[round.hole || 0] || '—';

  const players = round.players || [];
  const scores  = round.scores  || {};
  const pars    = round.pars    || Array(18).fill(4);
  const h       = round.hole    || 0;

  const grid = document.getElementById('lv-scores-grid');
  if (grid) {
    grid.innerHTML = players.map(name => {
      const sc      = scores[name] || Array(18).fill(null);
      const played  = sc.slice(0, h + 1).filter(s => s != null);
      const parsPlayed = pars.slice(0, played.length).reduce((a, b) => a + b, 0);
      const totalPlayed = played.reduce((a, b) => a + b, 0);
      const runDiff = played.length ? totalPlayed - parsPlayed : null;
      const diffStr = runDiff == null ? 'E' : runDiff > 0 ? `+${runDiff}` : runDiff === 0 ? 'E' : `${runDiff}`;
      const hScore  = sc[h];
      const hPar    = pars[h] || 4;
      const hDiff   = hScore != null ? hScore - hPar : null;
      const scoreCol = hDiff == null ? 'var(--dim)'
        : hDiff < -1 ? 'var(--eagle)'
        : hDiff === -1 ? 'var(--birdie)'
        : hDiff === 0  ? 'var(--par)'
        : hDiff === 1  ? 'var(--bogey)'
        : 'var(--double)';
      const isMe = name === state.me;
      return `<div style="display:flex;align-items:center;padding:10px 12px;border-radius:10px;margin-bottom:6px;background:${isMe ? 'rgba(201,168,76,.08)' : 'var(--card)'};border:1px solid ${isMe ? 'rgba(201,168,76,.25)' : 'var(--border)'}">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--mid);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${isMe ? 'var(--gold)' : 'var(--dim)'};margin-right:10px;flex-shrink:0;font-family:'DM Sans',sans-serif">${name.substring(0,2).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}${isMe ? ' <span style="font-size:10px;color:var(--gold);font-weight:400">(you)</span>' : ''}</div>
          <div style="font-size:11px;color:var(--dim)">Thru ${played.length} · <span style="color:${runDiff == null ? 'var(--dim)' : runDiff < 0 ? 'var(--birdie)' : runDiff === 0 ? 'var(--par)' : 'var(--bogey)'}">${diffStr}</span></div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:20px;font-weight:700;color:${scoreCol}">${hScore != null ? hScore : '·'}</div>
          <div style="font-size:10px;color:var(--dimmer)">H${h + 1}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Mini bar text
  const miniText = document.getElementById('lv-mini-text');
  if (miniText) {
    const mySc = scores[state.me] || Array(18).fill(null);
    const myPlayed = mySc.slice(0, h + 1).filter(s => s != null);
    const myDiff   = myPlayed.length
      ? myPlayed.reduce((a, b) => a + b, 0) - pars.slice(0, myPlayed.length).reduce((a, b) => a + b, 0)
      : null;
    const myDiffStr = myDiff == null ? '' : myDiff > 0 ? ` · +${myDiff}` : myDiff === 0 ? ' · E' : ` · ${myDiff}`;
    miniText.textContent = `Live · H${h + 1}${myDiffStr}`;
  }

  // Edit row
  const editRow = document.getElementById('lv-edit-row');
  const toggleBtn = document.getElementById('lv-toggle-edit-btn');
  const inEdit = state.liveInvite.mode === 'edit';
  if (editRow) editRow.style.display = inEdit ? 'block' : 'none';
  if (toggleBtn) toggleBtn.textContent = inEdit ? 'Switch to view only' : 'Edit my scores';
  if (inEdit) _renderEditRow(round);
}

function _renderEditRow(round) {
  const h       = round.hole || 0;
  const scores  = round.scores || {};
  const myScore = (scores[state.me] || [])[h];
  const par     = (round.pars || [])[h] || 4;
  const val     = document.getElementById('lv-score-val');
  const holeEl  = document.getElementById('lv-edit-hole');
  if (val)    { val.textContent = myScore ?? par; val._score = myScore ?? par; }
  if (holeEl) holeEl.textContent = h + 1;
}

// ── Edit mode actions ─────────────────────────────────────────────

export function liveViewScoreAdj(delta) {
  const val = document.getElementById('lv-score-val');
  if (!val) return;
  const next = Math.max(1, (Number(val._score) || 4) + delta);
  val.textContent = next;
  val._score = next;
  // Colour the value by diff vs par
  const h   = state.liveInvite.data?.hole || 0;
  const par = (state.liveInvite.data?.pars || [])[h] || 4;
  const d   = next - par;
  val.style.color = d < -1 ? 'var(--eagle)' : d === -1 ? 'var(--birdie)' : d === 0 ? 'var(--par)' : d === 1 ? 'var(--bogey)' : 'var(--double)';
}

export async function submitEditorScore() {
  if (!state.liveInvite.currentRoundId) return;
  const val   = document.getElementById('lv-score-val');
  const score = Number(val?._score) || 4;
  const h     = state.liveInvite.data?.hole ?? 0;
  const btn   = document.getElementById('lv-submit-score-btn');

  await pushSupabase('updateEditorScores', {
    roundId: Number(state.liveInvite.currentRoundId),
    player: state.me,
    hole: h,
    score
  });

  // Optimistic local update
  if (state.liveInvite.data) {
    if (!state.liveInvite.data.scores) state.liveInvite.data.scores = {};
    if (!state.liveInvite.data.scores[state.me]) state.liveInvite.data.scores[state.me] = Array(18).fill(null);
    state.liveInvite.data.scores[state.me][h] = score;
    _renderScores(state.liveInvite.data);
  }

  if (btn) {
    const orig = btn.textContent;
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = orig; }, 1800);
  }
}

export function toggleEditMode() {
  state.liveInvite.mode = state.liveInvite.mode === 'edit' ? 'view' : 'edit';
  if (state.liveInvite.data) _renderScores(state.liveInvite.data);
}

// ── Minimise / restore / leave ────────────────────────────────────

export function minimiseLiveView() {
  state.liveInvite.minimised = true;
  const overlay = document.getElementById('live-view-overlay');
  const mini    = document.getElementById('live-view-mini');
  if (overlay) overlay.style.display = 'none';
  if (mini)    mini.style.display = 'flex';
}

export function restoreLiveView() {
  state.liveInvite.minimised = false;
  const overlay = document.getElementById('live-view-overlay');
  const mini    = document.getElementById('live-view-mini');
  if (overlay) overlay.style.display = 'flex';
  if (mini)    mini.style.display = 'none';
  if (state.liveInvite.data) _renderScores(state.liveInvite.data);
}

export function leaveLiveView() {
  _stopLivePoll();
  _stopViewerGps();
  state.liveInvite.currentRoundId = null;
  state.liveInvite.mode = null;
  state.liveInvite.data = null;
  state.liveInvite.minimised = false;
  document.getElementById('live-view-overlay').style.display = 'none';
  document.getElementById('live-view-mini').style.display = 'none';
}

function _handleRoundEnded() {
  _stopLivePoll();
  const grid = document.getElementById('lv-scores-grid');
  if (grid) grid.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--dim);font-size:13px">The host has finished and saved this round.</div>';
  const title = document.getElementById('lv-title');
  if (title) title.textContent = 'Round ended';
  setTimeout(leaveLiveView, 4000);
}
