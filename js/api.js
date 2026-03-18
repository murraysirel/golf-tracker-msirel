// ─────────────────────────────────────────────────────────────────
// API — Gist sync via Netlify serverless function
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { DEFAULT_GIST, API } from './constants.js';

export function ss(status, msg) {
  const d = document.getElementById('sdot'), t = document.getElementById('stext');
  if (!d) return;
  d.className = 'sdot' + (status === 'syncing' ? ' syncing' : status === 'err' ? ' err' : '');
  if (t) t.textContent = msg;
}

function seedMurray() {
  if (!state.gd.players['Murray Sirel']) {
    state.gd.players['Murray Sirel'] = {
      handicap: 9.8, rounds: [{
        id: 1, player: 'Murray Sirel', course: 'Croham Hurst Golf Club', loc: 'Croydon, Surrey',
        tee: 'blue', date: '14/03/2026', totalScore: 74, totalPar: 69, diff: 5,
        birdies: 2, parsCount: 6, bogeys: 6, doubles: 3, eagles: 1,
        pars: [4,4,4,4,3,5,3,5,4,4,3,4,3,4,4,3,4,4],
        scores: [7,5,2,4,3,6,2,6,4,5,3,4,2,4,4,4,4,5],
        putts: [3,2,0,2,2,2,1,3,2,2,1,1,1,2,1,2,2,2],
        fir: ['No','Yes','No','Yes','N/A','Yes','N/A','No','Yes','No','N/A','No','N/A','Yes','Yes','Yes','Yes','No'],
        gir: ['No','No','Yes','Yes','Yes','No','Yes','No','Yes','No','No','No','Yes','Yes','No','No','Yes','No'],
        notes: '', penalties: 0, bunkers: 0, chips: 0, rating: 67.5, slope: 114
      }]
    };
  }
}

export async function loadGist() {
  ss('syncing', 'Loading...');
  try {
    const r = await fetch(API);
    if (!r.ok) throw new Error(r.status);
    const raw = await r.text();
    state.gd = JSON.parse(raw);
    if (!state.gd.players) state.gd.players = {};
    seedMurray();
    ss('ok', 'Synced \u2713');
  } catch (e) {
    ss('err', 'Could not load \u2014 check connection');
    const cached = localStorage.getItem('gt_localdata');
    if (cached) {
      try {
        state.gd = JSON.parse(cached);
        if (!state.gd.players) state.gd.players = {};
        seedMurray();
      } catch (_) {}
    } else {
      seedMurray();
    }
  }
}

export async function pushGist() {
  ss('syncing', 'Saving...');
  localStorage.setItem('gt_localdata', JSON.stringify(state.gd));
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: state.gd })
    });
    if (!r.ok) throw new Error(r.status);
    ss('ok', 'Saved \u2713 ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    return true;
  } catch (e) {
    ss('err', 'Sync failed \u2014 saved locally, will retry');
    return false;
  }
}
