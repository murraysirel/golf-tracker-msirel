// ─────────────────────────────────────────────────────────────────
// STREAKS — computed client-side from rounds data
// ─────────────────────────────────────────────────────────────────
import { isBufferOrBetter, parseDateGB } from './stats.js';

/**
 * Compute all streaks for a player.
 * @param {Array} rounds — player's rounds (any order)
 * @param {number} currentHcp — player's current handicap
 * @returns {{ bufferOrBetter: {current, pb}, sub36Putts: {current, pb}, roundsIn30Days: {current, pb} }}
 */
export function computeStreaks(rounds, currentHcp) {
  if (!rounds?.length) return _empty();

  // Sort newest-first for streak counting
  const sorted = [...rounds].sort((a, b) => parseDateGB(b.date) - parseDateGB(a.date));

  return {
    bufferOrBetter: _bufferStreak(sorted, currentHcp),
    sub36Putts: _puttsStreak(sorted),
    roundsIn30Days: _frequencyStreak(sorted),
  };
}

function _empty() {
  return {
    bufferOrBetter: { current: 0, pb: 0 },
    sub36Putts: { current: 0, pb: 0 },
    roundsIn30Days: { current: 0, pb: 0 },
  };
}

// Consecutive rounds at buffer-or-better (newest → oldest)
function _bufferStreak(sorted, currentHcp) {
  let current = 0;
  let counting = true;
  let maxRun = 0;
  let run = 0;

  for (const r of sorted) {
    const hcp = r.handicap ?? currentHcp;
    const hit = isBufferOrBetter(r, hcp);
    // Current streak: count from newest until first miss
    if (counting) {
      if (hit) current++;
      else counting = false;
    }
    // PB: track longest run across all rounds
    if (hit) { run++; if (run > maxRun) maxRun = run; }
    else run = 0;
  }

  return { current, pb: Math.max(maxRun, current) };
}

// Consecutive rounds with total putts < 36 (newest → oldest)
function _puttsStreak(sorted) {
  let current = 0;
  let counting = true;
  let maxRun = 0;
  let run = 0;

  for (const r of sorted) {
    const putts = (r.putts || []).filter(v => v != null && v > 0);
    if (!putts.length) continue; // skip rounds without putt data
    const total = putts.reduce((a, b) => a + b, 0);
    const hit = total < 36;
    if (counting) {
      if (hit) current++;
      else counting = false;
    }
    if (hit) { run++; if (run > maxRun) maxRun = run; }
    else run = 0;
  }

  return { current, pb: Math.max(maxRun, current) };
}

// Rounds in rolling 30-day window (current + PB)
function _frequencyStreak(sorted) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffMs = cutoff.getTime();

  // Current: count rounds in last 30 days
  const current = sorted.filter(r => parseDateGB(r.date) >= cutoffMs).length;

  // PB: slide 30-day window across all rounds to find max density
  // Use oldest-first for sliding window
  const asc = [...sorted].reverse();
  let pb = current;
  for (let i = 0; i < asc.length; i++) {
    const windowStart = parseDateGB(asc[i].date);
    const windowEnd = windowStart + 30 * 86400000;
    let count = 0;
    for (let j = i; j < asc.length && parseDateGB(asc[j].date) <= windowEnd; j++) count++;
    if (count > pb) pb = count;
  }

  return { current, pb };
}

/**
 * Format a streak value for display.
 * @returns {{ icon, text, isPB }}
 */
export function formatStreak(name, streak) {
  const labels = {
    bufferOrBetter: 'Buffer or better',
    sub36Putts: 'Sub-36 putts',
    roundsIn30Days: 'Rounds in 30 days',
  };
  const isPB = streak.current > 0 && streak.current >= streak.pb;
  return {
    label: labels[name] || name,
    current: streak.current,
    pb: streak.pb,
    isPB,
    icon: streak.current > 0 ? (isPB ? '🏆' : '🔥') : '',
  };
}
