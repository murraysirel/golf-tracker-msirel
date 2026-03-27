// ─────────────────────────────────────────────────────────────────
// DEMO MODE
// Loads the DEMO01 group from Supabase and enters read-only browse mode.
// No player profile required; no round saving permitted.
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { goTo } from './nav.js';
import { renderHomeStats } from './stats.js';

const DEMO_GROUP = 'DEMO01';
const DEMO_PLAYER = 'Murray'; // whose stats view to show by default

export function isDemoMode() {
  return !!state.demoMode;
}

// Called from the "Try the demo" button
export async function enterDemoMode() {
  const confirmed = window.confirm(
    'Explore Looper with real demo data — no account needed.\n\n' +
    'You\'ll be browsing a pre-populated group as a guest. ' +
    'Round entry and saving are disabled in demo mode.\n\n' +
    'Tap OK to continue.'
  );
  if (!confirmed) return;

  // Show loading state on the button
  const btn = document.getElementById('demo-entry-btn');
  if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }

  try {
    const res = await fetch('/.netlify/functions/demo-data');
    if (!res.ok) throw new Error('Could not load demo data');
    const { players, rounds } = await res.json();

    // Populate state with demo data (isolated from live data)
    state.demoMode = true;
    state.gd = {
      players:         {},
      groupCodes:      [DEMO_GROUP],
      activeGroupCode: DEMO_GROUP,
      groupMeta:       { [DEMO_GROUP]: { name: 'Demo Group' } },
      requireGroupCode: false,
      seasons:         [{ name: '2026 Season', year: 2026 }],
      customCourses:   {},
      greenCoords:     {},
      teeCoords:       {},
    };

    // Import players
    players.forEach(p => {
      state.gd.players[p.name] = { handicap: p.handicap, rounds: [] };
    });

    // Import rounds (map Supabase columns → app shape)
    rounds.forEach(r => {
      const player = state.gd.players[r.player_name];
      if (!player) return;
      player.rounds.push({
        id: r.id, player: r.player_name, course: r.course,
        loc: r.loc, tee: r.tee, date: r.date,
        scores: r.scores, putts: r.putts, fir: r.fir, gir: r.gir,
        pars: r.pars, notes: r.notes,
        totalScore: r.total_score, totalPar: r.total_par,
        diff: r.diff, birdies: r.birdies, parsCount: r.pars_count,
        bogeys: r.bogeys, doubles: r.doubles, eagles: r.eagles,
        penalties: r.penalties || 0, bunkers: r.bunkers || 0, chips: r.chips || 0,
        rating: r.rating, slope: r.slope,
        aiReview: r.ai_review, wolfResult: r.wolf_result, matchResult: r.match_result,
      });
    });

    // Set current player to Murray for stats view
    state.me = DEMO_PLAYER;
    localStorage.setItem('rr_me', DEMO_PLAYER);

    // Transition from onboarding screens to main app (same pattern as enterAs())
    ['pg-onboard', 'pg-group-fork', 'pg-join-group', 'pg-create-group'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const pgMain = document.getElementById('pg-main');
    if (pgMain) pgMain.style.display = 'flex';

    // Show demo badge, hide nav actions that require auth
    applyDemoUI();

    renderHomeStats();
    goTo('home');

  } catch (err) {
    console.error('Demo load failed:', err);
    alert('Could not load demo data. Please check your connection and try again.');
    if (btn) { btn.textContent = 'Try the demo'; btn.disabled = false; }
  }
}

// Exits demo mode and returns to the sign-in screen
export function exitDemoMode() {
  state.demoMode = false;
  state.me = '';
  state.gd = { players: {} };
  localStorage.removeItem('rr_me');
  removeDemoUI();

  // Reload so the Gist re-loads normally
  window.location.reload();
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function applyDemoUI() {
  // Show the demo badge in the header
  const badge = document.getElementById('demo-badge');
  if (badge) badge.style.display = 'flex';

  // Show the exit button inside the badge
  const exitBtn = document.getElementById('demo-exit-btn');
  if (exitBtn) exitBtn.style.display = 'inline';

  // Show exit row in profile panel
  const exitRow = document.getElementById('demo-exit-row');
  if (exitRow) exitRow.style.display = '';

  // Hide things that require a real profile
  const saveBtn  = document.getElementById('save-round-btn');
  if (saveBtn)  saveBtn.style.display = 'none';

  // Disable caddie CTA
  const cta = document.getElementById('home-caddie-cta');
  if (cta) {
    cta.textContent = 'Demo mode — round entry disabled';
    cta.style.opacity = '0.5';
    cta.style.cursor = 'default';
    cta.onclick = (e) => e.preventDefault();
  }

  const caddiePlayBtn = document.getElementById('caddie-play-btn');
  if (caddiePlayBtn) { caddiePlayBtn.disabled = true; caddiePlayBtn.style.opacity = '0.5'; }
}

function removeDemoUI() {
  const badge = document.getElementById('demo-badge');
  if (badge) badge.style.display = 'none';
  const exitBtn = document.getElementById('demo-exit-btn');
  if (exitBtn) exitBtn.style.display = 'none';
  const exitRow = document.getElementById('demo-exit-row');
  if (exitRow) exitRow.style.display = 'none';
}
