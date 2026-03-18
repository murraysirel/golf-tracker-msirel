# RRGs Tracker — Engineering Reference

## Overview

RRGs Tracker is a single-page golf tracking web app built with vanilla JavaScript ES modules, no build step and no framework. Data is persisted to a GitHub Gist via a Netlify serverless proxy, with `localStorage` as an offline fallback. AI features (scorecard parsing, coaching reviews, practice plans) are routed through a second Netlify function that proxies the Anthropic Claude API.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS ES modules, single `index.html` |
| Styling | Custom CSS (`styles/app.css`), CSS custom properties |
| Charts | Chart.js (global, loaded via CDN) |
| Spreadsheet export | SheetJS / XLSX (global, loaded via CDN) |
| Fonts | DM Sans, Cormorant Garamond (Google Fonts) |
| Backend | Netlify serverless functions (Node.js) |
| Data store | GitHub Gist (`golf_data.json`) |
| AI | Anthropic Claude (`claude-haiku-4-5-20251001`) |
| GPS | Browser Geolocation API |
| Deployment | Netlify (auto-deploy from `main`) |

---

## Repository Structure

```
/
├── index.html                  # Entire app shell — all pages, modals, navbar
├── styles/
│   └── app.css                 # Design system, CSS custom properties, components
├── js/
│   ├── state.js                # Shared mutable state singleton
│   ├── constants.js            # PAGES, COURSES, tee colours, API endpoint
│   ├── app.js                  # Entry point — imports, event bindings, init
│   ├── api.js                  # Gist load/save + sync status indicator
│   ├── nav.js                  # SPA routing (goTo, switchEntry)
│   ├── scorecard.js            # Round entry, score calculation, save
│   ├── live.js                 # Hole-by-hole live scoring UI
│   ├── competition.js          # Live competition feed + today's leaderboard
│   ├── stats.js                # Stats rendering, Chart.js charts, Stableford calc
│   ├── leaderboard.js          # Multi-player leaderboard (9 views)
│   ├── players.js              # Onboarding, player management, initials
│   ├── courses.js              # Course selector, AI course card scanner
│   ├── gps.js                  # GPS distance-to-green tracking
│   ├── ai.js                   # AI scorecard parsing and coaching review
│   ├── practice.js             # AI practice plan generation and session logging
│   ├── group.js                # Group code, seasons, data deletion
│   ├── admin.js                # Password-protected admin panel
│   └── export.js               # XLSX round data export
├── netlify/
│   └── functions/
│       ├── sync.js             # GitHub Gist proxy (GET/POST)
│       └── ai.js               # Anthropic Claude API proxy
├── netlify.toml                # Netlify build config and function routing
└── docs/
    └── README.md
```

---

## Pages

The app is a single HTML file with 10 named page divs (`id="pg-*"`). Navigation calls `goTo(pageName)` which shows/hides divs and fires the appropriate render function.

| Page ID | Nav trigger | Purpose |
|---|---|---|
| `pg-home` | Home | Dashboard — recent rounds, quick KPIs |
| `pg-round` | Round | Score entry (Manual / Photo / Course tabs) |
| `pg-live` | Round → Live tab | Hole-by-hole live scoring |
| `pg-competition` | Live nav button | Activity feed + today's leaderboard |
| `pg-stats` | Stats | Charts, handicap, filter pills, AI review |
| `pg-leaderboard` | Board | Season-filtered multi-player leaderboard |
| `pg-practice` | Practice | AI practice plans and session logging |
| `pg-players` | Players | Group management, seasons, data export |

The `pg-live` scoring page is accessed only from the Round tab's Live subtab. The main Live nav button routes to `pg-competition`.

---

## Module Reference

### `state.js` — Shared State

Exports a single `state` object imported by every other module. Never reset; mutated in place.

```js
state = {
  gd,             // Global data object (players, groupCode, seasons, customCourses, greenCoords, deletionLog)
  me,             // Current player name (string)
  cpars,          // Array(18) — current course pars
  stee,           // Current tee colour key (string)
  photoFile,      // File object for scorecard photo upload
  statsFilter,    // Active filter: '5' | '10' | 'all' | 'month' | 'course'
  liveState,      // { hole, scores[], putts[], fir[], gir[], notes[] }
  courseCardFile, // File object for course card scan
  scannedPars,    // Array(18)
  scannedSI,      // Array(18)
  scannedYards,   // Object keyed by tee
  scoringFor,     // Player name being scored for (multi-player)
  practiceState,  // { area, plan, currentDrillIndex, shotsLogged, sessionId }
  gpsState        // { watching, watchId, target, coords }
}
```

---

### `constants.js` — Configuration

| Export | Value |
|---|---|
| `DEFAULT_GIST` | `089c0ed169b5c67dbd8846002b3def45` |
| `API` | `/.netlify/functions/sync` |
| `PAGES` | `['home','round','live','stats','leaderboard','practice','players','competition']` |
| `TC` | Tee colour map: `{ blue, yellow, white, red, black }` → `{ l, d }` |
| `COURSES` | Array of 20 pre-configured courses with per-tee par/rating/slope/yardage |

---

### `api.js` — Gist Sync

| Export | Description |
|---|---|
| `loadGist()` | GET from sync function → parse JSON → `state.gd`. Falls back to `localStorage` key `gt_localdata`. Seeds default player if absent. |
| `pushGist()` | POST `state.gd` to sync function. Always writes to `localStorage` first. |
| `ss(status, msg)` | Updates sync status dot (`#sdot`) and text (`#stext`). Status: `'ok' \| 'syncing' \| 'err'`. |

---

### `nav.js` — Routing

| Export | Description |
|---|---|
| `registerNavHandlers(handlers)` | Called once at boot from `app.js` to register page renderers without circular imports |
| `goTo(page)` | Show target page div, hide others, update navbar active state, call page renderer |
| `switchEntry(type)` | Toggle between `'manual'`, `'photo'`, `'course'` sub-tabs within the Round page |

Page renderers registered: `renderStats`, `renderLeaderboard`, `renderAllPlayers`, `renderHomeStats`, `renderPracticePage`, `initLiveRound`, `initCompetition`.

---

### `app.js` — Entry Point

Imports every module and wires all DOM event listeners. Initialises the app:

```js
loadGist().then(() => renderOnboard());
```

The splash screen fades out after 2.3 seconds. All `getElementById` calls use optional chaining (`?.`) for safety.

---

### `scorecard.js` — Round Entry

| Export | Description |
|---|---|
| `buildSC()` | Renders 18-hole scorecard table with score/putts/FIR/GIR inputs |
| `recalc()` | Recomputes running totals (OUT, IN, total, vs par) from current inputs |
| `saveRound()` | Validates, computes scoring breakdown, appends round to player, calls `pushGist()` |
| `autoAdv()` | Auto-advances to next input after score entry (60ms debounce) |
| `scoreClass(d)` | Returns CSS class name for a score-vs-par delta |
| `scoreCol(d)` | Returns CSS colour variable for a score-vs-par delta |

**Saved round object:**
```js
{
  id, player, course, loc, tee, date, notes,
  pars[], scores[], putts[], fir[], gir[],
  totalScore, totalPar, diff,
  birdies, parsCount, bogeys, doubles, eagles,
  penalties, bunkers, chips, rating, slope
}
```

---

### `live.js` — Live Scoring

Hole-by-hole scoring for an in-progress round. Syncs back to the manual scorecard (`liveSyncToManual`) on every adjustment so saving still works through `scorecard.saveRound`.

| Export | Description |
|---|---|
| `initLiveRound()` | Seeds live state from manual scorecard inputs, renders hole 1 |
| `liveGoto(h)` | Navigate to hole `h` (0-indexed), update all UI elements |
| `liveAdj(field, delta)` | Adjust score (1–15) or putts (0–6) by delta |
| `liveSetToggle(field, val)` | Toggle FIR/GIR value for current hole |
| `liveNextOrFinish()` | Advance to next hole, or on hole 18 sync all and navigate to Round tab |
| `liveRenderPips()` | Render 18 pip indicators (active/done/eagle/birdie/bogey/double) |

---

### `competition.js` — Competition Mode

Drives the Live nav tab. Polls the Gist every 45 seconds and diffs the returned state against its last known snapshot.

| Export | Description |
|---|---|
| `initCompetition()` | Take initial snapshot, wire format toggles, render both panels, start polling interval |

**Internal functions:**
- `pollAndUpdate()` — `loadGist()` → diff → append events → re-render
- `diffSnapshots(old, new)` — finds rounds in `today's date` absent from old snapshot; surfaces birdies (Δ = −1) and eagles (Δ ≤ −2) from each new round
- `renderActivityFeed()` — renders reverse-chronological event list (`#comp-feed`)
- `renderCompLeaderboard()` — renders today's standings (`#comp-lb`), sorted by Stableford or Gross
- `setFormat(fmt)` — switches between `'stableford'` and `'gross'`

**Module-level state (in-memory, lost on reload):**
```js
_lastSnapshot  // deep copy of state.gd at last poll
_pollInterval  // setInterval reference
_feed          // array of up to 50 event objects
_format        // 'stableford' | 'gross'
_lastPollTime  // timestamp of last successful poll
```

---

### `stats.js` — Statistics & Charts

| Export | Description |
|---|---|
| `renderStats()` | Full stats page render — KPIs, all charts, round history |
| `renderHomeStats()` | Home page KPI summary and 3 most recent rounds |
| `setFilter(f)` | Set active filter and re-render |
| `toggleHcpEdit()` / `saveHandicap()` | Handicap inline edit |
| `parseDateGB(d)` | `'DD/MM/YYYY'` → numeric for sort comparison |
| `getFilteredRounds(all)` | Apply active filter to rounds array |
| `calcStableford(scores, pars, hcp, slope, si)` | Stableford points (SI-aware) |
| `isBufferOrBetter(round, hcp)` | Returns `true` if net diff ≤ +2 |
| `dc(key)` / `CO` | Destroy chart instance / base Chart.js options |

**Charts rendered:**
| ID | Type | Data |
|---|---|---|
| `ch-donut` | Doughnut | Eagles / Birdies / Pars / Bogeys / Doubles |
| `ch-trend` | Line | Score vs par per round (integer y-axis, step 1) |
| `ch-holes` | Bar | Avg score vs par per hole (0.5 y-step) |
| `ch-putts` | Bar | Avg putts per hole (0.5 y-step, min 0) |
| `ch-fg` | Bar (grouped) | FIR% and GIR% per hole (0–100%) |

**Stableford formula:**
```
Playing HCP = round(handicapIndex × slope / 113)
Strokes distributed by SI if available, else linearly
Points: Δ≤−3→5, Δ=−2→4, Δ=−1→3, Δ=0→2, Δ=+1→1, Δ≥+2→0
```

---

### `leaderboard.js` — Multi-Player Leaderboard

Renders 9 ranking panels, each sorted by a different metric. Filtered by season selector. Uses `calcStableford` and `isBufferOrBetter` from `stats.js`.

**Views:** Avg vs par · Scoring points (eagles ×3 + birdies ×1) · Avg Stableford · Avg Net Score · Buffer-or-better count · Fewest doubles · Best single Stableford · Most birdies in a round · Best gross round.

---

### `courses.js` — Course Management

| Export | Description |
|---|---|
| `getCourseByRef(ref)` | Find course by name from built-in COURSES or `state.gd.customCourses` |
| `populateCourses()` | Build `<select>` options from built-in + custom courses |
| `onCourseChange()` | Update `state.cpars`, `state.stee`, rebuild scorecard |
| `scanCourseCard()` | Send course card image to AI function, parse returned JSON, show edit grid |
| `saveCourse()` | Validate and persist scanned course to `state.gd.customCourses` |
| `handleCoursePhoto(input)` | Load file, show preview, enable scan button |
| `renderScannedCourses()` | Render custom courses list with delete buttons |

---

### `gps.js` — GPS Distance

Uses `navigator.geolocation.watchPosition` with high-accuracy mode. Distances computed via the Haversine formula. Green positions stored in `state.gd.greenCoords[courseName][hole]` as `{ lat, lng }`.

| Export | Description |
|---|---|
| `startGPS()` | Begin watching position, update display on each position update |
| `stopGPS()` | Clear watch, hide GPS bar |
| `gpsSetTarget(t)` | Switch active target: `'front' \| 'mid' \| 'back'` |
| `pinGreenPosition()` | Save current position as green centre for this hole |

Front/back estimates are approximated at ±0.00015° latitude from the pinned centre.

---

### `ai.js` — AI Features

All requests go to `/.netlify/functions/ai` which proxies to Claude.

| Export | Description |
|---|---|
| `handlePhoto(input)` | Load scorecard image file → base64, show preview |
| `parsePhoto()` | Send image + course context to Claude, parse JSON scores, populate scorecard |
| `generateAIReview()` | Send selected round stats to Claude, render coaching review |
| `generateStatsAnalysis()` | Send last 5 rounds summary, render multi-round analysis |
| `clearStatsAnalysis()` | Remove saved analysis from player object |

**Photo parsing response schema:**
```js
{ scores: [], putts: [], outTotal, inTotal, confidence: 'high'|'medium'|'low' }
```

**Review response schema:**
```js
{ positive: string, negative: string, drill: string }
```

**Stats analysis response schema:**
```js
{ positive: string, negative: string, drill: string, handicap: string }
```

---

### `practice.js` — Practice Sessions

| Export | Description |
|---|---|
| `renderPracticePage()` | Render area selector and session history |
| `selectPracticeArea(area)` | Set active area, trigger AI plan generation |
| `startPracticeSession()` | Begin session with generated plan |
| `logPracticeShots(n)` | Add n shots to current drill, advance when complete |
| `completePracticeSession()` | Save session to `player.practiceSessions`, reset state |
| `regeneratePlan()` | Re-generate AI plan for current area |

**Practice areas:** putting · chipping · pitching · irons · driving · course management · bunker play · ai-recommended

**Plan generated by Claude, returned as JSON:**
```js
{
  title, focus, warmup,
  drills: [{ name, shots, instruction, target, successMetric, tip }],
  cooldown, keyTakeaway
}
```

---

### `players.js` — Player Management

| Export | Description |
|---|---|
| `renderOnboard()` | Show player list or sign-in form |
| `enterAs(name)` | Set `state.me`, hide onboard, show main app |
| `addAndEnter()` | Validate name + group code, create player, enter |
| `signOut()` | Clear `state.me`, show onboard |
| `renderAllPlayers()` | Render players page list with handicap and round counts |
| `renderPlayersToday()` | Render "who's playing today" chip selector in Round tab |
| `addPlayer()` | Add new player to group (admin flow) |
| `initials(name)` | Returns 1–2 uppercase initials from player name |

---

### `group.js` — Group & Season Management

| Export | Description |
|---|---|
| `copyGroupCode()` | Copy `state.gd.groupCode` to clipboard |
| `leaveGroup()` | Reset `state.me` and navigate to onboard |
| `toggleGroupCodeRequired()` | Toggle `state.gd.requireGroupCode` |
| `addSeason(name)` | Add named season to `state.gd.seasons` |
| `deleteSeason(name)` | Remove season |
| `confirmDeleteMyData()` | Show confirmation prompt |
| `deleteMyData()` | Delete current player from `state.gd.players`, push Gist, sign out |
| `copyAppUrl()` | Copy current `window.location.href` to clipboard |
| `rebuildSeasonSelector()` | Refresh leaderboard season `<select>` options |

---

### `admin.js` — Admin Panel

Password: `YorBorTrial!` (hardcoded, checked client-side).

| Export | Description |
|---|---|
| `openAdminSettings()` | Show `#admin-modal` |
| `closeAdminSettings()` | Hide modal |
| `verifyAdminPw()` | Check password, show admin controls |
| `adminPopulateRounds()` | Populate round selector for chosen player |
| `adminDeleteRound()` | Delete selected round, log to `state.gd.deletionLog`, push Gist |

**Deletion log entry:**
```js
{ deletedBy, player, course, date, score, diff, deletedAt }
```
Last 20 entries displayed in the panel.

---

### `export.js` — XLSX Export

Exports `exportXlsx()`. Uses the global `XLSX` library. Produces a workbook with two sheets:
- **All Rounds** — one row per round, all summary fields
- **Hole Data** — one row per round per hole (scores, putts, FIR, GIR)

Filename: `{PlayerName}_golf_{YYYY-MM-DD}.xlsx`

---

## Backend Functions

### `netlify/functions/sync.js` — Gist Proxy

- **GET** — fetches `golf_data.json` from the Gist and returns raw content
- **POST** — accepts `{ data }`, serialises to JSON, PATCHes the Gist file
- **OPTIONS** — CORS preflight

Uses Node's built-in `https` module (no external dependencies). Auth via `process.env.GITHUB_TOKEN`. CORS headers allow all origins.

### `netlify/functions/ai.js` — Claude Proxy

- **POST** — forwards `{ model, max_tokens, messages }` to Anthropic API, returns response
- **GET** — diagnostic endpoint, tests API key validity
- **OPTIONS** — CORS preflight

Auth via `process.env.ANTHROPIC_API_KEY`. `max_tokens` capped at 4000. Model: `claude-haiku-4-5-20251001`.

---

## Data Schema

### `golf_data.json` (Gist root)

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
  groupCode: string,           // 6-char alphanumeric
  requireGroupCode: boolean,
  seasons: [ { name, year } ],
  customCourses: { key: CourseObject },
  greenCoords: { courseName: { [hole]: { lat, lng } } },
  deletionLog: [ DeletionEntry ]
}
```

### Round object

```js
{
  id: number,          // timestamp
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
  diff: number,        // totalScore - totalPar
  birdies, parsCount, bogeys, doubles, eagles: number,
  penalties, bunkers, chips: number,
  rating: number,      // course rating
  slope: number        // slope rating
}
```

---

## CSS Design Tokens

Defined in `:root` in `styles/app.css`:

| Variable | Purpose |
|---|---|
| `--navy` / `--mid` / `--card` | Background hierarchy |
| `--cream` | Primary text |
| `--gold` / `--gold2` | Accent / hover accent |
| `--dim` / `--dimmer` | Secondary / tertiary text |
| `--border` | Subtle dividers |
| `--eagle` | Eagle scoring colour (yellow) |
| `--birdie` | Birdie colour (blue) |
| `--par` | Par colour (green) |
| `--bogey` | Bogey colour (orange) |
| `--double` | Double+ colour (red) |
| `--safe-top` / `--safe-bot` | iOS safe area insets |

**Key component classes:** `.btn`, `.btn-o`, `.btn-ghost`, `.card`, `.ct` (card title), `.fpill`, `.nb` (nav button), `.lb-row`, `.lb-me`, `.lb-pos`, `.avatar`, `.lb-avatar-me`, `.live-pip`, `.tab`, `.tab-bar`.

---

## Circular Dependency Strategy

ES modules can deadlock on circular imports. The pattern used throughout:

1. **`nav.js` uses `registerNavHandlers`** — page renderers are passed in from `app.js` at boot, so `nav.js` never imports from page modules directly.
2. **Dynamic `import()`** — used in `live.js` (imports `gps.js`) and others where a module needs a peer only at call time.
3. **`app.js` is the only file that imports everything** — all other modules have a strict, acyclic import graph.

---

## Environment Variables (Netlify)

| Variable | Used by | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | `sync.js` | Read/write GitHub Gist |
| `ANTHROPIC_API_KEY` | `ai.js` | Call Claude API |

Neither key is ever sent to the browser.

---

## Deployment

Configured in `netlify.toml`. All requests to `/.netlify/functions/*` are handled by the functions directory. Static files are served from the repo root. No build command — the project ships as-is.
