// ─────────────────────────────────────────────────────────────────
// COMPETITION MODE — Live activity feed + today's leaderboard
// Also exports getMatchLeaderboard for group match standings
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { loadGist } from './api.js';
import { calcStableford, parseDateGB } from './stats.js';
import { initials } from './players.js';
import { getCourseByRef } from './courses.js';

let _lastSnapshot = null;
let _pollInterval = null;
let _feed = [];
let _format = 'stableford';
let _lastPollTime = null;

const BIRDIE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>`;

const EAGLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/></svg>`;

const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

function todayGB() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${mon}/${d.getFullYear()}`;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

function diffSnapshots(oldSnap, newSnap) {
  const events = [];
  const today = todayGB();
  const now = Date.now();
  Object.entries(newSnap.players || {}).forEach(([name, player]) => {
    const oldRounds = (oldSnap?.players?.[name]?.rounds || []);
    const oldIds = new Set(oldRounds.map(r => r.id));
    (player.rounds || []).filter(r => r.date === today).forEach(r => {
      if (!oldIds.has(r.id)) {
        // New round submitted today
        events.push({ type: 'round', player: name, course: r.course, score: r.totalScore, diff: r.diff, ts: now });
        // Also surface birdies/eagles from this round
        if (r.scores && r.pars) {
          for (let h = 0; h < 18; h++) {
            const s = r.scores[h], p = r.pars[h];
            if (s == null || p == null) continue;
            const d = s - p;
            if (d <= -2) events.push({ type: 'eagle', player: name, hole: h + 1, ts: now - 1 });
            else if (d === -1) events.push({ type: 'birdie', player: name, hole: h + 1, ts: now - 2 });
          }
        }
      }
    });
  });
  return events;
}

function updatePollStatus() {
  const el = document.getElementById('comp-poll-status');
  if (!el) return;
  if (_lastPollTime) {
    const mins = Math.floor((Date.now() - _lastPollTime) / 60000);
    el.textContent = mins < 1 ? 'Updated just now' : `Updated ${mins}m ago`;
  } else {
    el.textContent = 'Polling every 45s';
  }
}

async function pollAndUpdate() {
  await loadGist();
  const newEvents = diffSnapshots(_lastSnapshot, state.gd);
  if (newEvents.length) {
    _feed = [...newEvents, ..._feed].slice(0, 50);
    renderActivityFeed();
  }
  _lastSnapshot = JSON.parse(JSON.stringify(state.gd));
  _lastPollTime = Date.now();
  renderCompLeaderboard();
  updatePollStatus();
}

export function initCompetition() {
  // Take initial snapshot for diffing on next poll
  if (!_lastSnapshot) {
    _lastSnapshot = JSON.parse(JSON.stringify(state.gd));
  }
  _lastPollTime = Date.now();

  // Wire up format toggles
  document.getElementById('comp-fmt-stab')?.addEventListener('click', () => setFormat('stableford'));
  document.getElementById('comp-fmt-gross')?.addEventListener('click', () => setFormat('gross'));

  renderCompLeaderboard();
  renderActivityFeed();
  updatePollStatus();

  // Start polling if not already running
  if (!_pollInterval) {
    _pollInterval = setInterval(pollAndUpdate, 45000);
  }
}

function setFormat(fmt) {
  _format = fmt;
  document.getElementById('comp-fmt-stab')?.classList.toggle('active', fmt === 'stableford');
  document.getElementById('comp-fmt-gross')?.classList.toggle('active', fmt === 'gross');
  renderCompLeaderboard();
}

function renderActivityFeed() {
  const el = document.getElementById('comp-feed');
  if (!el) return;
  if (!_feed.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px;line-height:1.5">No activity yet today.<br>Submitted rounds will appear here.</div>';
    return;
  }
  el.innerHTML = _feed.map(evt => {
    let icon, label, detail, iconColor;
    if (evt.type === 'eagle') {
      icon = EAGLE_SVG; iconColor = 'var(--eagle)';
      label = 'Eagle'; detail = `Hole ${evt.hole}`;
    } else if (evt.type === 'birdie') {
      icon = BIRDIE_SVG; iconColor = 'var(--birdie)';
      label = 'Birdie'; detail = `Hole ${evt.hole}`;
    } else {
      icon = CHECK_SVG; iconColor = 'var(--par)';
      const dStr = evt.diff != null ? (evt.diff >= 0 ? ' (+' + evt.diff + ')' : ' (' + evt.diff + ')') : '';
      label = 'Round submitted' + dStr;
      const shortCourse = (evt.course || '').replace(' Golf Club','').replace(' Golf Course','').replace(' Golf Links','');
      detail = shortCourse;
    }
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;color:${iconColor};flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--cream);font-weight:500">${evt.player}</div>
        <div style="font-size:11px;color:var(--dim)">${label}${detail ? ' · ' + detail : ''}</div>
      </div>
      <div style="font-size:10px;color:var(--dimmer);flex-shrink:0">${timeAgo(evt.ts)}</div>
    </div>`;
  }).join('');
}

// ── Group Match Leaderboard ───────────────────────────────────────

export function getMatchLeaderboard(matchId) {
  const match = state.gd.matches?.[matchId];
  if (!match) return [];

  const entries = (match.players || []).map(p => {
    const scoreData = match.scores?.[p.name];
    return {
      name: p.name,
      netTotal: scoreData?.holesPlayed > 0 ? scoreData.netTotal : null,
      holesPlayed: scoreData?.holesPlayed ?? 0,
      isMe: p.name === state.me
    };
  });

  // Sort: players with holes played first (by netTotal asc), 0-holes at bottom
  entries.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
    if (a.holesPlayed === 0) return 1;
    if (b.holesPlayed === 0) return -1;
    return (a.netTotal ?? 999) - (b.netTotal ?? 999);
  });

  // Assign positions; ties share the same number
  let pos = 1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].holesPlayed === 0) {
      entries[i].position = null;
    } else {
      if (i > 0 && entries[i - 1].holesPlayed > 0 && entries[i].netTotal === entries[i - 1].netTotal) {
        entries[i].position = entries[i - 1].position;
      } else {
        entries[i].position = pos;
      }
      pos++;
    }
  }

  return entries;
}

function renderCompLeaderboard() {
  const el = document.getElementById('comp-lb');
  if (!el) return;
  const today = todayGB();
  const posClass = ['gold', 'silver', 'bronze'];

  const entries = Object.entries(state.gd.players || {}).map(([name, player]) => {
    const todayRounds = (player.rounds || []).filter(r => r.date === today);
    if (!todayRounds.length) return null;
    // Use the round with highest id (most recently submitted)
    const r = todayRounds.reduce((a, b) => ((b.id || 0) > (a.id || 0) ? b : a));
    let stab = null;
    if (r.scores && r.pars) {
      const course = getCourseByRef(r.course);
      const si = course?.tees?.[r.tee]?.si || null;
      stab = calcStableford(r.scores, r.pars, player.handicap || 0, r.slope, si);
    }
    return { name, score: r.totalScore, diff: r.diff, totalPar: r.totalPar, stab, birdies: r.birdies || 0, handicap: player.handicap || 0, round: r };
  }).filter(Boolean);

  if (!entries.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--dimmer);font-size:12px;line-height:1.5">No rounds submitted today yet.<br>Scores will appear here once submitted.</div>';
    return;
  }

  if (_format === 'stableford') {
    entries.sort((a, b) => (b.stab ?? -1) - (a.stab ?? -1));
  } else {
    entries.sort((a, b) => (a.diff ?? 99) - (b.diff ?? 99) || (a.score ?? 999) - (b.score ?? 999));
  }

  el.innerHTML = entries.map((e, i) => {
    const isMe = e.name === state.me;
    const pc = posClass[i] || '';
    const avatarHtml = isMe
      ? `<div class="lb-avatar-me">${initials(e.name)}</div>`
      : `<div class="avatar" style="width:36px;height:36px;font-size:13px;border:1px solid rgba(255,255,255,.1)">${initials(e.name)}</div>`;

    let metricHtml;
    if (_format === 'stableford') {
      const diff36 = e.stab != null ? e.stab - 36 : null;
      const diff36Str = diff36 != null ? (diff36 >= 0 ? '+' + diff36 : String(diff36)) : '';
      const diff36Color = diff36 != null && diff36 >= 0 ? 'var(--birdie)' : 'var(--bogey)';
      metricHtml = `<div style="text-align:right;flex-shrink:0">
        <div class="lb-score" style="color:var(--gold)">${e.stab ?? '—'}</div>
        <div style="font-size:9px;color:${diff36Color};margin-top:1px">${diff36Str ? diff36Str + ' vs 36' : 'pts'}</div>
      </div>`;
    } else {
      const dStr = e.diff != null ? (e.diff >= 0 ? '+' + e.diff : String(e.diff)) : '—';
      const dColor = e.diff < 0 ? 'var(--birdie)' : e.diff === 0 ? 'var(--par)' : 'var(--bogey)';
      metricHtml = `<div style="text-align:right;flex-shrink:0">
        <div class="lb-score" style="color:${dColor}">${dStr}</div>
        <div style="font-size:9px;color:var(--dimmer);margin-top:1px">${e.score} gross</div>
      </div>`;
    }

    const birdieNote = e.birdies > 0 ? ` · ${e.birdies} birdie${e.birdies !== 1 ? 's' : ''}` : '';
    return `<div class="lb-row${isMe ? ' lb-me' : ''}">
      <div class="lb-pos ${pc}">${i + 1}</div>
      ${avatarHtml}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px">
          <span class="lb-name" style="${isMe ? 'color:var(--gold)' : ''}">${e.name}</span>
          ${isMe ? '<span class="lb-you-badge">You</span>' : ''}
        </div>
        <div class="lb-meta">HCP ${e.handicap}${birdieNote}</div>
      </div>
      ${metricHtml}
    </div>`;
  }).join('');
}
