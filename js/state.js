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
    notes: Array(18).fill('')
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
  }
};
