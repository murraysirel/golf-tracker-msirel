// ─────────────────────────────────────────────────────────────────
// SHARED MUTABLE STATE
// All modules import { state } and use state.gd, state.me, etc.
// ─────────────────────────────────────────────────────────────────
export const state = {
  gd: { players: {} },
  me: '',
  cpars: Array(18).fill(4),
  stee: '',
  photoFile: null,
  CH: {},
  statsFilter: '5',
  liveState: {
    hole: 0,
    scores: Array(18).fill(null),
    putts: Array(18).fill(null),
    fir: Array(18).fill(''),
    gir: Array(18).fill(''),
    notes: Array(18).fill(''),
    // Multi-player group mode (Feature 3)
    group: [],          // selected player names for this round
    groupScores: {},    // { playerName: Array(18).fill(null) }
    groupPutts: {},     // { playerName: Array(18).fill(null) }
    groupFir: {},       // { playerName: Array(18).fill('') }
    groupGir: {},       // { playerName: Array(18).fill('') }
    // Match play (Feature 4)
    matchPlay: false,
    matchFormat: 'singles', // 'singles' | 'pairs'
    matchResult: null,
    hcpOverrides: {}        // { [playerName]: number } — playing handicap per player, set in pre-round modal
  },
  // Course card scanner state
  courseCardFile: null,
  scannedPars: Array(18).fill(4),
  scannedSI: Array(18).fill(null),
  scannedYards: {},
  // Multi-player scoring
  scoringFor: null,
  // Practice state
  practiceState: {
    area: null,
    plan: null,
    currentDrillIndex: 0,
    shotsLogged: 0,
    sessionId: null
  },
  // GPS state
  gpsState: {
    watching: false,
    watchId: null,
    target: 'mid',
    coords: null
  },
  roundActive: false,
  wakeLock: null,
  gameMode: 'stroke', // 'stroke' | 'wolf'
  wolfState: null     // populated by gamemodes.js when a Wolf round starts
};
