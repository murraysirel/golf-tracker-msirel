// ─────────────────────────────────────────────────────────────────
// APP ENTRY POINT
// Imports all modules, sets up event listeners, initialises app
// ─────────────────────────────────────────────────────────────────
import { loadGist } from './api.js';
import { goTo, switchEntry, registerNavHandlers } from './nav.js';
import { onCourseChange, populateCourses, scanCourseCard, saveCourse, cancelCourseScan, handleCoursePhoto } from './courses.js';
import { buildSC, recalc, saveRound } from './scorecard.js';
import { renderStats, setFilter, toggleHcpEdit, saveHandicap, renderHomeStats } from './stats.js';
import { renderLeaderboard } from './leaderboard.js';
import { renderOnboard, enterAs, addAndEnter, signOut, addPlayer, renderAllPlayers, renderPlayersToday } from './players.js';
import { renderPracticePage, selectPracticeArea, startPracticeSession, regeneratePlan, logPracticeShots, completePracticeSession } from './practice.js';
import { initLiveRound, liveGoto, liveAdj, liveSetToggle, liveSaveNote, liveNextOrFinish, liveRenderPips } from './live.js';
import { generateAIReview, generateStatsAnalysis, clearStatsAnalysis, parsePhoto, handlePhoto } from './ai.js';
import { startGPS, stopGPS, gpsSetTarget, pinGreenPosition } from './gps.js';
import { exportXlsx } from './export.js';
import { openAdminSettings, closeAdminSettings, verifyAdminPw, adminPopulateRounds, adminDeleteRound } from './admin.js';
import { copyGroupCode, leaveGroup, toggleGroupCodeRequired, addSeason, deleteSeason, confirmDeleteMyData, deleteMyData, copyAppUrl, rebuildSeasonSelector } from './group.js';
import { state } from './state.js';

// ── Register nav handlers (to avoid circular imports) ─────────────
registerNavHandlers({
  renderStats,
  renderLeaderboard,
  renderAllPlayers,
  renderHomeStats,
  renderPracticePage,
  initLiveRound
});

// ── Splash screen dismiss ─────────────────────────────────────────
(function () {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 500);
  }, 2300);
})();

// ── Navigation bar ────────────────────────────────────────────────
document.getElementById('nb-home')?.addEventListener('click', () => goTo('home'));
document.getElementById('nb-round')?.addEventListener('click', () => goTo('round'));
document.getElementById('nb-live')?.addEventListener('click', () => goTo('live'));
document.getElementById('nb-stats')?.addEventListener('click', () => goTo('stats'));
document.getElementById('nb-leaderboard')?.addEventListener('click', () => goTo('leaderboard'));
document.getElementById('nb-practice')?.addEventListener('click', () => goTo('practice'));
document.getElementById('nb-players')?.addEventListener('click', () => goTo('players'));

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

// ── Round / scorecard tab ─────────────────────────────────────────
document.getElementById('tab-m')?.addEventListener('click', () => switchEntry('manual'));
document.getElementById('tab-p')?.addEventListener('click', () => switchEntry('photo'));
document.getElementById('tab-c')?.addEventListener('click', () => switchEntry('course'));
document.getElementById('tab-l')?.addEventListener('click', () => goTo('live'));

document.getElementById('course-sel')?.addEventListener('change', onCourseChange);
document.getElementById('save-round-btn')?.addEventListener('click', saveRound);

// Photo entry
document.getElementById('photo-drop')?.addEventListener('click', () => document.getElementById('photo-inp').click());
document.getElementById('photo-inp')?.addEventListener('change', function () { handlePhoto(this); });
document.getElementById('parse-btn')?.addEventListener('click', parsePhoto);

// Course card scanner
document.getElementById('course-card-drop')?.addEventListener('click', () => document.getElementById('course-card-inp').click());
document.getElementById('course-card-inp')?.addEventListener('change', function () { handleCoursePhoto(this); });
document.getElementById('course-scan-btn')?.addEventListener('click', scanCourseCard);
document.getElementById('save-course-btn')?.addEventListener('click', saveCourse);
document.getElementById('cancel-course-btn')?.addEventListener('click', cancelCourseScan);

// ── Live round ────────────────────────────────────────────────────
document.getElementById('live-prev')?.addEventListener('click', () => liveGoto(state.liveState.hole - 1));
document.getElementById('live-next')?.addEventListener('click', () => liveGoto(state.liveState.hole + 1));
document.getElementById('live-btn-prev2')?.addEventListener('click', () => liveGoto(state.liveState.hole - 1));
document.getElementById('live-btn-next2')?.addEventListener('click', liveNextOrFinish);
document.getElementById('live-go-round')?.addEventListener('click', () => goTo('round'));
document.getElementById('live-gps-btn')?.addEventListener('click', startGPS);
document.getElementById('live-score-minus')?.addEventListener('click', () => liveAdj('score', -1));
document.getElementById('live-score-plus')?.addEventListener('click', () => liveAdj('score', 1));
document.getElementById('live-putt-minus')?.addEventListener('click', () => liveAdj('putts', -1));
document.getElementById('live-putt-plus')?.addEventListener('click', () => liveAdj('putts', 1));
document.getElementById('live-fir-yes')?.addEventListener('click', () => liveSetToggle('fir', 'Yes'));
document.getElementById('live-fir-no')?.addEventListener('click', () => liveSetToggle('fir', 'No'));
document.getElementById('live-gir-yes')?.addEventListener('click', () => liveSetToggle('gir', 'Yes'));
document.getElementById('live-gir-no')?.addEventListener('click', () => liveSetToggle('gir', 'No'));
document.getElementById('live-note')?.addEventListener('input', liveSaveNote);

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

// ── Admin modal ───────────────────────────────────────────────────
document.getElementById('admin-close-btn')?.addEventListener('click', closeAdminSettings);
document.getElementById('admin-verify-btn')?.addEventListener('click', verifyAdminPw);
document.getElementById('admin-del-player')?.addEventListener('change', adminPopulateRounds);
document.getElementById('admin-del-round-btn')?.addEventListener('click', adminDeleteRound);

// ── Initialise ────────────────────────────────────────────────────
loadGist().then(() => {
  renderOnboard();
});
