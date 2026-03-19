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
  const ci = document.getElementById('course-sel')?.value || '';
  const course = ci ? getCourseByRef(ci) : null;
  return course?.name || ci;
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

export function updateLiveGPSPill() {
  const pill = document.getElementById('live-gps-pill');
  const pillText = document.getElementById('live-gps-pill-text');
  if (!pill || !pillText) return;
  if (state.gpsState.watching) {
    pill.style.background = 'rgba(46,204,113,.1)';
    pill.style.borderColor = 'rgba(46,204,113,.3)';
    pill.style.color = 'var(--par)';
    pillText.textContent = 'GPS active — distances showing below';
  } else {
    pill.style.background = 'rgba(201,168,76,.07)';
    pill.style.borderColor = 'rgba(201,168,76,.2)';
    pill.style.color = 'var(--dim)';
    pillText.textContent = 'GPS off — tap to start';
  }
}

export function startGPS() {
  if (!navigator.geolocation) { alert('GPS not available on this device or browser.'); return; }
  const h = state.liveState?.hole || 0;
  const green = getGreenCoords(h);
  if (!green) {
    const yn = confirm(`No green coordinates for hole ${h+1}.\n\nWalk to the green centre and tap Pin to save the position — it only needs to be done once per hole and will be used for all future rounds.`);
    if (yn) { showPinGreenPrompt(h); }
    return;
  }
  const isApprox = green._approx === true;
  const bar = document.getElementById('gps-bar');
  bar.style.display = 'flex';
  document.getElementById('gps-hole-name').textContent = `Hole ${h+1}`;
  const ci = document.getElementById('course-sel')?.value || '';
  const course = ci ? getCourseByRef(ci) : null;
  document.getElementById('gps-course-name').textContent = isApprox ? 'Approx position — pin green for accuracy' : (course?.name || '');

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
  updateLiveGPSPill();
}

export function stopGPS() {
  if (state.gpsState.watchId != null) navigator.geolocation.clearWatch(state.gpsState.watchId);
  state.gpsState.watching = false;
  state.gpsState.watchId = null;
  document.getElementById('gps-bar').style.display = 'none';
  updateLiveGPSPill();
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

  // Also update caddie view distances
  const { latitude: _clat, longitude: _clng } = state.gpsState.coords;
  ['front','mid','back'].forEach(t => {
    const tgt = green[t];
    if (tgt) {
      const y = haversineYards(_clat, _clng, tgt.lat, tgt.lng);
      const el = document.getElementById('caddie-dist-' + t);
      if (el) el.textContent = y;
    }
  });

  // Show tee distance if tee is pinned
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

function showPinGreenPrompt(hole0) {
  const bar = document.getElementById('gps-bar');
  bar.style.display = 'flex';
  document.getElementById('gps-hole-name').textContent = `Pin Hole ${hole0+1}`;
  document.getElementById('gps-course-name').textContent = 'Stand at the green centre and tap Pin';
  document.getElementById('gps-dist').textContent = '\uD83D\uDCCD';
  const btns = bar.querySelectorAll('.gps-btn');
  btns.forEach(b => b.style.display = 'none');
  const pinBtn = document.createElement('button');
  pinBtn.className = 'gps-btn active';
  pinBtn.textContent = 'Pin green';
  pinBtn.style.fontSize = '13px';
  pinBtn.addEventListener('click', () => pinGreenPosition(hole0, pinBtn, btns));
  bar.insertBefore(pinBtn, bar.lastElementChild);
}

export function pinGreenPosition(hole0, pinBtn, btns) {
  if (!navigator.geolocation) { alert('GPS not available.'); return; }
  pinBtn.textContent = 'Getting GPS...';
  pinBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const courseName = getCourseName();
    if (!state.gd.greenCoords) state.gd.greenCoords = {};
    if (!state.gd.greenCoords[courseName]) state.gd.greenCoords[courseName] = {};
    state.gd.greenCoords[courseName][hole0] = {
      front: { lat: lat - 0.00015, lng },
      mid: { lat, lng },
      back: { lat: lat + 0.00015, lng }
    };
    pushGist();
    pinBtn.remove();
    btns.forEach(b => b.style.display = '');
    document.getElementById('gps-hole-name').textContent = `Hole ${hole0+1} pinned!`;
    document.getElementById('gps-dist').textContent = '\u2713';
    setTimeout(() => {
      stopGPS();
      alert(`Hole ${hole0+1} green pinned!\n\nDistances will now show when you tap the GPS button during a round on this course.`);
    }, 1200);
  }, err => {
    pinBtn.textContent = 'Retry';
    pinBtn.disabled = false;
    alert('Could not get GPS position — make sure you have location permission enabled for this site.');
  }, { enableHighAccuracy: true, timeout: 15000 });
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
