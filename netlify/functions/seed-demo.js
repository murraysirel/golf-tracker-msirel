// netlify/functions/seed-demo.js
// Seeds the DEMO01 group in Supabase with 8 players and 40 outings.
// Protected: requires x-admin-key header matching SYNC_SECRET env var.
// GET ?reset=true to wipe and re-seed; GET (no reset) to seed only if empty.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GROUP_CODE = 'DEMO01';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

// ── Seeded RNG (mulberry32) ────────────────────────────────────────────────────
function mkRng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Course definitions ─────────────────────────────────────────────────────────
// par[] and si[] are 18-element arrays. All par arrays verified to sum correctly.
const COURSES = [
  {
    name: 'Cawder Golf Club',
    loc: 'Bishopbriggs, Scotland',
    rating: 71.0, slope: 130,
    par: [4,4,3,4,4,4,3,4,5, 4,4,3,4,5,3,4,4,4], // 35+35 = 70
    si:  [7,1,15,5,9,3,17,11,13, 2,8,16,4,12,18,6,10,14],
  },
  {
    name: 'Bishopbriggs Golf Club',
    loc: 'Bishopbriggs, Scotland',
    rating: 67.5, slope: 119,
    par: [4,4,3,4,4,4,3,5,4, 4,3,4,4,4,3,4,4,4], // 35+34 = 69
    si:  [5,15,3,7,1,17,9,11,13, 4,8,16,2,6,18,10,12,14],
  },
  {
    name: 'Lundin Links',
    loc: 'Lundin Links, Fife, Scotland',
    rating: 71.5, slope: 131,
    par: [4,5,3,4,4,4,3,4,4, 4,5,3,4,4,3,4,5,4], // 35+36 = 71
    si:  [3,11,17,1,7,9,15,5,13, 2,10,12,4,8,18,6,14,16],
  },
  {
    name: 'Dumbarnie Links',
    loc: 'Leven, Fife, Scotland',
    rating: 73.2, slope: 138,
    par: [4,5,3,4,4,4,3,5,4, 4,5,3,4,4,3,4,5,4], // 36+36 = 72
    si:  [5,9,17,1,11,3,15,7,13, 4,10,16,2,12,18,6,8,14],
  },
  {
    name: 'Isle of Purbeck Golf Club',
    loc: 'Swanage, Dorset',
    rating: 69.8, slope: 126,
    par: [4,4,3,4,4,4,3,5,4, 4,4,3,4,4,3,5,4,4], // 35+35 = 70
    si:  [7,3,17,5,1,9,15,11,13, 4,16,2,8,6,18,10,12,14],
  },
  {
    name: 'Broadstone Golf Club',
    loc: 'Broadstone, Dorset',
    rating: 70.2, slope: 128,
    par: [4,4,3,5,4,3,4,4,4, 4,4,3,5,4,3,4,4,4], // 35+35 = 70
    si:  [1,7,17,3,5,15,9,11,13, 2,6,18,8,4,16,10,12,14],
  },
  {
    name: 'Trevose Golf Club',
    loc: 'Constantine Bay, Cornwall',
    rating: 71.3, slope: 129,
    par: [4,5,3,4,4,4,3,4,4, 4,3,5,4,4,4,3,5,4], // 35+36 = 71
    si:  [5,9,17,3,1,7,15,11,13, 4,16,12,2,8,18,6,10,14],
  },
  {
    name: 'Croham Hurst Golf Club',
    loc: 'Croydon, Surrey',
    rating: 67.5, slope: 114,
    par: [4,4,4,4,3,5,3,5,4, 4,3,4,3,4,4,3,4,4], // 36+33 = 69
    si:  [5,3,11,1,15,9,17,7,13, 4,10,2,16,6,8,18,12,14],
  },
  {
    name: 'The Addington Golf Club',
    loc: 'Croydon, Surrey',
    rating: 68.9, slope: 122,
    par: [4,3,5,4,3,4,3,4,4, 4,3,4,4,3,5,4,3,4], // 34+34 = 68
    si:  [3,17,9,1,5,15,7,11,13, 4,18,2,8,16,10,6,14,12],
  },
];

// ── Players ───────────────────────────────────────────────────────────────────
const PLAYERS = [
  { name: 'Murray', hcpIndex: 8.0,  tendency: 0.0  },
  { name: 'Jamie',  hcpIndex: 2.0,  tendency: -1.5 },
  { name: 'Fiona',  hcpIndex: 5.0,  tendency: -1.2 },
  { name: 'Ross',   hcpIndex: 11.0, tendency: 2.5  },
  { name: 'Debbie', hcpIndex: 14.0, tendency: 0.5  },
  { name: 'Craig',  hcpIndex: 15.0, tendency: 2.8  },
  { name: 'Isla',   hcpIndex: 17.0, tendency: 0.5  },
  { name: 'Pete',   hcpIndex: 18.0, tendency: -2.0 },
];

// ── Playing handicap ─────────────────────────────────────────────────────────
function playingHcp(hcpIndex, slope) {
  return Math.round(hcpIndex * slope / 113);
}

// ── Net-based score generation ────────────────────────────────────────────────
// NET delta = gross - par - extra_strokes_received
// EV ≈ 0 means the player plays exactly to their handicap.
// We generate net scores, then convert: gross = par + net_delta + extra_strokes.
//
// Net distributions have slight class variation in shape (low hcp = more net birdies),
// but all centre at EV ≈ 0 so gross averages at par + playingHcp as expected.

// Net distributions — EV must be ≈ 0 so gross total tracks par + playingHcp.
// Tendency then shifts the round total by player.tendency shots.
// Low hcp: more net birdies. High hcp: more net bogeys. All centred at 0.
const NET_DIST_LOW  = [[-2,.03],[-1,.27],[0,.46],[1,.20],[2,.04]]; // EV = -0.05 ≈ 0
const NET_DIST_MID  = [[-1,.26],[0,.50],[1,.18],[2,.06]];           // EV = +0.04 ≈ 0
const NET_DIST_HIGH = [[-1,.38],[0,.34],[1,.16],[2,.09],[3,.03]];   // EV = +0.05 ≈ 0

function netDistribution(hcpIndex) {
  if (hcpIndex <= 5)  return NET_DIST_LOW;
  if (hcpIndex <= 12) return NET_DIST_MID;
  return NET_DIST_HIGH;
}

function drawFromDist(rng, dist) {
  const r = rng();
  let cum = 0;
  for (const [score, w] of dist) { cum += w; if (r < cum) return score; }
  return dist[dist.length - 1][0];
}

// Extra strokes received on a hole for a given playing handicap
function extraStrokes(si, phcp) {
  if (phcp <= 0) return 0;
  if (phcp <= 18) return si <= phcp ? 1 : 0;
  // phcp > 18: all holes get at least 1 extra; SI 1..(phcp-18) get 2
  return si <= (phcp - 18) ? 2 : 1;
}

// ── Generate one round ────────────────────────────────────────────────────────
function generateRound(player, course, dateStr, outingIdx, playerIdx) {
  const phcp = playingHcp(player.hcpIndex, course.slope);
  const rng = mkRng(outingIdx * 997 + playerIdx * 137 + 42);
  const dist = netDistribution(player.hcpIndex);

  // Round-level variance: ±4 shots — applied by shifting random holes
  const roundVarShots = Math.round((rng() - 0.5) * 8);

  const scores = [];
  const putts  = [];
  const fir    = [];
  const gir    = [];

  let varRemaining = roundVarShots;

  for (let h = 0; h < 18; h++) {
    const par   = course.par[h];
    const si    = course.si[h];
    const extra = extraStrokes(si, phcp);

    // Net delta (how many shots over/under par NET)
    let netDelta = drawFromDist(rng, dist);

    // Tendency: probability of improving/worsening one shot per hole
    const tendProb = Math.abs(player.tendency) / 18;
    if (player.tendency < 0 && rng() < tendProb) netDelta -= 1;
    if (player.tendency > 0 && rng() < tendProb) netDelta += 1;

    // Round variance: distribute remaining over remaining holes
    if (varRemaining !== 0 && rng() < Math.abs(varRemaining) / (18 - h + 1)) {
      const step = varRemaining > 0 ? 1 : -1;
      netDelta += step;
      varRemaining -= step;
    }

    // Gross = par + net + extra strokes received
    let grossDelta = netDelta + extra;

    // Par-3 restriction for mid/high hcp: no gross eagle (gross 1) — extremely rare
    if (par === 3 && grossDelta <= -2 && player.hcpIndex > 5) grossDelta = -1;

    const gross = Math.max(1, par + grossDelta);
    scores.push(gross);

    // Putts
    let p;
    if (grossDelta <= -1)      p = 1;
    else if (grossDelta === 0) p = rng() < 0.65 ? 2 : 1;
    else                       p = 2 + (rng() < 0.3 ? 1 : 0);
    putts.push(p);

    // FIR
    if (par === 3) {
      fir.push('N/A');
    } else {
      const firRate = player.hcpIndex <= 5 ? 0.72 : player.hcpIndex <= 12 ? 0.58 : 0.44;
      fir.push(rng() < firRate ? 'Yes' : 'No');
    }

    // GIR
    gir.push((gross - p) <= (par - 2) ? 'Yes' : 'No');
  }

  const totalScore = scores.reduce((a, b) => a + b, 0);
  const totalPar   = course.par.reduce((a, b) => a + b, 0);
  const diff       = totalScore - totalPar;

  let birdies = 0, parsCount = 0, bogeys = 0, doubles = 0, eagles = 0;
  for (let h = 0; h < 18; h++) {
    const d = scores[h] - course.par[h];
    if (d <= -2) eagles++;
    else if (d === -1) birdies++;
    else if (d === 0)  parsCount++;
    else if (d === 1)  bogeys++;
    else               doubles++;
  }

  // Stableford (net)
  let stableford = 0;
  for (let h = 0; h < 18; h++) {
    const netDiff = (scores[h] - extraStrokes(course.si[h], phcp)) - course.par[h];
    if      (netDiff <= -2) stableford += 4;
    else if (netDiff === -1) stableford += 3;
    else if (netDiff === 0)  stableford += 2;
    else if (netDiff === 1)  stableford += 1;
  }

  // Unique deterministic ID: base timestamp Jan 4 2026 + offsets
  const baseTs = 1767225600000; // 2026-01-04 00:00:00 UTC approx
  const id = baseTs + outingIdx * 100000 + playerIdx * 10000 + Math.floor(rng() * 9999);

  return {
    id,
    player: player.name,
    course: course.name,
    loc: course.loc,
    tee: 'blue',
    date: dateStr,
    scores, putts, fir, gir,
    pars: course.par,
    notes: '',
    totalScore, totalPar, diff,
    birdies, parsCount, bogeys, doubles, eagles,
    penalties: 0, bunkers: 0, chips: 0,
    rating: course.rating,
    slope: course.slope,
    stableford,
    playingHcp: phcp,
  };
}

// ── Build the 40-outing schedule ──────────────────────────────────────────────
function buildOutings() {
  const rng = mkRng(42); // fixed seed — deterministic schedule

  // Flatten course list by distribution
  const courseDistrib = [8, 5, 4, 4, 4, 4, 4, 4, 3]; // sums to 40
  const courseList = [];
  COURSES.forEach((c, i) => { for (let j = 0; j < courseDistrib[i]; j++) courseList.push(i); });

  // Shuffle courses
  for (let i = courseList.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [courseList[i], courseList[j]] = [courseList[j], courseList[i]];
  }

  // Group size list: 30×4, 5×2, 3×3, 2×8
  const sizes = [...Array(30).fill(4), ...Array(5).fill(2), ...Array(3).fill(3), ...Array(2).fill(8)];
  for (let i = sizes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sizes[i], sizes[j]] = [sizes[j], sizes[i]];
  }

  // Dates: Jan 4 to Mar 22, 2026 (77 days) — spread evenly
  const start = new Date('2026-01-04');
  const totalDays = 77;

  const outings = [];
  let murrayCount = 0;
  const targetMurray = 26;

  for (let i = 0; i < 40; i++) {
    // Date: evenly spread with slight jitter
    const rawOffset = Math.floor((i / 40) * totalDays + (rng() - 0.5) * 3);
    const dayOffset = Math.max(0, Math.min(totalDays - 1, rawOffset));
    const d = new Date(start.getTime() + dayOffset * 86400000);
    const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

    const courseIdx = courseList[i];
    const size = sizes[i];

    let players;
    if (size === 8) {
      players = PLAYERS.map(p => p.name);
      murrayCount++;
    } else {
      const remaining = 40 - i;
      const murrayNeeded = Math.max(0, targetMurray - murrayCount);
      const murrayProb = Math.min(1, murrayNeeded / remaining + 0.1);
      const includeMurray = rng() < murrayProb;
      if (includeMurray) murrayCount++;

      // Pick non-Murray players (seeded shuffle)
      const others = PLAYERS.filter(p => p.name !== 'Murray');
      const shuffled = [...others];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }
      const needed = includeMurray ? size - 1 : size;
      players = [
        ...(includeMurray ? ['Murray'] : []),
        ...shuffled.slice(0, needed).map(p => p.name),
      ];
    }

    outings.push({ courseIdx, dateStr, players });
  }

  return outings;
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  // Auth check
  const adminKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
  const secret   = process.env.SYNC_SECRET;
  if (secret && adminKey !== secret) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorised' }) };
  }

  const reset = event.queryStringParameters?.reset === 'true';

  try {
    // Check for existing demo data
    const { data: existingRounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('group_code', GROUP_CODE)
      .limit(1);

    if (!reset && existingRounds && existingRounds.length > 0) {
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ ok: true, message: 'Demo data already exists. Add ?reset=true to re-seed.' })
      };
    }

    // Wipe existing demo data if reset
    if (reset) {
      await supabase.from('rounds').delete().eq('group_code', GROUP_CODE);
      await supabase.from('players').delete().eq('group_code', GROUP_CODE);
    }

    // ── Insert players ──────────────────────────────────────────────
    const playerRows = PLAYERS.map(p => ({
      name:       p.name,
      group_code: GROUP_CODE,
      handicap:   p.hcpIndex,
      email:      null,
      match_code: null,
    }));
    const { error: pErr } = await supabase.from('players').upsert(playerRows, { onConflict: 'name,group_code' });
    if (pErr) throw new Error('Player insert failed: ' + pErr.message);

    // ── Generate and insert rounds ──────────────────────────────────
    const outings = buildOutings();
    const allRounds = [];

    for (let oi = 0; oi < outings.length; oi++) {
      const { courseIdx, dateStr, players } = outings[oi];
      const course = COURSES[courseIdx];

      for (let pi = 0; pi < players.length; pi++) {
        const playerName = players[pi];
        const player = PLAYERS.find(p => p.name === playerName);
        const round = generateRound(player, course, dateStr, oi, pi);
        allRounds.push({
          id:           round.id,
          player_name:  round.player,
          group_code:   GROUP_CODE,
          course:       round.course,
          loc:          round.loc,
          tee:          round.tee,
          date:         round.date,
          scores:       round.scores,
          putts:        round.putts,
          fir:          round.fir,
          gir:          round.gir,
          pars:         round.pars,
          notes:        round.notes,
          total_score:  round.totalScore,
          total_par:    round.totalPar,
          diff:         round.diff,
          birdies:      round.birdies,
          pars_count:   round.parsCount,
          bogeys:       round.bogeys,
          doubles:      round.doubles,
          eagles:       round.eagles,
          penalties:    0,
          bunkers:      0,
          chips:        0,
          rating:       round.rating,
          slope:        round.slope,
          ai_review:    null,
          wolf_result:  null,
          match_result: null,
        });
      }
    }

    // Insert in batches of 50 to avoid payload limits
    const BATCH = 50;
    for (let i = 0; i < allRounds.length; i += BATCH) {
      const batch = allRounds.slice(i, i + BATCH);
      const { error: rErr } = await supabase
        .from('rounds')
        .upsert(batch, { onConflict: 'id' });
      if (rErr) throw new Error(`Round batch ${i}–${i + BATCH} failed: ` + rErr.message);
    }

    // ── Summary ─────────────────────────────────────────────────────
    const summary = {};
    PLAYERS.forEach(p => { summary[p.name] = { rounds: 0, totalDiff: 0, totalStableford: 0 }; });

    for (const outing of outings) {
      for (const name of outing.players) {
        if (summary[name]) summary[name].rounds++;
      }
    }

    const statLines = Object.entries(summary).map(([name, s]) => {
      const playerRounds = allRounds.filter(r => r.player_name === name);
      const avgDiff = playerRounds.length
        ? (playerRounds.reduce((a, r) => a + r.diff, 0) / playerRounds.length).toFixed(1)
        : '—';
      return `${name}: ${playerRounds.length} rounds, avg +${avgDiff} vs par`;
    });

    const courseCount = {};
    outings.forEach(o => {
      const n = COURSES[o.courseIdx].name;
      courseCount[n] = (courseCount[n] || 0) + 1;
    });

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        ok: true,
        message: `Seeded ${allRounds.length} rounds across ${outings.length} outings into group ${GROUP_CODE}`,
        playerStats: statLines,
        courseOutings: courseCount,
      })
    };

  } catch (err) {
    console.error('seed-demo error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
