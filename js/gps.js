// ─────────────────────────────────────────────────────────────────
// GPS DISTANCE TO GREEN
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { pushData, pushSupabase } from './api.js';
import { getCourseByRef } from './courses.js';

export function haversineYards(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  const metres = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(metres * 1.09361);
}

function getCourseName() {
  return getCourseByRef()?.name || '';
}

function getGreenCoords(hole0) {
  const greens = state.gd.greenCoords?.[getCourseName()];
  if (!greens || !greens[hole0]) return null;
  return greens[hole0];
}

function getTeeCoords(hole0) {
  const tees = state.gd.teeCoords?.[getCourseName()];
  if (!tees || !tees[hole0]) return null;
  return tees[hole0];
}

// startGPSWatch: always starts position watching for the unified live screen.
// Distances show once green coords exist; shows — if missing.
export function startGPSWatch() {
  if (!navigator.geolocation || state.gpsState.watching) return;
  state.gpsState.watching = true;
  state.gpsState.watchId = navigator.geolocation.watchPosition(
    pos => {
      state.gpsState.coords = pos.coords;
      updateGPSDisplay(state.liveState?.hole || 0);
    },
    err => { console.warn('GPS error:', err.message); },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
  );
}

export function startGPS() {
  if (!navigator.geolocation) { alert('GPS not available on this device or browser.'); return; }
  const h = state.liveState?.hole || 0;
  const bar = document.getElementById('gps-bar');
  bar.style.display = 'flex';
  document.getElementById('gps-hole-name').textContent = `Hole ${h+1}`;
  document.getElementById('gps-course-name').textContent = getCourseByRef()?.name || '';

  // Show "Pin tee" button if no tee coords yet
  const teePinBtn = document.getElementById('gps-btn-pin-tee');
  if (teePinBtn) teePinBtn.style.display = getTeeCoords(h) ? 'none' : '';

  // Show tee distance section if tee is already pinned
  const teeWrap = document.getElementById('gps-tee-wrap');
  if (teeWrap) teeWrap.style.display = getTeeCoords(h) ? '' : 'none';

  // Clear any existing watch before starting a new one
  if (state.gpsState.watchId != null) {
    navigator.geolocation.clearWatch(state.gpsState.watchId);
    state.gpsState.watchId = null;
  }
  state.gpsState.watching = true;
  state.gpsState.watchId = navigator.geolocation.watchPosition(
    pos => { state.gpsState.coords = pos.coords; updateGPSDisplay(state.liveState?.hole || 0); },
    err => { document.getElementById('gps-dist').textContent = '—'; console.warn('GPS error:', err.message); },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
  );
}

export function stopGPS() {
  if (state.gpsState.watchId != null) navigator.geolocation.clearWatch(state.gpsState.watchId);
  state.gpsState.watching = false;
  state.gpsState.watchId = null;
  const bar = document.getElementById('gps-bar');
  if (bar) bar.style.display = 'none';
  // Reset distance displays
  ['front','mid','back'].forEach(t => {
    const el = document.getElementById('live-dist-' + t);
    if (el) el.textContent = '—';
  });
  const driveWrap = document.getElementById('drive-log-wrap');
  if (driveWrap) driveWrap.style.display = 'none';
}

export function gpsSetTarget(t) {
  state.gpsState.target = t;
  ['mid','front','back'].forEach(x => {
    const btn = document.getElementById('gps-btn-' + x);
    if (btn) btn.className = 'gps-btn' + (x === t ? ' active' : '');
  });
  if (state.gpsState.coords) updateGPSDisplay(state.liveState?.hole || 0);
}

function _displayDist(yards) {
  const unit = localStorage.getItem('looper_dist_unit') || 'yards';
  if (unit === 'metres') return Math.round(yards / 1.09361);
  return yards;
}

export function updateGPSDisplay(hole0) {
  const green = getGreenCoords(hole0);
  if (!green || !state.gpsState.coords) return;
  const target = green[state.gpsState.target] || green.mid;
  if (!target) return;
  const yards = haversineYards(
    state.gpsState.coords.latitude, state.gpsState.coords.longitude,
    target.lat, target.lng
  );
  document.getElementById('gps-dist').textContent = _displayDist(yards);

  // Update unified live screen distances
  const { latitude: _clat, longitude: _clng } = state.gpsState.coords;
  ['front','mid','back'].forEach(t => {
    const tgt = green[t];
    const y = tgt ? haversineYards(_clat, _clng, tgt.lat, tgt.lng) : null;
    const el = document.getElementById('live-dist-' + t);
    if (el) el.textContent = y !== null ? _displayDist(y) : '—';
  });

  // Show tee distance if tee coords available
  const tee = getTeeCoords(hole0);
  const teeWrap = document.getElementById('gps-tee-wrap');
  if (tee && teeWrap) {
    teeWrap.style.display = '';
    const teeYards = haversineYards(
      state.gpsState.coords.latitude, state.gpsState.coords.longitude,
      tee.lat, tee.lng
    );
    const td = document.getElementById('gps-tee-dist');
    if (td) td.textContent = _displayDist(teeYards);
  }

  updateDriveBtn(hole0);
}

export function pinTeePosition(hole0) {
  if (!navigator.geolocation) { alert('GPS not available.'); return; }
  const btn = document.getElementById('gps-btn-pin-tee');
  if (btn) { btn.textContent = 'Getting GPS...'; btn.disabled = true; }
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const courseName = getCourseName();
    if (!state.gd.teeCoords) state.gd.teeCoords = {};
    if (!state.gd.teeCoords[courseName]) state.gd.teeCoords[courseName] = {};
    state.gd.teeCoords[courseName][hole0] = { lat, lng };
    pushData();
    if (btn) { btn.textContent = 'Tee pinned ✓'; btn.disabled = false; btn.style.display = 'none'; }
    const teeWrap = document.getElementById('gps-tee-wrap');
    if (teeWrap) teeWrap.style.display = '';
    if (state.gpsState.coords) updateGPSDisplay(hole0);
  }, err => {
    if (btn) { btn.textContent = 'Pin tee'; btn.disabled = false; }
    alert('Could not get GPS position — make sure location permission is enabled.');
  }, { enableHighAccuracy: true, timeout: 15000 });
}

// ─────────────────────────────────────────────────────────────────
// DRIVE TRACKING
// Feature toggle — set to false to hide drive tracking UI entirely
// ─────────────────────────────────────────────────────────────────
export const DRIVE_TRACKING = true;

export function updateDriveBtn(hole0, reset = false) {
  const wrap = document.getElementById('drive-log-wrap');
  if (!wrap) return;
  if (!DRIVE_TRACKING) { wrap.style.display = 'none'; return; }
  const hasTee = !!getTeeCoords(hole0);
  const hasGPS = !!state.gpsState.coords;
  wrap.style.display = (hasTee && hasGPS) ? '' : 'none';
  if (reset) {
    const clubRow = document.getElementById('drive-club-row');
    const confirmMsg = document.getElementById('drive-confirm-msg');
    const markBtn = document.getElementById('mark-drive-btn');
    if (clubRow) clubRow.style.display = 'none';
    if (confirmMsg) confirmMsg.textContent = '';
    if (markBtn) markBtn.style.display = '';
  }
}

export function markDriveTap() {
  const clubRow = document.getElementById('drive-club-row');
  const markBtn = document.getElementById('mark-drive-btn');
  if (!clubRow) return;
  const open = clubRow.style.display !== 'none';
  clubRow.style.display = open ? 'none' : 'flex';
  if (markBtn) markBtn.style.display = open ? '' : 'none';
}

export function logDrive(hole0) {
  const tee = getTeeCoords(hole0);
  const msg = document.getElementById('drive-confirm-msg');
  if (!tee || !state.gpsState.coords) {
    if (msg) { msg.style.color = 'var(--double)'; msg.textContent = 'GPS not ready'; }
    return;
  }
  const yards = haversineYards(
    state.gpsState.coords.latitude, state.gpsState.coords.longitude,
    tee.lat, tee.lng
  );
  const club = document.getElementById('drive-club-sel')?.value || 'Driver';
  const drive = {
    player: state.me,
    course: getCourseByRef()?.name || '',
    tee: state.stee || '',
    hole: hole0 + 1,
    club,
    yards,
    date: new Date().toLocaleDateString('en-GB')
  };
  pushSupabase('saveDrive', { drive });

  // Cache on liveState for potential round attachment later
  if (!state.liveState.drives) state.liveState.drives = {};
  state.liveState.drives[hole0] = { club, yards };

  if (msg) { msg.style.color = 'var(--par)'; msg.textContent = `${club} · ${yards} yds ✓`; }
  const clubRow = document.getElementById('drive-club-row');
  const markBtn = document.getElementById('mark-drive-btn');
  if (clubRow) clubRow.style.display = 'none';
  if (markBtn) markBtn.style.display = '';
}
