// js/push.js
// Native push notification registration and handling.
// Follows haptics.js pattern: lazy import, no-op on web.

import { IS_NATIVE, API_BASE } from './config.js';
import { state } from './state.js';

let PushNotifications = null;
let _registered = false;

const PUSH_API = API_BASE + '/.netlify/functions/push';

/** Load the plugin — retry-safe. */
async function _loadPlugin() {
  if (PushNotifications) return true;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    return true;
  } catch (e) {
    console.warn('[push] Plugin not available:', e.message);
    return false;
  }
}

/** Call once after auth completes and state.me is set. */
export async function initPush() {
  if (!IS_NATIVE || !state.me || _registered) return;

  if (!await _loadPlugin()) return;
  _registered = true;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.warn('[push] Permission not granted:', perm.receive);
      _registered = false; // Allow retry on next call
      return;
    }

    // Token received from APNs
    await PushNotifications.addListener('registration', ({ value: token }) => {
      console.log('[push] Token received');
      _saveToken(token);
    });

    // Registration failed
    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] Registration error:', err);
    });

    // Foreground: show in-app toast, refresh notification UI
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const { title, body } = notification;
      window._looperToast?.(body || title || 'New notification', 'info', 4000);
      import('./friends.js').then(m => m.pollNotifications?.()).catch(() => {});
    });

    // Tap from background: refresh UI and navigate
    await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      import('./friends.js').then(m => m.pollNotifications?.()).catch(() => {});
      const type = notification.data?.type;
      if (type === 'live_invite' || type === 'round_liked' || type === 'round_comment' || type === 'round_posted') {
        import('./nav.js').then(m => m.goTo?.('home')).catch(() => {});
      }
    });

    // Clear badge + delivered notifications on foreground
    PushNotifications.removeAllDeliveredNotifications().catch(() => {});
    try {
      const { App } = await import('@capacitor/app');
      await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) PushNotifications?.removeAllDeliveredNotifications().catch(() => {});
      });
    } catch (_) {}

    await PushNotifications.register();
    console.log('[push] Registration initiated');
  } catch (e) {
    console.warn('[push] Init failed:', e);
    _registered = false;
  }
}

/** Remove device token on sign-out. Call BEFORE clearing state.me. */
export async function removePushToken() {
  if (!IS_NATIVE) return;
  const token = localStorage.getItem('looper_push_token');
  const player = state.me; // Capture before any async work
  if (!token || !player) return;
  try {
    await fetch(PUSH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removeToken', data: { playerName: player, token } })
    });
  } catch (_) {}
  localStorage.removeItem('looper_push_token');
}

async function _saveToken(token) {
  if (!token || !state.me) return;
  localStorage.setItem('looper_push_token', token);
  try {
    await fetch(PUSH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'registerToken', data: { playerName: state.me, token, platform: 'ios' } })
    });
  } catch (_) {}
}
