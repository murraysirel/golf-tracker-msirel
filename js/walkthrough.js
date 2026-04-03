// ─────────────────────────────────────────────────────────────────
// WALKTHROUGH — 12-step spotlight tour for new users
// ─────────────────────────────────────────────────────────────────
import { goTo } from './nav.js';

const LS_KEY = 'looper_walkthrough_done';

const STEPS = [
  {
    target: null, page: null,
    title: 'Welcome to Looper',
    body: 'Your AI caddie in your pocket. Let\'s take a quick look at what\'s here — takes 30 seconds.',
    btnText: 'Let\'s go'
  },
  {
    target: '#home-pulse', page: 'home',
    title: 'Your game at a glance',
    body: 'Your 3 most important stats from your last 5 rounds. Tap the pencil icon to pick which ones matter most to you.'
  },
  {
    target: '#home-mates-section', page: 'home',
    title: 'Your group\'s live feed',
    body: 'Follow what your friends and leagues are up to. Birdies, who beat who, match results — because the final score isn\'t always the only story.'
  },
  {
    target: '#weather-container', page: 'home',
    title: 'Course conditions',
    body: 'See how tough the golf will be before you play. Set to your current location, or search any course worldwide.'
  },
  {
    target: '#home-caddie-cta', page: 'home',
    title: 'Ready to play?',
    body: 'Play with your mates in 5 different game modes — Stroke, Stableford, Match Play, Wolf, or Sixes. Or run a full weekend competition with live leaderboards. Access to 42,000+ courses worldwide.'
  },
  {
    target: '#round-play-section', page: 'round',
    title: 'Score every hole, your way',
    body: 'Tap to adjust scores, track putts, fairways, and greens. Other golfers in your group get a live notification — they can view your scores or join in and edit their own.'
  },
  {
    target: '#format-slider', page: 'round',
    title: 'Know your distances',
    body: 'Front, middle, and back of green on every hole with GPS. Tap to switch between targets. The green illustration shows exactly where each distance is.'
  },
  {
    target: '#pg-stats', page: 'stats',
    title: 'Your AI caddie',
    body: 'After every round, get a personalised coaching review based on your actual game — your worst holes, your putting patterns, what to work on next.'
  },
  {
    target: '#filter-pills', page: 'stats',
    title: 'Every stat, one place',
    body: 'Fairways, greens, putts, scoring trends, front 9 vs back 9, handicap benchmarks — everything you need to see where your game is going.'
  },
  {
    target: '#lb-view-pills', page: 'leaderboard',
    title: '8 ways to win',
    body: 'Stableford, net score, birdies, points scoring, and more. Your group competes across 8 leaderboards all season. Not every bad round is a bad round — there are always points to play for.'
  },
  {
    target: '#practice-area-grid', page: 'practice',
    title: 'Train smarter',
    body: 'AI builds a structured 50-shot practice session targeting your weaknesses. Pick an area or let AI choose based on your recent rounds.'
  },
  {
    target: null, page: 'home',
    title: 'Play more golf',
    body: 'Track who\'s really winning. Score points with many ways to beat your mates, not just breaking par. Because not every bad round is a bad round.',
    btnText: 'Get started'
  }
];

let _overlay = null;
let _tooltip = null;
let _step = 0;
let _currentPage = null;

export function isWalkthroughDone() {
  return localStorage.getItem(LS_KEY) === '1';
}

export function startWalkthrough() {
  _step = 0;
  _createElements();
  _showStep(0);
}

function _createElements() {
  // Remove existing if replaying
  document.getElementById('wt-spotlight')?.remove();
  document.getElementById('wt-tooltip')?.remove();

  _overlay = document.createElement('div');
  _overlay.id = 'wt-spotlight';
  _overlay.className = 'wt-overlay';
  document.body.appendChild(_overlay);

  _tooltip = document.createElement('div');
  _tooltip.id = 'wt-tooltip';
  _tooltip.className = 'wt-tooltip';
  document.body.appendChild(_tooltip);
}

function _showStep(idx) {
  if (idx >= STEPS.length) { _finish(); return; }
  _step = idx;
  const step = STEPS[idx];

  // Navigate if needed
  if (step.page && step.page !== _currentPage) {
    _currentPage = step.page;
    goTo(step.page);
    setTimeout(() => _renderStep(step, idx), 350);
  } else {
    _renderStep(step, idx);
  }
}

function _renderStep(step, idx) {
  const total = STEPS.length;
  const isFirst = idx === 0;
  const isLast = idx === total - 1;
  const nextLabel = step.btnText || 'Next';
  const skipLabel = isFirst ? 'Skip tour' : (isLast ? '' : 'Skip');

  // Position spotlight
  if (step.target) {
    const el = document.querySelector(step.target);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Wait for scroll to settle
      setTimeout(() => _positionSpotlight(el), 200);
    } else {
      _centreSpotlight();
    }
  } else {
    _centreSpotlight();
  }

  // Build tooltip
  _tooltip.innerHTML = `
    <div class="wt-step">${idx + 1} of ${total}</div>
    <div class="wt-title">${step.title}</div>
    <div class="wt-body">${step.body}</div>
    <div class="wt-btns">
      ${skipLabel ? `<button class="wt-skip" id="wt-skip">${skipLabel}</button>` : ''}
      <button class="wt-next" id="wt-next">${nextLabel}</button>
    </div>
  `;
  _tooltip.style.display = 'block';

  // Position tooltip after spotlight is placed
  setTimeout(() => {
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) _positionTooltip(el);
      else _centreTooltip();
    } else {
      _centreTooltip();
    }
  }, step.target ? 250 : 10);

  // Wire buttons
  document.getElementById('wt-next')?.addEventListener('click', () => _showStep(idx + 1));
  document.getElementById('wt-skip')?.addEventListener('click', _finish);
}

function _positionSpotlight(el) {
  const r = el.getBoundingClientRect();
  const pad = 8;
  _overlay.style.display = 'block';
  _overlay.style.top = (r.top - pad) + 'px';
  _overlay.style.left = (r.left - pad) + 'px';
  _overlay.style.width = (r.width + pad * 2) + 'px';
  _overlay.style.height = (r.height + pad * 2) + 'px';
  _overlay.style.borderRadius = '14px';
}

function _centreSpotlight() {
  // No target — full dark overlay with centred hole
  _overlay.style.display = 'block';
  _overlay.style.top = '50%';
  _overlay.style.left = '50%';
  _overlay.style.width = '0px';
  _overlay.style.height = '0px';
  _overlay.style.borderRadius = '50%';
}

function _positionTooltip(el) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const tooltipH = _tooltip.offsetHeight;
  const gap = 14;

  // Prefer below the element, fallback to above
  if (r.bottom + gap + tooltipH < vh) {
    _tooltip.style.top = (r.bottom + gap) + 'px';
  } else {
    _tooltip.style.top = Math.max(8, r.top - tooltipH - gap) + 'px';
  }
  // Centre horizontally, clamped to screen edges
  const centreX = r.left + r.width / 2 - 150;
  _tooltip.style.left = Math.max(16, Math.min(centreX, window.innerWidth - 316)) + 'px';
}

function _centreTooltip() {
  _tooltip.style.top = '50%';
  _tooltip.style.left = '50%';
  _tooltip.style.transform = 'translate(-50%, -50%)';
}

function _finish() {
  localStorage.setItem(LS_KEY, '1');
  _overlay?.remove();
  _tooltip?.remove();
  _overlay = null;
  _tooltip = null;
  _currentPage = null;
  goTo('home');
}
