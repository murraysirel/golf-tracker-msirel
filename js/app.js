// ─────────────────────────────────────────────────────────────────
// APP ENTRY POINT
// Imports all modules, sets up event listeners, initialises app
// ─────────────────────────────────────────────────────────────────
import { loadGist } from './api.js';
import { goTo, switchEntry, registerNavHandlers } from './nav.js';
import { onCourseChange, scanCourseCard, saveCourse, cancelCourseScan, handleCoursePhoto, searchCourseAPI } from './courses.js';
import { buildSC, recalc, saveRound } from './scorecard.js';
import { renderStats, setFilter, toggleHcpEdit, saveHandicap, renderHomeStats } from './stats.js';
import { renderLeaderboard } from './leaderboard.js';
import { renderOnboard, enterAs, addAndEnter, signOut, addPlayer, renderAllPlayers, renderPlayersToday } from './players.js';
import { renderPracticePage, selectPracticeArea, startPracticeSession, regeneratePlan, logPracticeShots, completePracticeSession } from './practice.js';
import { initLiveRound, liveGoto, liveSaveNote, liveNextOrFinish, toggleGroupPlayer, startGroupRound, toggleMatchPlay, openCorrectionModal, submitCorrectionReport } from './live.js';
import { generateAIReview, generateStatsAnalysis, clearStatsAnalysis, parsePhoto, handlePhoto } from './ai.js';
import { stopGPS, gpsSetTarget, pinGreenPosition, pinTeePosition } from './gps.js';
import { exportXlsx } from './export.js';
import { openAdminSettings, closeAdminSettings, verifyAdminPw, adminPopulateRounds, adminDeleteRound } from './admin.js';
import { copyGroupCode, leaveGroup, toggleGroupCodeRequired, addSeason, deleteSeason, confirmDeleteMyData, deleteMyData, copyAppUrl, rebuildSeasonSelector } from './group.js';
import { initCompetition } from './competition.js';
import { state } from './state.js';
import { initCaddieButton } from './caddie.js';
import { setGameMode, updateFormatUI, confirmWolfOrder, showWolfScoreboard } from './gamemodes.js';

// ── Theme ─────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme-dark-btn')?.classList.toggle('active', theme === 'dark');
  document.getElementById('theme-light-btn')?.classList.toggle('active', theme === 'light');
}
applyTheme(localStorage.getItem('rr_theme') || 'dark');

// ── Register nav handlers (to avoid circular imports) ─────────────
registerNavHandlers({
  renderStats,
  renderLeaderboard,
  renderAllPlayers,
  renderHomeStats,
  renderPracticePage,
  initLiveRound,
  initCompetition
});

// ── Splash screen dismiss ─────────────────────────────────────────
(function () {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 450);
  }, 2050);
})();

// ── Navigation bar ────────────────────────────────────────────────
document.getElementById('nb-home')?.addEventListener('click', () => goTo('home'));
document.getElementById('nb-round')?.addEventListener('click', () => goTo('round'));
document.getElementById('nb-stats')?.addEventListener('click', () => goTo('stats'));
document.getElementById('nb-leaderboard')?.addEventListener('click', () => goTo('leaderboard'));
document.getElementById('nb-practice')?.addEventListener('click', () => goTo('practice'));

// ── Profile panel ─────────────────────────────────────────────────
function openProfilePanel() {
  import('./players.js').then(({ renderAllPlayers }) => renderAllPlayers());
  import('./courses.js').then(({ renderScannedCourses }) => renderScannedCourses());
  document.getElementById('profile-panel')?.classList.add('open');
  document.getElementById('profile-backdrop')?.classList.add('open');
  const gc = document.getElementById('players-group-code');
  if (gc && state.gd?.groupCode) gc.textContent = state.gd.groupCode;
  const admin = document.getElementById('admin-gistid');
  if (admin) admin.textContent = 'gist.github.com/murraysirel/' + (state.gd?.groupCode || '');
  const gistRow = document.getElementById('gist-row');
  if (gistRow) gistRow.style.display = '';
  const sgistid = document.getElementById('s-gistid');
  import('./constants.js').then(({ DEFAULT_GIST }) => { if (sgistid) sgistid.textContent = 'gist.github.com/murraysirel/' + DEFAULT_GIST; });
}
function closeProfilePanel() {
  document.getElementById('profile-panel')?.classList.remove('open');
  document.getElementById('profile-backdrop')?.classList.remove('open');
}
document.getElementById('profile-icon-btn')?.addEventListener('click', openProfilePanel);
document.getElementById('profile-panel-close')?.addEventListener('click', closeProfilePanel);
document.getElementById('profile-backdrop')?.addEventListener('click', closeProfilePanel);

// ── Onboard ───────────────────────────────────────────────────────
document.getElementById('onb-join-btn')?.addEventListener('click', addAndEnter);

// ── Home page ─────────────────────────────────────────────────────
document.getElementById('home-go-round')?.addEventListener('click', () => goTo('round'));
document.getElementById('home-go-stats')?.addEventListener('click', () => goTo('stats'));
document.getElementById('home-go-leaderboard')?.addEventListener('click', () => goTo('leaderboard'));
document.getElementById('home-go-export')?.addEventListener('click', exportXlsx);
document.getElementById('home-go-stats-link')?.addEventListener('click', () => goTo('stats'));

// ── GPS bar ───────────────────────────────────────────────────────
document.getElementById('gps-btn-mid')?.addEventListener('click', () => gpsSetTarget('mid'));
document.getElementById('gps-btn-front')?.addEventListener('click', () => gpsSetTarget('front'));
document.getElementById('gps-btn-back')?.addEventListener('click', () => gpsSetTarget('back'));
document.getElementById('gps-stop-btn')?.addEventListener('click', stopGPS);
document.getElementById('gps-btn-pin-tee')?.addEventListener('click', () => pinTeePosition(state.liveState?.hole || 0));
// ── Round / scorecard tab ─────────────────────────────────────────
// Entry card buttons
document.getElementById('entry-btn-manual')?.addEventListener('click', () => switchEntry('manual'));
document.getElementById('entry-btn-photo')?.addEventListener('click', () => switchEntry('photo'));
document.getElementById('entry-btn-course')?.addEventListener('click', () => switchEntry('course'));

// Play with the Caddie CTA
document.getElementById('caddie-play-btn')?.addEventListener('click', () => {
  const courseVal = document.getElementById('course-sel')?.value;
  if (!courseVal) {
    document.getElementById('caddie-inline-setup')?.style && (document.getElementById('caddie-inline-setup').style.display = 'block');
  } else {
    goTo('live');
  }
});
document.getElementById('caddie-letsgo-btn')?.addEventListener('click', () => goTo('live'));

document.getElementById('course-sel')?.addEventListener('change', onCourseChange);
document.getElementById('save-round-btn')?.addEventListener('click', saveRound);

// Photo entry
document.getElementById('photo-drop')?.addEventListener('click', () => document.getElementById('photo-inp').click());
document.getElementById('photo-inp')?.addEventListener('change', function () { handlePhoto(this); });
document.getElementById('parse-btn')?.addEventListener('click', parsePhoto);

// Course API search
document.getElementById('api-search-btn')?.addEventListener('click', searchCourseAPI);
document.getElementById('api-course-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchCourseAPI(); });

// Course card scanner
document.getElementById('course-card-drop')?.addEventListener('click', () => document.getElementById('course-card-inp').click());
document.getElementById('course-card-inp')?.addEventListener('change', function () { handleCoursePhoto(this); });
document.getElementById('course-scan-btn')?.addEventListener('click', scanCourseCard);
document.getElementById('save-course-btn')?.addEventListener('click', saveCourse);
document.getElementById('cancel-course-btn')?.addEventListener('click', cancelCourseScan);

// ── Live round — group setup ──────────────────────────────────────
document.getElementById('live-group-start-btn')?.addEventListener('click', startGroupRound);
document.getElementById('live-matchplay-toggle')?.addEventListener('click', toggleMatchPlay);

// ── Live round ────────────────────────────────────────────────────
document.getElementById('live-prev')?.addEventListener('click', () => liveGoto(state.liveState.hole - 1));
document.getElementById('live-next')?.addEventListener('click', () => liveGoto(state.liveState.hole + 1));
document.getElementById('live-btn-prev2')?.addEventListener('click', () => liveGoto(state.liveState.hole - 1));
document.getElementById('live-btn-next2')?.addEventListener('click', liveNextOrFinish);
document.getElementById('live-note')?.addEventListener('input', liveSaveNote);
document.getElementById('live-pin-green-btn')?.addEventListener('click', () => {
  const h = state.liveState?.hole || 0;
  pinGreenPosition(h, document.getElementById('live-pin-green-btn'), []);
});
document.getElementById('live-flag-btn')?.addEventListener('click', openCorrectionModal);
document.getElementById('correction-close-btn')?.addEventListener('click', () => { document.getElementById('correction-modal').style.display = 'none'; });
document.getElementById('correction-submit-btn')?.addEventListener('click', submitCorrectionReport);

// ── Theme toggle ─────────────────────────────────────────────────
document.getElementById('theme-dark-btn')?.addEventListener('click', () => {
  applyTheme('dark'); localStorage.setItem('rr_theme', 'dark');
});
document.getElementById('theme-light-btn')?.addEventListener('click', () => {
  applyTheme('light'); localStorage.setItem('rr_theme', 'light');
});

// ── Caddie floating button ─────────────────────────────────────────
document.getElementById('caddie-btn')?.addEventListener('click', () => goTo('live'));
// Initialise caddie button drag behaviour
initCaddieButton();

// ── Stats ─────────────────────────────────────────────────────────
document.getElementById('hcp-edit-btn')?.addEventListener('click', toggleHcpEdit);
document.getElementById('hcp-save-btn')?.addEventListener('click', saveHandicap);
document.querySelectorAll('.fpill').forEach(btn => {
  btn.addEventListener('click', () => setFilter(btn.dataset.f));
});
document.getElementById('filter-course-sel')?.addEventListener('change', renderStats);
document.getElementById('ai-review-btn')?.addEventListener('click', generateAIReview);
document.getElementById('ai-stats-btn')?.addEventListener('click', generateStatsAnalysis);
document.getElementById('ai-stats-clear-btn')?.addEventListener('click', clearStatsAnalysis);

// ── Practice ──────────────────────────────────────────────────────
document.querySelectorAll('.parea-btn').forEach(btn => {
  btn.addEventListener('click', () => selectPracticeArea(btn.dataset.area));
});
document.getElementById('practice-start-btn')?.addEventListener('click', startPracticeSession);
document.getElementById('practice-regen-btn')?.addEventListener('click', regeneratePlan);
document.getElementById('practice-log-5')?.addEventListener('click', () => logPracticeShots(5));
document.getElementById('practice-log-10')?.addEventListener('click', () => logPracticeShots(10));
document.getElementById('practice-complete-btn')?.addEventListener('click', completePracticeSession);

// ── Leaderboard ───────────────────────────────────────────────────
document.getElementById('lb-season-sel')?.addEventListener('change', renderLeaderboard);
document.getElementById('lb-group-code')?.addEventListener('click', copyGroupCode);

// ── Players page ──────────────────────────────────────────────────
document.getElementById('lb-copy-group-code')?.addEventListener('click', copyGroupCode);
document.getElementById('leave-group-btn')?.addEventListener('click', leaveGroup);
document.getElementById('gc-toggle-btn')?.addEventListener('click', toggleGroupCodeRequired);
document.getElementById('add-season-btn')?.addEventListener('click', addSeason);
document.getElementById('export-xlsx-btn')?.addEventListener('click', exportXlsx);
document.getElementById('confirm-delete-data-btn')?.addEventListener('click', confirmDeleteMyData);
document.getElementById('add-player-btn')?.addEventListener('click', addPlayer);
document.getElementById('reload-btn')?.addEventListener('click', () => loadGist().then(renderHomeStats));
document.getElementById('copy-app-url-btn')?.addEventListener('click', copyAppUrl);
document.getElementById('sign-out-btn')?.addEventListener('click', signOut);
document.getElementById('open-admin-btn')?.addEventListener('click', openAdminSettings);

// ── Wolf game format ──────────────────────────────────────────────
document.getElementById('fmt-stroke')?.addEventListener('click', () => setGameMode('stroke'));
document.getElementById('fmt-match')?.addEventListener('click', () => setGameMode('match'));
document.getElementById('fmt-wolf')?.addEventListener('click', () => setGameMode('wolf'));
document.getElementById('wolf-info-btn')?.addEventListener('click', () => {
  document.getElementById('wolf-rules-modal').style.display = 'flex';
});
document.getElementById('wolf-rules-close')?.addEventListener('click', () => {
  document.getElementById('wolf-rules-modal').style.display = 'none';
});
document.getElementById('wolf-rules-modal')?.addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});
// Wolf order setup confirm
document.getElementById('wolf-order-confirm')?.addEventListener('click', confirmWolfOrder);
// Wolf scoreboard
document.getElementById('wolf-scoreboard-btn')?.addEventListener('click', showWolfScoreboard);
document.getElementById('wolf-scoreboard-close')?.addEventListener('click', () => {
  document.getElementById('wolf-scoreboard-modal').style.display = 'none';
});
document.getElementById('wolf-scoreboard-modal')?.addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

// ── Admin modal ───────────────────────────────────────────────────
document.getElementById('admin-close-btn')?.addEventListener('click', closeAdminSettings);
document.getElementById('admin-verify-btn')?.addEventListener('click', verifyAdminPw);
document.getElementById('admin-del-player')?.addEventListener('change', adminPopulateRounds);
document.getElementById('admin-del-round-btn')?.addEventListener('click', adminDeleteRound);

// ── Initialise ────────────────────────────────────────────────────
loadGist().then(() => {
  renderOnboard();
});
