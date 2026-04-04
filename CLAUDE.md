#cl1 CLAUDE.md — Architecture Reference

## Product Summary

Looper is a mobile-first progressive web app — your AI caddie — for a small group of golfers to record, compare, and analyse their rounds together. Players enter scores manually or via AI-parsed scorecard photos, track live hole-by-hole scoring (including multi-player groups and match play), and view personal stats (handicap trend, Stableford points, FIR/GIR charts) alongside a shared group leaderboard with eight ranking views. AI features — powered by Anthropic Claude via a Netlify proxy — cover scorecard OCR, post-round coaching reviews, multi-round stats analysis, and personalised practice-session planning. A pre-launch waitlist page (`waitlist.html`) captures signups via Tally webhooks with Resend confirmation emails.

---

## Architecture Overview

```
Browser (PWA, vanilla JS ES modules, no build step)
  │
  ├── index.html          ← entire app shell (all pages, modals, navbar in one file)
  ├── styles/app.css      ← design system via CSS custom properties
  └── js/*.js             ← 30 ES module files, entry point is app.js
         │
         ├── /.netlify/functions/auth      ← Supabase Auth proxy (auth.js)
         │       └── Supabase Auth — email/password + magic link sign-in
         │           (localStorage key looper_session = access/refresh token)
         │
         ├── /.netlify/functions/supabase  ← Supabase data proxy (supabase.js)
         │       └── Supabase DB — single source of truth
         │           (localStorage key gt_localdata = offline fallback cache)
         │
         ├── /.netlify/functions/ai        ← Anthropic Claude proxy (ai.js)
         │       └── claude-haiku-4-5-20251001
         │
         └── /.netlify/functions/courses   ← GolfAPI.io proxy with Supabase cache
```

Netlify hosts both the static frontend and all serverless functions. No build step; the repo ships as-is. Auto-deploys from `main`.

**GitHub Gist is fully retired.** Supabase is the sole backend. There is no sync.js function.

---

## Module List (`js/`)

| File | Responsibility |
|---|---|
| `state.js` | Exports the single mutable `state` singleton imported by every other module |
| `constants.js` | `PAGES`, `COURSES` array (20 built-in, fallback disabled), tee-colour map `TC`, `HANDICAP_BENCHMARKS` lookup table (USGA/R&A), `getBenchmark(hcp)` |
| `app.js` | Entry point — imports every module, binds all DOM event listeners, calls `registerNavHandlers`, runs boot sequence (auth check → token refresh → `loadAppData`) |
| `auth.js` | Client-side session management — `signIn()`, `signUp()`, `sendMagicLink()`, `handleMagicLinkRedirect()`, `refreshIfNeeded()`, `getStoredSession()`, `clearSession()`, `serverSignOut()`, `signOutAll()`, `listSessions()` |
| `nav.js` | SPA routing: `goTo(page)`, `switchEntry(type)`, `registerNavHandlers()` (circular-dep workaround). Pages include `feed` for the activity feed drill-down |
| `api.js` | `loadAppData()` / `loadGroupData()` / `pushData()` / `pushSupabase()` / `querySupabase()` / `retryUnsyncedRounds()` — Supabase data sync; `ss()` updates the status dot |
| `scorecard.js` | `buildSC()` renders the 18-hole input table; `saveRound()` collects DOM values, computes breakdown, appends to `state.gd`, calls `pushData()` then `pushSupabase()` fire-and-forget |
| `live.js` | Hole-by-hole live scoring UI — player-list-first layout, inline score adjusters with POP badge (handicap stroke indicator), stat panel for selected player, colour-coded pips, compact GPS card with green SVG illustration; running score shows gross vs par + net vs par; multi-player group mode; match play tracking; `publishLiveState()` publishes scores + gameMode + hcpOverrides for real-time viewer sharing; `_saveLiveBackup()` (exported) fires on every change + beforeunload + 30s interval; round recovery restores course by name, strokes, sixes state; `liveGroupSave()` falls back to backup course name if getCourseByRef returns null; `cancelRound()` resets live state. Each player row shows HCP/strokes info with mid-round "Edit strokes" link. |
| `live-invite.js` | Real-time round invite polling (12s interval, restarts on every page navigation), toast dismissal, join/leave live round, view/edit mode toggle; viewer GPS card with own phone GPS watch; `startInvitePolling()`, `joinLiveRound()`, `minimiseLiveView()`, `submitEditorScore()` |
| `overlay.js` | Match overlay display and controls; `initMatchOverlay()`, `showMatchOverlay()`, `hideMatchOverlay()`, `showEndRoundConfirm()` |
| `competition.js` | Competition hub — tabbed home screen (Overview/Schedule/Leaderboard/Activity); tee group management; `startCompetitionRound()` routes to comp-score; admin panel with handicap overrides; AI commentary; polls Supabase every 45 s; `getMatchLeaderboard()` exported for group matches |
| `competition-setup.js` | Competition creation/joining — `generateCompCode()`, `createCompetition()`, `joinCompetition()`, `lookupCompetition()`, `renderCompetitionSetupModal()`, `renderJoinCompetitionModal()`; AI commentary — `generateCompPreview()`, `generateHalftimeSummary()`, `generateFinalSummary()` |
| `comp-score.js` | Competition-specific scoring — carbon copy of live.js hole-by-hole UI, scoped to user's tee group. Separate module to avoid coupling with live.js. `initCompScore()`, `prepareCompScore()`, `compScoreNext()`, `compScorePrev()`, `compScoreSave()`. Includes all live.js bug fixes (onclick not addEventListener, putts cap, autoGir guards). Saves rounds tagged to competition dates, navigates back to competition home on finish |
| `stats.js` | KPI cards, six Chart.js charts (score trend, FIR/GIR, putts, birdies/doubles, per-hole, scoring breakdown bars), Stableford calculator, `calcScoringPointsNet()`, handicap edit, round history list, front 9 vs back 9 card; `parseDateGB()` used app-wide; `renderMatesFeed()` generates the home-screen activity highlights feed (3 events max, last 7 days); `renderFeedPage()` renders the full Strava-style activity feed page (`#pg-feed`) with 30-day lookback, rich round cards, event rows (birdies/eagles/PBs/match results), tap-to-view scorecard; home screen pulse row with customisable KPIs (last 5 rounds, stored in `looper_home_kpis`); handicap benchmark overlay lines and callout values on all charts |
| `leaderboard.js` | Unified podium + list layout with 8 switchable view pills (Stableford, Net score, Buffer+, Pts scoring net, Best round, Fewest doubles, Most birdies, Most net birdies); collapsible H2H widget; view explainers below podium; pills ordered by admin's `active_boards` config; `getAllowedBoardIds()` subscription gate; `filterRounds()` excludes rounds before a player's `joinedAt` date |
| `players.js` | Onboarding/sign-in, player management, initials generation, "who's playing today" selector, avatar upload (256px resize), home course setting |
| `courses.js` | Course search UI (`initCourseSearch()` mounts into `#course-search-container`), `getCourseByRef()` returns active course object, `clearCourseSelection()` resets it; `restoreCourseByName(name, tee)` searches Supabase and applies course for round recovery (falls back to minimal stub); `_applyCourse()` sets `state.cpars`/`state.activeCourse` and rebuilds the scorecard; country pill strip with SVG flag icons; tee pills from course data. All courses come from GolfAPI with Supabase caching. |
| `ai.js` | Scorecard photo parsing, post-round coaching review, multi-round stats analysis — all via `/.netlify/functions/ai` |
| `practice.js` | AI practice-plan generation (Claude) with preset areas or free-text custom requests, session logging with drill-by-drill shot counting |
| `group.js` | Group code/season CRUD, board setup, "delete my data", clipboard helpers; `initJoinGroup()`, `initCreateGroup()`, `initGroupSettings()`, `showBoardPage()` |
| `group-match.js` | Group match creation/joining modals and active-match badge; `openCreateMatchModal()`, `openJoinMatchModal()`, `updateGroupMatchButtonVisibility()`, `updateActiveMatchBadge()` |
| `admin.js` | Password-protected admin panel — round deletion (logged to `deletionLog`), course-correction application, GolfAPI usage check, demo seeding |
| `export.js` | XLSX export (disconnected — button removed, file kept for future re-enable) |
| `gamemodes.js` | Wolf / Match Play / Sixes game mode engines; `setGameMode()`, `updateFormatUI()` syncs both old fpill buttons and new format slider; Wolf state init/scoring/banners/scoreboard; Sixes 3-ball net points (4-2-0 scoring) with compact inline standings bar; `initSixesState()`, `getSixesStandings()`, `updateSixesBanner()` |
| `flags.js` | Feature flags — `PREMIUM_ENABLED: false` (all premium gates no-op when off); `isEnabled(flag)` |
| `subscription.js` | Premium subscription gatekeeping (hidden behind flag) — `isPremium()`, `checkAccess(feature)`, `incrementUsage(feature)`, `showUpgradePrompt(feature)`, `getAllowedBoardIds()`; usage tracking via localStorage; native bridge stub for future app store payments |
| `walkthrough.js` | 12-step spotlight tour for new users — box-shadow overlay with gold border, tooltip card, auto-page-navigation; triggers on first login (`looper_walkthrough_done` flag); replayable from Settings |
| `friends.js` | Friends system — live player search (fuzzy name match via `searchPlayers` Supabase action), friend request send/accept/decline, notification polling (60s), profile panel tabs (Settings/Actions/Friends); search results show name, handicap, home course |
| `empty-states.js` | `emptyState(icon, headline, subline, ctaText, ctaAction)` — reusable empty state renderer used across home, stats, leaderboard, practice |
| `caddie.js` | `initCaddieButton()` — floating caddie pill button initialisation |
| `demo.js` | `enterDemoMode()`, `exitDemoMode()`, `isDemoMode()` — demo group loaded from `/.netlify/functions/demo-data` with no auth |
| `weather.js` | 3-day weather forecast from Open-Meteo free API. No key required. Resolves location from: user-selected course (localStorage `looper_weather_location`) → GPS → last played course green coords → London fallback. Tappable location header with course search to change forecast location. 3-hour localStorage cache. Golf suitability score (score ≥90 = "Millionaire's golf"). Suncream reminder flag when sunny + >18°C. |
| `gps.js` | `watchPosition` GPS, `haversineYards()` (exported for shared use), distance-to-green with front/mid/back targets, tee/green coord pinning, drive logging stored in `state.gd`. Green coords mapping: GolfAPI location=1→front, location=3→back (corrected from docs). |

---

## Key `state` Object Fields

```js
state = {
  gd,              // Global data object (players, groupCodes, activeGroupCode, groupMeta, seasons, customCourses, greenCoords, teeCoords, courseCorrections, deletionLog)
  me,              // Current player name (string)
  cpars,           // Array(18) — current course pars
  stee,            // Current tee colour key ('blue'|'yellow'|'white'|'red'|'black')
  photoFile,       // File object for scorecard photo upload
  CH,              // Chart.js instance container (managed by stats.js)
  statsFilter,     // Active filter: '5'|'10'|'all'|'month'|'course'
  activeCompetitionId, // string|null — selected competition ID
  activeCompetition,   // full competition object from Supabase
  demoMode,        // boolean — true when running DEMO01 data
  roundActive,     // boolean — true between startGroupRound() and cancelRound()/save
  wakeLock,        // WakeLock sentinel (or null)
  gameMode,        // 'stroke' | 'match' | 'wolf' | 'sixes'
  wolfState: {
    order[],         // Player name turn order (hole 1 wolf = order[0])
    holes[]          // Per-hole result objects from scoreWolfHole()
  },
  sixesState,      // Sixes standings/hole breakdown (null when not a Sixes round)
  currentMatchId,  // string|null — set when joining a group live match
  liveState: {
    hole,                // Current hole index (0–17)
    scores[],            // Single-player hole scores
    putts[],
    fir[],               // 'Yes'|'No'|'N/A'
    gir[],               // 'Yes'|'No'
    notes[],
    group[],             // Selected player names for group round
    groupScores: {},     // { playerName: Array(18) }
    groupPutts: {},
    groupFir: {},
    groupGir: {},
    matchPlay,           // boolean
    matchFormat,         // 'singles'|'pairs'
    matchResult,         // match state (leader, holesUp, result)
    matchTeams: { a: [], b: [] },
    hcpOverrides: {}     // { playerName: playingHandicap } — set by pre-round modal
  },
  liveInvite: {
    liveRoundId,         // string — Supabase active_matches row id
    currentRoundId,      // string — round being tracked
    mode,                // 'view' | 'edit'
    data,                // latest published state snapshot
    minimised,           // boolean
    seenIds              // Set of already-processed snapshot IDs
  },
  courseCardFile,       // File for course card scan
  scannedPars,          // Array(18) from AI scan
  scannedSI,            // Array(18)
  scannedYards,         // Object keyed by tee colour
  scoringFor,           // Player name being scored in group mode
  practiceState: {
    area,                // Selected practice area string
    plan,                // AI-generated plan object
    currentDrillIndex,
    shotsLogged,
    sessionId
  },
  gpsState: {
    watching,            // boolean
    watchId,             // geolocation watch ID
    target,              // 'front'|'mid'|'back'
    coords               // latest GeolocationCoordinates
  }
}
```

`state` is never reset — always mutated in place.

---

## Data Schema

### Supabase — primary tables

```
players       — id (uuid), name (text, unique), email, auth_user_id (uuid), handicap (numeric), dob (text), avatar_url, match_code, group_code, home_course (text), practice_sessions (JSONB), stats_analysis (JSONB), stats_analysis_date
rounds        — id (bigint PK), player_name (text NOT NULL), group_code (text NOT NULL), date, course, loc, tee, scores[], pars[], putts[], fir[], gir[], notes, total_score, total_par, diff, birdies, pars_count, bogeys, doubles, eagles, penalties, bunkers, chips, rating (numeric), slope (int), ai_review (JSONB), match_result (JSONB), wolf_result (JSONB), sixes_result (JSONB), played_with[], match_handicaps (JSONB), handicaps_used (bool), created_at
groups        — id (uuid), code (text NOT NULL), name (text NOT NULL), admin_id, active_boards (text[]), season (int), settings (JSONB), created_at
group_members — id (uuid), group_id (uuid FK), player_id (text), joined_at (timestamptz DEFAULT now()), status (text DEFAULT 'approved')
active_matches — id (text PK), name, course, date, created_by, group_code, match_type, status, players (JSONB), scores (JSONB), tee_groups (JSONB), created_at
active_rounds — id (text PK), group_code, host, players (text[]), course, tee, hole (int), scores (JSONB), putts (JSONB), pars (JSONB), updated_at
courses       — id (bigint auto), external_course_id (text UNIQUE), external_club_id, name (text NOT NULL), club_name, location, country, city, holes (int), tees (JSONB), pars (JSONB), stroke_indexes (JSONB), green_coords (JSONB), has_gps (bool), has_hole_data (bool), data_source, data_quality, report_count (int), created_at, updated_at
competitions  — id (text PK), code (text UNIQUE, COMP+2 letters+4 digits), name, created_by, admin_players (text[]), format ('stableford'|'stableford_gross'|'stroke_gross'|'stroke_net'|'matchplay'), team_format (bool), team_a/team_b (text[]), rounds_config (JSONB), tee_groups (JSONB — keyed by round e.g. {"round_1":[{id,startHole,teeTime,players[]}]}), players (text[]), status ('setup'|'active'|'complete'), hcp_overrides (JSONB), commentary (JSONB), created_at
friendships   — id (text PK), requester, addressee, status ('pending'|'accepted'|'blocked'), created_at; UNIQUE(requester, addressee)
notifications — id (text PK), to_player, from_player, type ('friend_request'|'friend_accepted'|'join_request'|'join_approved'), payload (JSONB), read (bool), created_at
api_call_log  — id (serial), timestamp, endpoint, course_name, was_cache_hit (bool), details (JSONB)
course_reports — id (bigint auto), course_id, player_name, group_code, issue (text NOT NULL), created_at
```

`gt_localdata` localStorage key caches the full `state.gd` snapshot for offline fallback.

### `state.gd` top-level keys

```js
{
  players: {
    "Player Name": {
      handicap: number,
      dob: string|null,
      homeCourse: string|null,     // set in player settings, shown in friend search
      joinedAt: string|null,       // ISO timestamp from group_members.joined_at — rounds before this date excluded from leaderboards
      rounds: [ Round ],
      practiceSessions: [ PracticeSession ],
      statsAnalysis: { positive, negative, drill, handicap },
      statsAnalysisDate: string
    }
  },
  groupCodes: string[],           // all group codes this player belongs to
  activeGroupCode: string,        // currently viewed group (persisted to gt_activegroup)
  groupMeta: { [code]: { name } },
  requireGroupCode: boolean,
  seasons: [ { name, year } ],
  customCourses: { key: CourseObject },
  greenCoords: { courseName: { [hole]: { lat, lng } } },
  teeCoords:   { courseName: { [hole]: { lat, lng } } },
  courseCorrections: [ CorrectionEntry ],
  deletionLog: [ DeletionEntry ]
}
```

### Round object (saved by `scorecard.saveRound()`)

```js
{
  id: number,          // Date.now()
  player: string,
  course: string,
  loc: string,
  tee: string,         // 'blue'|'yellow'|'white'|'red'|'black'
  date: string,        // 'DD/MM/YYYY'
  notes: string,
  pars: number[18],
  scores: number[18],
  putts: number[18],
  fir: string[18],     // 'Yes'|'No'|'N/A'
  gir: string[18],     // 'Yes'|'No'
  totalScore: number,
  totalPar: number,
  diff: number,        // totalScore − totalPar
  birdies, parsCount, bogeys, doubles, eagles: number,
  penalties, bunkers, chips: number,
  rating: number,      // course rating
  slope: number,       // slope rating
  aiReview?: { positive, negative, drill },
  matchResult?: { ... },
  wolfResult?: { order, holes, winner },
  sixesResult?: { standings, holeBreakdown, winner },
  playedWith?: string[],
  matchHandicaps?: {},
  handicapsUsed?: boolean
}
```

---

## CSS Design Tokens

Defined in `:root` in `styles/app.css`:

```css
--navy:   #0b1520;   /* page background (warmer indigo-black) */
--mid:    #121e30;   /* section background */
--card:   #182538;   /* card background */
--border: #1e3252;   /* subtle dividers */

--gold:   #c9a84c;   /* primary accent */
--gold2:  #e8c96a;   /* hover accent */
--pale:   #f5e6b8;   /* light accent */
--cream:  #f0e8d0;   /* primary text */
--dim:    #8899bb;   /* secondary text */
--dimmer: #4a5a7a;   /* tertiary text */

--eagle:  #f1c40f;   /* score colour: eagle */
--birdie: #3498db;   /* score colour: birdie */
--par:    #2ecc71;   /* score colour: par */
--bogey:  #e67e22;   /* score colour: bogey */
--double: #e74c3c;   /* score colour: double+ */

--safe-top: env(safe-area-inset-top, 0px);    /* iOS notch */
--safe-bot: env(safe-area-inset-bottom, 0px); /* iOS home bar */
```

Key component classes: `.btn` `.btn-o` `.btn-ghost`, `.card` `.ct`, `.fpill`, `.nb`, `.lb-row` `.lb-me` `.lb-pos`, `.avatar` `.lb-avatar-me`, `.live-pip`, `.tab` `.tab-bar`.

Home screen KPI grid classes: `.home-kpi-grid` (2×2 CSS grid, `padding:12px 16px 0`), `.home-kpi-card` (individual card, `var(--mid)` bg, 12px radius), `.home-kpi-val` (28px Cormorant serif value), `.home-kpi-lbl` (9px uppercase label), `.home-kpi-delta` (11px trend line). Split card: `.home-kpi-split` + `.home-kpi-split-inner` + `.home-kpi-divider` (absolute-positioned SVG diagonal line) + `.home-kpi-split-top` / `.home-kpi-split-bot` (each `max-width:46%; overflow:hidden`; value font 20px, delta font 9px inside split). Avatar circles: `.avatar` and `.lb-avatar-me` both use DM Sans 13px/700 — do not use Cormorant Garamond for initials.

Cormorant Garamond is restricted to **splash screen only** (`#splash-app-name`). All other numeric displays (`.home-kpi-val`, `.lb-score`, `.bv`, `.tv`, `.hs`) use DM Sans 700. Text size tokens: `--text-xs` (9px) through `--text-3xl` (36px). Utility classes: `.text-upper`, `.text-section`, `.delta-up`, `.delta-dn`.

---

## Coding Conventions

- **No framework, no build step.** Vanilla ES modules (`type="module"` on the `<script>` tag in `index.html`).
- **Single HTML file.** All pages, modals, and the navbar live in `index.html`. New UI goes there.
- **DOM access.** Always via `document.getElementById('id')?.` — optional chaining everywhere for safety. IDs are short and kebab-case (`#h0`, `#sdot`, `#comp-feed`).
- **Module imports.** Named ES module exports only — no default exports. Circular dependencies are broken by the `registerNavHandlers` pattern (see below). `app.js` is the only module that imports every other module.
- **State mutation.** All modules import `state` from `state.js` and mutate it directly. No Redux, no events, no proxies.
- **Dates.** GB format `'DD/MM/YYYY'` everywhere. Parsed for comparison with `parseDateGB()` in `stats.js`. Never use `new Date()` on a DD/MM/YYYY string — always split on `/` first.
- **Score deltas.** Always `score − par` (negative = good). `scoreClass(d)` / `scoreCol(d)` in `scorecard.js` map deltas to CSS classes/colours.
- **FIR on par-3s.** Stored as `'N/A'` — exclude from FIR% calculations.
- **Async.** `loadAppData()` and `pushData()` are `async`/`await`. `pushData()` always writes `localStorage` first, then syncs to Supabase. Never call the old `pushGist` or `loadGist` names — they no longer exist.
- **Chart cleanup.** Always call `dc(key)` (destroy chart) before re-creating a chart to avoid canvas conflicts.
- **Error tracking.** Sentry is loaded via CDN `<script>` tag in `index.html` before `app.js`. Configured with `Sentry.init({ dsn: '...', tracesSampleRate: 0.1 })`. Unhandled errors and promise rejections are captured automatically. Do not add manual `Sentry.captureException()` calls unless catching errors that would otherwise be silently swallowed.
- **Competition scoring.** `comp-score.js` is intentionally a separate module from `live.js` — not shared code. This prevents competition changes from breaking normal live scoring. The duplication is acceptable.

---

## Before You Change Anything

### 1. Circular dependency strategy — the `registerNavHandlers` pattern

`nav.js` needs to call page renderers (`renderStats`, `renderLeaderboard`, etc.) when `goTo(page)` is called, but those renderers live in modules that also import from `nav.js`. To avoid a circular import deadlock:

1. `nav.js` exports `registerNavHandlers(handlers)` and stores the passed functions in module-level variables.
2. `app.js` — the only module that imports everything — calls `registerNavHandlers(...)` once at boot, passing in all renderers.
3. `nav.js` never imports from any page module directly.

**Do not import page-module functions directly into `nav.js`.** Always add new page renderers through this registration pattern.

### 2. Chart.js and SheetJS are CDN globals — not ES imports

`index.html` loads these via `<script src="...">` tags:
- `Chart` (Chart.js 4.4.0) — used in `stats.js`
- `XLSX` (SheetJS 0.18.5) — used in `export.js`

They are accessed as `window.Chart` / `window.XLSX` (bare global names in the code). **Do not attempt to `import` them** — there is no bundler and no `node_modules`.

### 3. Course selection — always use `getCourseByRef()`, never read `#course-sel`

The static `<select id="course-sel">` has been removed. Course selection is now driven by `initCourseSearch()` (mounted into `<div id="course-search-container">`), which calls `_applyCourse()` internally when the user picks a result. All modules must use:

- `getCourseByRef()` — returns the currently active course object (or `null` if none selected), imported from `courses.js`
- `clearCourseSelection()` — resets the selection and clears the search UI, imported from `courses.js`

**Never** use `document.getElementById('course-sel')` — the element no longer exists.

The course object shape from `getCourseByRef()`:
```js
{
  name: string,
  location: string,
  pars: number[18],
  tees: [{ colour, name, yardage, rating, slope, yards_per_hole, pars_per_hole, si_per_hole }],
  stroke_indexes: number[18],   // course-level fallback SI
  green_coords: { [hole1]: { front, middle, back } },
  has_gps: boolean
}
```

Built-in courses in `constants.js` use the same field names: `pars_per_hole`, `rating`, `slope`, `yardage`, `yards_per_hole`. There are no legacy short names (`r`, `s`, `hy`, `par`) anywhere.

### 4. `saveRound()` in `scorecard.js` is the single source of truth for persisting rounds

Every path that saves a round — manual entry, photo parse, live scoring — ultimately calls `scorecard.saveRound()`. It reads the 18 hole inputs directly from the DOM (`#h0`–`#h17`, `#p0`–`#p17`, `#fir0`–`#fir17`, `#gir0`–`#gir17`), constructs the full Round object, appends it to `state.gd.players[target].rounds`, and calls `pushData()` then `pushSupabase()` fire-and-forget.

**Live scoring** syncs its values back into those DOM inputs via `liveSyncToManual()` before routing back to the Round tab — the user then hits Save, which calls `saveRound()` as normal.

If you need to add a field to the Round object, add it in exactly one place: `saveRound()`.

### 5. Auth — sessions are managed by `js/auth.js` via the `/.netlify/functions/auth` proxy

The browser never talks to Supabase directly. All auth (sign-in, sign-up, token refresh, sign-out) goes through the Netlify function so keys stay server-side.

**Boot sequence** (`app.js`):
1. `handleMagicLinkRedirect()` — consume URL hash tokens from email links
2. `getStoredSession()` — check `looper_session` in localStorage
3. `refreshIfNeeded()` — silently exchange refresh token if access token is near/past expiry
4. `loadAppData(playerName, groupCode)` — fetch player + group data from Supabase
5. `enterAs(playerName)` — render the main app

**Session storage key:** `looper_session` (JSON: `{ accessToken, refreshToken, expiresAt, userId, playerName, sessionId }`)

**Important:** Network errors during token refresh do **not** clear the session — only a genuine 401 from Supabase triggers `clearSession()`. This prevents spurious logouts on mobile when the network is slow to wake up.

### 6. Netlify functions — full inventory

| Function | Endpoint | Auth | Purpose |
|---|---|---|---|
| `auth.js` | `/.netlify/functions/auth` | `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_KEY` (server) | Supabase Auth proxy — sign-in, sign-up, magic link, token refresh, sign-out, session listing |
| `supabase.js` | `/.netlify/functions/supabase` | `SUPABASE_SERVICE_KEY` (server) | Supabase CRUD — read/saveRound/updateHandicap/deleteRound/saveMatch/active_matches/searchPlayers/updateHomeCourse/createCompetition/joinCompetition/getCompetition/getMyCompetitions/updateCompetition |
| `ai.js` | `/.netlify/functions/ai` | `ANTHROPIC_API_KEY` (server) | Photo OCR, coaching review, stats analysis via Claude |
| `courses.js` | `/.netlify/functions/courses` | `GOLFAPI_KEY` (server) | GolfAPI.io search + detail fetch; results cached in Supabase (fields `overall_par`, `tee_types` are stripped from upsert — not in DB schema); actions: search, fetch, usage, diagnose, fix-bad-data, report, inspect |
| `demo-data.js` | `/.netlify/functions/demo-data` | None | Returns in-memory DEMO01 demo data (no DB, no auth) |
| `waitlist.js` | `/.netlify/functions/waitlist` | `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY` | Receives Tally webhook → writes to Supabase `waitlist` table (auto-assigns signup number via trigger) → sends branded confirmation email via Resend. First 100 signups get `is_founder: true`. |
| `seed-demo.js` | `/.netlify/functions/seed-demo` | `x-admin-key` header | Seeds DEMO01 group (8 players, 40 outings) into Supabase |
| `run-seed-demo.js` | `/.netlify/functions/run-seed-demo` | Injected server-side | Admin trigger — proxies seed-demo with `SYNC_SECRET` |

---

## Environment Variables

All variables are set in the Netlify dashboard. None are ever sent to the browser.

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `netlify/functions/ai.js` | Call the Anthropic Claude API |
| `SUPABASE_URL` | `netlify/functions/supabase.js`, `auth.js`, `courses.js` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | `netlify/functions/supabase.js`, `auth.js` | Supabase service-role key — never in browser JS |
| `SUPABASE_ANON_KEY` | `netlify/functions/auth.js` | Supabase anon key — used for user-scoped sign-in/sign-up only |
| `GOLFAPI_KEY` | `netlify/functions/courses.js` | GolfAPI.io key for course search, detail fetch, and result caching |
| `SYNC_SECRET` | `netlify/functions/courses.js` (diagnose/fix-bad-data actions), `netlify/functions/run-seed-demo.js` | Server-side only — protects admin-only endpoints |
| `RESEND_API_KEY` | `netlify/functions/waitlist.js`, `netlify/functions/auth.js` | Resend email API key — sends waitlist confirmation + welcome emails. Server-side only, never in browser JS. Domain: `loopercaddie.co.uk` (temporary while `.com` is ICANN-locked; switch to `.com` after transfer) |
| `SENTRY_DSN` | `index.html` (browser SDK) | Sentry error tracking DSN — loaded via CDN `<script>` tag, configured with `Sentry.init()` before app.js. **Security note:** the DSN is a public identifier, not a secret — it's safe in client-side code. It only allows sending events to Sentry, not reading them. Rate limiting and abuse prevention are handled by Sentry's server-side controls. |

---

## Change Log

| Date | Change |
|---|---|
| 2026-04-04 | **Critical live scoring fixes (on-course testing)** — round recovery now auto-restores course by name (`restoreCourseByName`), hcpOverrides, sixes state, and tee colour; `liveGroupSave` falls back to backup course name if getCourseByRef returns null (fixes zombie save loop); backup extended to 24 hours, fires on `beforeunload` + 30s interval, kept alive until save succeeds; GPS card shrunk (76px height, compact SVG); sixes bar moved below player rows as compact inline format; each player row shows HCP/strokes info with mid-round "Edit strokes" link; POP badge on handicap stroke holes |
| 2026-04-04 | **Waitlist page** — pre-launch landing page at `/waitlist.html` with Tally popup form (not inline iframe), floating "Join waitlist" CTA, 6 problem cards, vertical step flow ("The Looper loop"), 3 phone mockup teasers (leagues/live scoring/activity feed), "First 100 users get 6 months free premium". Root URL redirects to waitlist via `netlify.toml` (302 + force, with `/index.html` passthrough for the app) |
| 2026-04-04 | **Waitlist function** — `netlify/functions/waitlist.js` receives Tally webhook, writes to Supabase `waitlist` table, sends branded confirmation email via Resend with founder status for first 100 signups |
| 2026-04-04 | **Welcome email on signup** — `netlify/functions/auth.js` sends branded HTML welcome email via Resend after new account creation (fire-and-forget). Includes 3-step onboarding guide and Instagram CTA |
| 2026-04-04 | **Weather improvements** — course search in weather card header (tap location → search any course → forecast updates); "Millionaire's golf" label for score ≥90; suncream reminder when sunny + >18°C; user location preference saved to localStorage |
| 2026-04-04 | **Export removed** — export button, XLSX script tag, and event listener removed. `js/export.js` kept in repo but disconnected |
| 2026-04-04 | **Payment gatekeeping (hidden)** — `checkAccess()` calls added to AI reviews, practice sessions, competitions, and leaderboard board filtering. All gates return true while `PREMIUM_ENABLED = false`. Subscription state loaded from Supabase on boot (column must be added manually: `ALTER TABLE players ADD COLUMN subscription JSONB DEFAULT '{"tier":"free"}'::jsonb`) |
| 2026-04-03 | **Leaderboard overhaul** — 8 views (removed birdies total + net birdies total, added most net birdies); pts scoring switched to net; view explainers below podium; collapsible H2H; admin drag-reorder boards; board ID reconciliation (`normaliseBoardIds`); board leaders moved above H2H |
| 2026-04-03 | **App walkthrough** — 12-step spotlight tour (box-shadow overlay) triggered on first login; auto-navigates between pages; replayable from Settings > App tour |
| 2026-04-03 | **Zombie rounds fixed** — `pollGroupInvites` filters out rounds older than 30 min; garbage collects rows older than 60 min |
| 2026-04-03 | **GPS front/back swap fixed** — GolfAPI `parseCoordinates` location mapping corrected (1=front, 3=back); one-time client migration swaps cached greenCoords; GPS card sizes increased |
| 2026-04-03 | **Home stats arrows fixed** — arrow direction matches value change (down for decrease), colour reflects good/bad |
| 2026-04-03 | **Sixes results in scorecard + feed** — end-of-round scorecard shows medal standings; home feed shows "X beat Y by N points in Sixes!" |
| 2026-04-03 | **Round loading paginated** — server returns last 50 rounds per member on boot; `loadAllRounds()` fetches full history on demand when entering stats/leaderboard |
| 2026-04-02 | **Activity feed page** — new `#pg-feed` page with back button, accessible via "See more →" on home screen. Strava-style 30-day feed showing rich round cards (score, vs par, pts, birdies — tap to view scorecard), birdies/eagles/net eagles, season PBs, match play/Wolf/Sixes results with badges. Grouped by relative date. All group players included. |
| 2026-04-02 | **Home stats improvements** — pulse stats now use last 5 rounds (was 10), labelled "last 5 rounds"; delta arrows replaced with SVG trend triangles (up green, down orange); last round card tiebreaks by round ID when dates match |
| 2026-04-02 | **Round tab renamed to Play** — navbar label changed from "Round" to "Play" |
| 2026-04-02 | **Player selection flow cleanup** — duplicate "who's playing" screen removed (new player selection skips straight to `startGroupRound()`); match context sheet skipped for group rounds (2+ players already assigned); scroll-to-top on player selection open |
| 2026-04-02 | **Leagues header rearranged** — league name displayed prominently across top of board page; group code card removed from top (shown only at bottom with copy button); podium order fixed to 1st→2nd→3rd descending left-to-right |
| 2026-04-02 | **Round setup improvements** — duplicate tee dropdown removed (coloured pills only); country pill change clears selected course; format slider stroke/stableford selection fixed; "Teach me the game" button for Wolf/Sixes/Match; yellow/white tee pills use dark background for readability |
| 2026-04-02 | **Practice sessions** — 90-day auto-retention; sessions older than 90 days pruned on render and synced; pulsing gold dot animation on Build a Practice Session icon |
| 2026-04-02 | **Avatar zoom** — tap any player photo to view full-size in modal overlay; works for own and other users' avatars |
| 2026-04-02 | **Login/signup tightened** — smaller logo, consistent uppercase labels, tighter spacing, cleaner visual hierarchy |
| 2026-04-02 | **Sixes UI spacing** — medals centralised with stacked layout, "This hole" text larger/centred, widget has rounded border with more padding |
| 2026-04-02 | **Country flags redone** — Ireland, Spain, Portugal, France now use proper simplified flag SVGs |
| 2026-04-02 | **Weather forecast card** — 3-day forecast on home screen via Open-Meteo free API; animated SVG weather icons (8 types); golf suitability score bar; 3-hour localStorage cache |
| 2026-04-01 | **Warmer colour system** — `--navy`/`--mid`/`--card`/`--border` shifted from cold blue toward warmer indigo-black |
| 2026-04-01 | **Splash screen redesign** — centred brand stack: mascot (160px) → LOOPER wordmark in Cormorant Garamond 400 → gold hairline rule → italic tagline |
| 2026-04-01 | **Round tab redesign** — two-tab top switcher (Play/Competitions) with animated gold glider; country pill strip with SVG flag icons; tee pills from course data; 5-option format slider (Stroke/Stableford/Match/Wolf/Sixes); full-screen player selection overlay (League/Friends/Guest tabs); guest player support with Supabase write filtering |
| 2026-03-31 | **Competition mode V1** — full tournament flow: tabbed competition home screen (Overview/Schedule/Leaderboard/Activity); tee group management (admin assigns players via picker modal, keyed by round in `tee_groups` JSONB); dedicated `comp-score.js` scoring module (carbon copy of live.js, scoped to tee group, no game modes); drag-up leaderboard sheet (90% height, touch-drag to dismiss, trophy pill button); `startCompetitionRound()` routes to comp-score instead of live.js; Stableford only in V1, architecture ready for more formats |
| 2026-03-31 | **Settings panel cleanup** — removed DOB card, "All Players" list, "Add New Player" form from player settings; avatar upload quality increased from 64px to 256px; course search input auto-clears on page navigation |
| 2026-03-31 | **Friend search rebuild** — replaced text input with live search-as-you-type dropdown; `searchPlayers` Supabase action (ilike query returns name/handicap/home_course); tap result to send friend request; `home_course` field added to players table and settings UI; `updateHomeCourse` Supabase action |
| 2026-03-31 | **Live scoring crash fixes** — `addEventListener` replaced with `onclick` on putts +/- buttons (prevented exponential listener cascade causing freezes); putts max fallback changed from `?? 6` to `?? par`; `_autoGirCheck` rewritten with `pt >= sc` guard and auto-No for impossible GIR; autoGir now fires on putts changes too; `liveGoto` wrapped in try/catch with null checks; `_showLiveNudge()` toast for validation feedback |
| 2026-03-31 | **GolfAPI cost control** — 5-char minimum before paid API search fallback; Supabase cache always searched (no minimum); built-in 20-course fallback disabled |
| 2026-03-30 | **Handicap benchmarks** — `HANDICAP_BENCHMARKS` table in `constants.js` (USGA/R&A source); `getBenchmark(hcp)` helper; dashed reference lines on score trend, FIR/GIR, and putts charts; benchmark callout values in all `.chart-callout-row`; new birdies/doubles trend chart with 4 callouts |
| 2026-03-30 | **Home KPI customisation** — pulse row shows 3 user-chosen stats from 7 options (avg score, stableford, FIR%, GIR%, putts, birdies/round, doubles/round); inline picker with toggle pills; persisted to `looper_home_kpis` in localStorage |
| 2026-03-30 | **Leaderboard redesign** — unified podium + list layout with 9 switchable view pills; visual podium (top 3 with sized blocks); ranked player list (4th+); CSS bar chart spotlight card; context header with inline group/season selector panel |
| 2026-03-30 | **SVG icon system** — all emoji UI icons replaced with SVG line icons (18×18 viewBox, stroke-width 1.4); empty-states module maps icon names to SVGs; Cormorant Garamond removed from all CSS except splash |
| 2026-03-30 | **Home screen redesign** — hero header (greeting + name + handicap + avatar), pulse stats row (3 customisable KPIs), last round card (4-column score grid with net birdies toggle), group activity feed (avatar circles + badge pills), start-a-round CTA |
| 2026-03-30 | **Stats page redesign** — proportional scoring breakdown bars (replacing doughnut), chart callout rows below all charts, front 9 vs back 9 card with horizontal bars and insight text, "Month" filter restored |
| 2026-03-30 | **Performance & offline caching (Section 1)** — `_retryQueue` in `api.js` queues failed network writes and retries on `online` event + page navigation; `pushSupabase()` queues network errors instead of dropping; `retryUnsyncedData()` drains queue; `_updateSyncStatus()` shows green/amber/red sync dot based on queue + connectivity; `sw.js` service worker with cache-first for static assets + network-first for API calls (returns `{ offline: true }` when offline); `manifest.json` updated to "Looper"; SW registered in `index.html`; global CSS design tokens added (`.gold-rule`, `.pulse-cell`, `.pulse-accent`, `.section-hdr`, `.chart-callout-row`, `.f9b9-insight` etc.) |
| 2026-03-30 | **Admin dashboard** — standalone `dashboard.html` page (password-protected, separate from main app) with: API health (credits, calls, cache rate), player overview, course repository (filterable, expandable tees), course reports with resolve, app feedback viewer, system tools (pipeline test, diagnostics, cleanup); new Supabase actions `getDashboardStats`, `getAllCourses`, `getCourseReports`, `updateCourseReport`, `submitFeedback`, `getFeedback` |
| 2026-03-30 | **GolfAPI test pipeline** — `action=test-api` endpoint in `courses.js` uses free GolfAPI test endpoints (Pebble Beach, no credits consumed) to verify full fetch→parse→validate→upsert pipeline end-to-end |
| 2026-03-30 | **Live round backup on every change** — `_saveLiveBackup()` fires on every score/stat/note change (not just hole advance); saves full liveState including tee, hcpOverrides; recovery prompt on boot if backup < 8 hours old |
| 2026-03-30 | **League join-date enforcement** — removed admin bypass in `filterRounds()`; all players (including admin/creator) only see rounds from their `joinedAt` date onwards; admin's `joinedAt` equals group creation date, enforcing "only rounds from league creation date" rule |
| 2026-03-30 | **Cache-busting headers** — `_headers` file added for Netlify; JS/CSS served with `Cache-Control: public, max-age=0, must-revalidate`; prevents Safari caching stale code after deploys; fresh login clears `gt_localdata` to prevent old data contamination |
| 2026-03-30 | **Built-in course fallback** — course search falls back to 20 built-in courses from `constants.js` when GolfAPI returns empty (credits exhausted); built-in courses apply directly without API fetch |
| 2026-03-30 | **Live scoring redesign** — `#pg-live` hole view rebuilt to Caddie mockup: hole header with par badge, thin colour-coded pip bars, GPS card with tap-to-switch target, player-list-first layout with inline score adjusters and running vs-par, collapsible stat panel for selected player (`_statPlayer`), full-width gold next-hole button; all existing features preserved (match/wolf/sixes/GPS/drive/invite) |
| 2026-03-30 | **Competition UX cleanup** — format toggle hidden when viewing a competition (format locked at creation); read-only format label shown instead; "Today" renamed to "Group Activity"; dynamic leaderboard title; `setFormat()` only affects Group Activity view |
| 2026-03-30 | **League player list** — "Who's in?" pill button visible to all group members (not just admin); toggleable popup showing all members with avatars and handicaps |
| 2026-03-30 | **League join approval** — `joinGroup` inserts with `status: 'pending'`; admin gets `join_request` notification; `approveGroupMember` action for admin approve/decline; group settings shows pending members; only approved members appear in leaderboards; `group_members.status` column added |
| 2026-03-30 | **Course name fix** — `parseCourseDetail()` uses "Club Name — Course Name" format when both differ (e.g. "Trevose Golf Club — Championship Course") |
| 2026-03-30 | **Schema audit** — full code-to-schema alignment against `information_schema.columns` dump; courses upsert now sends all valid columns (only `overall_par`/`tee_types` stripped); `sixes_result` column added to rounds; `commentary` column added to competitions; `status` column added to `group_members`; `course_yardages` table dropped (unused) |
| 2026-03-30 | **Critical data fixes** — `parseDateGB()` returns integer not Date (fixed `.getTime()` crash that broke entire boot sequence); top-level `await` removed from stats/leaderboard/practice/competition modules; `active_rounds` table created; round ID bigint overflow fixed (`Date.now() + Math.random()` → integer); `saveRound` error checking added; GIR% denominator fixed to count actual data points |
| 2026-03-30 | **Competition setup rewrite** — new flow: Name → Rounds (card per round with date + course search + tee pills) → Scoring (Stableford/Stroke/Match Play) → Handicap (Net/Gross) → Create; course search with live dropdown per round; tee colour pills from course data |
| 2026-03-30 | **My Competitions list** — `renderMyCompetitions()` shows all player's competitions below Create/Join buttons in Round tab; tappable cards navigate to competition view; competition scoring flow pre-configures live round with all players |
| 2026-03-30 | **Profile tabs restyled** — `.tab-bar`/`.tab` replaced with `.profile-pills`/`.profile-pill` (hollow outline pills with gold active state) |
| 2026-03-30 | **Home screen rebuild** — compact 2-card KPI grid (customisable, max 2) + fixed GIR/FIR wide card; 2 recent round rows; group activity card (3 events max); gold separator lines; birdie icon restored in KPI tiles |
| 2026-03-30 | **Typography pass** — Cormorant retired from all CSS except splash; `--text-xs` through `--text-3xl` scale added; `.home-kpi-val`/`.lb-score`/`.bv`/`.tv`/`.hs` switched to DM Sans 700; `.text-upper`/`.text-section`/`.delta-up`/`.delta-dn` utility classes; `.empty-state` classes |
| 2026-03-29 | **Friends system** — `friendships` and `notifications` tables; `sendFriendRequest`, `respondFriendRequest`, `getFriends`, `getNotifications`, `markNotificationsRead` Supabase actions; `js/friends.js` with polling (60s), profile panel tabs (Settings/Actions/Friends), notification dot on avatar, accept/decline UI, add-friend flow with last-round display |
| 2026-03-29 | **AI competition commentary** — `generateCompPreview()`, `generateHalftimeSummary()`, `generateFinalSummary()` in `competition-setup.js`; stored as `commentary: { preview, halftime, final }` JSONB on competition row; auto-triggers halftime/final when round milestones detected; admin-only generate/regenerate buttons; gold-bordered shareable cards with copy-to-clipboard; `commentary` added to `updateCompetition` allowed fields |
| 2026-03-29 | **Competition mode phase 2** — `renderJoinCompetitionModal()` with client-side COMP code validation and live preview; `renderCompetitionLeaderboard()` aggregates scores across multi-round competitions by format (stableford/stroke_gross/stroke_net); `renderCompSelector()` pill strip switches between "Today" and active competitions; admin panel with handicap overrides, player roster, and share-admin flow; `getCompetition`, `getMyCompetitions`, `updateCompetition` Supabase actions; `hcp_overrides` JSONB column on competitions table; `activeCompetitionId`/`activeCompetition` added to state |
| 2026-03-29 | **Competition mode setup** — `competitions` table added to Supabase (code format COMP+2 letters+4 digits); `js/competition-setup.js` created with create/join/lookup flows; `netlify/functions/supabase.js` gains `createCompetition`, `lookupCompetition`, `joinCompetition` actions; "Coming soon" replaced with working create modal and join flow |
| 2026-03-29 | **Activity highlights feed** — `renderMatesFeed()` in `stats.js` rewritten from static mini-leaderboard to event-driven feed showing birdies (2+), eagles, net eagles, season-best net rounds, and stableford >36 alerts from the last 7 days |
| 2026-03-29 | **Custom practice requests** — free-text input (`#practice-custom-input`) added below the area grid; `generatePracticePlan(area, customRequest)` in `practice.js` accepts optional custom focus text passed to the AI prompt |
| 2026-03-29 | **Sign-up toggle restyle** — onboarding theme/distance toggles swapped from `.tab-bar`/`.tab` to `.theme-toggle-wrap`/`.theme-tab` classes to match settings page |
| 2026-03-29 | **Custom course creation removed** — "Add a course" button, `#entry-course` section (search/scan/review), `#scanned-courses-card` all removed from `index.html`; round entry grid changed to 2-column; `switchEntry('course')` path guarded in `nav.js` |
| 2026-03-29 | **Leaderboard join-date filtering** — `group_members.joined_at` fetched via `read` action in `supabase.js`, returned as `memberJoinDates` map; stored as `state.gd.players[name].joinedAt` in `api.js`; `filterRounds(rounds, playerName)` in `leaderboard.js` excludes rounds before join date |
| 2026-03-29 | **Live scoring vs par** — `liveUpdateRunning()` in `live.js` shows gross vs par (E/+3/−2) as primary display with net vs par below; par only accumulates for holes with scores entered (fixes −55 bug); HTML restructured to stack vertically |
| 2026-03-29 | **Tee data non-blocking** — `liveGroupSave()` no longer blocks on missing tee data; tee lookup fixed from `course.tees[state.stee]` (object access) to `.find(t => t.colour === state.stee)` (array search); rating/slope are null if no tee matched |
| 2026-03-29 | **Course Supabase persistence fix** — `overall_par` and `tee_types` stripped from upsert payload in `netlify/functions/courses.js` (columns don't exist in DB); added error logging on upsert failure |
| 2026-03-29 | **DOB display fix** — `dob` added to `getPlayerByAuthId` SELECT and response in `supabase.js`; stored in `state.gd.players[me].dob` at boot in `api.js` |
| 2026-03-29 | **Admin panel scroll fix** — `max-height:85vh; overflow-y:auto` added to admin modal inner container; duplicate `display:none` removed from outer div |
| 2026-03-29 | **Group code removed from settings** — group code card (code display, copy button, require-code toggle) removed from profile panel; codes only appear in leagues tab |
| 2026-03-28 | **Legacy Gist & field name cleanup** — deleted `sync.js`, `migrate-gist-to-supabase.js`, `run-migration.js` (all dead Netlify functions); removed `DEFAULT_GIST` and `API` constants from `constants.js`; removed `adminRunMigration()` and its admin panel UI; renamed `pushGist`→`pushData` across all 13 call-site modules; removed both migration aliases from `api.js`; normalised built-in course field names in `constants.js` (`par`→`pars_per_hole`, `r`→`rating`, `s`→`slope`, `y`→`yardage`, `hy`→`yards_per_hole`, `tp` removed); removed legacy `|| t.r` / `|| tee.hy` fallback guards from `courses.js`, `live.js`, `scorecard.js`, `admin.js`; fixed `rr_me`→`rrg_me` in `demo.js` |
| 2026-03-28 | **Session persistence fix** — `refreshIfNeeded()` in `auth.js` no longer calls `clearSession()` on network errors (only on genuine 401); `loadGroupData()` failure in `api.js` now falls back to localStorage cache instead of bubbling to boot catch; boot catch in `app.js` now tries `enterAs()` with cached data before falling back to `renderLogin()` |
| 2026-03-28 | **Course API fixes** — `sbSelect()` in `netlify/functions/courses.js` now throws on non-array Supabase responses so errors surface in logs; search action falls through to GolfAPI fallback on any Supabase error rather than returning `db_error`; removed `overall_par` and `tee_types` from `searchCache` SELECT (columns need migration); `pars` and `stroke_indexes` stripped from Supabase upsert (columns don't exist); GolfAPI search now expands `club.courses[]` into individual course entries with correct course IDs; `apiRequestsLeft` captured from GolfAPI responses; added `action=usage` (token balance) and `action=diagnose` endpoints; `cacheSucceeded` guard in `js/courses.js` prevents double-fetch on cache hit |
| 2026-03-28 | **Admin GolfAPI token balance** — `adminShowApiUsage()` in `admin.js` fetches `?action=usage` and displays remaining credits with colour coding (green >100, amber >20, red otherwise); "GolfAPI Token Balance" section added to admin panel |
| 2026-03-27 | **Multi-group support** — `state.gd.groupCode` (scalar) replaced by `state.gd.groupCodes: string[]` + `state.gd.activeGroupCode: string` + `state.gd.groupMeta: { [code]: { name } }`; join/create flows append to `groupCodes[]`; `renderGroupSwitcher()` in `leaderboard.js` renders a scrollable pill strip above the season selector; `switchActiveGroup(code)` re-fetches and re-renders; active group persisted to `gt_activegroup` localStorage key |
| 2026-03-26 | **Demo mode rewrite** — `netlify/functions/demo-data.js` generates demo data in-memory from a deterministic RNG (no auth, no DB); `enterDemoMode()` is a single GET fetch |
| 2026-03-26 | **Course pars/SI/yards fallback** — `_applyTee()` falls back to built-in `COURSES` when GolfAPI/Supabase returns all-4 pars; fuzzy name matching on first two meaningful words |
| 2026-03-25 | **Sixes competition format** — 3-ball net points game (4-2-0 / 3-3-0 / 4-1-1 / 2-2-2 per hole); `gamemodes.js` gains `initSixesState()`, `getSixesStandings()`, `getSixesHolePts()`, `updateSixesBanner()` |
| 2026-03-25 | **Round screen restructure** — `#pg-round` split into "Play a Round" and "Competitions" sections |
| 2026-03-25 | **Delete round Supabase sync** — `deletePlayerRound()` in `stats.js` calls `pushSupabase('deleteRound', { roundId })` |
| 2026-03-24 | **Course search UI** — `<select id="course-sel">` removed; replaced with `initCourseSearch()` mounted into `#course-search-container`; `netlify/functions/courses.js` rewritten for GolfAPI.io with Supabase caching |
| 2026-03-24 | **GIR auto-populate** — `autoGir()` fires on every score/putts input; formula: `(score − putts) <= (par − 2)` |
| 2026-03-24 | **Supabase as primary backend** — `netlify/functions/supabase.js` handles all CRUD; `loadAppData()` / `pushData()` / `pushSupabase()` in `api.js`; `gt_localdata` is now an offline cache not a Gist fallback |
| 2026-03-21 | **Match context prompt** — post-save bottom sheet tags playing partners and handicap use; stores `playedWith`, `matchHandicaps`, `handicapsUsed` on round |
| 2026-03-21 | **Pre-round handicap modal** — shown for 2+ players; calculates `round(hcpIndex × slope/113)` per player; stored in `state.liveState.hcpOverrides` |
| 2026-03-20 | **Wolf game mode** — `gamemodes.js` added; Lone Wolf / Six-pointer declarations; standings saved to `round.wolfResult` |
| 2026-03-20 | **Looper rebrand** — renamed from "RRGs Tracker"; new caddie mascot; tagline "Your caddie in your pocket" |
