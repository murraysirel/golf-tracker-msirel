// ─────────────────────────────────────────────────────────────────
// FRIENDS & NOTIFICATIONS
// Friend requests, notification polling, profile panel tabs
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { querySupabase } from './api.js';
import { parseDateGB } from './stats.js';
import { initials, avatarHtml } from './players.js';

let _notifications = [];
let _friendships = [];
let _pollTimer = null;

// ── API wrappers ─────────────────────────────────────────────────

export async function sendFriendRequest(toPlayer) {
  return querySupabase('sendFriendRequest', { from: state.me, to: toPlayer });
}

export async function respondToRequest(friendshipId, accept) {
  return querySupabase('respondFriendRequest', { friendshipId, playerName: state.me, accept });
}

export async function loadFriends() {
  const res = await querySupabase('getFriends', { playerName: state.me });
  _friendships = res?.friendships || [];
  return _friendships;
}

// ── Notification polling ─────────────────────────────────────────

export async function pollNotifications() {
  try {
    const res = await querySupabase('getNotifications', { playerName: state.me });
    _notifications = res?.notifications || [];
  } catch { _notifications = []; }
  updateNotificationDot();
  return _notifications;
}

export function startNotificationPolling() {
  if (_pollTimer) return;
  pollNotifications(); // immediate first poll
  _pollTimer = setInterval(pollNotifications, 60000);
}

export function getUnreadCount() {
  return _notifications.length;
}

function updateNotificationDot() {
  const count = _notifications.length;
  // Header avatar dot
  const dot = document.getElementById('profile-notif-dot');
  if (dot) {
    dot.style.display = count > 0 ? 'flex' : 'none';
    dot.textContent = count > 9 ? '9+' : String(count);
  }
  // Actions tab badge
  const tabBadge = document.getElementById('profile-tab-actions-badge');
  if (tabBadge) {
    tabBadge.style.display = count > 0 ? 'inline' : 'none';
    tabBadge.textContent = String(count);
  }
}

// ── Profile panel tab switching ──────────────────────────────────

export function initProfileTabs() {
  const tabs = document.querySelectorAll('.profile-pill');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.toggle('active', b === btn));
      const target = btn.dataset.tab;
      document.getElementById('profile-tab-settings')?.style && (document.getElementById('profile-tab-settings').style.display = target === 'settings' ? 'block' : 'none');
      document.getElementById('profile-tab-actions')?.style && (document.getElementById('profile-tab-actions').style.display = target === 'actions' ? 'block' : 'none');
      document.getElementById('profile-tab-friends')?.style && (document.getElementById('profile-tab-friends').style.display = target === 'friends' ? 'block' : 'none');
      if (target === 'actions') renderActionsTab();
      if (target === 'friends') renderFriendsTab();
    });
  });
}

// ── Actions tab — pending friend requests ────────────────────────

export async function renderActionsTab() {
  const el = document.getElementById('profile-tab-actions');
  if (!el) return;

  // Mark all notifications as read when viewing
  if (_notifications.length) {
    const ids = _notifications.map(n => n.id);
    querySupabase('markNotificationsRead', { ids }).catch(() => {});
    _notifications = [];
    updateNotificationDot();
  }

  // Load friendships to find pending requests addressed to me
  await loadFriends();
  const pending = _friendships.filter(f => f.addressee === state.me && f.status === 'pending');

  if (!pending.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;font-size:12px;color:var(--dimmer)">No pending actions</div>';
    return;
  }

  el.innerHTML = '<div style="font-family:\'DM Sans\',sans-serif;font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:12px">Friend Requests</div>';

  pending.forEach(f => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--wa-06)';
    row.innerHTML = `
      ${avatarHtml(f.requester, 36, false)}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--cream)">${f.requester}</div>
        <div style="font-size:10px;color:var(--dim)">wants to be friends</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn" data-fid="${f.id}" data-action="accept" style="width:auto;padding:6px 14px;font-size:11px;border-radius:20px">Accept</button>
        <button class="btn btn-ghost" data-fid="${f.id}" data-action="decline" style="width:auto;padding:6px 14px;font-size:11px;border-radius:20px">Decline</button>
      </div>`;
    el.appendChild(row);
  });

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fid = btn.dataset.fid;
      const accept = btn.dataset.action === 'accept';
      btn.disabled = true;
      btn.textContent = accept ? 'Accepting...' : 'Declining...';
      try {
        await respondToRequest(fid, accept);
        renderActionsTab();
      } catch {
        btn.disabled = false;
        btn.textContent = accept ? 'Accept' : 'Decline';
      }
    });
  });
}

// ── Friends tab — accepted friends with last round ───────────────

export async function renderFriendsTab() {
  const el = document.getElementById('profile-tab-friends');
  if (!el) return;

  await loadFriends();
  const accepted = _friendships.filter(f => f.status === 'accepted');
  const friendNames = accepted.map(f => f.requester === state.me ? f.addressee : f.requester);

  // Add friend — live search
  let html = `<div style="margin-bottom:14px;position:relative">
    <div style="font-family:'DM Sans',sans-serif;font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:8px">Add Friend</div>
    <input type="text" id="friend-search-input" placeholder="Search by name..." autocomplete="off" style="width:100%;font-size:13px;box-sizing:border-box">
    <div id="friend-search-results" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:50;max-height:220px;overflow-y:auto;background:var(--card);border:1px solid var(--border);border-radius:0 0 10px 10px;box-shadow:0 8px 24px rgba(0,0,0,.4)"></div>
    <div id="friend-add-msg" style="font-size:11px;color:var(--dim);margin-top:4px"></div>
  </div>`;

  if (!friendNames.length) {
    html += '<div style="text-align:center;padding:20px;font-size:12px;color:var(--dimmer)">No friends yet — add someone above</div>';
  } else {
    html += '<div style="font-family:\'DM Sans\',sans-serif;font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:10px">Friends</div>';
    friendNames.forEach(name => {
      const p = state.gd.players?.[name];
      const rounds = p?.rounds || [];
      const lastRound = rounds.length ? [...rounds].sort((a, b) => parseDateGB(b.date) - parseDateGB(a.date))[0] : null;
      const lastInfo = lastRound
        ? `Last: ${lastRound.course?.replace(/ Golf Club| Golf Course| Golf Links/g, '')} · ${lastRound.date}`
        : 'No rounds yet';
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--wa-06)">
        ${avatarHtml(name, 36, false)}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--cream)">${name}</div>
          <div style="font-size:10px;color:var(--dim)">${lastInfo}</div>
        </div>
        <div style="font-size:11px;color:var(--dim)">HCP ${p?.handicap ?? '?'}</div>
      </div>`;
    });
  }

  el.innerHTML = html;

  // Wire live search
  let _searchTimer = null;
  const searchInput = document.getElementById('friend-search-input');
  const resultsEl = document.getElementById('friend-search-results');
  const msgEl = document.getElementById('friend-add-msg');

  searchInput?.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) { if (resultsEl) resultsEl.style.display = 'none'; return; }
    _searchTimer = setTimeout(async () => {
      try {
        const res = await querySupabase('searchPlayers', { query: q, excludeName: state.me });
        const players = res?.players || [];
        if (!players.length) {
          resultsEl.style.display = 'block';
          resultsEl.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--dimmer);text-align:center">No players found</div>';
          return;
        }
        resultsEl.style.display = 'block';
        resultsEl.innerHTML = players.map(p => {
          const alreadyFriend = friendNames.includes(p.name);
          const courseStr = p.home_course ? ` · ${p.home_course}` : '';
          return `<div class="friend-search-row" data-name="${p.name}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:${alreadyFriend ? 'default' : 'pointer'};border-bottom:1px solid var(--border);${alreadyFriend ? 'opacity:.5' : ''}">
            ${avatarHtml(p.name, 32, false)}
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--cream)">${p.name}</div>
              <div style="font-size:10px;color:var(--dim)">HCP ${p.handicap ?? '?'}${courseStr}</div>
            </div>
            ${alreadyFriend ? '<span style="font-size:10px;color:var(--par)">Friends</span>' : '<span style="font-size:10px;color:var(--gold)">Add</span>'}
          </div>`;
        }).join('');
        resultsEl.querySelectorAll('.friend-search-row').forEach(row => {
          row.addEventListener('click', async () => {
            const name = row.dataset.name;
            if (friendNames.includes(name)) return;
            row.style.opacity = '0.5';
            row.querySelector('span:last-child').textContent = 'Sending...';
            try {
              const res = await sendFriendRequest(name);
              if (res?.alreadyExists) {
                if (msgEl) msgEl.textContent = `Already ${res.status === 'accepted' ? 'friends with' : 'requested'} ${name}.`;
              } else if (res?.ok) {
                if (msgEl) msgEl.innerHTML = `<span style="color:var(--par)">Request sent to ${name}!</span>`;
              } else {
                if (msgEl) msgEl.textContent = 'Could not send request.';
              }
            } catch {
              if (msgEl) msgEl.textContent = 'Network error.';
            }
            resultsEl.style.display = 'none';
            searchInput.value = '';
          });
        });
      } catch {
        resultsEl.style.display = 'block';
        resultsEl.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--dimmer);text-align:center">Search failed</div>';
      }
    }, 300);
  });

  // Close search results on outside tap
  document.addEventListener('click', e => {
    if (resultsEl && !resultsEl.contains(e.target) && e.target !== searchInput) {
      resultsEl.style.display = 'none';
    }
  }, { once: true });
}
