# CLAUDE.md — Architecture Reference

## Product Summary

Looper is a mobile-first progressive web app — your AI caddie — for a small group of golfers to record, compare, and analyse their rounds together. Players enter scores manually or via AI-parsed scorecard photos, track live hole-by-hole scoring (including multi-player groups and match play), and view personal stats (handicap trend, Stableford points, FIR/GIR charts) alongside a shared group leaderboard with nine ranking views. AI features — powered by Anthropic Claude via a Netlify proxy — cover scorecard OCR, post-round coaching reviews, multi-round stats analysis, and personalised practice-session planning.

---

## Architecture Overview

```
Browser (PWA, vanilla JS ES modules, no build step)
  │
  ├── index.html          ← entire app shell (all pages, modals, navbar in one file)
  ├── styles/app.css      ← design system via CSS custom properties
  └── js/*.js             ← 18 ES module files, entry point is app.js
         │
         ├── /.netlify/functions/sync  ← GitHub Gist proxy (sync.js)
         │       └── GitHub Gist: golf_data.json  ← single source of truth
         │           (localStorage key gt_localdata = offline fallback)
         │
         └── /.netlify/functions/ai   ← Anthropic Claude proxy (ai.js)
                 └── claude-haiku-4-5-20251001
```

Netlify hosts both the static frontend and the two serverless functions. No build step; the repo ships as-is. Auto-deploys from `main`.

---

## Module List (`js/`)

| File | Responsibility |
|---|---|
| `state.js` | Exports the single mutable `state` singleton imported by every other module |
| `constants.js` | `PAGES`, `COURSES` array (20 built-in), tee-colour map `TC`, `DEFAULT_GIST`, `API` |
| `app.js` | Entry point — imports every module, binds all DOM event listeners, calls `registerNavHandlers`, kicks off `loadGist()` |
| `nav.js` | SPA routing: `goTo(page)`, `switchEntry(type)`, `registerNavHandlers()` (circular-dep workaround) |
| `api.js` | `loadGist()` / `pushGist()` / `pushSupabase()` — Gist ↔ `state.gd` sync; Supabase parallel write; `ss()` updates the status dot |
| `scorecard.js` | `buildSC()` renders the 18-hole input table; `saveRound()` collects DOM values, computes breakdown, appends to `state.gd`, calls `pushGist()` then `pushSupabase()` fire-and-forget |
| `live.js` | Hole-by-hole live scoring UI; multi-player group mode; match play tracking; syncs back to manual scorecard before saving; exports `cancelRound()` to reset live state and hide the caddie button |
| `competition.js` | "Live" nav tab — activity feed + today's leaderboard; polls Gist every 45 s and diffs snapshots |
| `stats.js` | KPI cards, five Chart.js charts, Stableford calculator, handicap edit, round history list |
| `leaderboard.js` | Nine season-filtered ranking panels; imports `calcStableford` and `isBufferOrBetter` from `stats.js` |
| `players.js` | Onboarding/sign-in, player management, initials generation, "who's playing today" selector |
| `courses.js` | Course search UI (`initCourseSearch()` mounts into `#course-search-container`), `getCourseByRef()` returns the active course object, `clearCourseSelection()` resets it; AI course-card scanner; custom course CRUD; `_applyCourse()` sets `state.cpars`/`state.activeCourse` and rebuilds the scorecard |
| `gps.js` | `watchPosition` GPS, Haversine distance-to-green, tee/green coord pinning stored in `state.gd` |
| `ai.js` | Scorecard photo parsing, post-round coaching review, multi-round stats analysis — all via `/.netlify/functions/ai` |
| `practice.js` | AI practice-plan generation (Claude), session logging with drill-by-drill shot counting |
| `group.js` | Group code, season CRUD, "delete my data", clipboard helpers |
| `admin.js` | Password-protected admin panel — round deletion (logged to `deletionLog`), course-correction application, Supabase migration trigger |
| `export.js` | XLSX export using global `XLSX` — two sheets: All Rounds + Hole Data |
| `gamemodes.js` | Wolf + Match Play game mode engine; `setGameMode()`, `updateFormatUI()`, Wolf state init/scoring/banners/scoreboard, `isWolfRound()` |

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
  statsFilter,     // Active filter: '5'|'all'|'month'|'course'  (Last 10 option removed)
  gameMode,        // 'stroke' | 'match' | 'wolf'
  wolfState: {
    order[],         // Player name turn order (hole 1 wolf = order[0])
    holes[]          // Per-hole result objects from scoreWolfHole()
  },
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
    matchResult          // match state (leader, holesUp, result)
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
  aiReview?: { positive, negative, drill },  // optional, added post-save
  matchResult?: { ... },                     // optional, set when match play round saved
  wolfResult?: { order, holes, winner }      // optional, set when Wolf round saved
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

---

## Coding Conventions

- **No framework, no build step.** Vanilla ES modules (`type="module"` on the `<script>` tag in `index.html`).
- **Single HTML file.** All pages, modals, and the navbar live in `index.html`. New UI goes there.
- **DOM access.** Always via `document.getElementById('id')?.` — optional chaining everywhere for safety. IDs are short and kebab-case (`#h0`, `#sdot`, `#comp-feed`).
- **Module imports.** Named ES module exports only — no default exports. Circular dependencies are broken by the `registerNavHandlers` pattern (see below). `app.js` is the only module that imports every other module.
- **State mutation.** All modules import `state` from `state.js` and mutate it directly. No Redux, no events, no proxies.
- **Dates.** GB format `'DD/MM/YYYY'` everywhere. Parsed for comparison with `parseDateGB()` in `stats.js`.
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
| 2026-03-20 | **Home KPI polish** — Avg vs Par (card 1): prorates across however many rounds exist; labels "last N rounds" in `var(--dim)` until 5 rounds, then shows ↑/↓/→ delta vs season avg. Birdies (card 3): year delta removed, only vs-last-month delta shown. GIR/FIR split card: `max-width:46%` + `overflow:hidden` on both halves, value font 20px, delta font 9px, delta text shortened to "↑ X.X%" to prevent overflow across diagonal. Leaderboard avatar (`.lb-avatar-me`): standardised to DM Sans 13px/700 matching all other avatar circles |
| 2026-03-20 | **Home KPI delta lines** — Card 1 (Avg vs Par): delta compares last-5 avg vs current season avg; prorated for fewer than 5 rounds (see polish entry). Card 2 (Best Round): meta split into two stacked 11px lines — course name (truncated to 16 chars) and "Mar 18" formatted date. Card 3 (Birdies): vs last month only. Card 4 (GIR/FIR): deltas compare last-5 vs season avg using raw float percentages (toFixed(1)), shortened to "↑ X.X%". All date filtering uses `date.split('/')` field indexing — never `new Date()` on DD/MM/YYYY strings |
| 2026-03-20 | **Player initials in header avatar** — `.avatar-btn` now shows the current player's two-letter initials (`#hdr-avatar-initials`) instead of a person SVG; populated by `renderHomeStats()` via `initials()` from `players.js` |
| 2026-03-20 | **Cancel round** — `cancelRound()` exported from `live.js`; resets all `liveState` fields, clears `state.roundActive`, removes `.visible`/`.in-progress` from `#caddie-btn`, releases wake lock, navigates home. Two entry points: "Cancel" ghost button on group setup screen (`#live-cancel-setup-btn`) and "✕ End" text button on the right of the live hole-view sticky header (`#live-cancel-round-btn`) |
| 2026-03-20 | **Stats filter pills** — removed "Last 10" pill; remaining filters: Last 5, Month, Course, All time. `statsFilter` type is now `'5'|'all'|'month'|'course'` |
| 2026-03-20 | **Home screen layout restructure** — slim header replaces logo/wordmark/sync-pill: left side shows time-based greeting ("Good morning/afternoon/evening, [firstName]") + "HCP X · N rounds this season"; right side keeps avatar button. Sync status dot+text moved into profile panel as a 12px status line below the panel header. Hero card (avatar circle, full name, Ready-to-play dot, large HCP) removed. 2×2 KPI grid added directly below header: Avg vs Par, Best Round, Birdies (with bird SVG), GIR/FIR diagonal split card (absolute-positioned halves with SVG divider). Recent Rounds section updated: 11px/600 uppercase heading, "See all" link, score diff colour thresholds (birdie ≤−3, par ≤+3, bogey ≤+10, double +11+). Full-width gold "Play with the Caddie 🏌️" CTA at bottom wired to `goTo('live')`. CSS: `.hdr` padding/background updated; `.home-kpi-*` class family added |
| 2026-03-20 | **Match Play format pill fix** — `updateFormatUI()` in `gamemodes.js` now tracks `matchBtn` and `matchHint`; toggles `.active` on `#fmt-match` when `state.gameMode === 'match'`; stroke pill only active when neither wolf nor match is selected |
| 2026-03-20 | **Global micro-animations** — `@keyframes fadeUp` card entrance stagger extended to nth-child(5); `.btn/.btn-o/.btn-ghost` `:active` scale(0.93) press feedback with 80ms transition; scorecard extra stats (penalties/bunkers/chips) hidden by default behind "More +/Less −" JS toggle (`.scorecard-table` / `.sc-extra-cols` / `toggleSCExtras()` in `scorecard.js`); replaces native `<details>` element |
| 2026-03-20 | **Caddie score entry** — scores pre-filled to par on first hole visit; `.live-score-btn` 44×44px, `var(--mid)` bg, 24px/300 font, no border; `.live-score-val` 26px/700, min-width 52px; FIR/GIR replaced with `.live-toggle-pill` pill buttons ("Fairway Hit"/"Green in Reg"); `active-fir`=green, `active-gir`=blue; FIR hidden on par-3s; `scoreCol()` used for score colour; `@keyframes scoreBounce` + `.score-bounce` on +/− tap |
| 2026-03-20 | **Profile panel close button** — avatar icon cross-fades to ✕ when panel open via `.avatar-btn` + `.avatar-initials`/`.avatar-close` CSS opacity toggle on `.panel-open` class |
| 2026-03-20 | **Rolling ball splash screen** — replaced wink/shrink animation with golf ball rolling in from left, logo spinning on ball, grass strip SVG, title/tagline fade-in; `prefers-reduced-motion` respected; `loadGist()` runs in parallel |
| 2026-03-20 | **Caddie button fix** — tapping caddie button mid-round restores current hole view without reinitialising; green dot (`.caddie-dot`, `.in-progress`) shows when round active |
| 2026-03-20 | **Home screen declutter** — Quick Actions button grid and gold gradient divider removed; dead event listeners removed from `app.js`; profile panel export label → "Export my data" |
| 2026-03-20 | **Home KPI cards** — birdie card gets inline 16×16 bird SVG; new GIR%/FIR% combined `.kpi` block with delta vs prior calendar month; `renderHomeStats()` in `stats.js` updated |
| 2026-03-20 | **Game format pills** — Stroke Play pill renamed to "Stroke / Stableford"; Match Play added as a first-class format pill (`#fmt-match`, `state.gameMode = 'match'`) alongside Wolf; selecting Match Play auto-inits `state.liveState.matchPlay` and `matchResult` on round start; validates exactly 2 players at start; old `#live-matchplay-row` toggle hidden (replaced by pill) |
| 2026-03-20 | **Wolf game mode** — new `js/gamemodes.js` module; `state.gameMode` ('stroke'\|'match'\|'wolf'); Wolf requires 4 players, scoring engine with Lone Wolf / Six-pointer declarations, per-hole partner selection modal with 10 s auto-dismiss, Wolf scoreboard, standings persisted to `round.wolfResult`; `state.wolfState` holds order + hole results |
| 2026-03-20 | **Looper rebrand** — renamed app from "RRGs Tracker" to "Looper" throughout UI, manifest, splash, and onboarding; replaced Viking logo with new Looper caddie mascot (`/assets/looper-logo.png`); new tagline "Your AI caddie" |
| 2026-03-19 | **Round entry redesign** — removed 4-tab bar; replaced with three compact entry cards (Type it in / Scan scorecard / Add a course) + a full-width "Play with the Caddie 🏌️" pill CTA; CTA shows inline course selector when no course selected, otherwise launches unified live screen directly |
| 2026-03-19 | **Caddie button restyled** — changed from gold circle to subtle pill (`var(--mid)` bg, 1px gold border, grip-line SVG, `box-shadow: 0 4px 16px rgba(0,0,0,.35)`); clicking returns to `#pg-live` instead of opening an overlay |
| 2026-03-19 | **Unified Caddie+Live screen** — `#caddie-view` overlay removed; `#pg-live` now contains full GPS distance block (front/mid/back yards) + per-player scoring rows + sticky header + fixed footer; GPS auto-starts on round launch; Wake Lock prompted once and persisted to `localStorage` key `rr_wakelock` |
| 2026-03-19 | **Light mode** — `[data-theme="light"]` CSS variables (Schoolhouse White palette); `--wa-*` and `--chart-*` tokens replace all `rgba(255,255,255,...)` occurrences; Chart.js uses `cc()` helper for theme-aware tick/grid colors; Dark/Light toggle in profile panel persisted to `localStorage` key `rr_theme`; theme applied at boot in `app.js` before splash fades |
| 2026-03-19 | **Caddie View** — full-screen GPS + scoring overlay (`js/caddie.js`, `#caddie-view`); `gps.js` now populates `caddie-dist-{front,mid,back}`; Wake Lock API for screen-on during round |
| 2026-03-19 | **Floating Caddie button** — draggable `#caddie-btn` appears above tab bar when `startGroupRound()` fires (`state.roundActive`), disappears when round finishes |
| 2026-03-19 | **Nav reduced to 5 tabs** — Live and Players tabs removed from bottom nav; Players & Settings moved to a slide-in profile panel (`#profile-panel`) triggered by a circular icon in the header |
