// ─────────────────────────────────────────────────────────────────
// PLAYERS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { pushData, querySupabase, loadGroupData, loadAppData } from './api.js';
import { goTo } from './nav.js';
import { initCourseSearch, renderScannedCourses } from './courses.js';
import { renderHomeStats, parseDateGB } from './stats.js';
import { computeStreaks, formatStreak } from './streaks.js';

export function initials(n) {
  return n.split(' ').map(p => p[0] || '').join('').toUpperCase().slice(0, 2);
}

export function avatarHtml(name, size = 36, isMe = false) {
  const img = state.gd.players?.[name]?.avatarImg;
  if (img) {
    const border = isMe ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,.1)';
    return `<img src="${img}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:${border};flex-shrink:0;cursor:pointer" onclick="var m=document.getElementById('avatar-zoom-modal'),i=document.getElementById('avatar-zoom-img');if(m&&i){i.src=this.src;m.style.display='flex'}">`;
  }
  const cls = isMe ? 'lb-avatar-me' : 'avatar';
  const extra = !isMe ? `style="width:${size}px;height:${size}px;font-size:13px;border:1px solid rgba(255,255,255,.1)"` : '';
  return `<div class="${cls}" ${extra}>${initials(name)}</div>`;
}

export function refreshAvatarUI() {
  if (!state.me) return;
  const img = state.gd.players?.[state.me]?.avatarImg;
  // Header button
  const el = document.getElementById('hdr-avatar-initials');
  if (el) {
    if (img) {
      el.innerHTML = `<img src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      el.style.cssText = 'width:100%;height:100%;display:block;overflow:hidden;border-radius:50%';
    } else {
      el.textContent = initials(state.me);
      el.style.cssText = "font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;color:var(--gold)";
    }
  }
  // Profile panel circle
  const disp = document.getElementById('profile-avatar-display');
  if (disp) {
    disp.innerHTML = img
      ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover">`
      : `<span style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:700;color:var(--gold)">${initials(state.me)}</span>`;
  }
  const removeBtn = document.getElementById('avatar-remove-btn');
  if (removeBtn) removeBtn.style.display = img ? 'inline' : 'none';
  const nameEl = document.getElementById('profile-name-display');
  if (nameEl) nameEl.textContent = state.me;
  const emailEl = document.getElementById('profile-email-display');
  if (emailEl) emailEl.textContent = state.gd.players?.[state.me]?.email || '';
  // DOB — shown only in account card, never elsewhere
  const dobEl = document.getElementById('profile-dob-display');
  if (dobEl) dobEl.textContent = state.gd.players?.[state.me]?.dob || 'Not set';
  const acctCard = document.getElementById('profile-account-card');
  if (acctCard) acctCard.style.display = 'block';
  // Home course — populate input with stored value
  const hcInput = document.getElementById('home-course-input');
  if (hcInput) hcInput.value = state.gd.players?.[state.me]?.homeCourse || '';
}

function resizeToDataURL(file, size = 256) {
  return new Promise(resolve => {
    const imgEl = new Image();
    const url = URL.createObjectURL(file);
    imgEl.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(imgEl.width, imgEl.height);
      const sx = (imgEl.width - min) / 2;
      const sy = (imgEl.height - min) / 2;
      ctx.drawImage(imgEl, sx, sy, min, min, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    imgEl.src = url;
  });
}

export async function uploadAvatar(file) {
  const dataUrl = await resizeToDataURL(file);
  if (!state.gd.players[state.me]) return;
  state.gd.players[state.me].avatarImg = dataUrl;
  refreshAvatarUI();
  pushData();
  querySupabase('upsertPlayer', { playerName: state.me, avatarUrl: dataUrl });
}

export function renderLogin() {
  // Hide all flow pages, show the onboarding shell with the login form panel
  ['pg-main', 'pg-group-fork', 'pg-join-group', 'pg-create-group', 'pg-board-setup', 'pg-group-ready', 'pg-board'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const pg = document.getElementById('pg-onboard');
  if (pg) pg.style.display = 'block';
  showSignupStep(0);
}

// ── Profile completion for existing players ───────────────────────
let _profileCompletionPlayer = null;

function _isValidDOB(dob) {
  if (!dob) return false;
  const parts = dob.split('/');
  if (parts.length !== 3) return false;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 1900 || y > new Date().getFullYear() - 5) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function _showCompleteProfileFor(n) {
  _profileCompletionPlayer = n;
  const p = state.gd.players[n] || {};
  ['onb-step-select', 'onb-step-profile', 'onb-step-privacy'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const pg = document.getElementById('pg-onboard');
  if (pg) pg.style.display = 'block';
  const fields = document.getElementById('onb-complete-fields');
  if (fields) {
    let html = '';
    if (!p.email) {
      html += `<label style="font-size:11px;color:var(--dim);margin-bottom:4px;display:block">Email address <span style="color:#e74c3c">*</span></label>
        <input type="email" id="cp-email" placeholder="e.g. jamie@example.com" autocomplete="email" class="mb12" inputmode="email">`;
    }
    if (!p.dob) {
      html += `<label style="font-size:11px;color:var(--dim);margin-bottom:4px;display:block">Date of birth <span style="color:#e74c3c">*</span></label>
        <div style="font-size:10px;color:var(--dimmer);margin-bottom:5px">Used to keep your account secure — never shown publicly</div>
        <input type="text" id="cp-dob" placeholder="DD/MM/YYYY" class="mb12" inputmode="numeric" maxlength="10">`;
    }
    fields.innerHTML = html;
  }
  document.getElementById('onb-step-complete-profile').style.display = 'block';
  if (pg) pg.scrollTop = 0;
}

export function submitCompleteProfile() {
  const n = _profileCompletionPlayer;
  if (!n || !state.gd.players[n]) return;
  const p = state.gd.players[n];
  const errEl = document.getElementById('onb-complete-err');
  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };
  if (errEl) errEl.style.display = 'none';

  let email = p.email;
  let dob   = p.dob;

  if (!email) {
    email = (document.getElementById('cp-email')?.value || '').trim();
    if (!email || !email.includes('@')) { showErr('Please enter a valid email address.'); return; }
    const el = email.toLowerCase();
    const inUse = Object.entries(state.gd.players).some(([pn, pp]) => pn !== n && pp.email?.toLowerCase() === el);
    if (inUse) { showErr('This email is already used by another player.'); return; }
  }

  if (!dob) {
    dob = (document.getElementById('cp-dob')?.value || '').trim();
    if (!dob) { showErr('Please enter your date of birth.'); return; }
    if (!_isValidDOB(dob)) { showErr('Please enter a valid date in DD/MM/YYYY format.'); return; }
  }

  p.email = email;
  p.dob   = dob;
  pushData();
  querySupabase('upsertPlayer', { playerName: n, email, dob, handicap: p.handicap || 0 });

  document.getElementById('onb-step-complete-profile').style.display = 'none';
  _profileCompletionPlayer = null;
  enterAs(n); // re-call — profile is now complete, will proceed normally
}

export async function enterAs(n) {
  if (!state.gd.players[n]) state.gd.players[n] = { handicap: 0, rounds: [] };

  state.me = n;
  localStorage.setItem('rrg_me', n);

  ['pg-onboard', 'pg-group-fork', 'pg-join-group', 'pg-create-group', 'pg-board-setup', 'pg-group-ready', 'pg-board'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Auto-redirect to join flow if a group invite code is in the URL
  if (new URLSearchParams(window.location.search).get('group')) {
    forkJoinGroup();
    return;
  }
  const pm = document.getElementById('pg-main');
  pm.style.display = 'flex';
  initCourseSearch();
  renderHomeStats();
  seedGreenCoords();
  goTo('home');
  document.getElementById('r-date').value = new Date().toISOString().split('T')[0];

  // Show walkthrough for first-time users
  if (!localStorage.getItem('looper_walkthrough_done')) {
    import('./walkthrough.js').then(m => setTimeout(() => m.startWalkthrough(), 800)).catch(() => {});
  }

  // Check group membership — show fork screen if player has no active group
  _checkAndShowGroupFork(n);
}

async function _checkAndShowGroupFork(playerName) {
  // Skip if fork was already dismissed (persists across sessions)
  if (localStorage.getItem('looper_fork_dismissed')) return;
  // Skip if player is already at league cap
  if ((state.gd.groupCodes || []).length >= 5) return;
  try {
    const res = await querySupabase('checkGroupMembership', { playerName });
    if (res && res.isMember) {
      // Player already belongs to a real group — no action needed
      return;
    }
    // Not a member of any group — show the fork screen
    showGroupFork();
  } catch (_) {
    // Non-fatal: if check fails, don't block the player
  }
}

export function addAndEnter() {
  const fname = document.getElementById('new-fname')?.value.trim();
  const lname = document.getElementById('new-lname')?.value.trim();
  const username = document.getElementById('new-username')?.value.trim() || '';
  const errEl = document.getElementById('group-code-err');
  if (!fname || !lname) {
    if (errEl) { errEl.textContent = 'Please enter your first and last name.'; errEl.style.display = 'block'; setTimeout(() => { errEl.style.display = 'none'; errEl.textContent = 'Incorrect group code — check with your group admin.'; }, 3000); }
    else alert('Please enter your first and last name.');
    return;
  }
  const n = fname + ' ' + lname;
  if (state.gd.requireGroupCode && state.gd.activeGroupCode) {
    const entered = (document.getElementById('new-group-code')?.value || '').trim().toUpperCase();
    if (!state.gd.groupCodes?.includes(entered)) {
      if (errEl) { errEl.textContent = 'Incorrect group code — check with your group admin.'; errEl.style.display = 'block'; setTimeout(() => errEl.style.display = 'none', 4000); }
      document.getElementById('group-code-field').style.display = 'block';
      return;
    }
  }
  if (!state.gd.players[n]) state.gd.players[n] = { handicap: 0, rounds: [], ...(username ? { username } : {}) };
  pushData();
  enterAs(n);
}

export function signOut() {
  import('./push.js').then(m => m.removePushToken?.()).catch(() => {});
  import('./auth.js').then(({ serverSignOut }) => serverSignOut()).catch(() => {});
  // Stop all polling timers on logout
  import('./friends.js').then(m => { if (m.stopNotificationPolling) m.stopNotificationPolling(); }).catch(() => {});
  import('./live-invite.js').then(m => { if (m.stopInvitePolling) m.stopInvitePolling(); }).catch(() => {});
  state.me = '';
  localStorage.removeItem('rrg_me');
  renderLogin();
}

// ── New-user sign-up flow (3 steps) ──────────────────────────────

let _pendingProfile = null; // { name, handicap, email, dob } — held between steps 1 and 2
let _forkFromOnboarding = false;

export function showSignupStep(n) {
  const stepSelect = document.getElementById('onb-step-select');
  if (stepSelect) stepSelect.style.display = n === 0 ? 'block' : 'none';
  // When showing step 0 (login), default to login form panel, hide magic panel
  if (n === 0) {
    const lf = document.getElementById('onb-login-form');
    const mf = document.getElementById('onb-magic-form');
    if (lf) lf.style.display = 'block';
    if (mf) mf.style.display = 'none';
  }
  // Clear stale error messages when navigating between steps
  const privacyErr = document.getElementById('onb-privacy-err');
  if (privacyErr) privacyErr.style.display = 'none';
  const profileErr = document.getElementById('onb-profile-err');
  if (profileErr) profileErr.style.display = 'none';
  document.getElementById('onb-step-profile').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('onb-step-privacy').style.display = n === 2 ? 'block' : 'none';
  const cps = document.getElementById('onb-step-complete-profile');
  if (cps) cps.style.display = 'none';
  const ps = document.getElementById('onb-step-prefs');
  if (ps) ps.style.display = 'none';
  const pg = document.getElementById('pg-onboard');
  if (pg) pg.scrollTop = 0;
}

export function submitProfile() {
  const firstName = (document.getElementById('new-firstname')?.value || '').trim();
  const lastName = (document.getElementById('new-lastname')?.value || '').trim();
  const hcpRaw = document.getElementById('new-handicap')?.value ?? '';
  const email = (document.getElementById('new-email')?.value || '').trim();
  const dob   = (document.getElementById('new-dob')?.value || '').trim();
  const errEl = document.getElementById('onb-profile-err');
  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

  if (!firstName) { showErr('Please enter your first name.'); return; }
  if (!lastName) { showErr('Please enter your last name.'); return; }
  const fullName = firstName + ' ' + lastName;
  const hcp = parseFloat(hcpRaw);
  if (hcpRaw === '' || isNaN(hcp) || hcp < -10 || hcp > 54) {
    showErr('Please enter a valid Handicap Index between −10 and 54. Use a negative number for a plus handicap (e.g. −1.2 = +1.2).');
    return;
  }
  if (!email || !email.includes('@')) { showErr('Please enter a valid email address.'); return; }
  const emailLower = email.toLowerCase();
  const emailInUse = Object.entries(state.gd.players).some(([, p]) => p.email?.toLowerCase() === emailLower);
  if (emailInUse) { showErr('This email is already in use. If this is you, tap your name from the player list to sign in.'); return; }
  if (!dob) { showErr('Please enter your date of birth.'); return; }
  if (!_isValidDOB(dob)) { showErr('Please enter a valid date of birth in DD/MM/YYYY format (e.g. 15/06/1990).'); return; }

  const password  = (document.getElementById('new-password')?.value || '');
  const password2 = (document.getElementById('new-password2')?.value || '');
  if (password.length < 8) { showErr('Password must be at least 8 characters.'); return; }
  if (password !== password2) { showErr('Passwords do not match.'); return; }

  if (errEl) errEl.style.display = 'none';
  _pendingProfile = { name: fullName, handicap: parseFloat(hcp.toFixed(1)), email, dob, password };
  // Show preferences step before privacy
  showPrefsStep();
}

export function showPrefsStep() {
  ['onb-step-select', 'onb-step-profile', 'onb-step-privacy', 'onb-step-complete-profile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const prefs = document.getElementById('onb-step-prefs');
  if (prefs) prefs.style.display = 'block';
  // Reflect saved preferences in the step UI
  const savedTheme = localStorage.getItem('rr_theme') || 'dark';
  document.getElementById('pref-theme-dark')?.classList.toggle('active', savedTheme === 'dark');
  document.getElementById('pref-theme-light')?.classList.toggle('active', savedTheme === 'light');
  const savedUnit = localStorage.getItem('looper_dist_unit') || 'yards';
  document.getElementById('pref-unit-yards')?.classList.toggle('active', savedUnit === 'yards');
  document.getElementById('pref-unit-metres')?.classList.toggle('active', savedUnit === 'metres');
}

export function setPrefTheme(t) {
  localStorage.setItem('rr_theme', t);
  document.documentElement.dataset.theme = t;
  document.getElementById('pref-theme-dark')?.classList.toggle('active', t === 'dark');
  document.getElementById('pref-theme-light')?.classList.toggle('active', t === 'light');
  // Also update the main theme toggle buttons
  document.getElementById('theme-dark-btn')?.classList.toggle('active', t === 'dark');
  document.getElementById('theme-light-btn')?.classList.toggle('active', t === 'light');
}

export function setPrefUnit(u) {
  localStorage.setItem('looper_dist_unit', u);
  document.getElementById('pref-unit-yards')?.classList.toggle('active', u === 'yards');
  document.getElementById('pref-unit-metres')?.classList.toggle('active', u === 'metres');
}

export function submitPrefs() {
  const prefs = document.getElementById('onb-step-prefs');
  if (prefs) prefs.style.display = 'none';
  showSignupStep(2);
}

export async function agreePrivacy() {
  if (!_pendingProfile) return;
  const { name, handicap, email, dob, password } = _pendingProfile;

  const errEl = document.getElementById('onb-privacy-err');
  const btn   = document.getElementById('onb-privacy-agree-btn');
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }

  const { signUp } = await import('./auth.js');
  const result = await signUp(email, password, name, handicap, dob);

  if (btn) { btn.disabled = false; btn.textContent = 'I understand — continue →'; }

  if (result.needsConfirmation) {
    if (errEl) {
      errEl.textContent = 'Check your email for a confirmation link, then sign in.';
      errEl.style.display = 'block';
    }
    return;
  }

  if (result.error) {
    if (errEl) {
      errEl.textContent = result.error.toLowerCase().includes('already registered')
        ? 'An account with this email already exists — please sign in instead.'
        : result.error;
      errEl.style.display = 'block';
    }
    return;
  }

  // Auth account created + session stored by signUp()
  // Use the server-resolved player name (handles name-based linking)
  const resolvedName = result.playerName || name;
  if (!state.gd.players[resolvedName]) {
    state.gd.players[resolvedName] = { handicap, rounds: [], email, dob };
  }
  state.me = resolvedName;
  localStorage.setItem('rrg_me', resolvedName);
  _pendingProfile = null;

  // Load all data from Supabase now that auth_user_id is linked
  await loadAppData(resolvedName, localStorage.getItem('gt_activegroup') || '');

  // Ensure DOB, email, and handicap are persisted — server linkOrCreatePlayer may have
  // skipped DOB if it matched by email rather than creating a new row
  querySupabase('upsertPlayer', { playerName: resolvedName, email, dob, handicap });

  showGroupFork(true);
}

export function showGroupFork(fromOnboarding = false) {
  _forkFromOnboarding = fromOnboarding;
  ['pg-onboard', 'pg-main', 'pg-join-group', 'pg-create-group'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Auto-redirect to join flow if a group invite code is in the URL
  if (new URLSearchParams(window.location.search).get('group')) {
    forkJoinGroup();
    return;
  }
  const fork = document.getElementById('pg-group-fork');
  if (fork) fork.style.display = 'block';
}

export function goBackToFork() {
  ['pg-join-group', 'pg-create-group', 'pg-board-setup', 'pg-group-ready'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // If user came from the leaderboard, go back there instead of the fork screen
  if (window._lbGroupReturn) {
    window._lbGroupReturn = false;
    const pm = document.getElementById('pg-main');
    if (pm) pm.style.display = 'flex';
    import('./nav.js').then(({ goTo }) => goTo('leaderboard'));
    return;
  }
  const fork = document.getElementById('pg-group-fork');
  if (fork) fork.style.display = 'block';
}

export function forkNotNow() {
  localStorage.setItem('looper_fork_dismissed', '1');
  document.getElementById('pg-group-fork').style.display = 'none';
  // Don't call enterAs again — we're already on pg-main; just ensure it's visible
  const pm = document.getElementById('pg-main');
  if (pm) pm.style.display = 'flex';
}

export function forkJoinGroup() {
  document.getElementById('pg-group-fork').style.display = 'none';
  document.getElementById('pg-join-group').style.display = 'block';
  document.dispatchEvent(new CustomEvent('joinGroupShown'));
}

export function forkCreateGroup() {
  document.getElementById('pg-group-fork').style.display = 'none';
  document.getElementById('pg-create-group').style.display = 'block';
  document.dispatchEvent(new CustomEvent('createGroupShown'));
}

export function renderAllPlayers() {
  const list = document.getElementById('all-players');
  list.innerHTML = '';
  const pgc = document.getElementById('players-group-code');
  if (pgc) pgc.textContent = state.gd.activeGroupCode || '—';
  const gcBtn = document.getElementById('gc-toggle-btn');
  if (gcBtn) gcBtn.textContent = state.gd.requireGroupCode ? 'On' : 'Off';
  renderSeasonList();
  Object.keys(state.gd.players).forEach(n => {
    const p = state.gd.players[n];
    const rs = p.rounds || [];
    const sc = rs.map(r => r.totalScore).filter(Boolean);
    const div = document.createElement('div');
    div.className = 'player-card' + (n === state.me ? ' me' : '');
    div.innerHTML = `${avatarHtml(n, 36, n === state.me)}<div style="flex:1"><div class="pname">${n}${n === state.me ? ' <span style="font-size:10px;color:var(--gold)">\u25B6 you</span>' : ''}</div><div class="pmeta">${rs.length} round${rs.length !== 1 ? 's' : ''} \u00B7 Best: ${sc.length ? Math.min(...sc) : '—'}</div></div>`;
    if (n !== state.me) { div.addEventListener('click', () => { enterAs(n); goTo('home'); }); }
    list.appendChild(div);
  });
  renderScannedCourses();
}

export function addPlayer() {
  const fname = document.getElementById('add-fname')?.value.trim();
  const lname = document.getElementById('add-lname')?.value.trim();
  const username = document.getElementById('add-username')?.value.trim() || '';
  const msg = document.getElementById('add-msg');
  if (!fname || !lname) { if (msg) msg.textContent = 'Please enter first and last name.'; return; }
  const n = fname + ' ' + lname;
  if (state.gd.players[n]) { if (msg) msg.textContent = 'Already exists!'; return; }
  state.gd.players[n] = { handicap: 0, rounds: [], ...(username ? { username } : {}) };
  pushData();
  if (msg) msg.textContent = '\u2705 ' + n + ' added!';
  document.getElementById('add-fname').value = '';
  document.getElementById('add-lname').value = '';
  document.getElementById('add-username').value = '';
  renderAllPlayers();
}

// Multi-player scoring
export function renderPlayersToday() {
  const wrap = document.getElementById('players-today-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const allPlayers = Object.keys(state.gd.players || {});
  allPlayers.forEach(name => {
    const isActive = (state.scoringFor || state.me) === name;
    const btn = document.createElement('button');
    btn.style.cssText = `padding:6px 12px;border-radius:20px;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${isActive ? 'var(--gold)' : 'rgba(255,255,255,.15)'};background:${isActive ? 'rgba(201,168,76,.15)' : 'transparent'};color:${isActive ? 'var(--gold)' : 'var(--dim)'};font-weight:${isActive ? '600' : '400'}`;
    btn.textContent = name === state.me ? name + ' (you)' : name;
    btn.addEventListener('click', () => { state.scoringFor = name; renderPlayersToday(); updateScoringForLabel(); });
    wrap.appendChild(btn);
  });
  updateScoringForLabel();
}

export function updateScoringForLabel() {
  const label = document.getElementById('scoring-for-name');
  if (!label) return;
  const active = state.scoringFor || state.me;
  label.textContent = active === state.me ? 'yourself' : active;
}

// ── Match context bottom sheet ────────────────────────────────────

export function showMatchContextSheet(playerName, roundId) {
  const sheet = document.getElementById('match-context-sheet');
  const inner = document.getElementById('match-context-inner');
  if (!sheet || !inner) return;

  const otherPlayers = Object.keys(state.gd.players).filter(p => p !== playerName);
  if (!otherPlayers.length) return;

  let selected = new Set();

  const close = () => { sheet.style.display = 'none'; };

  const render = () => {
    const chips = otherPlayers.map(name => {
      const on = selected.has(name);
      return `<button class="mc-chip" data-player="${name}" style="padding:7px 14px;border-radius:20px;font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${on ? 'var(--gold)' : 'var(--border)'};background:${on ? 'rgba(201,168,76,.15)' : 'transparent'};color:${on ? 'var(--gold)' : 'var(--dim)'};margin:0 6px 6px 0">${name}</button>`;
    }).join('');

    const saveBtn = selected.size > 0
      ? `<button id="mc-save" style="flex:1;padding:14px;border-radius:10px;background:var(--gold);border:none;color:var(--navy);font-size:14px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer">Save</button>`
      : '';

    inner.innerHTML = `
      <div style="font-size:14px;font-weight:700;color:var(--cream);margin-bottom:4px">Who did you play with?</div>
      <div style="font-size:12px;color:var(--dim);margin-bottom:14px">Tag your playing partners to unlock match stats</div>
      <div style="display:flex;flex-wrap:wrap;margin-bottom:4px">${chips}</div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button id="mc-skip" style="flex:1;padding:14px;border-radius:10px;background:var(--mid);border:1px solid var(--border);color:var(--dim);font-size:14px;font-family:'DM Sans',sans-serif;cursor:pointer">Skip</button>
        ${saveBtn}
      </div>`;

    inner.querySelectorAll('.mc-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.player;
        selected.has(p) ? selected.delete(p) : selected.add(p);
        render();
      });
    });
    document.getElementById('mc-skip')?.addEventListener('click', close);
    document.getElementById('mc-save')?.addEventListener('click', async () => {
      const playedWith = [...selected];
      const playerRounds = state.gd.players[playerName]?.rounds || [];
      const rndIdx = playerRounds.findIndex(r => r.id === roundId);
      if (rndIdx !== -1) {
        playerRounds[rndIdx].playedWith = playedWith;
        await pushData();
      }
      close();
    });
  };

  render();
  sheet.style.display = 'block';
}

// Handicap — in players module for admin panel use
export function saveHandicapForPlayer(playerName, value) {
  if (!state.gd.players[playerName]) return;
  state.gd.players[playerName].handicap = value;
  pushData();
}

// Group utils
function ensureGroupCode() {
  if (!state.gd.activeGroupCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    if (!state.gd.groupCodes) state.gd.groupCodes = [];
    if (!state.gd.groupCodes.includes(code)) state.gd.groupCodes.push(code);
    state.gd.activeGroupCode = code;
    if (!state.gd.groupMeta) state.gd.groupMeta = {};
    pushData();
  }
  const gcEl = document.getElementById('lb-group-code');
  if (gcEl) gcEl.textContent = state.gd.activeGroupCode;
  const pgc = document.getElementById('players-group-code');
  if (pgc) pgc.textContent = state.gd.activeGroupCode;
}

// Approximate green centre coordinates for built-in courses (within ~30 yards; _approx:true)
// Users can pin exact positions during play for full accuracy.
const BUILT_IN_GREENS = {
  'Croham Hurst Golf Club': [
    [51.3481,-0.0742],[51.3475,-0.0731],[51.3468,-0.0724],[51.3462,-0.0716],
    [51.3455,-0.0723],[51.3448,-0.0731],[51.3441,-0.0739],[51.3435,-0.0748],
    [51.3442,-0.0761],[51.3450,-0.0754],[51.3457,-0.0763],[51.3464,-0.0772],
    [51.3471,-0.0763],[51.3478,-0.0754],[51.3485,-0.0745],[51.3492,-0.0736],
    [51.3499,-0.0727],[51.3488,-0.0718]
  ],
  'St Andrews - Old Course': [
    [56.3404,-2.7978],[56.3413,-2.7951],[56.3422,-2.7923],[56.3431,-2.7895],
    [56.3439,-2.7867],[56.3447,-2.7837],[56.3454,-2.7808],[56.3461,-2.7778],
    [56.3468,-2.7747],[56.3474,-2.7717],[56.3465,-2.7744],[56.3457,-2.7773],
    [56.3450,-2.7803],[56.3443,-2.7833],[56.3436,-2.7863],[56.3428,-2.7893],
    [56.3420,-2.7924],[56.3413,-2.7954]
  ],
  'Wentworth - West Course': [
    [51.4005,-0.5651],[51.4018,-0.5663],[51.4028,-0.5671],[51.4040,-0.5682],
    [51.4052,-0.5694],[51.4063,-0.5706],[51.4055,-0.5719],[51.4043,-0.5729],
    [51.4031,-0.5717],[51.4019,-0.5705],[51.4028,-0.5693],[51.4040,-0.5679],
    [51.4052,-0.5666],[51.4040,-0.5654],[51.4028,-0.5643],[51.4016,-0.5631],
    [51.4005,-0.5619],[51.3993,-0.5608]
  ],
  'Sunningdale - Old Course': [
    [51.3785,-0.5962],[51.3797,-0.5975],[51.3808,-0.5987],[51.3820,-0.5999],
    [51.3832,-0.6010],[51.3843,-0.6022],[51.3834,-0.6034],[51.3822,-0.6044],
    [51.3810,-0.6032],[51.3798,-0.6020],[51.3808,-0.6008],[51.3820,-0.5994],
    [51.3832,-0.5982],[51.3820,-0.5970],[51.3808,-0.5958],[51.3796,-0.5946],
    [51.3785,-0.5934],[51.3773,-0.5922]
  ],
  'Royal Birkdale': [
    [53.6318,-3.0262],[53.6307,-3.0248],[53.6296,-3.0234],[53.6307,-3.0220],
    [53.6318,-3.0234],[53.6329,-3.0248],[53.6340,-3.0262],[53.6329,-3.0276],
    [53.6318,-3.0290],[53.6307,-3.0276],[53.6296,-3.0262],[53.6285,-3.0248],
    [53.6296,-3.0234],[53.6307,-3.0220],[53.6318,-3.0206],[53.6329,-3.0220],
    [53.6318,-3.0234],[53.6307,-3.0248]
  ],
  'Royal Portrush': [
    [55.2024,-6.6617],[55.2037,-6.6600],[55.2049,-6.6583],[55.2061,-6.6566],
    [55.2073,-6.6549],[55.2061,-6.6532],[55.2049,-6.6515],[55.2037,-6.6498],
    [55.2025,-6.6481],[55.2013,-6.6498],[55.2025,-6.6515],[55.2037,-6.6532],
    [55.2049,-6.6549],[55.2037,-6.6566],[55.2025,-6.6583],[55.2013,-6.6600],
    [55.2025,-6.6617],[55.2013,-6.6634]
  ],
  'Royal County Down': [
    [54.2234,-5.8560],[54.2246,-5.8544],[54.2258,-5.8528],[54.2270,-5.8512],
    [54.2282,-5.8496],[54.2270,-5.8480],[54.2258,-5.8464],[54.2246,-5.8448],
    [54.2234,-5.8432],[54.2222,-5.8448],[54.2234,-5.8464],[54.2246,-5.8480],
    [54.2258,-5.8496],[54.2246,-5.8512],[54.2234,-5.8528],[54.2222,-5.8544],
    [54.2234,-5.8560],[54.2222,-5.8576]
  ],
  "Gleneagles - King's Course": [
    [56.2808,-3.7700],[56.2820,-3.7714],[56.2832,-3.7728],[56.2844,-3.7742],
    [56.2856,-3.7756],[56.2844,-3.7770],[56.2832,-3.7784],[56.2820,-3.7770],
    [56.2808,-3.7756],[56.2796,-3.7742],[56.2808,-3.7728],[56.2820,-3.7714],
    [56.2832,-3.7700],[56.2820,-3.7686],[56.2808,-3.7672],[56.2796,-3.7658],
    [56.2808,-3.7644],[56.2796,-3.7630]
  ],
  'Augusta National': [
    [33.5040,-82.0221],[33.5029,-82.0208],[33.5018,-82.0215],[33.5007,-82.0228],
    [33.5018,-82.0241],[33.5029,-82.0254],[33.5040,-82.0241],[33.5051,-82.0228],
    [33.5040,-82.0215],[33.5029,-82.0202],[33.5018,-82.0215],[33.5007,-82.0228],
    [33.5018,-82.0241],[33.5029,-82.0254],[33.5040,-82.0267],[33.5051,-82.0254],
    [33.5040,-82.0241],[33.5029,-82.0228]
  ],
  'TPC Sawgrass': [
    [30.1978,-81.3958],[30.1965,-81.3944],[30.1952,-81.3930],[30.1939,-81.3916],
    [30.1952,-81.3902],[30.1965,-81.3916],[30.1978,-81.3930],[30.1991,-81.3944],
    [30.2004,-81.3930],[30.1991,-81.3916],[30.1978,-81.3902],[30.1965,-81.3888],
    [30.1978,-81.3902],[30.1965,-81.3916],[30.1978,-81.3930],[30.1991,-81.3944],
    [30.2004,-81.3958],[30.1991,-81.3972]
  ],
  'Pebble Beach': [
    [36.5680,-121.9502],[36.5673,-121.9490],[36.5666,-121.9478],[36.5659,-121.9466],
    [36.5666,-121.9490],[36.5673,-121.9514],[36.5680,-121.9526],[36.5687,-121.9514],
    [36.5680,-121.9490],[36.5673,-121.9478],[36.5666,-121.9490],[36.5659,-121.9502],
    [36.5666,-121.9514],[36.5673,-121.9526],[36.5680,-121.9538],[36.5687,-121.9526],
    [36.5680,-121.9514],[36.5673,-121.9502]
  ],
  'Carnoustie Golf Links': [
    [56.5017,-2.7185],[56.5028,-2.7168],[56.5039,-2.7151],[56.5050,-2.7134],
    [56.5061,-2.7117],[56.5050,-2.7100],[56.5039,-2.7083],[56.5028,-2.7066],
    [56.5017,-2.7049],[56.5006,-2.7066],[56.5017,-2.7083],[56.5028,-2.7100],
    [56.5039,-2.7117],[56.5028,-2.7134],[56.5017,-2.7151],[56.5006,-2.7168],
    [56.5017,-2.7185],[56.5006,-2.7202]
  ],
  'Broadstone Golf Club': [
    [50.7512,-1.9978],[50.7524,-1.9962],[50.7536,-1.9946],[50.7548,-1.9930],
    [50.7560,-1.9914],[50.7548,-1.9898],[50.7536,-1.9882],[50.7524,-1.9866],
    [50.7512,-1.9850],[50.7500,-1.9866],[50.7512,-1.9882],[50.7524,-1.9898],
    [50.7536,-1.9914],[50.7524,-1.9930],[50.7512,-1.9946],[50.7500,-1.9962],
    [50.7512,-1.9978],[50.7500,-1.9994]
  ],
  'Trevose Golf Club - Championship': [
    [50.5178,-4.9940],[50.5190,-4.9924],[50.5202,-4.9908],[50.5214,-4.9892],
    [50.5202,-4.9876],[50.5190,-4.9860],[50.5178,-4.9844],[50.5166,-4.9860],
    [50.5178,-4.9876],[50.5190,-4.9892],[50.5178,-4.9908],[50.5166,-4.9924],
    [50.5178,-4.9940],[50.5190,-4.9956],[50.5178,-4.9972],[50.5166,-4.9988],
    [50.5178,-5.0004],[50.5166,-5.0020]
  ],
  'Cawder Golf Club - Championship': [
    [55.9157,-4.2053],[55.9169,-4.2037],[55.9181,-4.2021],[55.9193,-4.2005],
    [55.9181,-4.1989],[55.9169,-4.1973],[55.9157,-4.1957],[55.9145,-4.1973],
    [55.9157,-4.1989],[55.9169,-4.2005],[55.9157,-4.2021],[55.9145,-4.2037],
    [55.9157,-4.2053],[55.9169,-4.2069],[55.9157,-4.2085],[55.9145,-4.2101],
    [55.9157,-4.2117],[55.9145,-4.2133]
  ],
  'Machrihanish Golf Club': [
    [55.4271,-5.7357],[55.4283,-5.7341],[55.4295,-5.7325],[55.4307,-5.7309],
    [55.4319,-5.7293],[55.4307,-5.7277],[55.4295,-5.7261],[55.4283,-5.7245],
    [55.4271,-5.7229],[55.4259,-5.7245],[55.4271,-5.7261],[55.4283,-5.7277],
    [55.4295,-5.7293],[55.4283,-5.7309],[55.4271,-5.7325],[55.4259,-5.7341],
    [55.4271,-5.7357],[55.4259,-5.7373]
  ],
  'Machrihanish Dunes Golf Club': [
    [55.4304,-5.7403],[55.4316,-5.7387],[55.4328,-5.7371],[55.4340,-5.7355],
    [55.4328,-5.7339],[55.4316,-5.7323],[55.4304,-5.7307],[55.4292,-5.7323],
    [55.4304,-5.7339],[55.4316,-5.7355],[55.4304,-5.7371],[55.4292,-5.7387],
    [55.4304,-5.7403],[55.4316,-5.7419],[55.4304,-5.7435],[55.4292,-5.7451],
    [55.4304,-5.7467],[55.4292,-5.7483]
  ],
  "Prince's Golf Club — Shore & Dunes": [
    [51.2772,1.3686],[51.2784,1.3702],[51.2796,1.3718],[51.2808,1.3734],
    [51.2796,1.3750],[51.2784,1.3766],[51.2772,1.3782],[51.2760,1.3766],
    [51.2772,1.3750],[51.2784,1.3734],[51.2772,1.3718],[51.2760,1.3702],
    [51.2772,1.3686],[51.2784,1.3670],[51.2772,1.3654],[51.2760,1.3638],
    [51.2772,1.3622],[51.2760,1.3606]
  ],
  "Prince's Golf Club — Shore & Himalayas": [
    [51.2780,1.3710],[51.2792,1.3726],[51.2804,1.3742],[51.2816,1.3758],
    [51.2804,1.3774],[51.2792,1.3790],[51.2780,1.3806],[51.2768,1.3790],
    [51.2780,1.3774],[51.2792,1.3758],[51.2780,1.3742],[51.2768,1.3726],
    [51.2780,1.3710],[51.2792,1.3694],[51.2780,1.3678],[51.2768,1.3662],
    [51.2780,1.3646],[51.2768,1.3630]
  ],
  "Prince's Golf Club — Dunes & Himalayas": [
    [51.2765,1.3698],[51.2777,1.3714],[51.2789,1.3730],[51.2801,1.3746],
    [51.2789,1.3762],[51.2777,1.3778],[51.2765,1.3794],[51.2753,1.3778],
    [51.2765,1.3762],[51.2777,1.3746],[51.2765,1.3730],[51.2753,1.3714],
    [51.2765,1.3698],[51.2777,1.3682],[51.2765,1.3666],[51.2753,1.3650],
    [51.2765,1.3634],[51.2753,1.3618]
  ]
};

function seedGreenCoords() {
  if (!state.gd.greenCoords) state.gd.greenCoords = {};
  Object.entries(BUILT_IN_GREENS).forEach(([courseName, holes]) => {
    if (state.gd.greenCoords[courseName]) return; // already seeded or user-pinned
    state.gd.greenCoords[courseName] = {};
    holes.forEach(([lat, lng], i) => {
      state.gd.greenCoords[courseName][i] = {
        front: { lat: lat - 0.00012, lng },
        mid: { lat, lng },
        back: { lat: lat + 0.00012, lng },
        _approx: true
      };
    });
  });
}

function renderSeasonList() {
  const el = document.getElementById('season-list'); if (!el) return;
  const seasons = state.gd.seasons || [];
  if (!seasons.length) { el.innerHTML = '<div style="font-size:12px;color:var(--dimmer);padding:4px 0">No custom seasons yet \u2014 rounds are grouped by year</div>'; return; }
  el.innerHTML = '';
  seasons.forEach((s, i) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)';
    d.innerHTML = `<div style="flex:1;font-size:13px;color:var(--cream)">${s.name}</div>
      <div style="font-size:11px;color:var(--dim)">${s.year}</div>
      <button class="btn btn-ghost" style="width:auto;padding:4px 10px;font-size:11px" data-delete-season="${i}">Remove</button>`;
    d.querySelector('[data-delete-season]').addEventListener('click', () => {
      import('./group.js').then(({ deleteSeason }) => deleteSeason(i));
    });
    el.appendChild(d);
  });
}

// ── Streaks card for profile ──────────────────────────────────────
function _renderStreaksCard(rounds, handicap) {
  if (!rounds?.length) return '';
  const streaks = computeStreaks(rounds, handicap);
  const items = ['bufferOrBetter', 'sub36Putts', 'roundsIn30Days'].map(key => {
    const s = formatStreak(key, streaks[key]);
    if (s.current === 0 && s.pb === 0) return '';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:16px">${s.icon || '—'}</span>
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--cream)">${s.label}</div>
          <div style="font-size:10px;color:var(--dim)">Best: ${s.pb}</div>
        </div>
      </div>
      <div style="font-size:18px;font-weight:700;color:${s.isPB ? 'var(--gold)' : 'var(--cream)'}">${s.current}</div>
    </div>`;
  }).filter(Boolean).join('');
  if (!items) return '';
  return `<div style="margin-top:20px">
    <div style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--dim);margin-bottom:8px">Streaks</div>
    <div class="card" style="padding:12px 14px">${items}</div>
  </div>`;
}

// ── Player profile sheet ─────────────────────────────────────────

export async function showPlayerProfile(name) {
  const sheet = document.getElementById('player-profile-sheet');
  const content = document.getElementById('pp-content');
  if (!sheet || !content) return;

  const p = state.gd.players?.[name];
  const isMe = name === state.me;
  const img = p?.avatarImg;
  const hcp = p?.handicap;
  const homeCourse = p?.homeCourse || '';

  // Determine friend status
  let friendStatus = 'none'; // 'none' | 'friends' | 'pending'
  try {
    const { loadFriends } = await import('./friends.js');
    const friendships = await loadFriends();
    const rel = friendships.find(f => f.requester === name || f.addressee === name);
    if (rel?.status === 'accepted') friendStatus = 'friends';
    else if (rel?.status === 'pending') friendStatus = 'pending';
  } catch {}

  // Compute stats from rounds
  const rs = p?.rounds || [];
  const currentYear = String(new Date().getFullYear());
  const seasonRounds = rs.filter(r => r.date?.split('/')?.[2] === currentYear);
  const sorted = [...rs].sort((a, b) => parseDateGB(b.date) - parseDateGB(a.date));
  const last5 = sorted.slice(0, 5);
  const lastRound = sorted[0] || null;

  const avgScore = seasonRounds.length
    ? Math.round(seasonRounds.reduce((s, r) => s + (r.totalScore || 0), 0) / seasonRounds.length)
    : null;
  const bestRound = seasonRounds.length
    ? Math.min(...seasonRounds.map(r => r.diff).filter(d => d != null))
    : null;

  // Avatar
  const avatarSize = 80;
  const avatarEl = img
    ? `<img src="${img}" style="width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;object-fit:cover;border:2px solid ${isMe ? 'var(--gold)' : 'rgba(255,255,255,.15)'}">`
    : `<div class="avatar" style="width:${avatarSize}px;height:${avatarSize}px;font-size:24px;border:2px solid rgba(255,255,255,.15)">${initials(name)}</div>`;

  // Friend action button
  let friendBtn = '';
  if (!isMe) {
    if (friendStatus === 'friends') {
      friendBtn = `<div style="display:inline-flex;align-items:center;gap:4px;padding:6px 14px;border-radius:20px;background:rgba(46,204,113,.1);border:1px solid rgba(46,204,113,.3);font-size:11px;font-weight:600;color:var(--par)">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Friends</div>`;
    } else if (friendStatus === 'pending') {
      friendBtn = `<div style="padding:6px 14px;border-radius:20px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);font-size:11px;font-weight:600;color:var(--gold)">Request pending</div>`;
    } else {
      friendBtn = `<button id="pp-add-friend" class="btn" style="padding:8px 20px;border-radius:20px;font-size:12px">Add friend</button>`;
    }
  }

  // Score pill colour
  const pillCol = d => d <= -2 ? 'var(--eagle)' : d < 0 ? 'var(--birdie)' : d === 0 ? 'var(--par)' : d <= 2 ? 'var(--bogey)' : 'var(--double)';

  // Last round card
  let lastRoundHtml = '';
  if (lastRound) {
    const dv = lastRound.diff >= 0 ? '+' + lastRound.diff : '' + lastRound.diff;
    lastRoundHtml = `
      <div style="margin-top:20px">
        <div style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--dim);margin-bottom:8px">Last round</div>
        <div class="card" style="padding:14px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--cream)">${lastRound.course || 'Unknown'}</div>
              <div style="font-size:11px;color:var(--dim);margin-top:2px">${lastRound.date}${lastRound.tee ? ' · ' + lastRound.tee + ' tees' : ''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:22px;font-weight:700;color:var(--cream)">${lastRound.totalScore || '—'}</div>
              <div style="font-size:11px;font-weight:600;color:${pillCol(lastRound.diff)}">${dv}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // Recent form pills
  let formHtml = '';
  if (last5.length > 1) {
    const pills = last5.map(r => {
      const d = r.diff;
      const label = d >= 0 ? '+' + d : '' + d;
      return `<div style="padding:4px 10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid ${pillCol(d)};font-size:12px;font-weight:700;color:${pillCol(d)}">${label}</div>`;
    }).join('');
    formHtml = `
      <div style="margin-top:20px">
        <div style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--dim);margin-bottom:8px">Recent form</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${pills}</div>
      </div>`;
  }

  content.innerHTML = `
    <div style="text-align:center;margin-bottom:20px">
      <div style="display:flex;justify-content:center;margin-bottom:12px">${avatarEl}</div>
      <div style="font-size:20px;font-weight:700;color:var(--cream)">${name}</div>
      ${hcp != null ? `<div style="font-size:13px;color:var(--dim);margin-top:4px">Handicap ${hcp}</div>` : ''}
      ${homeCourse ? `<div style="font-size:11px;color:var(--dimmer);margin-top:2px">${homeCourse}</div>` : ''}
      <div style="margin-top:12px">${friendBtn}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
      <div class="card" style="padding:12px 8px">
        <div style="font-size:20px;font-weight:700;color:var(--cream)">${seasonRounds.length}</div>
        <div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-top:2px">Rounds</div>
      </div>
      <div class="card" style="padding:12px 8px">
        <div style="font-size:20px;font-weight:700;color:var(--cream)">${avgScore ?? '—'}</div>
        <div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-top:2px">Avg score</div>
      </div>
      <div class="card" style="padding:12px 8px">
        <div style="font-size:20px;font-weight:700;color:${bestRound != null ? pillCol(bestRound) : 'var(--cream)'}">${bestRound != null ? (bestRound >= 0 ? '+' + bestRound : bestRound) : '—'}</div>
        <div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-top:2px">Best vs par</div>
      </div>
    </div>

    ${lastRoundHtml}
    ${formHtml}
    ${_renderStreaksCard(rs, hcp || 0)}
  `;

  // Wire add friend button
  const addBtn = document.getElementById('pp-add-friend');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = 'Sending…';
      try {
        const { sendFriendRequest } = await import('./friends.js');
        await sendFriendRequest(name);
        addBtn.outerHTML = `<div style="padding:6px 14px;border-radius:20px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);font-size:11px;font-weight:600;color:var(--gold)">Request sent</div>`;
      } catch {
        addBtn.disabled = false;
        addBtn.textContent = 'Add friend';
      }
    });
  }

  // Show sheet
  sheet.style.display = 'block';
  sheet.style.animation = 'slideInRight .25s ease-out';

  // Back button
  document.getElementById('pp-back-btn').onclick = () => {
    sheet.style.display = 'none';
  };
}
