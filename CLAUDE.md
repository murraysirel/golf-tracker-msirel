#cl1 CLAUDE.md — Architecture Reference

## Product Summary

Looper is a mobile-first progressive web app — your AI caddie — for a small group of golfers to record, compare, and analyse their rounds together. Players enter scores manually or via AI-parsed scorecard photos, track live hole-by-hole scoring (including multi-player groups and match play), and view personal stats (handicap trend, Stableford points, FIR/GIR charts) alongside a shared group leaderboard with nine ranking views. AI features — powered by Anthropic Claude via a Netlify proxy — cover scorecard OCR, post-round coaching reviews, multi-round stats analysis, and personalised practice-session planning.

---

## Architecture Overview

```
Browser (PWA, vanilla JS ES modules, no build step)
  │
  ├── index.html          ← entire app shell (all pages, modals, navbar in one file)
  ├── styles/app.css      ← design system via CSS custom properties
  └── js/*.js             ← 26 ES module files, entry point is app.js
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
| `constants.js` | `PAGES`, `COURSES` array (20 built-in), tee-colour map `TC` |
| `app.js` | Entry point — imports every module, binds all DOM event listeners, calls `registerNavHandlers`, runs boot sequence (auth check → token refresh → `loadAppData`) |
| `auth.js` | Client-side session management — `signIn()`, `signUp()`, `sendMagicLink()`, `handleMagicLinkRedirect()`, `refreshIfNeeded()`, `getStoredSession()`, `clearSession()`, `serverSignOut()`, `signOutAll()`, `listSessions()` |
| `nav.js` | SPA routing: `goTo(page)`, `switchEntry(type)`, `registerNavHandlers()` (circular-dep workaround) |
| `api.js` | `loadAppData()` / `loadGroupData()` / `pushData()` / `pushSupabase()` / `querySupabase()` / `retryUnsyncedRounds()` — Supabase data sync; `ss()` updates the status dot |
| `scorecard.js` | `buildSC()` renders the 18-hole input table; `saveRound()` collects DOM values, computes breakdown, appends to `state.gd`, calls `pushData()` then `pushSupabase()` fire-and-forget |
| `live.js` | Hole-by-hole live scoring UI; running score shows gross vs par (big) + net vs par (small); multi-player group mode; match play tracking; `publishLiveState()` for real-time sharing; `cancelRound()` resets live state; `liveGroupSave()` saves group rounds directly (tee data is optional — missing tee never blocks save) |
| `live-invite.js` | Real-time round invite polling, toast dismissal, join/leave live round, view/edit mode toggle; `startInvitePolling()`, `joinLiveRound()`, `minimiseLiveView()`, `submitEditorScore()` |
| `overlay.js` | Match overlay display and controls; `initMatchOverlay()`, `showMatchOverlay()`, `hideMatchOverlay()`, `showEndRoundConfirm()` |
| `competition.js` | Competition tab — activity feed (eagles, birdies, submissions) + live leaderboard; polls Supabase every 45 s; supports Stableford and Gross modes |
| `competition-setup.js` | Competition creation/joining — `generateCompCode()`, `createCompetition()`, `joinCompetition()`, `lookupCompetition()`, `renderCompetitionSetupModal()`, `renderJoinCompetitionModal()`; AI commentary — `generateCompPreview()`, `generateHalftimeSummary()`, `generateFinalSummary()` |
| `stats.js` | KPI cards, five Chart.js charts, Stableford calculator, `calcScoringPointsNet()`, handicap edit, round history list; `parseDateGB()` used app-wide; `renderMatesFeed()` generates the home-screen activity highlights feed |
| `leaderboard.js` | Nine season-filtered ranking panels; imports `calcStableford` and `isBufferOrBetter` from `stats.js`; `filterRounds()` excludes rounds before a player's `joinedAt` date |
| `players.js` | Onboarding/sign-in, player management, initials generation, "who's playing today" selector, avatar upload |
| `courses.js` | Course search UI (`initCourseSearch()` mounts into `#course-search-container`), `getCourseByRef()` returns active course object, `clearCourseSelection()` resets it; `_applyCourse()` sets `state.cpars`/`state.activeCourse` and rebuilds the scorecard. Custom course creation has been removed — all courses come from GolfAPI. |
| `gps.js` | `watchPosition` GPS, Haversine distance-to-green, tee/green coord pinning, drive logging stored in `state.gd` |
| `ai.js` | Scorecard photo parsing, post-round coaching review, multi-round stats analysis — all via `/.netlify/functions/ai` |
| `practice.js` | AI practice-plan generation (Claude) with preset areas or free-text custom requests, session logging with drill-by-drill shot counting |
| `group.js` | Group code/season CRUD, board setup, "delete my data", clipboard helpers; `initJoinGroup()`, `initCreateGroup()`, `initGroupSettings()`, `showBoardPage()` |
| `group-match.js` | Group match creation/joining modals and active-match badge; `openCreateMatchModal()`, `openJoinMatchModal()`, `updateGroupMatchButtonVisibility()`, `updateActiveMatchBadge()` |
| `admin.js` | Password-protected admin panel — round deletion (logged to `deletionLog`), course-correction application, GolfAPI usage check, demo seeding |
| `export.js` | XLSX export using global `XLSX` — two sheets: All Rounds + Hole Data |
| `gamemodes.js` | Wolf / Match Play / Sixes game mode engines; `setGameMode()`, `updateFormatUI()`, Wolf state init/scoring/banners/scoreboard, Sixes 3-ball net points (4-2-0 scoring), `initSixesState()`, `getSixesStandings()` |
| `empty-states.js` | `emptyState(icon, headline, subline, ctaText, ctaAction)` — reusable empty state renderer used across home, stats, leaderboard, practice |
| `caddie.js` | `initCaddieButton()` — floating caddie pill button initialisation |
| `demo.js` | `enterDemoMode()`, `exitDemoMode()`, `isDemoMode()` — demo group loaded from `/.netlify/functions/demo-data` with no auth |

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
  statsFilter,     // Active filter: '5'|'all'|'month'|'course'
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
players       — name, email, auth_user_id, handicap, dob, avatar_url
rounds        — player_id, group_code, date, course, scores[], pars[], putts[], fir[], gir[], rating, slope, wolf_result, sixes_result, ...
groups        — code, name
group_members — player_id (FK players.name), group_id, joined_at (timestamptz, DEFAULT now())
user_sessions — id (sessionId), user_id, device_hint, last_seen_at
active_matches — live round state for real-time sharing
courses       — external_course_id, name, location, country, tees (JSONB), green_coords (JSONB), has_hole_data, ...
competitions   — id (TEXT PK), code (COMP+2 letters+4 digits), name, created_by, admin_players TEXT[], format ('stableford'|'stroke_gross'|'stroke_net'|'matchplay'), team_format BOOLEAN, team_a/team_b TEXT[], rounds_config JSONB, players TEXT[], status ('setup'|'active'|'complete'), created_at
api_call_log  — timestamp, endpoint, course_name, was_cache_hit, details (JSONB)
```

`gt_localdata` localStorage key caches the full `state.gd` snapshot for offline fallback.

### `state.gd` top-level keys

```js
{
  players: {
    "Player Name": {
      handicap: number,
      dob: string|null,
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
--navy:   #0a1628;   /* page background */
--mid:    #111e35;   /* section background */
--card:   #16273d;   /* card background */
--border: #1e3358;   /* subtle dividers */

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
| `supabase.js` | `/.netlify/functions/supabase` | `SUPABASE_SERVICE_KEY` (server) | Supabase CRUD — read/saveRound/updateHandicap/deleteRound/saveMatch/active_matches |
| `ai.js` | `/.netlify/functions/ai` | `ANTHROPIC_API_KEY` (server) | Photo OCR, coaching review, stats analysis via Claude |
| `courses.js` | `/.netlify/functions/courses` | `GOLFAPI_KEY` (server) | GolfAPI.io search + detail fetch; results cached in Supabase (fields `pars`, `stroke_indexes`, `overall_par`, `tee_types`, `club_name`, `city`, `holes`, `has_gps`, `data_source`, `data_quality`, `report_count` are stripped from upsert — not in DB schema); actions: search, fetch, usage, diagnose, fix-bad-data, report, inspect |
| `demo-data.js` | `/.netlify/functions/demo-data` | None | Returns in-memory DEMO01 demo data (no DB, no auth) |
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

---

## Change Log

| Date | Change |
|---|---|
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
