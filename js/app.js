// ─────────────────────────────────────────────────────────────────
// APP ENTRY POINT
// Imports all modules, sets up event listeners, initialises app
// ─────────────────────────────────────────────────────────────────
import { loadGist, pushGist, ss, retrySyncUnsynced, updateUnsyncedBadge } from './api.js';
import { goTo, switchEntry, registerNavHandlers } from './nav.js';
import { getCourseByRef, scanCourseCard, saveCourse, cancelCourseScan, handleCoursePhoto, searchCourseAPI } from './courses.js';
import { buildSC, recalc, saveRound, toggleSCExtras } from './scorecard.js';
import { renderStats, setFilter, toggleHcpEdit, saveHandicap, renderHomeStats, openScorecardModal } from './stats.js';
import { renderLeaderboard } from './leaderboard.js';
import { renderOnboard, enterAs, addAndEnter, signOut, addPlayer, renderAllPlayers, renderPlayersToday, showSignupStep, submitProfile, agreePrivacy, showGroupFork, goBackToFork, forkNotNow, forkJoinGroup, forkCreateGroup, refreshAvatarUI, uploadAvatar } from './players.js';
import { renderPracticePage, selectPracticeArea, startPracticeSession, regeneratePlan, logPracticeShots, completePracticeSession } from './practice.js';
import { initLiveRound, liveGoto, liveSaveNote, liveNextOrFinish, toggleGroupPlayer, startGroupRound, toggleMatchPlay, openCorrectionModal, submitCorrectionReport, cancelRound } from './live.js';
import { generateAIReview, generateStatsAnalysis, clearStatsAnalysis, parsePhoto, handlePhoto } from './ai.js';
import { stopGPS, gpsSetTarget, pinTeePosition, markDriveTap, logDrive } from './gps.js';
import { exportXlsx } from './export.js';
import { openAdminSettings, closeAdminSettings, verifyAdminPw, adminPopulateRounds, adminDeleteRound, adminSeedDemo } from './admin.js';
import { copyGroupCode, leaveGroup, toggleGroupCodeRequired, addSeason, deleteSeason, confirmDeleteMyData, deleteMyData, copyAppUrl, rebuildSeasonSelector } from './group.js';
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
  renderLeaderboard,
  renderAllPlayers,
  renderHomeStats,
  renderPracticePage,
  initLiveRound,
  initCompetition,
  onPageChange: (page) => { if (page !== 'live') hideMatchOverlay(); },
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
  if (gc && state.gd?.groupCode) gc.textContent = state.gd.groupCode;
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
// Group fork screen
document.getElementById('fork-join-btn')?.addEventListener('click', forkJoinGroup);
document.getElementById('fork-create-btn')?.addEventListener('click', forkCreateGroup);
document.getElementById('fork-solo-btn')?.addEventListener('click', forkNotNow);
// Placeholder back / continue buttons
document.getElementById('join-group-back-btn')?.addEventListener('click', goBackToFork);
document.getElementById('join-group-continue-btn')?.addEventListener('click', forkNotNow);
document.getElementById('create-group-back-btn')?.addEventListener('click', goBackToFork);
document.getElementById('create-group-continue-btn')?.addEventListener('click', forkNotNow);
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
  pushGist();
});

// Demo mode
document.getElementById('demo-entry-btn')?.addEventListener('click', enterDemoMode);
document.getElementById('demo-entry-btn-fork')?.addEventListener('click', enterDemoMode);
document.getElementById('demo-exit-btn')?.addEventListener('click', exitDemoMode);
document.getElementById('demo-exit-panel-btn')?.addEventListener('click', exitDemoMode);

// ── Home page ─────────────────────────────────────────────────────
document.getElementById('home-go-stats-link')?.addEventListener('click', () => goTo('stats'));
document.getElementById('home-kpis')?.addEventListener('click', () => goTo('stats'));

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
    const raw = localStorage.getItem('rr_unsynced_rounds');
    if (!raw) { overlay.remove(); return; }
    let items;
    try { items = JSON.parse(raw); } catch (_) { overlay.remove(); return; }
    let merged = false;
    for (const item of items) {
      if (!state.gd.players[item.player]) state.gd.players[item.player] = { handicap: 0, rounds: [] };
      const exists = state.gd.players[item.player].rounds.some(r => r.id === item.round.id);
      if (!exists) { state.gd.players[item.player].rounds.push(item.round); merged = true; }
    }
    overlay.remove();
    if (merged) {
      try {
        await pushGist();
        localStorage.removeItem('rr_unsynced_rounds');
        updateUnsyncedBadge();
        ss('ok', 'Rounds synced successfully');
      } catch (e) {
        ss('err', 'Sync failed \u2014 will try again next time you open the app');
      }
    } else {
      localStorage.removeItem('rr_unsynced_rounds');
      updateUnsyncedBadge();
    }
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

// ── Initialise ────────────────────────────────────────────────────
initMatchOverlay();
loadGist().then(async () => {
  renderOnboard();
  updateActiveMatchBadge();
  updateUnsyncedBadge();
  startInvitePolling(); // begin checking for live round invites once data loaded

  // Silent retry — merge any unsynced rounds into Gist without prompting
  const syncedOk = await retrySyncUnsynced();

  // Only show modal if silent retry failed and rounds still remain
  if (!syncedOk) {
    const raw = localStorage.getItem('rr_unsynced_rounds');
    if (raw) {
      try {
        const unsynced = JSON.parse(raw);
        if (unsynced.length > 0) showUnsyncedRoundsPrompt(unsynced);
      } catch (_) {}
    }
  }

  // Live round recovery
  const backup = localStorage.getItem('rr_live_backup');
  if (backup) {
    try {
      const b = JSON.parse(backup);
      const ageMinutes = (Date.now() - b.savedAt) / 60000;
      if (ageMinutes < 480 && b.hole > 0) showRoundRecoveryPrompt(b);
    } catch (_) {}
  }
});
