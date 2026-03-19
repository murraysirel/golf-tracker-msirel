# CLAUDE.md — Architecture Reference

## Product Summary

RRGs Tracker is a mobile-first progressive web app for a small group of golfers to record, compare, and analyse their rounds together. Players enter scores manually or via AI-parsed scorecard photos, track live hole-by-hole scoring (including multi-player groups and match play), and view personal stats (handicap trend, Stableford points, FIR/GIR charts) alongside a shared group leaderboard with nine ranking views. AI features — powered by Anthropic Claude via a Netlify proxy — cover scorecard OCR, post-round coaching reviews, multi-round stats analysis, and personalised practice-session planning.

---

## Architecture Overview

```
Browser (PWA, vanilla JS ES modules, no build step)
  │
  ├── index.html          ← entire app shell (all pages, modals, navbar in one file)
  ├── styles/app.css      ← design system via CSS custom properties
  └── js/*.js             ← 17 ES module files, entry point is app.js
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
| `api.js` | `loadGist()` / `pushGist()` — Gist ↔ `state.gd` sync; `ss()` updates the status dot |
| `scorecard.js` | `buildSC()` renders the 18-hole input table; `saveRound()` collects DOM values, computes breakdown, appends to `state.gd`, calls `pushGist()` |
| `live.js` | Hole-by-hole live scoring UI; multi-player group mode; match play tracking; syncs back to manual scorecard before saving |
| `competition.js` | "Live" nav tab — activity feed + today's leaderboard; polls Gist every 45 s and diffs snapshots |
| `stats.js` | KPI cards, five Chart.js charts, Stableford calculator, handicap edit, round history list |
| `leaderboard.js` | Nine season-filtered ranking panels; imports `calcStableford` and `isBufferOrBetter` from `stats.js` |
| `players.js` | Onboarding/sign-in, player management, initials generation, "who's playing today" selector |
| `courses.js` | Course selector, AI course-card scanner, golfcourseapi.com search/import, custom course CRUD |
| `gps.js` | `watchPosition` GPS, Haversine distance-to-green, tee/green coord pinning stored in `state.gd` |
| `ai.js` | Scorecard photo parsing, post-round coaching review, multi-round stats analysis — all via `/.netlify/functions/ai` |
| `practice.js` | AI practice-plan generation (Claude), session logging with drill-by-drill shot counting |
| `group.js` | Group code, season CRUD, "delete my data", clipboard helpers |
| `admin.js` | Password-protected admin panel — round deletion (logged to `deletionLog`), course-correction application |
| `export.js` | XLSX export using global `XLSX` — two sheets: All Rounds + Hole Data |

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
  statsFilter,     // Active filter: '5'|'10'|'all'|'month'|'course'
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
  aiReview?: { positive, negative, drill }   // optional, added post-save
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

### 3. `saveRound()` in `scorecard.js` is the single source of truth for persisting rounds

Every path that saves a round — manual entry, photo parse, live scoring — ultimately calls `scorecard.saveRound()`. It reads the 18 hole inputs directly from the DOM (`#h0`–`#h17`, `#p0`–`#p17`, `#fir0`–`#fir17`, `#gir0`–`#gir17`), constructs the full Round object, appends it to `state.gd.players[target].rounds`, and calls `pushGist()`.

**Live scoring** syncs its values back into those DOM inputs via `liveSyncToManual()` before routing back to the Round tab — the user then hits Save, which calls `saveRound()` as normal.

If you need to add a field to the Round object, add it in exactly one place: `saveRound()`.

---

## Environment Variables

Both variables are set in the Netlify dashboard. Neither is ever sent to the browser.

| Variable | Used by | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | `netlify/functions/sync.js` | Read and write `golf_data.json` in the GitHub Gist |
| `ANTHROPIC_API_KEY` | `netlify/functions/ai.js` | Call the Anthropic Claude API |

---

## Change Log

## Change log

<!-- Add entries here newest-first: date · author · description -->

| Date | Change |
|---|---|
| 2026-03-19 | **Light mode** — `[data-theme="light"]` CSS variables (Schoolhouse White palette); `--wa-*` and `--chart-*` tokens replace all `rgba(255,255,255,...)` occurrences; Chart.js uses `cc()` helper for theme-aware tick/grid colors; Dark/Light toggle in profile panel persisted to `localStorage` key `rr_theme`; theme applied at boot in `app.js` before splash fades |
| 2026-03-19 | **Caddie View** — full-screen GPS + scoring overlay (`js/caddie.js`, `#caddie-view`); `gps.js` now populates `caddie-dist-{front,mid,back}`; Wake Lock API for screen-on during round |
| 2026-03-19 | **Floating Caddie button** — draggable `#caddie-btn` appears above tab bar when `startGroupRound()` fires (`state.roundActive`), disappears when round finishes |
| 2026-03-19 | **Nav reduced to 5 tabs** — Live and Players tabs removed from bottom nav; Players & Settings moved to a slide-in profile panel (`#profile-panel`) triggered by a circular icon in the header |
