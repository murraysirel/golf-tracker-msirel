// js/push.js
// Native push notification registration and handling.
// Follows haptics.js pattern: lazy import, no-op on web.

import { IS_NATIVE, API_BASE } from './config.js';
import { state } from './state.js';

let PushNotifications = null;
let _registered = false;

if (IS_NATIVE) {
  import('@capacitor/push-notifications').then(mod => {
    PushNotifications = mod.PushNotifications;
  }).catch(() => {});
}

const PUSH_API = API_BASE + '/.netlify/functions/push';

/** Call once after auth completes and state.me is set. */
export async function initPush() {
  if (!IS_NATIVE || !state.me || _registered) return;

  if (!PushNotifications) {
    try {
      const mod = await import('@capacitor/push-notifications');
      PushNotifications = mod.PushNotifications;
    } catch { return; }
  }

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return;

  // Token received from APNs
  await PushNotifications.addListener('registration', ({ value: token }) => {
    _saveToken(token);
  });

  // Registration failed (non-fatal — push is best-effort)
  await PushNotifications.addListener('registrationError', () => {});

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
    if (type === 'live_invite' || type === 'round_liked' || type === 'round_comment') {
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
  _registered = true;
}

/** Remove device token on sign-out. Call BEFORE clearing state.me. */
export async function removePushToken() {
  if (!IS_NATIVE) return;
  const token = localStorage.getItem('looper_push_token');
  if (!token || !state.me) return;
  try {
    await fetch(PUSH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removeToken', data: { playerName: state.me, token } })
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
