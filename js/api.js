// ─────────────────────────────────────────────────────────────────
// API — Gist sync via Netlify serverless function
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { DEFAULT_GIST, API } from './constants.js';

const GROUP_SETTINGS_KEYS = ['customCourses','teeCoords','greenCoords','seasons',
                              'deletionLog','courseCorrections','requireGroupCode'];

export function ss(status, msg) {
  const d = document.getElementById('sdot'), t = document.getElementById('stext');
  if (!d) return;
  d.className = 'sdot' + (status === 'syncing' ? ' syncing' : status === 'err' ? ' err' : status === 'warn' ? ' warn' : '');
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
  if (state.demoMode) return;
  ss('syncing', 'Loading...');
  try {
    const r = await fetch(API);
    if (!r.ok) throw new Error(r.status);
    const raw = await r.text();
    // Preserve unsynced rounds — loadGist must never destroy them
    const unsynced = localStorage.getItem('rr_unsynced_rounds');
    state.gd = JSON.parse(raw);
    if (!state.gd.players) state.gd.players = {};
    if (!state.gd.matches) state.gd.matches = {};
    // Migrate legacy scalar groupCode → multi-group schema
    if (!state.gd.groupCodes) {
      state.gd.groupCodes = state.gd.groupCode ? [state.gd.groupCode] : [];
      state.gd.activeGroupCode = state.gd.groupCode || '';
      delete state.gd.groupCode;
    }
    if (!state.gd.groupMeta) state.gd.groupMeta = {};
    // Restore active group from localStorage if present
    const storedActive = localStorage.getItem('gt_activegroup');
    if (storedActive && state.gd.groupCodes.includes(storedActive)) {
      state.gd.activeGroupCode = storedActive;
    }
    if (state.demoMode) seedMurray();
    localStorage.setItem('gt_localdata', JSON.stringify(state.gd));
    if (unsynced) localStorage.setItem('rr_unsynced_rounds', unsynced);
    ss('ok', 'Synced \u2713');
  } catch (e) {
    ss('err', 'Could not load \u2014 check connection');
    const cached = localStorage.getItem('gt_localdata');
    if (cached) {
      try {
        state.gd = JSON.parse(cached);
        if (!state.gd.players) state.gd.players = {};
        if (!state.gd.matches) state.gd.matches = {};
        if (!state.gd.groupCodes) {
          state.gd.groupCodes = state.gd.groupCode ? [state.gd.groupCode] : [];
          state.gd.activeGroupCode = state.gd.groupCode || '';
          delete state.gd.groupCode;
        }
        if (!state.gd.groupMeta) state.gd.groupMeta = {};
        if (state.demoMode) seedMurray();
      } catch (_) {}
    } else {
      if (state.demoMode) seedMurray();
    }
  }
  // Merge Supabase data on top — parallel phase: Supabase wins on conflict
  await loadSupabase();
}

// ── Supabase-first group load ─────────────────────────────────────
// Primary boot loader when a group code is known.
// Populates state.gd.players from Supabase scoped to the group,
// and restores group metadata from groups.settings.
// Falls back to loadGist() if Supabase fails.
export async function loadGroupData(groupCode) {
  if (state.demoMode) return loadGist();
  if (!groupCode) return loadGist();
  ss('syncing', 'Loading...');
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', groupCode })
    });
    if (!res.ok) throw new Error('Supabase read ' + res.status);
    const { players, rounds, settings } = await res.json();

    // Preserve unsynced rounds across reload
    const unsynced = localStorage.getItem('rr_unsynced_rounds');

    // Build state.gd.players scoped to this group only
    if (!state.gd.groupCodes) state.gd.groupCodes = [];
    if (!state.gd.groupCodes.includes(groupCode)) state.gd.groupCodes.push(groupCode);
    state.gd.activeGroupCode = groupCode;
    if (!state.gd.groupMeta) state.gd.groupMeta = {};
    if (!state.gd.matches) state.gd.matches = {};

    state.gd.players = {};
    (players || []).forEach(p => {
      state.gd.players[p.name] = { handicap: p.handicap || 0, rounds: [],
        ...(p.email ? { email: p.email } : {}) };
    });
    (rounds || []).forEach(r => {
      const pl = state.gd.players[r.player_name];
      if (pl) pl.rounds.push(supabaseRoundToApp(r));
    });

    // Restore group metadata from Supabase settings JSONB
    const s = settings || {};
    GROUP_SETTINGS_KEYS.forEach(k => { if (s[k] != null) state.gd[k] = s[k]; });

    localStorage.setItem('gt_localdata', JSON.stringify(state.gd));
    if (unsynced) localStorage.setItem('rr_unsynced_rounds', unsynced);
    ss('ok', 'Synced \u2713');
    return true;
  } catch (e) {
    console.warn('[loadGroupData] Supabase failed, falling back to Gist:', e.message);
    return loadGist();
  }
}

// ── Supabase parallel sync ────────────────────────────────────────

// querySupabase — like pushSupabase but returns the parsed JSON body (for read-type calls)
export async function querySupabase(action, data) {
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, groupCode: state.gd?.activeGroupCode || '', data })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function pushSupabase(action, data) {
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        groupCode: state.gd?.activeGroupCode || '',
        data
      })
    });
    if (!res.ok) throw new Error('Supabase write failed: ' + res.status);
    return true;
  } catch (err) {
    console.warn('Supabase write failed (non-critical during parallel phase):', err);
    return false;
  }
}

async function loadSupabase() {
  if (state.demoMode) return false;
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'read',
        groupCode: state.gd?.activeGroupCode || ''
      })
    });
    if (!res.ok) return false;
    const { players, rounds } = await res.json();
    mergeSupabaseData(players, rounds);
    return true;
  } catch (err) {
    console.warn('Supabase read failed (falling back to Gist):', err);
    return false;
  }
}

function mergeSupabaseData(players, rounds) {
  if (!players || !rounds) return;
  players.forEach(p => {
    if (!state.gd.players[p.name]) {
      state.gd.players[p.name] = { handicap: p.handicap, rounds: [] };
    }
    state.gd.players[p.name].handicap = p.handicap;
    if (p.email) state.gd.players[p.name].email = p.email;
  });
  rounds.forEach(r => {
    const player = state.gd.players[r.player_name];
    if (!player) return;
    const exists = player.rounds.some(ex => ex.id === r.id);
    if (!exists) {
      player.rounds.push(supabaseRoundToApp(r));
    }
  });
}

export function supabaseRoundToApp(r) {
  return {
    id: r.id, player: r.player_name, course: r.course,
    loc: r.loc, tee: r.tee, date: r.date,
    scores: r.scores, putts: r.putts, fir: r.fir, gir: r.gir,
    pars: r.pars, notes: r.notes,
    totalScore: r.total_score, totalPar: r.total_par,
    diff: r.diff, birdies: r.birdies, parsCount: r.pars_count,
    bogeys: r.bogeys, doubles: r.doubles, eagles: r.eagles,
    penalties: r.penalties, bunkers: r.bunkers, chips: r.chips,
    rating: r.rating, slope: r.slope,
    aiReview: r.ai_review, wolfResult: r.wolf_result,
    matchResult: r.match_result
  };
}

export function updateUnsyncedBadge() {
  const badge = document.getElementById('unsynced-badge');
  if (!badge) return;
  const raw = localStorage.getItem('rr_unsynced_rounds');
  let count = 0;
  if (raw) { try { count = JSON.parse(raw).length; } catch (_) {} }
  if (count > 0) {
    badge.textContent = '\u26A0 ' + count + ' round' + (count > 1 ? 's' : '') + ' unsynced';
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

// Silent retry: merge unsynced rounds into state.gd and push once.
// Returns true if no unsynced rounds remain, false if sync failed.
export async function retrySyncUnsynced() {
  const raw = localStorage.getItem('rr_unsynced_rounds');
  if (!raw) return true;
  let unsynced;
  try { unsynced = JSON.parse(raw); } catch (_) { return true; }
  if (unsynced.length === 0) return true;

  let merged = false;
  for (const item of unsynced) {
    if (!state.gd.players[item.player]) continue;
    const exists = state.gd.players[item.player].rounds.some(r => r.id === item.round.id);
    if (!exists) {
      state.gd.players[item.player].rounds.push(item.round);
      merged = true;
    }
  }

  if (merged) {
    try {
      const ok = await pushGist();
      if (!ok) return false;
      localStorage.removeItem('rr_unsynced_rounds');
      updateUnsyncedBadge();
      ss('ok', 'Unsynced rounds uploaded');
      return true;
    } catch (e) {
      return false; // silent fail — will try again next load
    }
  } else {
    // All rounds already in Gist — safe to clear
    localStorage.removeItem('rr_unsynced_rounds');
    updateUnsyncedBadge();
    return true;
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
    if (r.status === 429) {
      ss('err', 'Too many saves — wait a moment');
      return false;
    }
    if (!r.ok) throw new Error(r.status);
    updateUnsyncedBadge();
    ss('ok', 'Saved \u2713 ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    // Sync group-level metadata to Supabase groups.settings (fire-and-forget)
    if (state.gd.activeGroupCode) {
      const settings = {};
      GROUP_SETTINGS_KEYS.forEach(k => { if (state.gd[k] != null) settings[k] = state.gd[k]; });
      pushSupabase('saveGroupSettings', { groupCode: state.gd.activeGroupCode, settings }).catch(() => {});
    }
    return true;
  } catch (e) {
    ss('err', 'Sync failed \u2014 saved locally, will retry');
    updateUnsyncedBadge();
    return false;
  }
}
