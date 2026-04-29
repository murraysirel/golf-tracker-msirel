#cl1 CLAUDE.md — Architecture Reference

## Product Summary

Looper is a mobile-first PWA wrapped as a native iOS app via Capacitor 8, built for small groups of club golfers to record, compare, and analyse their rounds together — "Strava and FPL for golf". Players enter scores manually or via AI-parsed scorecard photos, track live hole-by-hole scoring (including multi-player groups and match play), and view personal stats alongside a shared group leaderboard with eight ranking views. AI features (Anthropic Claude via Netlify proxy) cover scorecard OCR, coaching reviews, stats analysis, and practice planning.

**App ID:** `com.loopercaddie.app` — TestFlight build 1.0 (2) uploaded 2026-04-24, pending beta review.

Code must be written with high professionalism — reliable, futureproofed, minimal duplication. Apps that break are embarrassing and users never return. Keep at the core: minimising unnecessary code, minimising user clicks, class-leading UX/UI, and encouraging engagement. "Your mates, your season".

---

## Architecture Overview

```
Browser (PWA, vanilla JS ES modules, no build step)
  │
  ├── index.html          ← entire app shell (all pages, modals, navbar)
  ├── styles/app.css      ← design system via CSS custom properties
  └── js/*.js             ← ~30 ES modules, entry point is app.js
         │
         ├── /.netlify/functions/auth      ← Supabase Auth proxy
         ├── /.netlify/functions/supabase  ← Supabase data proxy
         ├── /.netlify/functions/ai        ← Anthropic Claude proxy
         └── /.netlify/functions/courses   ← GolfAPI.io proxy + Supabase cache
```

Netlify hosts static frontend + serverless functions. No build step; auto-deploys from `main`.

**Capacitor iOS:** Same codebase in WKWebView. `js/config.js` exports `API_BASE` (`''` on web, `'https://loopercaddie.com'` on native), `APP_ORIGIN`, `IS_NATIVE`. iOS project in `ios/App/`. Workflow: edit JS/CSS → `npm run cap:sync` → Cmd+R in Xcode. See `CAPACITOR.md` for migration checklist.

**Supabase is the sole backend.** No Gist, no sync.js.

---

## Module List (`js/`)

| File | Responsibility |
|---|---|
| `state.js` | Single mutable `state` singleton imported by every module |
| `constants.js` | `PAGES`, `COURSES` (20 built-in, fallback disabled), tee-colour map `TC`, `HANDICAP_BENCHMARKS`, `getBenchmark(hcp)` |
| `app.js` | Entry point — imports all modules, binds DOM listeners, `registerNavHandlers`, boot sequence (auth → token refresh → `loadAppData`) |
| `auth.js` | Session management — `signIn()`, `signUp()`, `sendMagicLink()`, `handleMagicLinkRedirect()`, `refreshIfNeeded()`, `getStoredSession()`, `clearSession()` |
| `nav.js` | SPA routing: `goTo(page)`, `switchEntry(type)`, `registerNavHandlers()` (circular-dep workaround) |
| `api.js` | `loadAppData()` / `loadGroupData()` / `pushData()` / `pushSupabase()` / `querySupabase()` / `loadAllRounds()` / `retryUnsyncedRounds()` — Supabase sync; `ss()` status dot |
| `scorecard.js` | `buildSC()` renders 18-hole input table; `saveRound()` — single source of truth for persisting rounds |
| `live.js` | Hole-by-hole live scoring — player-list layout, score adjusters with POP badge, stat panel, colour-coded pips, GPS card; group mode; match play; `publishLiveState()`; `_saveLiveBackup()` on every change + beforeunload + 30s interval; round recovery restores course/strokes/sixes |
| `live-invite.js` | Real-time round invite polling (12s), toast, join/leave, view/edit mode, viewer GPS |
| `overlay.js` | Match overlay display; `showEndRoundConfirm()` |
| `competition.js` | Competition hub — tabbed screen (Overview/Schedule/Leaderboard/Activity); tee groups; AI commentary; polls Supabase every 45s |
| `competition-setup.js` | Competition creation/joining; AI commentary generation |
| `comp-score.js` | Competition scoring — separate copy of live.js scoped to tee group (intentional duplication to avoid coupling) |
| `stats.js` | KPI cards, 6 Chart.js charts, Stableford calculator, handicap edit, round history; `renderMatesFeed()` (home activity, cached 60s); `renderFeedPage()` (full Strava-style feed); `renderHomeStats()` (home KPIs, cached 60s); `parseDateGB()` used app-wide |
| `leaderboard.js` | Podium + list with 8 view pills; H2H widget; admin board ordering; `filterRounds()` excludes pre-joinedAt rounds; pending member banner for admins |
| `players.js` | Onboarding, player management, avatar upload (256px), home course, "who's playing" selector |
| `courses.js` | Course search (`initCourseSearch()`), `getCourseByRef()`, `clearCourseSelection()`, `restoreCourseByName()`; country pills; tee pills; recent courses pills (last 3, localStorage `looper_recent_courses`) |
| `ai.js` | Scorecard photo parsing, coaching review, stats analysis — via `/.netlify/functions/ai` |
| `practice.js` | AI practice plans (Claude), session logging with drill-by-drill shot counting |
| `group.js` | Group CRUD, board setup, member management (pending approval flow), clipboard helpers |
| `group-match.js` | Group match creation/joining modals, active-match badge |
| `admin.js` | Password-protected admin panel — round deletion, course corrections, GolfAPI usage, demo seeding |
| `export.js` | XLSX export (disconnected — kept for future re-enable) |
| `gamemodes.js` | Wolf / Match Play / Sixes engines; `setGameMode()`, `updateFormatUI()` |
| `flags.js` | Feature flags — `PREMIUM_ENABLED: false` (all gates no-op when off) |
| `subscription.js` | Premium gatekeeping (hidden behind flag); native bridge stub for future IAP |
| `walkthrough.js` | 12-step spotlight tour; triggers on first login; replayable from Settings |
| `friends.js` | Friend search/request/accept, notification polling (60s), profile panel |
| `empty-states.js` | Reusable empty state renderer |
| `caddie.js` | Floating caddie pill button |
| `demo.js` | Demo mode — loaded from `/.netlify/functions/demo-data` with no auth |
| `weather.js` | 3-day forecast (Open-Meteo, no key); golf suitability score; suncream reminder; 3-hour cache |
| `gps.js` | GPS distances (front/mid/back), `haversineYards()`, drive logging. GolfAPI coords: location=1→front, location=3→back |
| `config.js` | `API_BASE`, `APP_ORIGIN`, `IS_NATIVE` — leaf module, no app imports |
| `haptics.js` | Native haptics via `@capacitor/haptics` — no-op on web |
| `push.js` | Native push via `@capacitor/push-notifications` — no-op on web; token registration, foreground toasts, background navigation |

---

## Key `state` Object Fields

```js
state = {
  gd,              // Global data (players, groupCodes, activeGroupCode, groupMeta, greenCoords, teeCoords, etc.)
  me,              // Current player name (string)
  cpars,           // Array(18) — current course pars
  stee,            // Tee colour key ('blue'|'yellow'|'white'|'red'|'black')
  roundActive,     // boolean — true between startGroupRound() and cancelRound()/save
  gameMode,        // 'stroke' | 'match' | 'wolf' | 'sixes'
  activeCourse,    // Full course object from getCourseByRef()
  liveState: {
    hole,                // 0–17
    group[],             // Selected player names
    groupScores: {},     // { playerName: Array(18) }
    groupPutts: {}, groupFir: {}, groupGir: {},
    matchPlay, matchFormat, matchResult, matchTeams: { a: [], b: [] },
    hcpOverrides: {}     // { playerName: playingHandicap }
  },
  wolfState, sixesState, currentMatchId,
  liveInvite: { liveRoundId, mode, data, minimised },
  gpsState: { watching, watchId, target, coords },
  practiceState: { area, plan, currentDrillIndex, shotsLogged, sessionId },
  _pendingMemberCount,   // int — pending group join requests (for admin badge)
  _hasMoreRounds         // boolean — true if boot loaded paginated (50/member)
}
```

`state` is never reset — always mutated in place.

---

## Data Schema

### Supabase tables

```
players       — id, name (unique), email, auth_user_id, handicap, avatar_url, home_course, practice_sessions (JSONB), stats_analysis (JSONB)
rounds        — id (bigint PK), player_name, group_code, date, course, tee, scores[], pars[], putts[], fir[], gir[], total_score, diff, birdies, pars_count, bogeys, doubles, eagles, rating, slope, ai_review (JSONB), match_result (JSONB), wolf_result (JSONB), sixes_result (JSONB), played_with[]
groups        — id, code, name, admin_id, active_boards[], season, settings (JSONB)
group_members — id, group_id (FK), player_id, joined_at, status ('approved'|'pending')
active_rounds — id, group_code, host, players[], course, tee, hole, scores (JSONB), updated_at
courses       — id, external_course_id (UNIQUE), name, club_name, location, country, tees (JSONB), pars (JSONB), green_coords (JSONB), has_gps, has_hole_data
competitions  — id, code (UNIQUE), name, created_by, format, tee_groups (JSONB), players[], status, hcp_overrides (JSONB), commentary (JSONB)
friendships   — id, requester, addressee, status ('pending'|'accepted'|'blocked')
notifications — id, to_player, from_player, type, payload (JSONB), read (bool)
device_tokens — id, player_name, token, platform ('ios')
active_matches, api_call_log, course_reports, feed_likes, feed_comments
```

### Round object (from `saveRound()`)

```js
{ id, player, course, loc, tee, date: 'DD/MM/YYYY', pars: [18], scores: [18], putts: [18],
  fir: [18], gir: [18], totalScore, totalPar, diff, birdies, parsCount, bogeys, doubles, eagles,
  rating, slope, aiReview?, matchResult?, wolfResult?, sixesResult?, playedWith?, matchHandicaps? }
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

Key classes: `.btn` `.btn-o` `.btn-ghost`, `.card` `.ct`, `.fpill`, `.nb`, `.lb-row` `.lb-me`, `.avatar`, `.live-pip`, `.tab`, `.format-slider`, `.player-select-screen`, `.tee-pill`.

Cormorant Garamond = **splash screen only**. All other numerics use DM Sans 700. Avatar initials: DM Sans 13px/700.

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
- **Error tracking.** Sentry via CDN, `tracesSampleRate: 0.1`. No manual `captureException()` unless swallowed.
- **Competition scoring.** `comp-score.js` is a separate copy of `live.js` — intentional, prevents coupling.
- **Notifications.** All inserts via `insertNotification()` helper in `supabase.js` that logs errors.

---

## Before You Change Anything

### 1. `registerNavHandlers` pattern (circular dep strategy)

`nav.js` never imports page modules directly. `app.js` calls `registerNavHandlers(...)` once at boot, passing all renderers. New page renderers must go through this pattern.

### 2. CDN globals — not ES imports

`Chart` (Chart.js 4.4.0) and `XLSX` (SheetJS 0.18.5) are loaded via `<script>` tags. Access as bare globals. **Do not `import` them.**

### 3. Course selection — `getCourseByRef()`, never `#course-sel`

The `<select id="course-sel">` is removed. Use `getCourseByRef()` (returns active course or null) and `clearCourseSelection()` from `courses.js`. Course object shape:
```js
{ name, location, pars: [18], tees: [{ colour, yardage, rating, slope, pars_per_hole, si_per_hole }],
  stroke_indexes: [18], green_coords: { [hole]: { front, middle, back } }, has_gps }
```

### 4. `saveRound()` is the single save path

Every round save (manual, photo, live) goes through `scorecard.saveRound()`. Live scoring syncs values via `liveSyncToManual()` first. Add new Round fields in `saveRound()` only.

### 5. Auth via `js/auth.js` → `/.netlify/functions/auth`

Browser never talks to Supabase directly. Boot: `handleMagicLinkRedirect()` → `getStoredSession()` → `refreshIfNeeded()` → `loadAppData()` → `enterAs()`. Session key: `looper_session`. Network errors don't clear session — only genuine 401 does.

### 6. Group member join flow

`joinGroup` inserts `group_members` row with `status: 'pending'`. Admin must approve in group settings. `read` API only returns approved/NULL members. `pendingCount` included in API response for admin badge on Leagues page.

### 7. Netlify functions

| Function | Purpose |
|---|---|
| `auth.js` | Supabase Auth proxy (sign-in, sign-up, magic link, refresh, sign-out) |
| `supabase.js` | Supabase CRUD (read, saveRound, updateHandicap, deleteRound, groups, competitions, friends, notifications) |
| `ai.js` | Photo OCR, coaching review, stats analysis via Claude |
| `courses.js` | GolfAPI.io search + detail fetch with Supabase caching |
| `push.js` | Device token registration/removal for APNs |
| `demo-data.js` | In-memory demo data (no auth) |
| `waitlist.js` | Tally webhook → Supabase + Resend confirmation email |

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
| `SENTRY_DSN` | Browser error tracking (public identifier, safe in client code) |
| `APNS_KEY_P8` | APNs auth key contents (server only) |
| `APNS_KEY_ID` | APNs key ID (server only) |
| `APNS_TEAM_ID` | Apple Team ID (server only) |

---

## Change Log

| Period | Changes |
|---|---|
| 2026-04-29 | **Competition setup redesign + feed photos + slider fix** — competition setup converted to full-screen page; Done button navigates to competition; player invite chips for league members; input overflow fixed; feed photo cache updated on upload so photos persist; "Last played" label above recent courses; format slider glider uses pixel-precise positioning (fixes Sixes overshoot); push notification for `round_posted` handled in background tap; duplicate home hero header removed; KPI picker cache-busts on selection change |
| 2026-04-26–28 | **10 fixes** — push notification on round save; photo quality 1600px/85%; putts/hole leaderboard board with explainer; monthly handicap reminder; podium avatars show photos; board drag reorder fixed (DOM swap); leaderboard loads instantly from cache; GPS `@capacitor/geolocation` import error caught; format slider bounce removed; teach-me modal height capped |
| 2026-04-24–25 | **TestFlight + per-round handicap** — Apple Developer account; APNs key; app icon; Info.plist permissions; PrivacyInfo.xcprivacy; Xcode signing; TestFlight build uploaded; handicap snapshot saved with every round; leaderboard uses per-round handicap (fallback to current for legacy); "Were handicaps used?" prompt removed; GPS `requestPermissions()` on iOS; zoom disabled; player profile sheet; pending badge clears on approve; input zoom prevention; iOS splash background navy |
| 2026-04-18–22 | **Bug fixes + performance** — match play off-by-one fixed (17→18 in holes-to-play); finish round confirmation on hole 18; round recovery handles solo rounds; team selection visible for match play; Capacitor imports get `.catch()`; match modal scroll/alignment fixed; page transitions deferred with `requestAnimationFrame`; home feed/KPIs cached 60s; stats charts deferred below fold |
| 2026-04-20 | **Recent courses + pending members** — last 3 courses as pills on Play tab; pending member count in API response; red badge + gold banner on Leagues page for admins; notification inserts log errors instead of silent `.catch()` |
| 2026-04-15–16 | **Capacitor iOS Chunks 1-6** — `config.js` (API_BASE/IS_NATIVE); all fetch calls prefixed; CORS echo origin; service worker disabled on native; Capacitor 8 init; 12 native plugins (status bar, keyboard, haptics, camera, GPS, push, share, browser, splash, app, keep-awake); push notifications via APNs (http2+crypto JWT); 7 notification types wired; haptics at 14 interaction points |
| 2026-04-07–10 | **Round persistence + home polish** — pagehide/visibilitychange backup; match/sixes state backup+restore; demo data enriched (match/wolf/sixes results, AI reviews); walkthrough synced; feed comments with counts/previews; front9/back9 gross/net toggle |
| 2026-04-01–04 | **Pre-launch features** — waitlist page + function; welcome email on signup; weather card (Open-Meteo); warmer colour system; splash redesign; round tab redesign with format slider + player selection overlay; live scoring bug fixes (onclick, putts cap, autoGir); GPS front/back corrected; round loading paginated (50/member); payment gatekeeping (hidden) |
| 2026-03-31 | **Competition mode V1** — full tournament flow with tee groups, dedicated `comp-score.js`, drag-up leaderboard; settings cleanup; friend search rebuild; GolfAPI cost control |
| 2026-03-20–30 | **Foundation** — Supabase backend (replaced Gist); course search (GolfAPI+cache); live scoring redesign; game modes (Wolf/Sixes/Match Play); competition mode; friends system; multi-group support; leaderboard (podium+9 views); home screen (KPI grid, feed, weather); stats (charts, benchmarks); SVG icons; DM Sans typography; admin dashboard; demo mode; session hardening |

---

## Code Review Standards

- Functions longer than 30 lines → likely doing too much
- Logic duplicated more than twice → extract to utility
- Missing error handling on async operations
- Run /simplify before presenting code to the user
