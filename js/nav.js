// ─────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────
import { PAGES } from './constants.js';

// These are imported lazily to avoid circular deps — resolved at call time
let _renderStats, _renderLeaderboard, _renderAllPlayers, _renderHomeStats, _renderPracticePage, _initLiveRound, _initCompetition;

export function registerNavHandlers(handlers) {
  _renderStats = handlers.renderStats;
  _renderLeaderboard = handlers.renderLeaderboard;
  _renderAllPlayers = handlers.renderAllPlayers;
  _renderHomeStats = handlers.renderHomeStats;
  _renderPracticePage = handlers.renderPracticePage;
  _initLiveRound = handlers.initLiveRound;
  _initCompetition = handlers.initCompetition;
}

export function goTo(p) {
  PAGES.forEach(pg => {
    const el = document.getElementById('pg-' + pg);
    if (el) el.style.display = pg === p ? 'block' : 'none';
  });
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
  const nb = document.getElementById('nb-' + p);
  if (nb) nb.classList.add('active');
  document.getElementById('app-scroll').scrollTop = 0;
  if (p === 'stats' && _renderStats) _renderStats();
  if (p === 'leaderboard' && _renderLeaderboard) _renderLeaderboard();
  if (p === 'players' && _renderAllPlayers) _renderAllPlayers();
  if (p === 'home' && _renderHomeStats) _renderHomeStats();
  if (p === 'practice' && _renderPracticePage) _renderPracticePage();
  if (p === 'live' && _initLiveRound) _initLiveRound();
  if (p === 'competition' && _initCompetition) _initCompetition();
}

export function switchEntry(t) {
  document.getElementById('entry-manual').style.display = t === 'manual' ? 'block' : 'none';
  document.getElementById('entry-photo').style.display = t === 'photo' ? 'block' : 'none';
  document.getElementById('entry-course').style.display = t === 'course' ? 'block' : 'none';
  document.getElementById('tab-m').classList.toggle('active', t === 'manual');
  document.getElementById('tab-p').classList.toggle('active', t === 'photo');
  document.getElementById('tab-c').classList.toggle('active', t === 'course');
}
