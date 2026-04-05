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

export function stopNotificationPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
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

  // Snapshot notifications before marking as read
  const recentNotifs = [..._notifications];

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

  // Separate notification types
  const likeNotifs = recentNotifs.filter(n => n.type === 'round_liked');
  const commentNotifs = recentNotifs.filter(n => n.type === 'round_comment');
  const joinNotifs = recentNotifs.filter(n => n.type === 'join_request');
  const approvedNotifs = recentNotifs.filter(n => n.type === 'join_approved' || n.type === 'friend_accepted');

  const hasAnything = pending.length || likeNotifs.length || commentNotifs.length || joinNotifs.length || approvedNotifs.length;

  if (!hasAnything) {
    el.innerHTML = '<div style="text-align:center;padding:24px;font-size:12px;color:var(--dimmer)">No notifications</div>';
    return;
  }

  el.innerHTML = '';

  // Friend requests (actionable)
  if (pending.length) {
    el.innerHTML += '<div style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:10px;font-weight:600">Friend Requests</div>';
    pending.forEach(f => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--wa-06)';
      row.innerHTML = `
        ${avatarHtml(f.requester, 32, false)}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--cream)">${f.requester}</div>
          <div style="font-size:10px;color:var(--dim)">wants to be friends</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn" data-fid="${f.id}" data-action="accept" style="width:auto;padding:5px 12px;font-size:10px;border-radius:20px">Accept</button>
          <button class="btn btn-ghost" data-fid="${f.id}" data-action="decline" style="width:auto;padding:5px 12px;font-size:10px;border-radius:20px">Decline</button>
        </div>`;
      el.appendChild(row);
    });
  }

  // Likes + comments + approvals (informational)
  const infoNotifs = [...likeNotifs, ...commentNotifs, ...joinNotifs, ...approvedNotifs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (infoNotifs.length) {
    const header = document.createElement('div');
    header.style.cssText = 'font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin:16px 0 10px;font-weight:600';
    header.textContent = 'Recent';
    el.appendChild(header);

    infoNotifs.forEach(n => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--wa-06)';
      const from = n.from_player || 'Someone';
      let icon = '', text = '';
      if (n.type === 'round_liked') {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="var(--double)" stroke="var(--double)" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
        text = `<span style="color:var(--cream);font-weight:600">${from}</span> liked your round${n.payload?.roundCourse ? ' at ' + n.payload.roundCourse : ''}`;
      } else if (n.type === 'round_comment') {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--birdie)" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
        text = `<span style="color:var(--cream);font-weight:600">${from}</span> commented: "${(n.payload?.text || '').substring(0, 60)}"`;
      } else if (n.type === 'join_request') {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>';
        text = `<span style="color:var(--cream);font-weight:600">${from}</span> wants to join ${n.payload?.groupName || 'your league'}`;
      } else if (n.type === 'join_approved') {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--par)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        text = `You were approved to join ${n.payload?.groupName || 'a league'}`;
      } else if (n.type === 'friend_accepted') {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--par)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        text = `<span style="color:var(--cream);font-weight:600">${from}</span> accepted your friend request`;
      }
      row.innerHTML = `
        <div style="flex-shrink:0">${icon}</div>
        <div style="flex:1;min-width:0;font-size:11px;color:var(--dim);line-height:1.4">${text}</div>`;
      el.appendChild(row);
    });
  }

  // Wire friend request buttons
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
