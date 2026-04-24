// ─────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────
import { PAGES } from './constants.js';

// These are imported lazily to avoid circular deps — resolved at call time
let _renderStats, _renderLeaderboard, _renderAllPlayers, _renderHomeStats, _renderPracticePage, _initLiveRound, _initCompetition, _initCompScore, _onPageChange, _closeProfilePanel, _renderFeedPage;

export function registerNavHandlers(handlers) {
  _renderStats = handlers.renderStats;
  _renderLeaderboard = handlers.renderLeaderboard;
  _renderAllPlayers = handlers.renderAllPlayers;
  _renderHomeStats = handlers.renderHomeStats;
  _renderPracticePage = handlers.renderPracticePage;
  _initLiveRound = handlers.initLiveRound;
  _initCompetition = handlers.initCompetition;
  _initCompScore = handlers.initCompScore || null;
  _onPageChange = handlers.onPageChange || null;
  _closeProfilePanel = handlers.closeProfilePanel || null;
  _renderFeedPage = handlers.renderFeedPage || null;
}

export function goTo(p) {
  if (_closeProfilePanel) _closeProfilePanel();
  // Find the currently visible page for fade-out
  let outgoing = null;
  PAGES.forEach(pg => {
    const el = document.getElementById('pg-' + pg);
    if (el && el.style.display === 'block') outgoing = el;
  });
  const incoming = document.getElementById('pg-' + p);

  document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
  const nb = document.getElementById('nb-' + p);
  if (nb) nb.classList.add('active');

  function showPage() {
    const scroll = document.getElementById('app-scroll');
    if (scroll) scroll.scrollTop = 0;
    PAGES.forEach(pg => {
      const el = document.getElementById('pg-' + pg);
      if (el) {
        el.style.transition = '';
        el.style.opacity = '';
        el.style.display = pg === p ? 'block' : 'none';
      }
    });
    if (incoming) {
      incoming.style.opacity = '0';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          incoming.style.transition = 'opacity 120ms';
          incoming.style.opacity = '1';
        });
      });
    }
    // Defer heavy renders so the fade-in animation starts before computation blocks the thread
    if (p === 'stats' && _renderStats) requestAnimationFrame(_renderStats);
    if (p === 'leaderboard' && _renderLeaderboard) requestAnimationFrame(_renderLeaderboard);
    if (p === 'players' && _renderAllPlayers) requestAnimationFrame(_renderAllPlayers);
    if (p === 'home' && _renderHomeStats) requestAnimationFrame(_renderHomeStats);
    if (p === 'practice' && _renderPracticePage) requestAnimationFrame(_renderPracticePage);
    if (p === 'live' && _initLiveRound) _initLiveRound();
    if (p === 'competition' && _initCompetition) _initCompetition();
    if (p === 'comp-score' && _initCompScore) _initCompScore();
    if (p === 'feed' && _renderFeedPage) requestAnimationFrame(_renderFeedPage);
    if (_onPageChange) _onPageChange(p);
  }

  if (outgoing && outgoing !== incoming) {
    outgoing.style.transition = 'opacity 120ms';
    outgoing.style.opacity = '0';
    setTimeout(showPage, 120);
  } else {
    showPage();
  }
}

export function switchEntry(t) {
  // Show the log panel if any entry type is selected
  const panel = document.getElementById('round-log-panel');
  if (panel) panel.style.display = t ? 'block' : 'none';
  document.getElementById('entry-manual').style.display = t === 'manual' ? 'block' : 'none';
  document.getElementById('entry-photo').style.display = t === 'photo' ? 'block' : 'none';
  const ec = document.getElementById('entry-course'); if (ec) ec.style.display = t === 'course' ? 'block' : 'none';
  // Update active state on entry cards
  ['manual','photo'].forEach(type => {
    document.getElementById('entry-btn-' + type)?.classList.toggle('active', type === t);
  });
}
