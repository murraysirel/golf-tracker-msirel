// ─────────────────────────────────────────────────────────────────
// AUTH CLIENT
// Manages Supabase Auth sessions via the /.netlify/functions/auth proxy.
// The browser never talks to Supabase directly — all auth traffic goes
// through the Netlify function so service keys stay server-side.
// ─────────────────────────────────────────────────────────────────

import { API_BASE } from './config.js';

const AUTH_ENDPOINT = API_BASE + '/.netlify/functions/auth';
const SESSION_KEY   = 'looper_session';
// Access token refresh threshold — refresh if less than 5 minutes remain
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// ── Device hint — human-readable label for the current browser/device ─────
function deviceHint() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const device = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : 'Desktop';
  return `${browser} on ${device}`;
}

// ── Internal helpers ──────────────────────────────────────────────

async function callAuth(payload) {
  const res = await fetch(AUTH_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  return res.json();
}

function storeSession(supabaseSession, playerName, sessionId) {
  const session = {
    accessToken:  supabaseSession.accessToken,
    refreshToken: supabaseSession.refreshToken,
    // expiresAt in ms — access token typically expires in 3600s (1 hour)
    expiresAt:    Date.now() + (supabaseSession.expiresIn || 3600) * 1000,
    userId:       supabaseSession.userId,
    playerName:   playerName || '',
    sessionId:    sessionId || (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  // Keep rrg_me in sync for any legacy code that reads it during transition
  if (playerName) localStorage.setItem('rrg_me', playerName);
  return session;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Returns the stored session object or null.
 * @returns {{ accessToken, refreshToken, expiresAt, userId, playerName } | null}
 */
export function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clears the stored session and related keys.
 */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('rrg_me');
}

/**
 * Sign in with email + password.
 * @returns {{ ok: true, playerName: string, groupCodes: string[] } | { error: string }}
 */
export async function signIn(email, password) {
  try {
    const sessionId = typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const res = await callAuth({ action: 'signInPassword', email, password, sessionId, deviceHint: deviceHint() });
    if (res.error) return { error: res.error };
    storeSession(res.session, res.playerName, sessionId);
    return { ok: true, playerName: res.playerName, groupCodes: res.groupCodes || [] };
  } catch (e) {
    return { error: 'Network error — check your connection' };
  }
}

/**
 * Create a new account. Links to existing player row if email matches.
 * @returns {{ ok: true, playerName: string } | { needsConfirmation: true } | { error: string }}
 */
export async function signUp(email, password, name, handicap, dob) {
  try {
    const sessionId = typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const res = await callAuth({ action: 'signUp', email, password, name, handicap, dob, sessionId, deviceHint: deviceHint() });
    if (res.error) return { error: res.error };
    if (res.needsConfirmation) return { needsConfirmation: true };
    storeSession(res.session, res.playerName, sessionId);
    return { ok: true, playerName: res.playerName };
  } catch (e) {
    return { error: 'Network error — check your connection' };
  }
}

/**
 * Send a magic link to the given email address.
 * @returns {{ ok: true } | { error: string }}
 */
export async function sendMagicLink(email) {
  try {
    const res = await callAuth({ action: 'sendMagicLink', email });
    if (res.error) return { error: res.error };
    return { ok: true };
  } catch (e) {
    return { error: 'Network error — check your connection' };
  }
}

export async function resetPassword(email) {
  try {
    const res = await callAuth({ action: 'resetPassword', email });
    if (res.error) return { error: res.error };
    return { ok: true };
  } catch (e) {
    return { error: 'Network error — check your connection' };
  }
}

/**
 * Detect and consume a magic link redirect.
 * Supabase puts access_token + refresh_token in the URL hash after the user
 * taps the magic link email. This function reads them, clears the hash
 * immediately, then resolves the player name via the auth function.
 *
 * Call this FIRST in the boot sequence, before any session checks.
 *
 * @returns {{ ok: true, playerName: string, needsProfile?: boolean } | null}
 */
export async function handleMagicLinkRedirect() {
  const hash = window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash.slice(1)); // strip leading #
  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type         = params.get('type');

  if (!accessToken || !refreshToken || type !== 'magiclink') return null;

  // Clear the hash immediately — tokens must not linger in the address bar
  history.replaceState('', document.title, window.location.pathname + window.location.search);

  try {
    const res = await callAuth({ action: 'getPlayerByAuthId', accessToken });
    if (res.error) return null;

    if (res.needsProfile) {
      // New user via magic link — they need to complete their profile
      // Store a partial session so we can pick up after profile creation
      storeSession(
        { accessToken, refreshToken, expiresIn: 3600, userId: res.userId },
        ''
      );
      return { needsProfile: true, email: res.email, userId: res.userId };
    }

    const expiresIn = parseInt(params.get('expires_in')) || 3600;
    storeSession(
      { accessToken, refreshToken, expiresIn, userId: res.userId },
      res.playerName
    );
    return { ok: true, playerName: res.playerName, groupCodes: res.groupCodes || [] };
  } catch (e) {
    console.warn('[auth] magic link handling failed:', e.message);
    return null;
  }
}

/**
 * Refresh the access token if it expires within REFRESH_THRESHOLD_MS.
 * Supabase rotates refresh tokens — the old one is invalidated after use.
 *
 * @returns {null} if no refresh needed or refresh succeeded
 * @returns {{ error: string }} if session expired/invalid — caller should clearSession() + show login
 */
export async function refreshIfNeeded() {
  const session = getStoredSession();
  if (!session) return null;

  const timeLeft = session.expiresAt - Date.now();
  if (timeLeft > REFRESH_THRESHOLD_MS) return null; // still fresh

  try {
    const res = await callAuth({
      action: 'refreshSession',
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      deviceHint: deviceHint(),
    });
    if (res.error) return { error: res.error };

    // Update stored session with new tokens; preserve sessionId + playerName
    storeSession(res.session, res.playerName || session.playerName, session.sessionId);
    return null;
  } catch (e) {
    // Network error — don't destroy the session; the refresh token is still valid.
    // Data calls use the server-side service key so they'll still work.
    // Token will be refreshed successfully on the next boot.
    console.warn('[auth] token refresh network error — proceeding with stale token:', e.message);
    return null;
  }
}

/**
 * Server-side sign out (invalidates this session's refresh token).
 * Always call clearSession() client-side regardless of server response.
 */
export async function serverSignOut() {
  const session = getStoredSession();
  clearSession();
  if (session?.accessToken) {
    try {
      await callAuth({ action: 'signOut', accessToken: session.accessToken, userId: session.userId, sessionId: session.sessionId });
    } catch (_) {
      // Non-fatal — local session is already cleared
    }
  }
}

/**
 * Sign out ALL devices — invalidates every active session for this user.
 */
export async function signOutAll() {
  const session = getStoredSession();
  clearSession();
  if (session?.accessToken) {
    try {
      await callAuth({ action: 'signOut', accessToken: session.accessToken, userId: session.userId, scope: 'global' });
    } catch (_) {}
  }
}

/**
 * Return the list of active sessions for the current user.
 * @returns {{ id, deviceHint, lastSeenAt, createdAt }[]}
 */
export async function listSessions() {
  const session = getStoredSession();
  if (!session?.accessToken) return [];
  try {
    const res = await callAuth({ action: 'listSessions', accessToken: session.accessToken });
    return res.sessions || [];
  } catch {
    return [];
  }
}
