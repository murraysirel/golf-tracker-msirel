// ─────────────────────────────────────────────────────────────────
// WEATHER — 3-day forecast from Open-Meteo (free, no key)
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { API_BASE } from './config.js';

const CACHE_KEY = 'looper_weather_cache';
const CACHE_TTL = 10800000; // 3 hours

// WMO weather code → icon type
const WMO_MAP = {
  0: 'sunny',
  1: 'partly_cloudy', 2: 'partly_cloudy', 3: 'partly_cloudy',
  45: 'foggy', 48: 'foggy',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'drizzle', 57: 'drizzle',
  61: 'rain', 63: 'rain', 80: 'rain', 81: 'rain',
  65: 'heavy_rain', 82: 'heavy_rain',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow', 85: 'snow', 86: 'snow',
  95: 'thunder', 96: 'thunder', 99: 'thunder',
};

// ── Location resolution ──────────────────────────────────────────

const WX_LOC_KEY = 'looper_weather_location';

function resolveLocation() {
  // 1. User-selected course location
  try {
    const saved = JSON.parse(localStorage.getItem(WX_LOC_KEY));
    if (saved?.lat && saved?.lng) return saved;
  } catch { /* ignore */ }

  // 2. Active GPS
  const gps = state.gpsState?.coords;
  if (gps?.latitude && gps?.longitude) {
    return { lat: gps.latitude, lng: gps.longitude, locationName: 'Current location' };
  }

  // 3. Last played course green coords
  const lastRound = state.gd?.players?.[state.me]?.rounds?.slice(-1)[0];
  const courseName = lastRound?.course;
  const coords = state.gd?.greenCoords?.[courseName];
  if (coords) {
    const firstHole = coords[1] || coords[Object.keys(coords)[0]];
    const lat = firstHole?.lat || firstHole?.front?.lat;
    const lng = firstHole?.lng || firstHole?.front?.lng;
    if (lat && lng) {
      const shortName = (courseName || '').replace(/ Golf Club| Golf Course| Golf Links/g, '');
      return { lat, lng, locationName: shortName || 'Last course' };
    }
  }

  // 4. Fallback
  return { lat: 51.5, lng: -0.1, locationName: 'London (set home course for local forecast)' };
}

function setWeatherLocation(lat, lng, name) {
  localStorage.setItem(WX_LOC_KEY, JSON.stringify({ lat, lng, locationName: name }));
  localStorage.removeItem(CACHE_KEY); // clear weather cache so it re-fetches
}

// ── Fetch with cache ─────────────────────────────────────────────

export async function getWeather() {
  // Check cache
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached;
    }
  } catch { /* ignore bad cache */ }

  const loc = resolveLocation();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&daily=weathercode,precipitation_probability_max,temperature_2m_max,temperature_2m_min,windspeed_10m_max&timezone=auto&forecast_days=3`;
  const res = await fetch(url);
  const json = await res.json();

  const d = json.daily;
  if (!d?.time?.length) throw new Error('Invalid weather response');

  const days = d.time.map((date, i) => {
    const windMph = Math.round((d.windspeed_10m_max[i] || 0) * 0.621371);
    const tempMax = Math.round(d.temperature_2m_max[i]);
    const tempMin = Math.round(d.temperature_2m_min[i]);
    const precipProbability = Math.round(d.precipitation_probability_max[i] || 0);
    const weathercode = d.weathercode[i];
    const iconType = WMO_MAP[weathercode] || 'sunny';

    // Golf suitability
    let score = 100;
    score -= precipProbability * 0.7;
    score -= Math.max(0, windMph - 15) * 1.5;
    score -= Math.max(0, 10 - tempMax) * 2;
    score = Math.round(Math.max(0, Math.min(100, score)));

    let suitLabel, suitColour;
    if (score >= 90) { suitLabel = "Millionaire's golf"; suitColour = '#2ecc71'; }
    else if (score >= 75) { suitLabel = 'Great'; suitColour = '#2ecc71'; }
    else if (score >= 50) { suitLabel = 'Good'; suitColour = '#f1c40f'; }
    else if (score >= 30) { suitLabel = 'Tricky'; suitColour = '#e67e22'; }
    else { suitLabel = 'Poor'; suitColour = '#e74c3c'; }

    // Suncream reminder flag: sunny/partly cloudy + above 18°C
    const needsSuncream = tempMax >= 18 && (iconType === 'sunny' || iconType === 'partly_cloudy');

    return { date, tempMax, tempMin, precipProbability, windMph, iconType, score, suitLabel, suitColour, needsSuncream };
  });

  const result = { data: days, timestamp: Date.now(), locationName: loc.locationName };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch { /* quota */ }
  return result;
}

// ── SVG weather icons ────────────────────────────────────────────

function getWeatherIconSVG(iconType) {
  const svgs = {
    sunny: `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <g class="wx-spin">
        <line x1="24" y1="4" x2="24" y2="10" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" class="wx-pulse"/>
        <line x1="24" y1="38" x2="24" y2="44" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" class="wx-pulse" style="animation-delay:.25s"/>
        <line x1="4" y1="24" x2="10" y2="24" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" class="wx-pulse" style="animation-delay:.5s"/>
        <line x1="38" y1="24" x2="44" y2="24" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" class="wx-pulse" style="animation-delay:.75s"/>
        <line x1="9.9" y1="9.9" x2="14.1" y2="14.1" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" class="wx-pulse" style="animation-delay:1s"/>
        <line x1="33.9" y1="33.9" x2="38.1" y2="38.1" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" class="wx-pulse" style="animation-delay:1.25s"/>
        <line x1="9.9" y1="38.1" x2="14.1" y2="33.9" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" class="wx-pulse" style="animation-delay:1.5s"/>
        <line x1="33.9" y1="14.1" x2="38.1" y2="9.9" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" class="wx-pulse" style="animation-delay:1.75s"/>
      </g>
      <circle cx="24" cy="24" r="8" fill="none" stroke="#f1c40f" stroke-width="2"/>
    </svg>`,

    partly_cloudy: `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <g class="wx-spin" style="transform-origin:16px 16px">
        <circle cx="16" cy="16" r="5.5" fill="none" stroke="#f1c40f" stroke-width="1.5"/>
        <line x1="16" y1="6" x2="16" y2="9" stroke="#f1c40f" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="16" y1="23" x2="16" y2="26" stroke="#f1c40f" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="6" y1="16" x2="9" y2="16" stroke="#f1c40f" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="23" y1="16" x2="26" y2="16" stroke="#f1c40f" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="8.9" y1="8.9" x2="10.7" y2="10.7" stroke="#f1c40f" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="21.3" y1="21.3" x2="23.1" y2="23.1" stroke="#f1c40f" stroke-width="1.2" stroke-linecap="round"/>
      </g>
      <path d="M18 36h20a6 6 0 0 0 0-12h-.5A8 8 0 0 0 22 22a8 8 0 0 0-4 14z" fill="none" stroke="#8899bb" stroke-width="1.5" class="wx-drift"/>
    </svg>`,

    foggy: `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <line x1="8" y1="16" x2="40" y2="16" stroke="#8899bb" stroke-width="2" stroke-linecap="round" class="wx-drift"/>
      <line x1="12" y1="22" x2="36" y2="22" stroke="#8899bb" stroke-width="2" stroke-linecap="round" class="wx-drift" style="animation-delay:.5s"/>
      <line x1="6" y1="28" x2="42" y2="28" stroke="#8899bb" stroke-width="2" stroke-linecap="round" class="wx-drift" style="animation-delay:1s"/>
      <line x1="10" y1="34" x2="38" y2="34" stroke="#8899bb" stroke-width="2" stroke-linecap="round" class="wx-drift" style="animation-delay:1.5s"/>
    </svg>`,

    drizzle: `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 28h22a7 7 0 0 0 0-14h-.5A9 9 0 0 0 18 12a9 9 0 0 0-4 16z" fill="none" stroke="#8899bb" stroke-width="1.5"/>
      <line x1="18" y1="32" x2="18" y2="37" stroke="#3498db" stroke-width="1.2" stroke-linecap="round" class="wx-fall"/>
      <line x1="28" y1="32" x2="28" y2="37" stroke="#3498db" stroke-width="1.2" stroke-linecap="round" class="wx-fall" style="animation-delay:.4s"/>
    </svg>`,

    rain: `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 24h22a7 7 0 0 0 0-14h-.5A9 9 0 0 0 18 8a9 9 0 0 0-4 16z" fill="rgba(52,152,219,.1)" stroke="#3498db" stroke-width="1.5"/>
      <line x1="16" y1="28" x2="16" y2="33" stroke="#3498db" stroke-width="1.3" stroke-linecap="round" class="wx-fall"/>
      <line x1="22" y1="28" x2="22" y2="33" stroke="#3498db" stroke-width="1.3" stroke-linecap="round" class="wx-fall" style="animation-delay:.25s"/>
      <line x1="28" y1="28" x2="28" y2="33" stroke="#3498db" stroke-width="1.3" stroke-linecap="round" class="wx-fall" style="animation-delay:.5s"/>
      <line x1="34" y1="28" x2="34" y2="33" stroke="#3498db" stroke-width="1.3" stroke-linecap="round" class="wx-fall" style="animation-delay:.1s"/>
    </svg>`,

    heavy_rain: `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 22h22a7 7 0 0 0 0-14h-.5A9 9 0 0 0 18 6a9 9 0 0 0-4 16z" fill="rgba(52,152,219,.15)" stroke="#3498db" stroke-width="1.5"/>
      <line x1="12" y1="26" x2="10" y2="33" stroke="#3498db" stroke-width="1.5" stroke-linecap="round" class="wx-fall" style="animation-duration:.6s"/>
      <line x1="18" y1="26" x2="16" y2="33" stroke="#3498db" stroke-width="1.5" stroke-linecap="round" class="wx-fall" style="animation-duration:.6s;animation-delay:.15s"/>
      <line x1="24" y1="26" x2="22" y2="33" stroke="#3498db" stroke-width="1.5" stroke-linecap="round" class="wx-fall" style="animation-duration:.6s;animation-delay:.3s"/>
      <line x1="30" y1="26" x2="28" y2="33" stroke="#3498db" stroke-width="1.5" stroke-linecap="round" class="wx-fall" style="animation-duration:.6s;animation-delay:.1s"/>
      <line x1="36" y1="26" x2="34" y2="33" stroke="#3498db" stroke-width="1.5" stroke-linecap="round" class="wx-fall" style="animation-duration:.6s;animation-delay:.45s"/>
      <line x1="42" y1="26" x2="40" y2="33" stroke="#3498db" stroke-width="1.5" stroke-linecap="round" class="wx-fall" style="animation-duration:.6s;animation-delay:.25s"/>
    </svg>`,

    snow: `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 24h22a7 7 0 0 0 0-14h-.5A9 9 0 0 0 18 8a9 9 0 0 0-4 16z" fill="none" stroke="#cbd5e1" stroke-width="1.5"/>
      <circle cx="16" cy="30" r="1.5" fill="#cbd5e1" class="wx-snow"/>
      <circle cx="24" cy="32" r="1.5" fill="#cbd5e1" class="wx-snow" style="animation-delay:.4s"/>
      <circle cx="32" cy="30" r="1.5" fill="#cbd5e1" class="wx-snow" style="animation-delay:.8s"/>
      <circle cx="20" cy="34" r="1.5" fill="#cbd5e1" class="wx-snow" style="animation-delay:1.2s"/>
      <circle cx="28" cy="34" r="1.5" fill="#cbd5e1" class="wx-snow" style="animation-delay:1.6s"/>
    </svg>`,

    thunder: `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 24h22a7 7 0 0 0 0-14h-.5A9 9 0 0 0 18 8a9 9 0 0 0-4 16z" fill="none" stroke="#8899bb" stroke-width="1.5"/>
      <path d="M22 26l4 6h-5l3 8" fill="none" stroke="#f1c40f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="wx-flash"/>
    </svg>`,
  };
  return svgs[iconType] || svgs.sunny;
}

// ── Render ────────────────────────────────────────────────────────

export async function renderWeatherCard(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Loading skeleton
  el.innerHTML = `<div class="wx-card">
    <div class="wx-hdr"><div class="wx-title">FORECAST</div></div>
    <div class="wx-days">
      ${[0,1,2].map(() => `<div class="wx-day">
        <div style="height:10px;width:30px;background:var(--border);border-radius:4px;margin:0 auto 10px"></div>
        <div style="height:40px;width:40px;background:var(--border);border-radius:8px;margin:0 auto 10px"></div>
        <div style="height:12px;width:24px;background:var(--border);border-radius:4px;margin:0 auto 4px"></div>
        <div style="height:10px;width:32px;background:var(--border);border-radius:4px;margin:0 auto"></div>
      </div>`).join('')}
    </div>
  </div>`;

  try {
    const weather = await getWeather();
    const days = weather.data;
    if (!days?.length) throw new Error('No data');

    const pinSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 16s-5-4.3-5-8.5a5 5 0 0 1 10 0C14 11.7 9 16 9 16z"/><circle cx="9" cy="7.5" r="1.5"/></svg>';
    const dropSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 2C9 2 4 8 4 11.5a5 5 0 0 0 10 0C14 8 9 2 9 2z"/></svg>';

    const daysHtml = days.map((day, i) => {
      const dayName = i === 0 ? 'Today' : new Date(day.date).toLocaleDateString('en-GB', { weekday: 'short' });
      const tempColour = i > 0 ? day.suitColour : 'var(--cream)';
      return `<div class="wx-day">
        <div class="wx-day-name">${dayName}</div>
        <div class="wx-icon-wrap">${getWeatherIconSVG(day.iconType)}</div>
        <div class="wx-temp" style="color:${tempColour}">${day.tempMax}°</div>
        <div class="wx-temp-low">${day.tempMin}° low</div>
        <div class="wx-rain">${dropSvg} ${day.precipProbability}%</div>
        <div class="wx-wind">${day.windMph} mph</div>
      </div>`;
    }).join('');

    const today = days[0];
    const suitHtml = `<div class="wx-suit">
      <div class="wx-suit-lbl">Today's golf</div>
      <div class="wx-suit-track">
        <div class="wx-suit-fill" style="width:${today.score}%;background:${today.suitColour}"></div>
      </div>
      <div class="wx-suit-word" style="color:${today.suitColour}">${today.suitLabel}</div>
    </div>`;

    el.innerHTML = `<div class="wx-card">
      <div class="wx-hdr">
        <div class="wx-title">FORECAST</div>
        <div class="wx-location" id="wx-loc-btn" style="cursor:pointer">${pinSvg} ${weather.locationName} <span style="font-size:8px;color:var(--gold);margin-left:2px">change</span></div>
      </div>
      <div id="wx-search-row" style="display:none;padding:6px 14px 0">
        <div style="display:flex;gap:6px">
          <input id="wx-search-input" type="text" placeholder="Search a course…" style="flex:1;padding:6px 10px;background:var(--navy);color:var(--cream);border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:'DM Sans',sans-serif;outline:none">
          <button id="wx-search-reset" style="background:none;border:none;color:var(--dim);font-size:10px;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap">Reset</button>
        </div>
        <div id="wx-search-results" style="max-height:120px;overflow-y:auto"></div>
      </div>
      <div class="wx-days">${daysHtml}</div>
      ${suitHtml}
    </div>`;

    // Wire location search
    document.getElementById('wx-loc-btn')?.addEventListener('click', () => {
      const row = document.getElementById('wx-search-row');
      if (row) { row.style.display = row.style.display === 'none' ? 'block' : 'none'; }
      document.getElementById('wx-search-input')?.focus();
    });
    let _wxTimer = null;
    document.getElementById('wx-search-input')?.addEventListener('input', (e) => {
      clearTimeout(_wxTimer);
      const q = e.target.value.trim();
      if (q.length < 3) { document.getElementById('wx-search-results').innerHTML = ''; return; }
      _wxTimer = setTimeout(async () => {
        try {
          const res = await fetch(API_BASE + '/.netlify/functions/courses?action=search&name=' + encodeURIComponent(q) + '&country=all');
          const data = await res.json();
          const results = document.getElementById('wx-search-results');
          if (!results) return;
          const courses = data.courses || [];
          if (!courses.length) { results.innerHTML = '<div style="padding:6px 0;font-size:11px;color:var(--dim)">No courses found</div>'; return; }
          results.innerHTML = courses.slice(0, 5).map((c, i) =>
            `<div class="wx-search-item" data-idx="${i}" style="padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer;font-size:12px;color:var(--cream)">${c.name}${c.location ? ` <span style="color:var(--dim)">· ${c.location}</span>` : ''}</div>`
          ).join('');
          results.querySelectorAll('.wx-search-item').forEach(item => {
            item.addEventListener('click', async () => {
              const c = courses[parseInt(item.dataset.idx)];
              // Try to get coords from green_coords in cache or fetch
              let lat = null, lng = null;
              const gc = state.gd?.greenCoords?.[c.name];
              if (gc) {
                const h = gc[1] || gc[Object.keys(gc)[0]];
                lat = h?.lat || h?.front?.lat; lng = h?.lng || h?.front?.lng;
              }
              if (!lat && c.external_course_id) {
                try {
                  const fr = await fetch(API_BASE + '/.netlify/functions/courses?action=fetch&courseId=' + encodeURIComponent(c.external_course_id));
                  const fd = await fr.json();
                  const fgc = fd.course?.green_coords;
                  if (fgc) { const fh = fgc['1'] || fgc[Object.keys(fgc)[0]]; lat = fh?.green?.front?.lat || fh?.green?.middle?.lat; lng = fh?.green?.front?.lng || fh?.green?.middle?.lng; }
                } catch { /* fallback below */ }
              }
              if (lat && lng) {
                const shortName = c.name.replace(/ Golf Club| Golf Course| Golf Links/g, '');
                setWeatherLocation(lat, lng, shortName);
                renderWeatherCard(containerId);
              }
            });
          });
        } catch { /* network error */ }
      }, 400);
    });
    document.getElementById('wx-search-reset')?.addEventListener('click', () => {
      localStorage.removeItem(WX_LOC_KEY);
      localStorage.removeItem(CACHE_KEY);
      renderWeatherCard(containerId);
    });

  } catch {
    el.innerHTML = `<div class="wx-card">
      <div style="padding:16px;text-align:center;font-size:12px;color:var(--dim)">Weather unavailable — check connection</div>
    </div>`;
  }
}
