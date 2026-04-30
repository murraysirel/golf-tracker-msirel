#cl1 CLAUDE.md — Architecture Reference

## Product Summary

Looper is a mobile-first PWA wrapped as a native iOS app via Capacitor 8, built for small groups of club golfers to record, compare, and analyse their rounds together — "Strava and FPL for golf". Players enter scores manually or via AI-parsed scorecard photos, track live hole-by-hole scoring (including multi-player groups and match play), and view personal stats alongside a shared group leaderboard with nine ranking views. AI features (Anthropic Claude via Netlify proxy) cover scorecard OCR, coaching reviews, shorthand summaries, stats analysis, and practice planning. A retention loop provides streaks, share cards, course leaderboards, and monthly badges.

**App ID:** `com.loopercaddie.app` — TestFlight beta active, multiple builds uploaded. Launch target: 28 May 2026.

Code must be written with high professionalism — reliable, futureproofed, minimal duplication. Apps that break are embarrassing and users never return. Keep at the core: minimising unnecessary code, minimising user clicks, class-leading UX/UI, and encouraging engagement. "Your mates, your season".

---

## Architecture Overview

```
Browser (PWA, vanilla JS ES modules, no build step)
  │
  ├── index.html          ← entire app shell (all pages, modals, navbar)
  ├── styles/app.css      ← design system via CSS custom properties
  └── js/*.js             ← ~33 ES modules, entry point is app.js
         │
         ├── /.netlify/functions/auth      ← Supabase Auth proxy
         ├── /.netlify/functions/supabase  ← Supabase data proxy
         ├── /.netlify/functions/ai        ← Anthropic Claude proxy
         ├── /.netlify/functions/courses   ← GolfAPI.io proxy + Supabase cache
         └── /.netlify/functions/monthly-badges ← scheduled (1st of month)
```

Netlify hosts static frontend + serverless functions. No build step; auto-deploys from `main`.

**Capacitor iOS:** Same codebase in WKWebView via Capacitor 8. `js/config.js` detects native via `window.Capacitor?.isNativePlatform?.()` and sets `API_BASE` (`''` on web, `'https://loopercaddie.com'` on native). 12 native plugins installed. iOS project in `ios/App/`. Workflow: edit JS/CSS → `npm run cap:sync` → Xcode archive → TestFlight.

**Supabase is the sole backend.** All data persistence, auth, and storage via Netlify function proxies.

---

## Module List (`js/`)

| File | Responsibility |
|---|---|
| `state.js` | Single mutable `state` singleton imported by every module |
| `constants.js` | `PAGES`, `COURSES` (20 built-in), tee-colour map `TC`, `HANDICAP_BENCHMARKS`, `getBenchmark(hcp)` |
| `app.js` | Entry point — imports all modules, binds DOM listeners, `registerNavHandlers`, boot sequence, monthly handicap reminder |
| `auth.js` | Session management — signIn, signUp, magic link, token refresh, session storage |
| `nav.js` | SPA routing: `goTo(page)` with deferred renders via `requestAnimationFrame` |
| `api.js` | Supabase sync — `loadAppData()`, `loadGroupData()`, `pushData()`, `pushSupabase()`, `querySupabase()`, `loadAllRounds()` |
| `scorecard.js` | 18-hole input table; `saveRound()` (single save path); post-save: streak toast, AI shorthand, share card, course rank, 24h review reminder |
| `live.js` | Hole-by-hole live scoring — player list, score adjusters, POP badges, stat panel, pips, GPS card; group mode; match play; round backup/recovery |
| `live-invite.js` | Real-time round invite polling (12s), toast, join/leave, viewer GPS |
| `overlay.js` | Match overlay display; `showEndRoundConfirm()` |
| `competition.js` | Competition hub — tabbed screen (Overview/Schedule/Leaderboard/Activity); tee groups; AI commentary |
| `competition-setup.js` | Full-screen competition creation with player invite chips; join flow |
| `comp-score.js` | Competition scoring — separate copy of live.js scoped to tee group |
| `stats.js` | KPI cards, 6 Chart.js charts (below-fold deferred), Stableford calculator, round history; `renderMatesFeed()` (cached 60s); `renderFeedPage()` (Strava-style feed with photos); `renderHomeStats()` (cached 60s) |
| `leaderboard.js` | Podium (with avatar photos) + list with 9 view pills; H2H widget; admin board ordering; pending member banner; renders instantly from cache |
| `players.js` | Onboarding, player management, avatar upload (256px), home course, player profile sheet (stats + streaks + badges + friend actions) |
| `courses.js` | Course search, `getCourseByRef()`, recent courses pills ("Last played" label), country/tee pills |
| `ai.js` | Photo parsing, coaching review, stats analysis, `generateShorthandReview()` (witty caddie summary) |
| `practice.js` | AI practice plans, session logging with drill-by-drill shot counting |
| `group.js` | Group CRUD, board setup, member management (pending approval), drag-reorder boards (DOM swap) |
| `group-match.js` | Group match creation/joining modals, active-match badge |
| `admin.js` | Password-protected admin panel — round deletion, course corrections, GolfAPI usage |
| `gamemodes.js` | Wolf / Match Play / Sixes engines; pixel-precise format slider positioning |
| `flags.js` | Feature flags — `PREMIUM_ENABLED: false` (all gates no-op) |
| `subscription.js` | Premium gatekeeping (hidden behind flag); native bridge stub for future IAP |
| `walkthrough.js` | 12-step spotlight tour; triggers on first login |
| `friends.js` | Friend search/request/accept, notification polling (60s), profile panel |
| `streaks.js` | Client-side streak engine — buffer-or-better, sub-36 putts, rounds-in-30-days; SVG icons |
| `share-card.js` | Canvas-based 1080×1920 share cards — 3 layouts (Score/Heatmap/AI); Web Share + Capacitor Share + download |
| `weather.js` | 3-day forecast (Open-Meteo, no key); golf suitability score; suncream reminder |
| `gps.js` | GPS distances (front/mid/back) with native permission request; `haversineYards()` |
| `config.js` | `API_BASE`, `APP_ORIGIN`, `IS_NATIVE` — leaf module |
| `haptics.js` | Native haptics via `@capacitor/haptics` — no-op on web |
| `push.js` | Native push via `@capacitor/push-notifications` — handles 8 notification types |
| `empty-states.js` | Reusable empty state renderer |
| `caddie.js` | Floating caddie pill button |
| `demo.js` | Demo mode — in-memory data, no auth |
| `export.js` | XLSX export (disconnected) |

---

## Key `state` Object Fields

```js
state = {
  gd,              // Global data (players, groupCodes, activeGroupCode, groupMeta, greenCoords, teeCoords)
  me,              // Current player name (string)
  cpars,           // Array(18) — current course pars
  stee,            // Tee colour key
  roundActive,     // boolean — true during live scoring
  gameMode,        // 'stroke' | 'match' | 'wolf' | 'sixes'
  activeCourse,    // Full course object from getCourseByRef()
  liveState: { hole, group[], groupScores, groupPutts, groupFir, groupGir, matchPlay, matchTeams, hcpOverrides },
  wolfState, sixesState, currentMatchId,
  liveInvite: { liveRoundId, mode, data, minimised },
  gpsState: { watching, watchId, target, coords },
  practiceState: { area, plan, currentDrillIndex, shotsLogged, sessionId },
  _pendingMemberCount, _groupAdminId, _hasMoreRounds
}
```

---

## Data Schema

### Supabase tables

```
players       — id, name (unique), email, auth_user_id, handicap, avatar_url, home_course, practice_sessions (JSONB), stats_analysis (JSONB)
rounds        — id (bigint PK), player_name, group_code, date, course, tee, scores[], pars[], putts[], fir[], gir[], total_score, diff, birdies, pars_count, bogeys, doubles, eagles, rating, slope, handicap (numeric), ai_review (JSONB), shorthand_review (text), photo_url, match_result (JSONB), wolf_result (JSONB), sixes_result (JSONB), played_with[]
groups        — id, code, name, admin_id, active_boards[], season, settings (JSONB)
group_members — id, group_id (FK), player_id, joined_at, status ('approved'|'pending')
competitions  — id, code (UNIQUE), name, created_by, format, players[], tee_groups (JSONB), status, hcp_overrides (JSONB), rounds_config (JSONB)
friendships   — id, requester, addressee, status ('pending'|'accepted'|'blocked')
notifications — id, to_player, from_player, type, payload (JSONB), read (bool)
device_tokens — id, player_name, token, platform ('ios')
user_badges   — id, player_name, group_code, badge_type, month, label, score
courses, active_rounds, active_matches, api_call_log, course_reports, feed_likes, feed_comments, app_errors
```

### Round object (from `saveRound()`)

```js
{ id, player, course, loc, tee, date: 'DD/MM/YYYY', pars: [18], scores: [18], putts: [18],
  fir: [18], gir: [18], totalScore, totalPar, diff, birdies, parsCount, bogeys, doubles, eagles,
  rating, slope, handicap, shorthandReview?, aiReview?, matchResult?, wolfResult?, sixesResult?, playedWith? }
```

---

## CSS Design Tokens

```css
--navy: #0b1520;  --mid: #121e30;  --card: #182538;  --border: #1e3252;
--gold: #c9a84c;  --gold2: #e8c96a;  --pale: #f5e6b8;
--cream: #f0e8d0;  --dim: #8899bb;  --dimmer: #4a5a7a;
--eagle: #f1c40f;  --birdie: #3498db;  --par: #2ecc71;  --bogey: #e67e22;  --double: #e74c3c;
--safe-top: env(safe-area-inset-top, 0px);  --safe-bot: env(safe-area-inset-bottom, 0px);
```

Cormorant Garamond = **splash screen only**. All other numerics use DM Sans 700. Use SVG line icons throughout — no emojis.

---

## Coding Conventions

- **No framework, no build step.** Vanilla ES modules (`type="module"`).
- **Single HTML file.** All pages, modals, navbar in `index.html`.
- **DOM access.** `document.getElementById('id')?.` — optional chaining everywhere.
- **Module imports.** Named exports only. Circular deps broken via `registerNavHandlers`.
- **State mutation.** Direct mutation of `state` singleton. No Redux/events/proxies.
- **Dates.** GB format `'DD/MM/YYYY'`. Parse with `parseDateGB()`. Never `new Date('DD/MM/YYYY')`.
- **Score deltas.** `score − par` (negative = good). `scoreClass(d)` / `scoreCol(d)` map to CSS.
- **FIR on par-3s.** Stored as `'N/A'` — exclude from FIR%.
- **Async.** `pushData()` writes localStorage first, then Supabase fire-and-forget.
- **Charts.** Always `dc(key)` before re-creating. Below-fold charts deferred with `setTimeout(50ms)`.
- **Capacitor plugins.** Dynamic `import('@capacitor/...')` with `.catch(() => {})`. All no-op on web.
- **Error tracking.** Sentry via CDN, `tracesSampleRate: 0.1`.
- **Competition scoring.** `comp-score.js` is a separate copy of `live.js` — intentional, prevents coupling.
- **Notifications.** All inserts via `insertNotification()` helper that logs errors.
- **No emojis.** Use SVG line icons (`stroke`, no `fill`) throughout. Icons use `var(--gold)` or `var(--dim)`.
- **Per-round handicap.** Every round stores `handicap` at time of play. Leaderboards use `r.handicap ?? p.handicap` (per-round with fallback to current for legacy).

---

## Before You Change Anything

### 1. `registerNavHandlers` pattern (circular dep strategy)
`nav.js` never imports page modules directly. `app.js` passes all renderers at boot.

### 2. CDN globals — not ES imports
`Chart` (Chart.js 4.4.0) and `XLSX` (SheetJS 0.18.5) are `<script>` tags. Access as bare globals.

### 3. Course selection — `getCourseByRef()`, never `#course-sel`
Use `getCourseByRef()` and `clearCourseSelection()` from `courses.js`.

### 4. `saveRound()` is the single save path
All round saves go through `scorecard.saveRound()`. Post-save triggers: streak check, AI shorthand, share card, course leaderboard rank, 24-hour review reminder, push notification to group.

### 5. Auth via `js/auth.js` → `/.netlify/functions/auth`
Browser never talks to Supabase directly. Network errors don't clear session — only genuine 401.

### 6. Group member join flow
`joinGroup` inserts as `'pending'`. Admin approves. `pendingCount` in API response for admin badge.

### 7. Netlify functions

| Function | Purpose |
|---|---|
| `auth.js` | Supabase Auth proxy |
| `supabase.js` | Supabase CRUD + getCourseLeaderboard + getPlayerBadges + updateRoundField |
| `ai.js` | Photo OCR, coaching review, stats analysis via Claude Haiku |
| `courses.js` | GolfAPI.io search + detail fetch with Supabase caching |
| `push.js` | APNs device token registration/removal |
| `monthly-badges.js` | Scheduled (1st of month) — awards "Most Consistent" badge per group |
| `demo-data.js` | In-memory demo data (no auth) |
| `waitlist.js` | Tally webhook → Supabase + Resend email |

---

## Post-Save Flow (retention loop)

When `saveRound()` completes, the following triggers fire asynchronously:

| Delay | Feature | Module |
|---|---|---|
| 0s | Round saved toast + haptic | `scorecard.js` |
| 0s | Network sync (localStorage → Supabase) | `api.js` |
| 0s | Push notification to group members ("X posted Y at Course") | `supabase.js` → `push.js` |
| 0s | 24-hour review reminder scheduled (local notification) | `scorecard.js` |
| 0s | Course leaderboard rank fetched | `scorecard.js` → `supabase.js` |
| 3.5s | Streak toast (if streak > 1) | `streaks.js` |
| 5s | AI shorthand review toast (witty caddie summary) | `ai.js` |
| 7s | Share card modal (3 swipeable layouts) | `share-card.js` |
| 8.5s | Course rank toast ("You're 2nd at X this month!") | `scorecard.js` |

---

## Environment Variables

All in Netlify dashboard. None sent to browser.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key (server only) |
| `SUPABASE_ANON_KEY` | Supabase anon key (user-scoped auth only) |
| `GOLFAPI_KEY` | GolfAPI.io course search |
| `SYNC_SECRET` | Admin endpoint protection |
| `RESEND_API_KEY` | Email via Resend (domain: `loopercaddie.co.uk`) |
| `SENTRY_DSN` | Browser error tracking (public identifier) |
| `APNS_KEY_P8` | APNs auth key contents (server only) |
| `APNS_KEY_ID` | APNs key ID (server only) |
| `APNS_TEAM_ID` | Apple Team ID (server only) |

---

## Change Log

| Period | Changes |
|---|---|
| 2026-04-30 | **Retention loop** — streak engine (buffer/putts/frequency, profile card, post-save toast); AI shorthand review (witty caddie summary, cached on round); share card generator (3 canvas layouts — Score/Heatmap/AI, Web Share + native); Most Consistent badge (monthly scheduled function, per-group, profile display); 24-hour review reminder (local notifications, native + PWA, auto-cancel on review view); course leaderboard (platform-wide rank, post-save toast, share card badge); SVG icons replace all emojis |
| 2026-04-29 | **Competition setup redesign + fixes** — full-screen page replaces modal; player invite chips; Done→"Go to competition" navigation; input overflow fixed; feed photo cache persists; "Last played" label; format slider pixel-precise positioning; duplicate home hero removed; KPI picker cache-busts |
| 2026-04-26–28 | **10 fixes** — push on round save; photo quality 1600px/85%; putts/hole board; monthly handicap reminder; podium avatars; board drag reorder (DOM swap); leaderboard instant cache render; GPS import error caught; slider bounce removed; teach-me modal height |
| 2026-04-24–25 | **TestFlight + per-round handicap** — Apple Developer setup; app icon; Info.plist permissions; PrivacyInfo.xcprivacy; handicap saved per round; leaderboard uses per-round handicap; strokes prompt removed; GPS permissions on iOS; zoom disabled; player profile sheet; pending badge clears; iOS splash navy |
| 2026-04-18–22 | **Bug fixes + performance** — match play off-by-one; finish confirmation; round recovery solo; team selection; Capacitor imports; page transitions deferred; home caches 60s; charts deferred |
| 2026-04-15–16 | **Capacitor iOS Chunks 1-6** — config.js; CORS; 12 native plugins; push notifications (APNs); haptics |
| 2026-04-01–10 | **Pre-launch** — waitlist; weather; round tab redesign; live scoring fixes; GPS fixes; competitions V1; round persistence; demo data |
| 2026-03-20–31 | **Foundation** — Supabase backend; course search; live scoring; game modes; friends; multi-group; leaderboard; home screen; stats; admin; demo; session hardening |

---

## Code Review Standards

- Functions longer than 30 lines → likely doing too much
- Logic duplicated more than twice → extract to utility
- Missing error handling on async operations
- No emojis — SVG line icons only
- Run /simplify before presenting code to the user
