// ─────────────────────────────────────────────────────────────────
// API — Supabase backend (Gist retired)
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';

const GROUP_SETTINGS_KEYS = ['customCourses','teeCoords','greenCoords','seasons',
                              'deletionLog','courseCorrections','requireGroupCode'];

// ── Retry queue for failed network writes ────────────────────────
const _retryQueue = [];

export function ss(status, msg) {
  const d = document.getElementById('sdot'), t = document.getElementById('stext');
  if (!d) return;
  d.className = 'sdot' + (status === 'syncing' ? ' syncing' : status === 'err' ? ' err' : status === 'warn' ? ' warn' : '');
  if (t) t.textContent = msg;
}

function _updateSyncStatus() {
  if (!navigator.onLine) {
    ss('err', 'Offline — will retry');
  } else if (_retryQueue.length > 0) {
    ss('warn', `Saving... (${_retryQueue.length} pending)`);
  } else {
    ss('ok', 'Synced \u2713');
  }
}

export async function retryUnsyncedData() {
  if (!navigator.onLine || !_retryQueue.length) return;
  _updateSyncStatus();
  const items = [..._retryQueue];
  _retryQueue.length = 0;
  for (const item of items) {
    const ok = await pushSupabase(item.action, item.data);
    if (!ok) _retryQueue.push(item);
  }
  _updateSyncStatus();
  await retryUnsyncedRounds();
}

// Listen for connectivity changes
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { retryUnsyncedData(); _updateSyncStatus(); });
  window.addEventListener('offline', () => _updateSyncStatus());
}

// ── querySupabase — POST and return parsed response body ──────────
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

// ── pushSupabase — fire-and-forget Supabase write ─────────────────
export async function pushSupabase(action, data) {
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, groupCode: state.gd?.activeGroupCode || '', data })
    });
    if (!res.ok) throw new Error('Supabase write failed: ' + res.status);
    _updateSyncStatus();
    return true;
  } catch (err) {
    console.warn('Supabase write failed:', err.message);
    // Queue for retry on network errors (not validation errors)
    if (!navigator.onLine || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      _retryQueue.push({ action, data });
    }
    _updateSyncStatus();
    return false;
  }
}

// ── loadAppData — primary boot loader (replaces loadGist) ─────────
// Called once after auth resolves. Loads player-specific data then
// group-scoped data (other members, rounds, settings).
export async function loadAppData(playerName, groupCode) {
  if (state.demoMode) return;
  ss('syncing', 'Loading...');

  // Ensure base structure
  if (!state.gd.players) state.gd.players = {};
  if (!state.gd.matches) state.gd.matches = {};
  if (!state.gd.groupCodes) state.gd.groupCodes = [];
  if (!state.gd.groupMeta) state.gd.groupMeta = {};

  // 1. Get player's own data from Supabase (practice sessions, stats analysis, group codes)
  try {
    const { getStoredSession } = await import('./auth.js');
    const session = getStoredSession();
    console.log('[loadAppData] playerName:', playerName, 'session:', session?.playerName, 'userId:', session?.userId);
    if (session?.userId) {
      const playerRes = await querySupabase('getPlayerByAuthId', { authUserId: session.userId });
      console.log('[loadAppData] getPlayerByAuthId result:', playerRes?.name, 'groupCodes:', playerRes?.groupCodes);
      if (playerRes?.name) {
        if (!state.gd.players[playerName]) state.gd.players[playerName] = { handicap: 0, rounds: [] };
        state.gd.players[playerName].dob              = playerRes.dob             || null;
        state.gd.players[playerName].homeCourse       = playerRes.homeCourse      || null;
        state.gd.players[playerName].practiceSessions = playerRes.practiceSessions || [];
        state.gd.players[playerName].statsAnalysis    = playerRes.statsAnalysis    || null;
        state.gd.players[playerName].statsAnalysisDate = playerRes.statsAnalysisDate || null;
        // Restore group codes from server-side membership query
        if (playerRes.groupCodes?.length) {
          playerRes.groupCodes.forEach(c => {
            if (!state.gd.groupCodes.includes(c)) state.gd.groupCodes.push(c);
          });
          if (!state.gd.activeGroupCode) {
            state.gd.activeGroupCode = playerRes.groupCodes[0] || '';
          }
        }
      }
    }
  } catch (_) {
    // Non-fatal — continue with whatever we have
  }

  // 2. Restore active group from localStorage if valid
  const storedActive = localStorage.getItem('gt_activegroup');
  if (storedActive && state.gd.groupCodes.includes(storedActive)) {
    state.gd.activeGroupCode = storedActive;
  }

  // 3. Load group-scoped data (other players, rounds, settings)
  const code = groupCode || state.gd.activeGroupCode || '';
  console.log('[loadAppData] groupCodes:', state.gd.groupCodes, 'activeGroupCode:', state.gd.activeGroupCode, 'using code:', code);
  if (code) {
    try {
      await loadGroupData(code);
    } catch (e) {
      console.warn('[api] loadGroupData failed, using cache:', e.message);
      const cached = localStorage.getItem('gt_localdata');
      if (cached) {
        try { Object.assign(state.gd, JSON.parse(cached)); } catch (_) {}
      }
    }
  }

  // Only update cache if we actually have player data — prevents a transient
  // Supabase failure from wiping the local cache with empty data
  const playerCount = Object.keys(state.gd.players || {}).length;
  console.log('[loadAppData] final playerCount:', playerCount, 'players:', Object.keys(state.gd.players || {}));
  if (playerCount > 0) {
    localStorage.setItem('gt_localdata', JSON.stringify(state.gd));
  } else {
    // Restore from cache if server returned empty but we had data before
    const cached = localStorage.getItem('gt_localdata');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Object.keys(parsed.players || {}).length > 0) {
          Object.assign(state.gd, parsed);
          ss('warn', 'Using cached data');
          return;
        }
      } catch (_) {}
    }
  }
  ss('ok', 'Synced \u2713');
}

// ── loadGroupData — load group-scoped data from Supabase ──────────
export async function loadGroupData(groupCode) {
  if (state.demoMode) return;
  if (!groupCode) return;
  ss('syncing', 'Loading...');
  try {
    const res = await fetch('/.netlify/functions/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', groupCode, requestingPlayer: state.me || '' })
    });
    if (!res.ok) throw new Error('Supabase read ' + res.status);
    const responseData = await res.json();
    const { players, rounds, settings, memberJoinDates } = responseData;
    console.log('[loadGroupData] response:', { playerCount: players?.length, roundCount: rounds?.length, memberJoinDates: Object.keys(memberJoinDates || {}) });

    const unsynced = localStorage.getItem('rr_unsynced_rounds');
    const s0 = settings || {};

    // Guard: if Supabase returns nothing for this code, it may be a legacy/ghost code
    if ((players?.length ?? 0) === 0 && (rounds?.length ?? 0) === 0 && Object.keys(s0).length === 0) {
      if (!state.gd.groupCodes) state.gd.groupCodes = [];
      if (!state.gd.groupCodes.includes(groupCode)) state.gd.groupCodes.push(groupCode);
      state.gd.activeGroupCode = groupCode;
      ss('ok', 'Synced \u2713');
      return true;
    }

    if (!state.gd.groupCodes) state.gd.groupCodes = [];
    if (!state.gd.groupCodes.includes(groupCode)) state.gd.groupCodes.push(groupCode);
    state.gd.activeGroupCode = groupCode;
    if (!state.gd.groupMeta) state.gd.groupMeta = {};
    if (!state.gd.matches) state.gd.matches = {};

    // Snapshot existing players so we can preserve personal data (avatarImg,
    // practiceSessions, statsAnalysis) that was loaded in loadAppData()
    const prevPlayers = state.gd.players || {};
    state.gd.players = {};
    const joinDates = memberJoinDates || {};
    (players || []).forEach(p => {
      const prev = prevPlayers[p.name] || {};
      state.gd.players[p.name] = {
        handicap: p.handicap || 0,
        rounds: [],
        ...(joinDates[p.name] ? { joinedAt: joinDates[p.name] } : {}),
        ...(p.email  ? { email:  p.email  } : {}),
        ...(p.dob    ? { dob:    p.dob    } : {}),
        ...(p.avatar_url ? { avatarImg: p.avatar_url } : (prev.avatarImg ? { avatarImg: prev.avatarImg } : {})),
        ...(prev.practiceSessions ? { practiceSessions: prev.practiceSessions } : {}),
        ...(prev.statsAnalysis    ? { statsAnalysis:    prev.statsAnalysis    } : {}),
        ...(prev.statsAnalysisDate? { statsAnalysisDate:prev.statsAnalysisDate} : {}),
      };
    });

    (rounds || []).forEach(r => {
      const pl = state.gd.players[r.player_name];
      if (pl) pl.rounds.push(supabaseRoundToApp(r));
    });

    // Restore group metadata from Supabase settings JSONB
    GROUP_SETTINGS_KEYS.forEach(k => { if (s0[k] != null) state.gd[k] = s0[k]; });

    localStorage.setItem('gt_localdata', JSON.stringify(state.gd));
    if (unsynced) localStorage.setItem('rr_unsynced_rounds', unsynced);
    ss('ok', 'Synced \u2713');
    return true;
  } catch (e) {
    console.warn('[loadGroupData] Supabase failed, using cached data:', e.message);
    // Fall back to localStorage cache
    const cached = localStorage.getItem('gt_localdata');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Only restore group-specific data, not clobber personal data
        if (parsed.players) Object.assign(state.gd.players || {}, parsed.players);
        GROUP_SETTINGS_KEYS.forEach(k => { if (parsed[k] != null) state.gd[k] = parsed[k]; });
      } catch (_) {}
    }
    ss('warn', 'Using cached data');
    return false;
  }
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

// ── retryUnsyncedRounds — push buffered rounds to Supabase ────────
// Returns true if no unsynced rounds remain.
export async function retryUnsyncedRounds() {
  const raw = localStorage.getItem('rr_unsynced_rounds');
  if (!raw) return true;
  let unsynced;
  try { unsynced = JSON.parse(raw); } catch (_) { return true; }
  if (!unsynced.length) return true;

  const remaining = [];
  for (const item of unsynced) {
    const playerData = state.gd.players[item.player] || {};
    const ok = await pushSupabase('saveRound', {
      round: item.round,
      playerData: {
        name:      item.player,
        email:     playerData.email     || null,
        dob:       playerData.dob       || null,
        handicap:  playerData.handicap  || 0,
        matchCode: playerData.matchCode || null,
      }
    });
    if (!ok) remaining.push(item);
  }

  if (remaining.length === 0) {
    localStorage.removeItem('rr_unsynced_rounds');
    updateUnsyncedBadge();
    ss('ok', 'Unsynced rounds uploaded \u2713');
    return true;
  }
  localStorage.setItem('rr_unsynced_rounds', JSON.stringify(remaining));
  updateUnsyncedBadge();
  return false;
}

// ── pushData — write group settings to Supabase ───────────────────
export async function pushData() {
  localStorage.setItem('gt_localdata', JSON.stringify(state.gd));
  if (state.demoMode) return true;
  ss('syncing', 'Saving...');
  try {
    if (state.gd.activeGroupCode) {
      const settings = {};
      GROUP_SETTINGS_KEYS.forEach(k => { if (state.gd[k] != null) settings[k] = state.gd[k]; });
      await pushSupabase('saveGroupSettings', { groupCode: state.gd.activeGroupCode, settings });
    }
    updateUnsyncedBadge();
    ss('ok', 'Saved \u2713 ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    return true;
  } catch (e) {
    ss('err', 'Sync failed \u2014 saved locally');
    return false;
  }
}

