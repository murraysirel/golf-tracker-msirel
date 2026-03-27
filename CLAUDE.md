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
  └── js/*.js             ← 25 ES module files, entry point is app.jsyera
         │
         ├── /.netlify/functions/sync      ← GitHub Gist proxy (sync.js)
         │       └── GitHub Gist: golf_data.json  ← single source of truth
         │           (localStorage key gt_localdata = offline fallback)
         │
         ├── /.netlify/functions/supabase  ← Supabase backend proxy (supabase.js)
         │       └── Supabase DB — parallel write target; active_matches queries
         │
         ├── /.netlify/functions/ai        ← Anthropic Claude proxy (ai.js)
         │       └── claude-haiku-4-5-20251001
         │
         └── /.netlify/functions/courses   ← GolfAPI.io proxy with Supabase cache
```

Netlify hosts both the static frontend and all serverless functions. No build step; the repo ships as-is. Auto-deploys from `main`.

---

## Module List (`js/`)

| File | Responsibility |
|---|---|
| `state.js` | Exports the single mutable `state` singleton imported by every other module |
| `constants.js` | `PAGES`, `COURSES` array (20 built-in), tee-colour map `TC`, `DEFAULT_GIST`, `API` |
| `app.js` | Entry point — imports every module, binds all DOM event listeners, calls `registerNavHandlers`, kicks off `loadGist()` |
| `nav.js` | SPA routing: `goTo(page)`, `switchEntry(type)`, `registerNavHandlers()` (circular-dep workaround) |
| `api.js` | `loadGist()` / `pushGist()` / `pushSupabase()` / `querySupabase()` / `retrySyncUnsynced()` — Gist ↔ `state.gd` sync; Supabase parallel write; `ss()` updates the status dot |
| `scorecard.js` | `buildSC()` renders the 18-hole input table; `saveRound()` collects DOM values, computes breakdown, appends to `state.gd`, calls `pushGist()` then `pushSupabase()` fire-and-forget |
| `live.js` | Hole-by-hole live scoring UI; multi-player group mode; match play tracking; `publishLiveState()` for real-time sharing; `cancelRound()` resets live state; syncs back to manual scorecard before saving |
| `live-invite.js` | Real-time round invite polling, toast dismissal, join/leave live round, view/edit mode toggle; `startInvitePolling()`, `joinLiveRound()`, `minimiseLiveView()`, `submitEditorScore()` |
| `overlay.js` | Match overlay display and controls; `initMatchOverlay()`, `showMatchOverlay()`, `hideMatchOverlay()`, `showEndRoundConfirm()` |
| `competition.js` | Competition tab — activity feed (eagles, birdies, submissions) + live leaderboard; polls Gist every 45 s and diffs snapshots; supports Stableford and Gross modes |
| `stats.js` | KPI cards, five Chart.js charts, Stableford calculator, `calcScoringPointsNet()`, handicap edit, round history list; `parseDateGB()` used app-wide |
| `leaderboard.js` | Nine season-filtered ranking panels; imports `calcStableford` and `isBufferOrBetter` from `stats.js` |
| `players.js` | Onboarding/sign-in, player management, initials generation, "who's playing today" selector, avatar upload |
| `courses.js` | Course search UI (`initCourseSearch()` mounts into `#course-search-container`), `getCourseByRef()` returns active course object, `clearCourseSelection()` resets it; AI course-card scanner; custom course CRUD; `_applyCourse()` sets `state.cpars`/`state.activeCourse` and rebuilds the scorecard |
| `gps.js` | `watchPosition` GPS, Haversine distance-to-green, tee/green coord pinning, drive logging stored in `state.gd` |
| `ai.js` | Scorecard photo parsing, post-round coaching review, multi-round stats analysis — all via `/.netlify/functions/ai` |
| `practice.js` | AI practice-plan generation (Claude), session logging with drill-by-drill shot counting |
| `group.js` | Group code/season CRUD, board setup, "delete my data", clipboard helpers; `initJoinGroup()`, `initCreateGroup()`, `initGroupSettings()`, `showBoardPage()` |
| `group-match.js` | Group match creation/joining modals and active-match badge; `openCreateMatchModal()`, `openJoinMatchModal()`, `updateGroupMatchButtonVisibility()`, `updateActiveMatchBadge()` |
| `admin.js` | Password-protected admin panel — round deletion (logged to `deletionLog`), course-correction application, Supabase migration trigger, demo seeding |
| `export.js` | XLSX export using global `XLSX` — two sheets: All Rounds + Hole Data |
| `gamemodes.js` | Wolf / Match Play / Sixes game mode engines; `setGameMode()`, `updateFormatUI()`, Wolf state init/scoring/banners/scoreboard, Sixes 3-ball net points (4-2-0 scoring), `initSixesState()`, `getSixesStandings()` |
| `caddie.js` | `initCaddieButton()` — floating caddie pill button initialisation |
| `demo.js` | `enterDemoMode()`, `exitDemoMode()`, `isDemoMode()` — demo group loaded from `/.netlify/functions/demo-data` with no auth |

---

## Key `state` Object Fields

```js
state = {
  gd,              // Global data object (players, groupCode, seasons, customCourses, greenCoords, teeCoords, courseCorrections, deletionLog)
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

### `golf_data.json` (top-level keys)

```js
{
  players: {
    "Player Name": {
      handicap: number,
      rounds: [ Round ],
      practiceSessions: [ PracticeSession ],
      statsAnalysis: { positive, negative, drill, handicap },
      statsAnalysisDate: string
    }
  },
  groupCode: string,              // 6-char alphanumeric
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
  aiReview?: { positive, negative, drill },         // optional, added post-save
  matchResult?: { ... },                            // optional, set when match play round saved
  wolfResult?: { order, holes, winner },            // optional, set when Wolf round saved
  sixesResult?: { standings, holeBreakdown, winner }, // optional, set when Sixes round saved
  playedWith?: string[],       // partner names tagged post-save
  matchHandicaps?: {},         // playing handicaps used
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

Cormorant Garamond is restricted to: `.home-kpi-val`, stats breakdown header (`#st-avg`, `#st-best` etc.), and `.lb-score`/`.bv`. Do not use it in live scoring, GPS, or game mode UI.

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
- **Async.** `loadGist()` and `pushGist()` are `async`/`await`. `pushGist()` always writes `localStorage` first, then tries remote.
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
  tees: { [colour]: { colour, name, yardage, rating, slope, yards_per_hole, pars_per_hole, si_per_hole } },
  stroke_indexes: number[18],   // course-level fallback SI
  green_coords: { [hole1]: { front, middle, back } },
  has_gps: boolean
}
```

### 4. `saveRound()` in `scorecard.js` is the single source of truth for persisting rounds

Every path that saves a round — manual entry, photo parse, live scoring — ultimately calls `scorecard.saveRound()`. It reads the 18 hole inputs directly from the DOM (`#h0`–`#h17`, `#p0`–`#p17`, `#fir0`–`#fir17`, `#gir0`–`#gir17`), constructs the full Round object, appends it to `state.gd.players[target].rounds`, and calls `pushGist()` then `pushSupabase()` fire-and-forget.

**Live scoring** syncs its values back into those DOM inputs via `liveSyncToManual()` before routing back to the Round tab — the user then hits Save, which calls `saveRound()` as normal.

If you need to add a field to the Round object, add it in exactly one place: `saveRound()`.

### 5. Netlify functions — full inventory

| Function | Endpoint | Auth | Purpose |
|---|---|---|---|
| `sync.js` | `/.netlify/functions/sync` | `GITHUB_TOKEN` (server) | Gist read/write proxy; IP rate-limit 60/hr; schema validation |
| `supabase.js` | `/.netlify/functions/supabase` | `SUPABASE_SERVICE_KEY` (server) | Supabase CRUD — read/saveRound/updateHandicap/deleteRound/saveMatch/active_matches |
| `ai.js` | `/.netlify/functions/ai` | `ANTHROPIC_API_KEY` (server) | Photo OCR, coaching review, stats analysis via Claude |
| `courses.js` | `/.netlify/functions/courses` | `GOLFAPI_KEY` (server) | GolfAPI.io search + detail fetch; results cached in Supabase |
| `demo-data.js` | `/.netlify/functions/demo-data` | None | Returns in-memory DEMO01 demo data (no DB, no auth) |
| `migrate-gist-to-supabase.js` | `/.netlify/functions/migrate-gist-to-supabase` | `x-admin-key` header | One-time Gist→Supabase migration worker |
| `run-migration.js` | `/.netlify/functions/run-migration` | Injected server-side | Admin trigger — proxies migrate-gist-to-supabase with `SYNC_SECRET` |
| `seed-demo.js` | `/.netlify/functions/seed-demo` | `x-admin-key` header | Seeds DEMO01 group (8 players, 40 outings) into Supabase |
| `run-seed-demo.js` | `/.netlify/functions/run-seed-demo` | Injected server-side | Admin trigger — proxies seed-demo with `SYNC_SECRET` |

---

## Environment Variables

All variables are set in the Netlify dashboard. None are ever sent to the browser.

| Variable | Used by | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | `netlify/functions/sync.js` | Read and write `golf_data.json` in the GitHub Gist |
| `ANTHROPIC_API_KEY` | `netlify/functions/ai.js` | Call the Anthropic Claude API |
| `SUPABASE_URL` | `netlify/functions/supabase.js` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | `netlify/functions/supabase.js` | Supabase service-role key (never in browser JS) |
| `SYNC_SECRET` | `netlify/functions/sync.js` (rate-limit bypass), `netlify/functions/migrate-gist-to-supabase.js` (x-admin-key), `netlify/functions/run-migration.js` (injected server-to-server) | Server-side only — never sent from browser |
| `GOLFAPI_KEY` | `netlify/functions/courses.js` | GolfAPI.io key for course search, detail fetch, and result caching via Supabase |

---

## Change Log

<!-- Add entries here newest-first: date · author · description -->

| Date | Change |
|---|---|
| 2026-03-27 | **Multi-group support** — `state.gd.groupCode` (scalar) replaced by `state.gd.groupCodes: string[]` + `state.gd.activeGroupCode: string` + `state.gd.groupMeta: { [code]: { name } }`; `loadGist()` in `api.js` auto-migrates old scalar on load; join/create flows append to `groupCodes[]` instead of overwriting; `renderGroupSwitcher()` in `leaderboard.js` renders a horizontal scrollable pill strip above the season selector (hidden when ≤1 group); `switchActiveGroup(code)` (exported) re-fetches group from Supabase and re-renders; active group persisted to `localStorage` key `gt_activegroup`; all `state.gd.groupCode` reads in `api.js`, `app.js`, `players.js`, `group.js`, `courses.js`, `live-invite.js`, `demo.js` updated to `activeGroupCode`; `.group-switcher-bar` + `.group-pill` + `.group-pill.active` CSS classes added |
| 2026-03-26 | **Demo mode rewrite** — replaced Supabase-dependent seed flow (`run-seed-demo` → `seed-demo` server-to-server → DB writes) with a new `netlify/functions/demo-data.js` that generates all demo data in-memory from the deterministic RNG in `seed-demo.js` (no auth, no DB, no timeout risk); `enterDemoMode()` in `demo.js` is now a single `GET /.netlify/functions/demo-data` fetch; `seed-demo.js` gains a `generateDemoData()` export and a guard on `createClient` so it can be safely required without env vars |
| 2026-03-26 | **Course pars/SI/yards fallback** — `_applyTee()` in `courses.js` now falls back to the built-in `BUILTIN_COURSES` (imported from `constants.js`) when GolfAPI/Supabase returns no per-hole par data (detected by all-4 pars after API application); fuzzy name matching (first two meaningful words) maps the selected course to its constants.js entry and applies verified `par` arrays and `hy` hole-yardage arrays; fixes Broadstone, Trevose, Cawder, and all other built-in UK/US courses showing par 4 everywhere; `syncPlayerMatchScore()` in `live.js` updated to find tees by colour from array format (array/object dual-support); tee option display in `_renderSelectedCard` gains `r`/`s`/`y` fallbacks for old field names |
| 2026-03-25 | **Sixes competition format** — 3-ball net points game (4-2-0 / 3-3-0 / 4-1-1 / 2-2-2 per hole); `initSixesState()`, `getSixesStandings()`, `getSixesHolePts()`, `updateSixesBanner()`, `isSixesRound()`, `sixesGetSaveData()` added to `gamemodes.js`; `state.gameMode = 'sixes'` set via `#play-sixes-btn` in Competition section (enabled only when exactly 3 players registered); `startGroupRound()` validates 3 players and calls `initSixesState()`; `liveGoto()` and `liveGroupAdj()` call `updateSixesBanner()` via dynamic import; per-player running pts shown via `.sixes-player-pts` spans in group rows and `#sixes-live-bar` standings bar; `liveUpdateRunning()` overrides header bar to show sixes standings; `sixesResult` (standings, holeBreakdown, winner) stored on each player's round object and written to Supabase `rounds.sixes_result` JSONB column (conditional spread — column must be added manually); final alert shows podium standings; `state.sixesState` reset in `cancelRound()` and after `liveGroupSave()` |
| 2026-03-25 | **Round screen restructure** — `#pg-round` split into two labelled sections: "Play a Round" (single card with all setup, format, group match, caddie CTA, and log-a-round entry cards inside) and "Competitions" (new card: Set up a Competition coming-soon toggle, Sixes 3-ball block, Join a Competition code entry); "Join a Round" section removed |
| 2026-03-25 | **Five UX/branding improvements** — (1) Home GIR card now averages across all holes regardless of par (was par-4 only); label updated to "GIR". (2) Avg vs Par card now shows last-30-day average with round count subtitle instead of last-5/season-avg delta. (3) Branding copy "Your AI caddie" replaced with "Your caddie in your pocket" on splash, onboarding, and manifest. (4) Course selected-card buttons restyled: Change Course = dark pill, Report an Issue = red pill. (5) Cormorant Garamond now restricted to `.home-kpi-val`, stats breakdown header (`#st-avg`, `#st-best` etc.), and `.lb-score`/`.bv`; removed from all live scoring CSS classes (`.live-hole-num`, `.live-info-val`, `.live-score-val`, `.live-putt-val`, `.kv`, `.tv`, `.hs`, GPS/distance classes) and all inline styles in `live.js`, `gamemodes.js`, `practice.js`, `overlay.js`, `group-match.js` |
| 2026-03-25 | **Delete round Supabase sync** — `deletePlayerRound()` in `stats.js` now calls `pushSupabase('deleteRound', { roundId })` after `pushGist()` so rounds are removed from the Supabase `rounds` table, not just the Gist |
| 2026-03-25 | **Home KPI tap to stats** — click handler added to `#home-kpis` grid calling `goTo('stats')`; `.home-kpi-card` gains `cursor:pointer` |
| 2026-03-25 | **Fix SI and hole yards** — `_applyTee()` in `courses.js` now checks legacy field names `hy`/`si`/`par` as fallbacks for Supabase-cached courses using the old golfcourseapi.com schema; `saveRound()` in `scorecard.js` fixes tee lookup (`tees.find(t => t.colour === state.stee)` instead of `tees[state.stee]`); rating/slope now check `t.rating||t.r` and `t.slope||t.s` |
| 2026-03-24 | **Course search UI** — `<select id="course-sel">` removed from `index.html`; replaced with `<div id="course-search-container">` populated by `initCourseSearch()` from `courses.js`; `populateCourses()` removed, `players.js` now calls `initCourseSearch()` on sign-in; all `getElementById('course-sel')` reads across `live.js`, `scorecard.js`, `gps.js`, `ai.js`, `app.js` replaced with `getCourseByRef()`; `clearCourseSelection()` added to `courses.js` and called by `scorecard.js` after saving a round; `onCourseChange` removed (logic now internal to `_applyCourse()`); `.cs-*` CSS classes moved from comment block in `courses.js` into `styles/app.css`; `netlify/functions/courses.js` rewritten for GolfAPI.io with Supabase caching; `GOLFAPI_KEY` env var required |
| 2026-03-24 | **Admin migration trigger** — new `netlify/functions/run-migration.js` proxies `migrate-gist-to-supabase` server-to-server, injecting `SYNC_SECRET` from `process.env` so it never reaches the browser; admin panel gains a "Supabase Migration" section with a Run button and inline result display; `adminRunMigration()` exported from `admin.js` and exposed as `window._adminRunMigration` |
| 2026-03-24 | **Non-blocking save banner** — `alert()` after `saveRound()` in scorecard.js replaced with a self-removing DOM banner (4 s timeout); `alert()` was blocking the JS microtask queue and preventing `pushSupabase().then()` from firing |
| 2026-03-24 | **Remove SYNC_SECRET from browser** — hardcoded `SYNC_SECRET` constant removed from `js/api.js` entirely; all `x-sync-secret` fetch headers removed; secret check removed from `netlify/functions/sync.js` POST handler (rate limiting + schema validation remain); secret check removed from `netlify/functions/supabase.js`; `CORS Allow-Headers` updated to drop `x-sync-secret` in both functions; `migrate-gist-to-supabase.js` still reads `process.env.SYNC_SECRET` server-side via `x-admin-key` |
| 2026-03-24 | **GIR derive on putts-only entry** — `showPuttsOnlyEntry()` modal now recalculates `r.gir` for all 18 holes on save using the same formula; preserves existing GIR where score or putts are missing |
| 2026-03-24 | **GIR auto-populate** — in `buildSC()` scorecard input bindings, `autoGir()` fires on every score or putts input event; formula: `(score − putts) <= (par − 2)` → Yes, otherwise No; user can still override manually |
| 2026-03-24 | **Supabase parallel migration** — Gist→Supabase dual-write: new `netlify/functions/supabase.js` handles read/saveRound/updateHandicap/deleteRound/saveMatch actions; `js/api.js` gains `pushSupabase()` (exported), `loadSupabase()`, `mergeSupabaseData()`, `supabaseRoundToApp()`; `loadGist()` calls `loadSupabase()` after completing so Supabase data merges on top; `saveRound()` in scorecard.js and live.js finish path both fire `pushSupabase` fire-and-forget after pushGist; status indicator shows "Synced ✓" (both ok), "⚠ Gist only" (Supabase fail), unchanged on Gist fail; `.sdot.warn` amber style added; `netlify/functions/migrate-gist-to-supabase.js` one-time migration script (GET, x-admin-key header); root `package.json` created with `@supabase/supabase-js ^2.0.0` (Netlify requires root-level dep); `SUPABASE_SERVICE_KEY` never in browser JS — netlify/functions only |
| 2026-03-23 | **GIR/FIR charts** — GIR % by hole type: three trend lines (par 3/4/5) across last 10 rounds with GIR data; FIR % single trend line across last 10 rounds; home KPI split card updated to show par 4 GIR% with "GIR (par 4)" label; both charts skip rounds with no recorded data silently; dc() called before each render |
| 2026-03-21 | **Phase 0 security hardening** — `sync.js`: SYNC_SECRET env var checked on every POST via `x-sync-secret` header (guarded by `if (syncSecret)` — safe to deploy before env var is set); `validatePayload()` rejects malformed/malicious payloads (players object with rounds arrays, optional numeric handicap, alphanumeric groupCode); in-memory rate limiting 60 writes/hour/IP (429 on exceed, resets on cold start); security maintenance comment block with token rotation instructions. `api.js`: `SYNC_SECRET` constant; `x-sync-secret` header on every POST; 429 handled with `ss('err', 'Too many saves — wait a moment')` |
| 2026-03-21 | **Match context prompt** — post-save bottom sheet shown after any round save (live or manual); tag playing partners, flag handicap use; stores `playedWith`, `matchHandicaps`, `handicapsUsed` on round object; `showMatchContextSheet(playerName, roundId)` in `players.js`; `pushGist()` called once on save |
| 2026-03-21 | **Pre-round handicap modal** — shown when 2+ players selected; calculates playing handicap (`round(hcpIndex × slope/113)`) per player using selected tee slope; inline number input for override stored in `state.liveState.hcpOverrides`; modal skipped for solo rounds |
| 2026-03-21 | **AI scorecard reader** — `parsePhoto()` prompt updated to extract SI per hole (validated: 18 unique values 1–18, stored to `state.scannedSI`) and all tees found on card (`state._scannedTeeRatings`); `buildSC()` falls back to `state.scannedSI` when course has no SI; `scanCourseCard()` stores per-tee ratings and renders editable per-tee rating/slope inputs (`#tee-ratings-detail`); `saveCourse()` uses per-tee rating/slope rather than one global value |
| 2026-03-21 | **Wolf fixes** — drag-to-reorder player setup (HTML5 drag + iOS touch); single centred partner-selection modal replaces sequential prompts + countdown; 6-pointer modal centred and re-selectable until wolf's score first changed (`wolfShotStarted` per hole); Wolf round saves to all 4 player profiles in one `pushGist()` call |
| 2026-03-20 | **Wolf game mode** — new `js/gamemodes.js` module; `state.gameMode` ('stroke'\|'match'\|'wolf'); Wolf requires 4 players, scoring engine with Lone Wolf / Six-pointer declarations, per-hole partner selection modal with 10 s auto-dismiss, Wolf scoreboard, standings persisted to `round.wolfResult`; `state.wolfState` holds order + hole results |
| 2026-03-20 | **Looper rebrand** — renamed app from "RRGs Tracker" to "Looper" throughout UI, manifest, splash, and onboarding; replaced Viking logo with new Looper caddie mascot (`/assets/looper-logo.png`); new tagline "Your AI caddie" |
