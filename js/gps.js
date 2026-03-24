// ─────────────────────────────────────────────────────────────────
// GPS DISTANCE TO GREEN
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { pushGist } from './api.js';
import { getCourseByRef } from './courses.js';

function haversineYards(lat1, lng1, lat2, lng2) {
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

  state.gpsState.watching = true;
  state.gpsState.watchId = navigator.geolocation.watchPosition(
    pos => { state.gpsState.coords = pos.coords; updateGPSDisplay(h); },
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
}

export function gpsSetTarget(t) {
  state.gpsState.target = t;
  ['mid','front','back'].forEach(x => {
    const btn = document.getElementById('gps-btn-' + x);
    if (btn) btn.className = 'gps-btn' + (x === t ? ' active' : '');
  });
  if (state.gpsState.coords) updateGPSDisplay(state.liveState?.hole || 0);
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
  document.getElementById('gps-dist').textContent = yards;

  // Update unified live screen distances
  const { latitude: _clat, longitude: _clng } = state.gpsState.coords;
  ['front','mid','back'].forEach(t => {
    const tgt = green[t];
    const y = tgt ? haversineYards(_clat, _clng, tgt.lat, tgt.lng) : null;
    const el = document.getElementById('live-dist-' + t);
    if (el) el.textContent = y !== null ? y : '—';
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
    if (td) td.textContent = teeYards;
  }
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
    pushGist();
    if (btn) { btn.textContent = 'Tee pinned ✓'; btn.disabled = false; btn.style.display = 'none'; }
    const teeWrap = document.getElementById('gps-tee-wrap');
    if (teeWrap) teeWrap.style.display = '';
    if (state.gpsState.coords) updateGPSDisplay(hole0);
  }, err => {
    if (btn) { btn.textContent = 'Pin tee'; btn.disabled = false; }
    alert('Could not get GPS position — make sure location permission is enabled.');
  }, { enableHighAccuracy: true, timeout: 15000 });
}
