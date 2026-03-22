// ─────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────
import { PAGES } from './constants.js';

// These are imported lazily to avoid circular deps — resolved at call time
let _renderStats, _renderLeaderboard, _renderAllPlayers, _renderHomeStats, _renderPracticePage, _initLiveRound, _initCompetition, _onPageChange;

export function registerNavHandlers(handlers) {
  _renderStats = handlers.renderStats;
  _renderLeaderboard = handlers.renderLeaderboard;
  _renderAllPlayers = handlers.renderAllPlayers;
  _renderHomeStats = handlers.renderHomeStats;
  _renderPracticePage = handlers.renderPracticePage;
  _initLiveRound = handlers.initLiveRound;
  _initCompetition = handlers.initCompetition;
  _onPageChange = handlers.onPageChange || null;
}

export function goTo(p) {
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
    document.getElementById('app-scroll').scrollTop = 0;
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
    if (p === 'stats' && _renderStats) _renderStats();
    if (p === 'leaderboard' && _renderLeaderboard) _renderLeaderboard();
    if (p === 'players' && _renderAllPlayers) _renderAllPlayers();
    if (p === 'home' && _renderHomeStats) _renderHomeStats();
    if (p === 'practice' && _renderPracticePage) _renderPracticePage();
    if (p === 'live' && _initLiveRound) _initLiveRound();
    if (p === 'competition' && _initCompetition) _initCompetition();
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
  document.getElementById('entry-course').style.display = t === 'course' ? 'block' : 'none';
  // Update active state on entry cards
  ['manual','photo','course'].forEach(type => {
    document.getElementById('entry-btn-' + type)?.classList.toggle('active', type === t);
  });
}
