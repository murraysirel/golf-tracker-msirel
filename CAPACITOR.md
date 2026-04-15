# Capacitor / iOS Migration Plan

Actionable work chunks for wrapping Looper in Capacitor for iOS. Each chunk is self-contained and can be run independently. Domain: `loopercaddie.com` (`.co.uk` is email-only via Resend).

---

## CHUNK 1: PWA Prep (pre-Capacitor, no risk to web app) [DONE]

### 1A: API Base URL System [DONE]
- [x] Created `js/config.js` exporting `API_BASE`, `APP_ORIGIN`, `IS_NATIVE`
- [x] All ~30 `/.netlify/functions/` fetch calls prefixed with `API_BASE`
- [x] `window.location.origin` replaced with `APP_ORIGIN` in share URLs (`group.js` lines 328, 565, 847)
- [x] `index.html` waitlist redirect guarded with `Capacitor?.isNativePlatform?.()`
- [x] Sentry environment detection updated for native context (`app.js` line 10)
- [x] Service worker commented (cross-origin note, `sw.js` line 41)
- **PWA impact:** None. `API_BASE` is `''` on web.

---

## CHUNK 2: PWA Prep continued (pre-Capacitor, no risk to web app)

### 2A: Service Worker — disable in native context
Add to `app.js` near the top (after imports):
```js
import { IS_NATIVE } from './config.js';

if (IS_NATIVE && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}
```
Capacitor handles its own asset caching at the native level. The SW would cause stale-cache bugs in the WebView.
- **PWA impact:** None. `IS_NATIVE` is `false` on web.

### 2B: CORS hardening on Netlify functions
When native fetch calls hit `https://loopercaddie.com/.netlify/functions/...` from origin `capacitor://localhost`, CORS headers must allow it.

**Current state:** All functions use `'Access-Control-Allow-Origin': '*'` (wildcard). This _should_ work but some WebView implementations are stricter. Safer approach: echo back the requesting origin.

Files to update (change the CORS headers object in each):
```js
'Access-Control-Allow-Origin': event.headers?.origin || '*',
```

| Function file | Current status | Action needed |
|---|---|---|
| `netlify/functions/auth.js` (line 22) | Wildcard, has OPTIONS | Echo origin |
| `netlify/functions/supabase.js` (line 14) | Wildcard, has OPTIONS | Echo origin |
| `netlify/functions/ai.js` (line 9) | Wildcard, has OPTIONS | Echo origin |
| `netlify/functions/courses.js` (line 21) | Wildcard, has OPTIONS (line 339) | Echo origin |
| `netlify/functions/demo-data.js` (line 9) | Wildcard, **missing `Allow-Headers`**, has OPTIONS | Echo origin + add `'Access-Control-Allow-Headers': 'Content-Type'` |
| `netlify/functions/waitlist.js` (line 12) | Wildcard, has OPTIONS | Echo origin |
| `netlify/functions/seed-demo.js` (line 17) | Wildcard, has OPTIONS | Echo origin |
| `netlify/functions/run-seed-demo.js` (line 9) | Wildcard, has OPTIONS | Echo origin |

- **PWA impact:** None. Echoing origin is functionally identical to wildcard for browser requests.

### 2C: Audit external URL opens
The app opens external URLs in a few places that will break or exit the app in Capacitor:

| Location | What it does | Native fix |
|---|---|---|
| `js/group.js` line 331 | WhatsApp share link (`href="https://wa.me/..."`) | Use `@capacitor/share` for native share sheet (falls back to web) |
| `js/group.js` lines 336–346 | Copy URL to clipboard | `navigator.clipboard` works in WKWebView, no change needed |
| Any `<a target="_blank">` in `index.html` | Opens in Safari, exits app | Audit and use `@capacitor/browser` for in-app Safari |

### 2D: CSS WebView fixes
Add to `styles/app.css` on the `body` rule:
```css
overscroll-behavior: none;
```
Prevents elastic bounce / pull-to-refresh in the WebView which looks unfinished in a native app.

Verify `--safe-top` and `--safe-bot` (`env(safe-area-inset-*)`) render correctly — they should since WKWebView supports `env()`, but test on a notched device.

- **PWA impact:** `overscroll-behavior: none` is arguably better on web too. No downside.

---

## CHUNK 3: Capacitor Init + First Build

### 3A: Install Capacitor
```bash
npm init -y                                  # if no package.json exists
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios
npx cap init "Looper" "uk.co.loopercaddie.app" --web-dir "."
```

### 3B: Configure `capacitor.config.json`
```json
{
  "appId": "uk.co.loopercaddie.app",
  "appName": "Looper",
  "webDir": ".",
  "server": {
    "allowNavigation": [
      "loopercaddie.com",
      "*.supabase.co",
      "api.open-meteo.com",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "cdnjs.cloudflare.com",
      "browser.sentry-cdn.com"
    ]
  },
  "ios": {
    "contentInset": "automatic"
  }
}
```
Note: the original plan missed Open-Meteo (weather), Google Fonts, Chart.js CDN, and Sentry CDN.

### 3C: Add iOS platform and first build
```bash
npx cap add ios
npx cap sync ios
npx cap open ios
```
Select iPhone simulator in Xcode, hit Play. Verify the app loads `index.html` and renders.

### 3D: Add `.gitignore` entries
```
ios/
node_modules/
```
The `ios/` folder is generated — keep it out of the main repo (or keep it in, depending on your workflow preference; some teams commit it for CI reproducibility).

---

## CHUNK 4: Essential Plugins (native feel)

### 4A: Install plugins
```bash
npm install @capacitor/status-bar @capacitor/splash-screen \
  @capacitor/keyboard @capacitor/haptics @capacitor/browser \
  @capacitor/share @capacitor/app @capacitor-community/keep-awake
npx cap sync ios
```

### 4B: Status Bar (`app.js`, runs on boot)
```js
if (IS_NATIVE) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark });
  });
}
```
Matches the navy theme. Without this, status bar text can be invisible.

### 4C: Keyboard (`app.js`, runs on boot)
```js
if (IS_NATIVE) {
  import('@capacitor/keyboard').then(({ Keyboard, KeyboardResize }) => {
    Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  });
}
```
**Critical for Looper.** Without this, the on-screen keyboard overlaps score inputs (`#h0`–`#h17`) and live scoring adjusters. The original plan missed this plugin entirely.

### 4D: Haptics — wired from day 1
Create `js/haptics.js`:
```js
import { IS_NATIVE } from './config.js';

let Haptics = null;
let ImpactStyle = null;
let NotificationType = null;

if (IS_NATIVE) {
  import('@capacitor/haptics').then(mod => {
    Haptics = mod.Haptics;
    ImpactStyle = mod.ImpactStyle;
    NotificationType = mod.NotificationType;
  });
}

// Light tap — score adjusters, toggles, pill selections
export function tapLight() {
  Haptics?.impact({ style: ImpactStyle?.Light });
}

// Medium tap — hole navigation, player selection
export function tapMedium() {
  Haptics?.impact({ style: ImpactStyle?.Medium });
}

// Heavy tap — round save, finish round
export function tapHeavy() {
  Haptics?.impact({ style: ImpactStyle?.Heavy });
}

// Success — round saved, AI parse complete
export function notifySuccess() {
  Haptics?.notification({ type: NotificationType?.Success });
}

// Warning — validation nudge
export function notifyWarning() {
  Haptics?.notification({ type: NotificationType?.Warning });
}
```

Then add haptic calls at these interaction points:

**High-impact (rapid feedback during scoring):**
| Location | Function | Haptic |
|---|---|---|
| `js/live.js` ~line 770 | `liveGroupAdj()` — score/putts +/- | `tapLight()` |
| `js/live.js` ~line 450 | Pip click → `liveGoto()` | `tapMedium()` |
| `js/live.js` ~line 690 | FIR/GIR toggle buttons | `tapLight()` |
| `js/live.js` ~line 1092 | `liveNextOrFinish()` — next hole | `tapMedium()` |
| `js/live.js` ~line 1151 | `liveFinishAndSave()` — round complete | `notifySuccess()` |

**Medium-impact (selections and confirmations):**
| Location | Function | Haptic |
|---|---|---|
| `js/courses.js` ~line 165 | Tee pill selection | `tapLight()` |
| `js/live.js` ~line 189 | Player chip toggle | `tapMedium()` |
| `js/scorecard.js` ~line 197 | `saveRound()` success | `notifySuccess()` |
| `js/gps.js` ~line 98 | GPS target selection (front/mid/back) | `tapLight()` |
| `js/group.js` ~line 338 | Copy URL success | `tapLight()` |
| `js/ai.js` ~line 22 | AI parse complete | `notifySuccess()` |

**Game mode results:**
| Location | Function | Haptic |
|---|---|---|
| `js/live.js` ~line 1104 | Wolf hole result | `tapHeavy()` |
| `js/live.js` ~line 810 | Sixes banner update | `tapMedium()` |

On web, all haptic calls are no-ops (`Haptics` is `null`). Zero PWA impact.

### 4E: Keep Awake — replace Wake Lock (`js/live.js`)
Current code (`live.js` ~line 74):
```js
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  state.wakeLock = await navigator.wakeLock.request('screen');
  ...
}
```
Update to:
```js
async function requestWakeLock() {
  if (IS_NATIVE) {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    await KeepAwake.keepAwake();
    return;
  }
  if (!('wakeLock' in navigator)) return;
  state.wakeLock = await navigator.wakeLock.request('screen');
  ...
}
```
Same for `releaseWakeLock()` — call `KeepAwake.allowSleep()` on native.

### 4F: Browser plugin — external links (`js/group.js`)
Replace WhatsApp `href` link with native share sheet on iOS:
```js
if (IS_NATIVE) {
  const { Share } = await import('@capacitor/share');
  await Share.share({ title: 'Join my Looper group', url: shareUrl });
} else {
  // existing WhatsApp href logic
}
```

### 4G: Splash Screen
```bash
npm install --save-dev @capacitor/assets
```
Place `resources/icon.png` (1024x1024) and `resources/splash.png`, then:
```bash
npx capacitor-assets generate --ios
```

---

## CHUNK 5: Camera + GPS (native upgrades)

### 5A: Camera for scorecard OCR (`js/ai.js`)
```bash
npm install @capacitor/camera
npx cap sync ios
```
Update `handlePhoto()` (~line 13):
```js
if (IS_NATIVE) {
  const { Camera, CameraResultType } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Base64
  });
  // Convert base64 to blob/file for existing parsePhoto() flow
} else {
  // existing file input logic
}
```
iOS requires `NSCameraUsageDescription` in `Info.plist` — Capacitor adds this automatically when you install the camera plugin.

### 5B: Native GPS (`js/gps.js`)
```bash
npm install @capacitor/geolocation
npx cap sync ios
```
Update `startGPSWatch()` (~line 35):
```js
if (IS_NATIVE) {
  const { Geolocation } = await import('@capacitor/geolocation');
  state.gpsState.watchId = await Geolocation.watchPosition(
    { enableHighAccuracy: true },
    (pos) => {
      if (pos) {
        state.gpsState.coords = pos.coords;
        updateGPSDisplay(state.liveState?.hole || 0);
      }
    }
  );
} else {
  // existing navigator.geolocation.watchPosition
}
```
Similar branching needed in `stopGPS()`, `pinTeePosition()`, and `startGPS()`.

iOS requires `NSLocationWhenInUseUsageDescription` in `Info.plist`.

---

## CHUNK 6: Push Notifications (biggest work item, critical for 4.2)

### 6A: Supabase table
```sql
CREATE TABLE device_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name text NOT NULL,
  device_token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'ios',
  created_at timestamptz DEFAULT now()
);
```

### 6B: APNs key
Generate in Apple Developer Console > Keys > + New Key > Apple Push Notifications. Download the `.p8` file. Add to Netlify env vars:
- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_KEY` (contents of `.p8` file)

### 6C: Netlify function `netlify/functions/push.js`
New function that takes `{ playerName, title, body }`, looks up device tokens from Supabase, calls APNs via `apn` npm package.

### 6D: Client registration (`app.js`)
On native boot, after auth:
```js
if (IS_NATIVE) {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.requestPermissions();
  await PushNotifications.register();
  PushNotifications.addListener('registration', token => {
    // POST token.value to /.netlify/functions/supabase { action: 'saveDeviceToken', ... }
  });
  PushNotifications.addListener('pushNotificationReceived', notification => {
    // Show in-app toast or navigate
  });
}
```

### 6E: Trigger notifications from existing flows
Add `fetch(API_BASE + '/.netlify/functions/push', ...)` calls in:
- `netlify/functions/supabase.js` — on `saveFriendRequest` action
- `netlify/functions/supabase.js` — on `saveActiveRound` action (live round invite)
- `netlify/functions/supabase.js` — on `saveComment` action

This replaces the polling loops (`friends.js` 60s poll, `live-invite.js` 12s poll) on native. Keep polling as fallback on web.

### 6F: Install
```bash
npm install @capacitor/push-notifications
npx cap sync ios
```
Enable Push Notifications capability in Xcode (Signing & Capabilities tab).

---

## CHUNK 7: App Store Prep

### 7A: Assets from brand designer
- App icon: 1024x1024 PNG, no transparency, no rounded corners
- Splash screen source image
- 5-8 screenshots on 6.7" (iPhone 15/16 Pro Max) and 6.5" (older Pro Max)
- Optional: 15-30s preview video

### 7B: App Store Connect metadata
- **Name:** Looper
- **Category:** Sports (primary), Health & Fitness (secondary)
- **Description:** Lead with native features — push alerts, native camera, GPS. See section below.
- **Keywords:** golf scorecard, handicap tracker, golf stats, stableford, golf gps, golf league, fourball
- **Privacy policy URL:** Host on loopercaddie.com
- **Support URL:** loopercaddie.com or contact page
- **Age rating:** 4+

### 7C: Description text (lead with native features to clear Guideline 4.2)
> "Looper is your AI golf caddie -- track scores, analyse your stats, and play live rounds with friends. Get push alerts when your group starts a round, snap a photo of any scorecard for instant AI entry, and use precise GPS distances on every hole. Built for golfers who want to know exactly where their game is improving."

### 7D: Build versioning
Set version 1.0.0, build number 1 in Xcode. Bump build number on every archive. Use `@sentry/capacitor` for native crash reporting alongside existing browser Sentry.

### 7E: In-App Purchase (defer)
While `PREMIUM_ENABLED` is `false`, no IAP needed. When you flip it on, use RevenueCat (`@revenuecat/purchases-capacitor`). Remove any UI mentioning paid features or external payment before first submission.

---

## Chunk execution order

| Order | Chunk | Risk to PWA | Effort | Notes |
|---|---|---|---|---|
| 1 | ~~Chunk 1~~ | None | Done | API base URL system |
| 2 | Chunk 2 | None | 1 day | SW disable, CORS, CSS, external URL audit |
| 3 | Chunk 3 | None | 0.5 day | Capacitor init, first simulator build |
| 4 | Chunk 4 | None | 2 days | Plugins: status bar, keyboard, haptics, keep awake, splash |
| 5 | Chunk 5 | None | 1 day | Camera + GPS native upgrades |
| 6 | Chunk 6 | None | 3-5 days | Push notifications (biggest item) |
| 7 | Chunk 7 | None | Ongoing | App Store assets + submission |

All chunks use `IS_NATIVE` branching so web codepaths are never touched. The PWA continues to work identically throughout.
