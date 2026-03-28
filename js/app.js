// ─────────────────────────────────────────────────────────────────
// APP ENTRY POINT
// Imports all modules, sets up event listeners, initialises app
// ─────────────────────────────────────────────────────────────────
import { loadAppData, pushData, querySupabase, ss, retryUnsyncedRounds, updateUnsyncedBadge } from './api.js';
import { goTo, switchEntry, registerNavHandlers } from './nav.js';
import { getCourseByRef, scanCourseCard, saveCourse, cancelCourseScan, handleCoursePhoto, searchCourseAPI, initCourseSearch } from './courses.js';
import { buildSC, recalc, saveRound, toggleSCExtras } from './scorecard.js';
import { renderStats, setFilter, toggleHcpEdit, saveHandicap, renderHomeStats, openScorecardModal, openKpiPicker, closeKpiPicker } from './stats.js';
import { renderLeaderboard, initLeaderboard } from './leaderboard.js';
import { renderLogin, enterAs, signOut, addPlayer, renderAllPlayers, renderPlayersToday, showSignupStep, submitProfile, agreePrivacy, submitCompleteProfile, showGroupFork, goBackToFork, forkNotNow, forkJoinGroup, forkCreateGroup, refreshAvatarUI, uploadAvatar, setPrefTheme, setPrefUnit, submitPrefs } from './players.js';
import { renderPracticePage, selectPracticeArea, startPracticeSession, regeneratePlan, logPracticeShots, completePracticeSession } from './practice.js';
import { initLiveRound, liveGoto, liveSaveNote, liveNextOrFinish, toggleGroupPlayer, startGroupRound, toggleMatchPlay, openCorrectionModal, submitCorrectionReport, cancelRound } from './live.js';
import { generateAIReview, generateStatsAnalysis, clearStatsAnalysis, parsePhoto, handlePhoto } from './ai.js';
import { stopGPS, gpsSetTarget, pinTeePosition, markDriveTap, logDrive } from './gps.js';
import { exportXlsx } from './export.js';
import { openAdminSettings, closeAdminSettings, verifyAdminPw, adminPopulateRounds, adminDeleteRound, adminSeedDemo } from './admin.js';
import { copyGroupCode, leaveGroup, toggleGroupCodeRequired, addSeason, deleteSeason, confirmDeleteMyData, deleteMyData, copyAppUrl, rebuildSeasonSelector, initJoinGroup, lookupGroupByCode, confirmJoinGroup, showBoardPage, initCreateGroup, submitGroupName, confirmBoardSetup, initGroupSettings, saveGroupName, hideGSModal, confirmGSModal } from './group.js';
import { initCompetition } from './competition.js';
import { state } from './state.js';
import { initCaddieButton } from './caddie.js';
import { setGameMode, updateFormatUI, confirmWolfOrder, showWolfScoreboard } from './gamemodes.js';
import { openCreateMatchModal, openJoinMatchModal, updateGroupMatchButtonVisibility, updateActiveMatchBadge } from './group-match.js';
import { initMatchOverlay, hideMatchOverlay, showEndRoundConfirm } from './overlay.js';
import { startInvitePolling, dismissInviteToast, joinLiveRound, minimiseLiveView, restoreLiveView, leaveLiveView, liveViewScoreAdj, submitEditorScore, toggleEditMode } from './live-invite.js';
import { enterDemoMode, exitDemoMode } from './demo.js';

// ── Theme ─────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme-dark-btn')?.classList.toggle('active', theme === 'dark');
  document.getElementById('theme-light-btn')?.classList.toggle('active', theme === 'light');
}
applyTheme(localStorage.getItem('rr_theme') || 'dark');

// ── Design variant toggle (dev/testing) ───────────────────────────
function applyDesign(variant) {
  document.documentElement.dataset.design = variant || '';
  localStorage.setItem('rr_design', variant || '');
  document.getElementById('design-v1-btn')?.classList.toggle('dv-active', !variant);
  document.getElementById('design-v2-btn')?.classList.toggle('dv-active', variant === 'v2');
}
applyDesign(localStorage.getItem('rr_design') || '');

// ── Register nav handlers (to avoid circular imports) ─────────────
registerNavHandlers({
  renderStats,
  renderLeaderboard: initLeaderboard,
  renderAllPlayers,
  renderHomeStats,
  renderPracticePage,
  initLiveRound,
  initCompetition,
  onPageChange: (page) => {
    if (page !== 'live') hideMatchOverlay();
    // Reinitialise course search if container is empty (guard against missing init)
    if (page === 'round') {
      const wrap = document.getElementById('course-search-container');
      if (wrap && !wrap.querySelector('.cs-wrap')) initCourseSearch();
    }
  },
  closeProfilePanel
});

// ── Splash screen dismiss ─────────────────────────────────────────
(function () {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 450);
  }, 2550);
})();

// ── Navigation bar ────────────────────────────────────────────────
document.getElementById('nb-home')?.addEventListener('click', () => goTo('home'));
document.getElementById('nb-round')?.addEventListener('click', () => goTo('round'));
document.getElementById('nb-stats')?.addEventListener('click', () => goTo('stats'));
document.getElementById('nb-leaderboard')?.addEventListener('click', () => goTo('leaderboard'));
document.getElementById('nb-practice')?.addEventListener('click', () => goTo('practice'));

// ── Profile panel ─────────────────────────────────────────────────
function openProfilePanel() {
  refreshAvatarUI();
  import('./players.js').then(({ renderAllPlayers }) => renderAllPlayers());
  import('./courses.js').then(({ renderScannedCourses }) => renderScannedCourses());
  document.getElementById('profile-panel')?.classList.add('open');
  document.getElementById('profile-backdrop')?.classList.add('open');
  document.getElementById('profile-icon-btn')?.classList.add('panel-open');
  const gc = document.getElementById('players-group-code');
  if (gc && state.gd?.activeGroupCode) gc.textContent = state.gd.activeGroupCode;
  // Load active session count (non-blocking)
  if (!state.demoMode) {
    import('./auth.js').then(({ listSessions, getStoredSession }) => {
      if (!getStoredSession()) return;
      const row = document.getElementById('active-sessions-row');
      const txt = document.getElementById('session-count-text');
      if (row) row.style.display = 'flex';
      listSessions().then(sessions => {
        if (!txt) return;
        if (!sessions.length) { txt.textContent = '1 device (this one)'; return; }
        const count = sessions.length;
        const current = getStoredSession()?.sessionId;
        const others = sessions.filter(s => s.id !== current);
        txt.textContent = count === 1
          ? '1 device — just you here'
          : `${count} devices active${others.length ? ' · ' + others.map(s => s.device_hint || 'Unknown').join(', ') : ''}`;
      });
    });
  }
}
function closeProfilePanel() {
  document.getElementById('profile-panel')?.classList.remove('open');
  document.getElementById('profile-backdrop')?.classList.remove('open');
  document.getElementById('profile-icon-btn')?.classList.remove('panel-open');
}
document.getElementById('profile-icon-btn')?.addEventListener('click', openProfilePanel);
document.getElementById('profile-panel-close')?.addEventListener('click', closeProfilePanel);
document.getElementById('profile-backdrop')?.addEventListener('click', closeProfilePanel);

// ── Onboard — 3-step sign-up flow ────────────────────────────────
document.getElementById('onb-create-profile-btn')?.addEventListener('click', () => showSignupStep(1));
document.getElementById('onb-back-to-select-btn')?.addEventListener('click', () => showSignupStep(0));
document.getElementById('onb-profile-submit-btn')?.addEventListener('click', submitProfile);
document.getElementById('onb-back-to-profile-btn')?.addEventListener('click', () => showSignupStep(1));
document.getElementById('onb-privacy-agree-btn')?.addEventListener('click', agreePrivacy);
document.getElementById('onb-complete-submit-btn')?.addEventListener('click', submitCompleteProfile);
// Prefs step (theme + distance unit) — between profile and privacy
document.getElementById('onb-prefs-submit-btn')?.addEventListener('click', submitPrefs);
document.getElementById('pref-theme-dark')?.addEventListener('click', () => setPrefTheme('dark'));
document.getElementById('pref-theme-light')?.addEventListener('click', () => setPrefTheme('light'));
document.getElementById('pref-unit-yards')?.addEventListener('click', () => setPrefUnit('yards'));
document.getElementById('pref-unit-metres')?.addEventListener('click', () => setPrefUnit('metres'));
// Group fork screen
document.getElementById('fork-join-btn')?.addEventListener('click', forkJoinGroup);
document.getElementById('fork-create-btn')?.addEventListener('click', forkCreateGroup);
document.getElementById('fork-solo-btn')?.addEventListener('click', forkNotNow);
// Join group screen
document.getElementById('join-group-back-btn')?.addEventListener('click', goBackToFork);
document.getElementById('join-group-find-btn')?.addEventListener('click', lookupGroupByCode);
document.getElementById('join-group-code-inp')?.addEventListener('keydown', e => { if (e.key === 'Enter') lookupGroupByCode(); });
document.getElementById('join-group-code-inp')?.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
document.getElementById('join-group-confirm-btn')?.addEventListener('click', confirmJoinGroup);
document.getElementById('join-group-board-btn')?.addEventListener('click', () => showBoardPage());
// Board page
document.getElementById('board-enter-btn')?.addEventListener('click', () => {
  document.getElementById('pg-board').style.display = 'none';
  enterAs(state.me);
});
// Trigger initJoinGroup whenever pg-join-group becomes visible
document.addEventListener('joinGroupShown', initJoinGroup);
// Create group flow
document.getElementById('create-group-back-btn')?.addEventListener('click', goBackToFork);
document.getElementById('create-group-next-btn')?.addEventListener('click', submitGroupName);
document.getElementById('create-group-name-inp')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitGroupName(); });
document.getElementById('board-setup-back-btn')?.addEventListener('click', () => {
  document.getElementById('pg-board-setup').style.display = 'none';
  document.getElementById('pg-create-group').style.display = 'block';
});
document.getElementById('board-setup-confirm-btn')?.addEventListener('click', confirmBoardSetup);
document.getElementById('group-ready-start-btn')?.addEventListener('click', () => {
  document.getElementById('pg-group-ready').style.display = 'none';
  enterAs(state.me);
});
document.addEventListener('createGroupShown', initCreateGroup);
// Group fork entry points from within the main app
document.getElementById('lb-group-fork-btn')?.addEventListener('click', () => showGroupFork(false));
document.getElementById('panel-group-fork-btn')?.addEventListener('click', () => showGroupFork(false));
// Avatar upload
document.getElementById('avatar-file-input')?.addEventListener('change', e => {
  if (e.target.files[0]) uploadAvatar(e.target.files[0]);
  e.target.value = '';
});
document.getElementById('avatar-upload-btn')?.addEventListener('click', () => document.getElementById('avatar-file-input')?.click());
document.getElementById('profile-avatar-display')?.addEventListener('click', () => document.getElementById('avatar-file-input')?.click());
document.getElementById('avatar-remove-btn')?.addEventListener('click', () => {
  if (state.gd.players[state.me]) delete state.gd.players[state.me].avatarImg;
  refreshAvatarUI();
  pushData();
  querySupabase('upsertPlayer', { playerName: state.me, avatarUrl: null });
});
// DOB auto-format: insert slashes as user types digits (numeric keypad on mobile)
document.getElementById('new-dob')?.addEventListener('input', e => {
  let digits = e.target.value.replace(/\D/g, '');
  let v = digits;
  if (digits.length > 2) v = digits.slice(0, 2) + '/' + digits.slice(2);
  if (digits.length > 4) v = v.slice(0, 5) + '/' + digits.slice(4);
  e.target.value = v.slice(0, 10);
});

// Demo mode
document.getElementById('demo-entry-btn')?.addEventListener('click', enterDemoMode);
document.getElementById('demo-entry-btn-fork')?.addEventListener('click', enterDemoMode);
document.getElementById('demo-exit-btn')?.addEventListener('click', exitDemoMode);
document.getElementById('demo-exit-panel-btn')?.addEventListener('click', exitDemoMode);

// ── Home page ─────────────────────────────────────────────────────
document.getElementById('home-go-stats-link')?.addEventListener('click', () => goTo('stats'));
document.getElementById('home-kpis')?.addEventListener('click', () => goTo('stats'));
document.getElementById('kpi-customise-btn')?.addEventListener('click', e => { e.stopPropagation(); openKpiPicker(); });
document.getElementById('kpi-picker-done')?.addEventListener('click', () => closeKpiPicker(true));
document.getElementById('kpi-picker-backdrop')?.addEventListener('click', () => closeKpiPicker(false));

// ── GPS bar ───────────────────────────────────────────────────────
document.getElementById('gps-btn-mid')?.addEventListener('click', () => gpsSetTarget('mid'));
document.getElementById('gps-btn-front')?.addEventListener('click', () => gpsSetTarget('front'));
document.getElementById('gps-btn-back')?.addEventListener('click', () => gpsSetTarget('back'));
document.getElementById('gps-stop-btn')?.addEventListener('click', stopGPS);
document.getElementById('gps-btn-pin-tee')?.addEventListener('click', () => pinTeePosition(state.liveState?.hole || 0));
document.getElementById('mark-drive-btn')?.addEventListener('click', markDriveTap);
document.getElementById('drive-log-btn')?.addEventListener('click', () => logDrive(state.liveState?.hole || 0));
// ── Live invite & viewer ──────────────────────────────────────────
document.getElementById('live-invite-dismiss')?.addEventListener('click', dismissInviteToast);
document.getElementById('live-invite-view-btn')?.addEventListener('click', () => joinLiveRound('view'));
document.getElementById('live-invite-edit-btn')?.addEventListener('click', () => joinLiveRound('edit'));
document.getElementById('lv-minimise-btn')?.addEventListener('click', minimiseLiveView);
document.getElementById('lv-leave-btn')?.addEventListener('click', leaveLiveView);
document.getElementById('lv-restore-btn')?.addEventListener('click', restoreLiveView);
document.getElementById('lv-score-dec')?.addEventListener('click', () => liveViewScoreAdj(-1));
document.getElementById('lv-score-inc')?.addEventListener('click', () => liveViewScoreAdj(1));
document.getElementById('lv-submit-score-btn')?.addEventListener('click', submitEditorScore);
document.getElementById('lv-toggle-edit-btn')?.addEventListener('click', toggleEditMode);
// ── Round / scorecard tab ─────────────────────────────────────────
// Entry card buttons
document.getElementById('entry-btn-manual')?.addEventListener('click', () => switchEntry('manual'));
document.getElementById('entry-btn-photo')?.addEventListener('click', () => switchEntry('photo'));
document.getElementById('entry-btn-course')?.addEventListener('click', () => switchEntry('course'));

// Home screen CTA — Play with the Caddie
document.getElementById('home-caddie-cta')?.addEventListener('click', () => goTo('live'));

// Play with the Caddie CTA
document.getElementById('caddie-play-btn')?.addEventListener('click', () => {
  if (!getCourseByRef()) {
    document.getElementById('caddie-inline-setup')?.style && (document.getElementById('caddie-inline-setup').style.display = 'block');
  } else {
    goTo('live');
  }
});
document.getElementById('caddie-letsgo-btn')?.addEventListener('click', () => goTo('live'));
document.getElementById('save-round-btn')?.addEventListener('click', saveRound);
document.getElementById('sc-extras-toggle')?.addEventListener('click', toggleSCExtras);

// Photo entry
document.getElementById('photo-drop')?.addEventListener('click', () => document.getElementById('photo-inp').click());
document.getElementById('photo-inp')?.addEventListener('change', function () { handlePhoto(this); });
document.getElementById('parse-btn')?.addEventListener('click', parsePhoto);

// Competitions section
document.getElementById('setup-competition-btn')?.addEventListener('click', () => {
  const panel = document.getElementById('setup-competition-soon');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('join-competition-btn')?.addEventListener('click', () => {
  const code = document.getElementById('comp-join-code')?.value?.trim().toUpperCase();
  const msg = document.getElementById('comp-join-msg');
  if (!code) { if (msg) { msg.style.color = 'var(--double)'; msg.textContent = 'Please enter a competition code.'; } return; }
  if (msg) { msg.style.color = 'var(--dim)'; msg.textContent = 'Competition joining is coming soon.'; }
});

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
document.getElementById('live-cancel-setup-btn')?.addEventListener('click', cancelRound);
document.getElementById('live-cancel-round-btn')?.addEventListener('click', showEndRoundConfirm);

// ── Live round ────────────────────────────────────────────────────
document.getElementById('live-prev')?.addEventListener('click', () => liveGoto(state.liveState.hole - 1));
document.getElementById('live-next')?.addEventListener('click', () => liveGoto(state.liveState.hole + 1));
document.getElementById('live-btn-prev2')?.addEventListener('click', () => liveGoto(state.liveState.hole - 1));
document.getElementById('live-btn-next2')?.addEventListener('click', liveNextOrFinish);
document.getElementById('live-note')?.addEventListener('input', liveSaveNote);
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
// ── Distance unit toggle (profile panel) ─────────────────────────
function applyDistUnit(u) {
  localStorage.setItem('looper_dist_unit', u);
  document.getElementById('dist-unit-yards-btn')?.classList.toggle('active', u === 'yards');
  document.getElementById('dist-unit-metres-btn')?.classList.toggle('active', u === 'metres');
  // Also sync the onboarding prefs step buttons
  document.getElementById('pref-unit-yards')?.classList.toggle('active', u === 'yards');
  document.getElementById('pref-unit-metres')?.classList.toggle('active', u === 'metres');
}
document.getElementById('dist-unit-yards-btn')?.addEventListener('click', () => applyDistUnit('yards'));
document.getElementById('dist-unit-metres-btn')?.addEventListener('click', () => applyDistUnit('metres'));
// Initialise the toggle to reflect saved preference
applyDistUnit(localStorage.getItem('looper_dist_unit') || 'yards');
// Design variant buttons
document.getElementById('design-v1-btn')?.addEventListener('click', () => applyDesign(''));
document.getElementById('design-v2-btn')?.addEventListener('click', () => applyDesign('v2'));

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
document.getElementById('lb-join-group-btn')?.addEventListener('click', () => { showGroupFork(false); forkJoinGroup(); });
document.getElementById('lb-create-group-btn')?.addEventListener('click', () => { showGroupFork(false); forkCreateGroup(); });
document.getElementById('gs-back-btn')?.addEventListener('click', () => goTo('leaderboard'));
document.getElementById('gs-name-save-btn')?.addEventListener('click', saveGroupName);
document.getElementById('gs-modal-cancel')?.addEventListener('click', hideGSModal);
document.getElementById('gs-modal-confirm')?.addEventListener('click', confirmGSModal);

// ── Players page ──────────────────────────────────────────────────
document.getElementById('lb-copy-group-code')?.addEventListener('click', copyGroupCode);
document.getElementById('leave-group-btn')?.addEventListener('click', leaveGroup);
document.getElementById('gc-toggle-btn')?.addEventListener('click', toggleGroupCodeRequired);
document.getElementById('add-season-btn')?.addEventListener('click', addSeason);
document.getElementById('export-xlsx-btn')?.addEventListener('click', exportXlsx);
document.getElementById('confirm-delete-data-btn')?.addEventListener('click', confirmDeleteMyData);
document.getElementById('add-player-btn')?.addEventListener('click', addPlayer);
document.getElementById('reload-btn')?.addEventListener('click', () => loadAppData(state.me, state.gd?.activeGroupCode || '').then(() => renderHomeStats()));
document.getElementById('copy-app-url-btn')?.addEventListener('click', copyAppUrl);
document.getElementById('sign-out-btn')?.addEventListener('click', signOut);
document.getElementById('sign-out-all-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('sign-out-all-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing out…'; }
  const { signOutAll } = await import('./auth.js');
  await signOutAll();
  signOut();
});
document.getElementById('open-admin-btn')?.addEventListener('click', openAdminSettings);

// ── Wolf game format ──────────────────────────────────────────────
document.getElementById('fmt-stroke')?.addEventListener('click', () => { setGameMode('stroke'); updateGroupMatchButtonVisibility(); });
document.getElementById('fmt-match')?.addEventListener('click', () => { setGameMode('match'); updateGroupMatchButtonVisibility(); });
document.getElementById('fmt-sixes')?.addEventListener('click', () => { setGameMode('sixes'); updateGroupMatchButtonVisibility(); });
document.getElementById('fmt-wolf')?.addEventListener('click', () => { setGameMode('wolf'); updateGroupMatchButtonVisibility(); });

// ── Group Match ───────────────────────────────────────────────────
document.getElementById('start-group-match-btn')?.addEventListener('click', openCreateMatchModal);
document.getElementById('join-group-match-btn')?.addEventListener('click', openJoinMatchModal);
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

// ── Scorecard history modal ───────────────────────────────────────
function closeScModal() { document.getElementById('sc-hist-modal')?.classList.remove('open'); }
document.getElementById('sc-hist-close')?.addEventListener('click', closeScModal);
document.getElementById('sc-hist-backdrop')?.addEventListener('click', closeScModal);

// ── Admin modal ───────────────────────────────────────────────────
document.getElementById('admin-close-btn')?.addEventListener('click', closeAdminSettings);
document.getElementById('admin-verify-btn')?.addEventListener('click', verifyAdminPw);
document.getElementById('admin-del-player')?.addEventListener('change', adminPopulateRounds);
document.getElementById('admin-del-round-btn')?.addEventListener('click', adminDeleteRound);

// ── Unsynced rounds recovery prompt ───────────────────────────────
function showUnsyncedRoundsPrompt(unsynced) {
  const overlay = document.createElement('div');
  overlay.id = 'unsynced-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.75)',
    'z-index:2000', 'display:flex', 'align-items:center',
    'justify-content:center', 'font-family:"DM Sans",sans-serif'
  ].join(';');

  const roundRows = unsynced.map(item => {
    const r = item.round;
    const score = r.totalScore != null ? r.totalScore : '\u2014';
    return '<div style="font-size:14px;color:var(--cream);padding:4px 0">' +
      (item.player || '\u2014') + ' \u2014 ' + (r.course || '\u2014') +
      ' \u2014 ' + (r.date || '\u2014') + ' \u2014 ' + score + '</div>';
  }).join('');

  overlay.innerHTML =
    '<div style="background:var(--card);border:2px solid var(--gold);border-radius:16px;' +
    'padding:24px;width:min(340px,calc(100vw - 32px))">' +
    '<div style="font-size:17px;font-weight:700;color:var(--gold);margin-bottom:12px">' +
    'You have unsynced rounds</div>' +
    roundRows +
    '<div style="font-size:13px;color:var(--dim);margin-top:8px">' +
    "These rounds saved on your device but did not sync to the server. " +
    "Tap \u2018Sync now\u2019 to upload them.</div>" +
    '<button id="us-sync-btn" style="width:100%;padding:14px;border-radius:10px;' +
    'background:var(--gold);border:none;color:var(--navy);font-size:14px;' +
    'font-weight:600;cursor:pointer;margin-top:16px">Sync now</button>' +
    '<button id="us-later-btn" style="width:100%;padding:14px;border-radius:10px;' +
    'background:var(--mid);border:none;color:var(--dim);font-size:14px;' +
    'cursor:pointer;margin-top:8px">Remind me later</button></div>';

  document.body.appendChild(overlay);

  document.getElementById('us-later-btn').addEventListener('click', () => overlay.remove());

  document.getElementById('us-sync-btn').addEventListener('click', async () => {
    overlay.remove();
    const ok = await retryUnsyncedRounds();
    if (!ok) ss('err', 'Sync failed \u2014 will try again next time you open the app');
  });
}

// ── Round recovery after crash/timeout ────────────────────────────
function showRoundRecoveryPrompt(backup) {
  const modal = document.getElementById('round-recovery-modal');
  if (!modal) return;
  const holeNum = backup.hole + 1;
  const courseText = backup.course ? ` at ${backup.course}` : '';
  document.getElementById('rr-hole-text').textContent =
    `You were on hole ${holeNum}${courseText}. Restore your progress?`;
  modal.style.display = 'flex';

  document.getElementById('rr-resume-btn').onclick = () => {
    modal.style.display = 'none';
    state.liveState.hole = backup.hole;
    state.liveState.scores = backup.scores || Array(18).fill(null);
    state.liveState.putts = backup.putts || Array(18).fill(null);
    state.liveState.fir = backup.fir || Array(18).fill('');
    state.liveState.gir = backup.gir || Array(18).fill('');
    state.liveState.notes = backup.notes || Array(18).fill('');
    state.liveState.group = backup.group || [];
    state.liveState.groupScores = backup.groupScores || {};
    state.liveState.groupPutts = backup.groupPutts || {};
    state.liveState.groupFir = backup.groupFir || {};
    state.liveState.groupGir = backup.groupGir || {};
    state.gameMode = backup.gameMode || 'stroke';
    state.wolfState = backup.wolfState || null;
    state.roundActive = true;
    // Note: course selection cannot be restored programmatically with the
    // search UI — the user will need to re-select their course after resuming.
    localStorage.removeItem('rr_live_backup');
    goTo('live');
  };

  document.getElementById('rr-discard-btn').onclick = () => {
    localStorage.removeItem('rr_live_backup');
    modal.style.display = 'none';
  };
}

// ── Login form event listeners ────────────────────────────────────
document.getElementById('login-submit-btn')?.addEventListener('click', async () => {
  const email    = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  const errEl    = document.getElementById('login-err');
  if (!email || !password) {
    if (errEl) { errEl.textContent = 'Please enter your email and password.'; errEl.style.display = 'block'; }
    return;
  }
  const btn = document.getElementById('login-submit-btn');
  if (btn) btn.disabled = true;
  const { signIn } = await import('./auth.js');
  const result = await signIn(email, password);
  if (btn) btn.disabled = false;
  if (result.error) {
    if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  await loadAppData(result.playerName, '');
  await enterAs(result.playerName);
  updateActiveMatchBadge();
  updateUnsyncedBadge();
  startInvitePolling();
  await retryUnsyncedRounds();
});

document.getElementById('login-magic-link-btn')?.addEventListener('click', () => {
  document.getElementById('onb-login-form').style.display = 'none';
  document.getElementById('onb-magic-form').style.display = 'block';
});

document.getElementById('magic-back-btn')?.addEventListener('click', () => {
  document.getElementById('onb-magic-form').style.display = 'none';
  document.getElementById('onb-login-form').style.display = 'block';
});

document.getElementById('magic-submit-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('magic-email')?.value.trim();
  const errEl = document.getElementById('magic-err');
  if (!email) {
    if (errEl) { errEl.textContent = 'Please enter your email address.'; errEl.style.display = 'block'; }
    return;
  }
  const btn = document.getElementById('magic-submit-btn');
  if (btn) btn.disabled = true;
  const { sendMagicLink } = await import('./auth.js');
  const result = await sendMagicLink(email);
  if (btn) btn.disabled = false;
  if (result.error) {
    if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  const sent = document.getElementById('magic-sent');
  if (sent) sent.style.display = 'block';
  if (btn) btn.style.display = 'none';
});

// ── Initialise ────────────────────────────────────────────────────
initMatchOverlay();
(async function boot() {
  try {
    const { handleMagicLinkRedirect, getStoredSession, refreshIfNeeded, clearSession } =
      await import('./auth.js');

    // 1. Consume magic link redirect tokens from URL hash (must run before any nav)
    const magicResult = await handleMagicLinkRedirect();
    if (magicResult?.needsProfile) {
      // New user via magic link — direct to signup profile step
      ss('ok', '');
      showSignupStep(1);
      return;
    }

    // 2. Check stored session
    let session = getStoredSession();
    if (!session?.playerName) {
      ss('ok', '');
      renderLogin();
      return;
    }

    // 3. Refresh access token if near expiry
    const refreshResult = await refreshIfNeeded();
    if (refreshResult?.error) {
      clearSession();
      ss('ok', '');
      renderLogin();
      return;
    }

    session = getStoredSession(); // re-read after potential refresh

    // 4. Load data and enter app
    await loadAppData(session.playerName, localStorage.getItem('gt_activegroup') || '');
    await enterAs(session.playerName);
    updateActiveMatchBadge();
    updateUnsyncedBadge();
    startInvitePolling();

    // 5. Retry unsynced rounds silently; show prompt if still failing
    const syncedOk = await retryUnsyncedRounds();
    if (!syncedOk) {
      const raw = localStorage.getItem('rr_unsynced_rounds');
      if (raw) {
        try {
          const unsynced = JSON.parse(raw);
          if (unsynced.length > 0) showUnsyncedRoundsPrompt(unsynced);
        } catch (_) {}
      }
    }

    // 6. Live round recovery
    const backup = localStorage.getItem('rr_live_backup');
    if (backup) {
      try {
        const b = JSON.parse(backup);
        const ageMinutes = (Date.now() - b.savedAt) / 60000;
        if (ageMinutes < 480 && b.hole > 0) showRoundRecoveryPrompt(b);
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[boot] unhandled error:', e);
    ss('ok', '');
    try {
      const { getStoredSession } = await import('./auth.js');
      const s = getStoredSession();
      if (s?.playerName) {
        // Session exists — show app with cached data rather than kicking to login
        const cached = localStorage.getItem('gt_localdata');
        if (cached) { try { Object.assign(state.gd, JSON.parse(cached)); } catch (_) {} }
        await enterAs(s.playerName);
        return;
      }
    } catch (_) {}
    renderLogin();
  }
})();
