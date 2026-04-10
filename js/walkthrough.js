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
    title: 'Your group\'s activity feed',
    body: 'See what your group is up to — rounds played, scores, birdies, match results, and milestones. Tap anywhere to open the full feed where you can like, comment, and share photos.'
  },
  {
    target: '#home-caddie-cta', page: 'home',
    title: 'Ready to play?',
    body: 'Start a round with your mates in 5 game modes — Stroke, Stableford, Match Play, Wolf, or Sixes. GPS distances on every hole, live scoring with your group, and access to 42,000+ courses worldwide.'
  },
  {
    target: '#weather-container', page: 'home',
    title: 'Course conditions',
    body: 'See how tough the golf will be before you play. Set to your current location, or search any course worldwide.'
  },
  {
    target: '#round-play-section', page: 'round',
    title: 'Score every hole, your way',
    body: 'Tap to adjust scores, track putts, fairways, and greens. Other golfers in your group get a live notification — they can view your scores or join in and edit their own.'
  },
  {
    target: '#format-slider', page: 'round',
    title: 'Pick your format',
    body: 'Choose from Stroke, Stableford, Match Play, Wolf, or Sixes. Each format has its own scoring and standings. Tap "Teach me" on any format to learn the rules.'
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
    title: 'You\'re all set',
    body: 'Track who\'s really winning. Create competitions, build your stats, and find out who really is the best golfer in your group.',
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
  _currentPage = null;
  _createElements();
  _showStep(0);
}

function _createElements() {
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

  if (step.page && step.page !== _currentPage) {
    _currentPage = step.page;
    goTo(step.page);
    // Longer delay for page render + scroll
    setTimeout(() => _renderStep(step, idx), 500);
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

  // Build tooltip HTML first (need its height for positioning)
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

  // Reset any stale transform
  _tooltip.style.transform = '';

  if (step.target) {
    const el = document.querySelector(step.target);
    if (el) {
      // Scroll element into view first
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Wait for scroll, then position everything
      setTimeout(() => {
        _positionSpotlight(el);
        _positionTooltipNear(el);
      }, 300);
    } else {
      _fullOverlay();
      _centreTooltip();
    }
  } else {
    _fullOverlay();
    _centreTooltip();
  }

  // Wire buttons
  document.getElementById('wt-next')?.addEventListener('click', () => _showStep(idx + 1));
  document.getElementById('wt-skip')?.addEventListener('click', _finish);
}

function _positionSpotlight(el) {
  const r = el.getBoundingClientRect();
  const pad = 10;
  _overlay.style.display = 'block';
  _overlay.style.top = (r.top - pad) + 'px';
  _overlay.style.left = (r.left - pad) + 'px';
  _overlay.style.width = (r.width + pad * 2) + 'px';
  _overlay.style.height = (r.height + pad * 2) + 'px';
  _overlay.style.borderRadius = '14px';
}

function _fullOverlay() {
  // No target — tiny invisible hole = full dark screen
  _overlay.style.display = 'block';
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  _overlay.style.top = cy + 'px';
  _overlay.style.left = cx + 'px';
  _overlay.style.width = '0px';
  _overlay.style.height = '0px';
  _overlay.style.borderRadius = '50%';
}

function _positionTooltipNear(el) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tH = _tooltip.offsetHeight;
  const tW = Math.min(300, vw - 32);
  const gap = 16;

  // Vertical: prefer below, fallback above, fallback centre
  let top;
  if (r.bottom + gap + tH + 20 < vh) {
    // Below the element
    top = r.bottom + gap;
  } else if (r.top - gap - tH > 20) {
    // Above the element
    top = r.top - gap - tH;
  } else {
    // Element takes most of the screen — put tooltip in the visible gap
    top = Math.max(20, vh - tH - 20);
  }

  // Horizontal: centre on element, clamp to screen
  let left = r.left + r.width / 2 - tW / 2;
  left = Math.max(16, Math.min(left, vw - tW - 16));

  _tooltip.style.top = top + 'px';
  _tooltip.style.left = left + 'px';
  _tooltip.style.transform = '';
}

function _centreTooltip() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tH = _tooltip.offsetHeight;
  const tW = Math.min(300, vw - 32);
  _tooltip.style.top = ((vh - tH) / 2) + 'px';
  _tooltip.style.left = ((vw - tW) / 2) + 'px';
  _tooltip.style.transform = '';
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
