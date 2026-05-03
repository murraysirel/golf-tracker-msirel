// ─────────────────────────────────────────────────────────────────
// AI REVIEW & ANALYSIS
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { pushData, querySupabase } from './api.js';
import { parseDateGB } from './stats.js';
import { checkAccess, incrementUsage, showUpgradePrompt } from './subscription.js';
import { getCourseByRef } from './courses.js';
import { API_BASE, IS_NATIVE } from './config.js';
import { notifySuccess } from './haptics.js';

const AI_API = API_BASE + '/.netlify/functions/ai';

export async function handlePhoto(input) {
  // Native camera path
  if (IS_NATIVE && !input?.files) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt
      });
      // Convert base64 to File for existing parsePhoto flow
      const byteStr = atob(photo.base64String);
      const ab = new ArrayBuffer(byteStr.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
      state.photoFile = new File([ab], 'scorecard.jpg', { type: 'image/' + (photo.format || 'jpeg') });
      const pv = document.getElementById('photo-prev');
      pv.src = 'data:image/' + (photo.format || 'jpeg') + ';base64,' + photo.base64String;
      pv.style.display = 'block';
      document.getElementById('parse-btn').style.display = 'block';
      document.getElementById('photo-msg').innerHTML = '';
    } catch (e) {
      if (e.message?.includes('cancelled')) return; // user cancelled camera
      console.error('Camera error:', e);
    }
    return;
  }
  // Web file input path
  const f = input.files[0]; if (!f) return;
  state.photoFile = f;
  const pv = document.getElementById('photo-prev');
  pv.src = URL.createObjectURL(f); pv.style.display = 'block';
  document.getElementById('parse-btn').style.display = 'block';
  document.getElementById('photo-msg').innerHTML = '';
}

export async function parsePhoto() {
  if (!state.photoFile) return;
  const course = getCourseByRef();
  const courseInfo = course ? `The course is ${course.name}, played from ${state.stee} tees. The par for each hole in order is: ${state.cpars.join(', ')}.` : 'Unknown course — try to identify it from the scorecard.';

  document.getElementById('photo-msg').innerHTML = '<div class="alert"><span class="spin"></span> Reading scorecard with AI — this takes a few seconds...</div>';
  document.getElementById('parse-btn').disabled = true;

  try {
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(state.photoFile);
    });
    const prompt = `You are reading a golf scorecard photograph. ${courseInfo}

Your task: extract the GROSS score (total strokes taken) for each of the 18 holes, putts if visible, stroke index (SI) per hole, and all tee information shown on the card.

IMPORTANT RULES:
- Return the GROSS score — the actual number of strokes on each hole, NOT net or stableford points
- If you see coloured circles/dots around a score (these mean birdie/eagle/bogey in some apps), read the number inside
- Count carefully — a triple bogey on a par 4 is 7, not 3
- If the scorecard shows OUT total and IN total, use them to sanity check your reading (OUT should be sum of holes 1-9)
- Extract stroke index (SI) for each hole — this is the number 1–18 printed in the SI row of the scorecard, indicating hole difficulty order
- Also extract ALL tee options shown on the scorecard, each with their course rating, slope rating, and per-hole yardages
- If a score is genuinely unclear, use null
- Return ONLY valid JSON, no explanation:

{"scores":[h1,h2,h3,h4,h5,h6,h7,h8,h9,h10,h11,h12,h13,h14,h15,h16,h17,h18],"putts":[p1,p2,...p18],"si":[si1,si2,...si18],"outTotal":39,"inTotal":35,"confidence":"high/medium/low","tees":[{"name":"Yellow","rating":69.2,"slope":118,"yardages":[350,380,420,180,390,340,510,160,400,370,420,180,340,510,390,420,160,380]},{"name":"White","rating":70.5,"slope":122,"yardages":[...]}]}

Use null for any value you cannot read with confidence. Putts and SI arrays should have null values if those rows are not visible. Tees array should be [] if no tee rating information is shown.`;

    const resp = await fetch(AI_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 900,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: state.photoFile.type || 'image/jpeg', data: b64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    const data = await resp.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (!parsed.scores || parsed.scores.length < 9) throw new Error('too few scores');

    const outSum = parsed.scores.slice(0, 9).filter(Boolean).reduce((a, b) => a + b, 0);
    const inSum = parsed.scores.slice(9).filter(Boolean).reduce((a, b) => a + b, 0);
    const outOk = !parsed.outTotal || (outSum === parsed.outTotal);
    const inOk = !parsed.inTotal || (inSum === parsed.inTotal);

    // Store SI if valid: 18 values, each 1–18, all unique
    if (Array.isArray(parsed.si) && parsed.si.length === 18) {
      const siNums = parsed.si.filter(v => v != null && v >= 1 && v <= 18);
      if (siNums.length === 18 && new Set(siNums).size === 18) {
        state.scannedSI = [...parsed.si];
      }
    }

    // Store per-tee ratings extracted from the scorecard photo
    if (Array.isArray(parsed.tees) && parsed.tees.length > 0) {
      state._scannedTeeRatings = {};
      parsed.tees.forEach(t => {
        if (!t.name) return;
        const key = t.name.toLowerCase().trim();
        state._scannedTeeRatings[key] = {
          rating: t.rating || null,
          slope: t.slope || null,
          yardages: Array.isArray(t.yardages) ? t.yardages : null
        };
      });
    }

    import('./scorecard.js').then(({ buildSC }) => buildSC(parsed.scores, parsed.putts));
    import('./nav.js').then(({ switchEntry }) => switchEntry('manual'));

    notifySuccess();
    const conf = parsed.confidence || 'medium';
    const warn = (!outOk || !inOk) ? ' Some totals didn\'t match — please check carefully.' : '';
    const confColour = conf === 'high' ? 'alert-ok' : 'alert';
    document.getElementById('photo-msg').innerHTML = `<div class="alert ${confColour}">
      ${conf === 'high' ? '\u2705' : '\u26A0\uFE0F'} Scores loaded (${conf} confidence).${warn} Check each hole before saving — tap any score to edit it.
    </div>`;

  } catch (e) {
    document.getElementById('photo-msg').innerHTML = '<div class="alert alert-err">\u26A0\uFE0F Couldn\'t read the scorecard — try a clearer, well-lit photo. Enter scores manually below.</div>';
    if (getCourseByRef()) {
      import('./scorecard.js').then(({ buildSC }) => buildSC());
    }
  }
  document.getElementById('parse-btn').disabled = false;
}

export async function generateAIReview() {
  if (!checkAccess('ai_reviews')) { showUpgradePrompt('ai_reviews'); return; }
  // Cancel the 24-hour review reminder since user is viewing now
  import('./scorecard.js').then(m => m.cancelReviewReminder?.()).catch(() => {});
  const sel = document.getElementById('ai-round-sel');
  const rs = state.gd.players[state.me]?.rounds || [];
  if (!rs.length) return;
  if (sel.value === 'last5') { generateStatsAnalysis(); return; }
  const idx = parseInt(sel.value);
  const r = rs[idx];
  if (!r) return;

  const puttsOk = (r.putts || []).some(v => v != null && v !== '' && !isNaN(v));
  const firOk = (r.fir || []).some(v => v === 'Yes' || v === 'No' || v === 'N/A');
  const girOk = (r.gir || []).some(v => v === 'Yes' || v === 'No');
  if (!puttsOk || !firOk || !girOk) {
    document.getElementById('ai-review-msg').innerHTML = '<div class="alert alert-err">\u26A0\uFE0F AI assessment requires complete data — please ensure Putts, Fairways (FIR) and Greens (GIR) are all entered for this round.</div>';
    return;
  }

  const btn = document.getElementById('ai-review-btn');
  btn.disabled = true; btn.textContent = '\u23F3 Generating...';
  document.getElementById('ai-review-output').style.display = 'none';
  document.getElementById('ai-review-msg').innerHTML = '<div class="alert"><span class="spin"></span> Analysing your round...</div>';

  const holeSummary = (r.pars || []).map((p, i) => {
    const s = r.scores?.[i]; if (s == null) return `H${i+1}(par${p}):?`;
    const d = s - p; return `H${i+1}(par${p}):${s}(${d >= 0 ? '+' : ''}${d})`;
  }).join(', ');

  const totalPutts = (r.putts || []).filter(Boolean).reduce((a, b) => a + b, 0);
  const girPct = r.gir ? Math.round(r.gir.filter(v => v === 'Yes').length / 18 * 100) : null;
  const firCount = r.fir ? r.fir.filter((v, i) => v === 'Yes' && r.pars[i] !== 3).length : null;
  const firHoles = r.pars ? r.pars.filter(p => p !== 3).length : 11;

  const prompt = `Golf coach reviewing a round for ${r.player}. Be specific and concise.

${r.course} (${r.tee}, par ${r.totalPar}) ${r.date} — Score: ${r.totalScore} (${r.diff >= 0 ? '+' : ''}${r.diff})
${holeSummary}
Eagles:${r.eagles||0} Birdies:${r.birdies||0} Pars:${r.parsCount||0} Bogeys:${r.bogeys||0} Doubles+:${r.doubles||0}${totalPutts ? ` Putts:${totalPutts}(${(totalPutts/18).toFixed(1)}/hole)` : ''}${girPct != null ? ` GIR(greens hit in regulation):${girPct}%` : ''}${firCount != null ? ` FIR(fairways hit off the tee, excl par 3s):${firCount}/${firHoles}` : ''}${r.notes ? ` Notes:"${r.notes}"` : ''}

IMPORTANT:
- Only mention eagles if eagles > 0. Only mention birdies if birdies > 0.
- FIR = fairways hit off the tee (driving accuracy). GIR = greens reached in regulation (approach accuracy). These are DIFFERENT stats — do not conflate them.
- Base the review strictly on what the numbers show. Do not assume data not provided.

Respond ONLY with valid JSON:
{
  "positive": "One specific strength (2 sentences, cite actual holes/numbers from the data)",
  "negative": "One specific weakness that cost shots (2 sentences, cite actual holes/numbers)",
  "drill": "One concrete drill to fix the weakness (2 sentences, specific reps and targets)"
}`;

  try {
    const resp = await fetch(AI_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err?.error || err?.full?.error?.message || JSON.stringify(err);
      throw new Error(`API ${resp.status}: ${msg}`);
    }
    const data = await resp.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    document.getElementById('ai-positive').textContent = parsed.positive || '';
    document.getElementById('ai-negative').textContent = parsed.negative || '';
    document.getElementById('ai-drill').textContent = parsed.drill || '';
    document.getElementById('ai-review-output').style.display = 'block';
    document.getElementById('ai-review-msg').innerHTML = '';
    storeAIReviewInRound(idx, parsed);
  } catch (e) {
    console.error('AI review error:', e);
    document.getElementById('ai-review-msg').innerHTML = `<div class="alert alert-err">\u26A0\uFE0F Could not generate review — ${e.message || 'please try again'}.</div>`;
  }
  btn.disabled = false;
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/></svg> Generate Review';
}

export async function generateStatsAnalysis() {
  const rs = (state.gd.players[state.me]?.rounds || []);
  const sorted = [...rs].sort((a, b) => parseDateGB(b.date) - parseDateGB(a.date));
  if (sorted.length < 5) {
    document.getElementById('ai-stats-msg').innerHTML = '<div class="alert alert-err">You need at least 5 rounds submitted to use this feature.</div>';
    return;
  }
  const last5 = sorted.slice(0, 5);
  const btn = document.getElementById('ai-stats-btn');
  btn.disabled = true; btn.textContent = 'Analysing...';
  document.getElementById('ai-stats-output').style.display = 'none';
  document.getElementById('ai-stats-msg').innerHTML = '<div class="alert"><span class="spin"></span> Analysing your last 5 rounds...</div>';

  const roundsSummary = last5.map((r, i) => {
    const totalPutts = (r.putts || []).filter(Boolean).reduce((a, b) => a + b, 0);
    const girPct = r.gir ? Math.round(r.gir.filter(v => v === 'Yes').length / 18 * 100) : null;
    const firCount = r.fir ? r.fir.filter((v, j) => v === 'Yes' && (r.pars || [])[j] !== 3).length : null;
    const firHoles = (r.pars || []).filter(p => p !== 3).length || 14;
    return `Round ${i+1}: ${r.course} (${r.tee}, par ${r.totalPar}) on ${r.date}
  Score: ${r.totalScore} (${r.diff >= 0 ? '+' : ''}${r.diff}) | Eagles:${r.eagles||0} Birdies:${r.birdies||0} Pars:${r.parsCount||0} Bogeys:${r.bogeys||0} Doubles+:${r.doubles||0}
  ${totalPutts ? `Putts: ${totalPutts} (${(totalPutts/18).toFixed(1)}/hole)  ` : ''}${girPct != null ? `GIR: ${girPct}%  ` : ''}${firCount != null ? `FIR: ${firCount}/${firHoles}` : ''}`;
  }).join('\n\n');

  const avgScore = Math.round(last5.reduce((a, r) => a + (r.totalScore || 0), 0) / 5);
  const avgDiff = +(last5.reduce((a, r) => a + (r.diff || 0), 0) / 5).toFixed(1);
  const handicap = state.gd.players[state.me]?.handicap || 'unknown';

  // Compute score trend: compare first half vs second half of the 5 rounds
  const firstHalf = last5.slice(0, Math.floor(last5.length / 2));
  const secondHalf = last5.slice(Math.floor(last5.length / 2));
  const firstAvg = firstHalf.length ? +(firstHalf.reduce((a, r) => a + (r.diff || 0), 0) / firstHalf.length).toFixed(1) : null;
  const secondAvg = secondHalf.length ? +(secondHalf.reduce((a, r) => a + (r.diff || 0), 0) / secondHalf.length).toFixed(1) : null;
  const trendNote = firstAvg != null && secondAvg != null
    ? `Score trend: earlier rounds avg ${firstAvg >= 0 ? '+' : ''}${firstAvg}, recent rounds avg ${secondAvg >= 0 ? '+' : ''}${secondAvg} (${secondAvg > firstAvg ? 'scores getting WORSE' : secondAvg < firstAvg ? 'scores IMPROVING' : 'stable'}).`
    : '';

  const prompt = `Golf coach analysing patterns across ${state.me}'s last 5 rounds. Current handicap: ${handicap}. Avg score vs par: ${avgDiff >= 0 ? '+' : ''}${avgDiff}.
${trendNote}

IMPORTANT:
- FIR = fairways hit off the tee (driving accuracy). GIR = greens reached in regulation (approach accuracy). These are DIFFERENT stats — do not conflate them.
- Higher scores = worse performance. A handicap trending UP means the player is getting WORSE, not better.
- Base analysis strictly on the data provided. Do not invent trends not shown in the numbers.

${roundsSummary}

Find genuine multi-round patterns, not single-round noise. Respond ONLY with valid JSON:
{
  "positive": "Strongest consistent pattern (2 sentences, cite numbers)",
  "negative": "Most persistent weakness across rounds (2 sentences, cite stats)",
  "drill": "One high-priority drill with exact reps and measurable target (2 sentences)",
  "handicap": "Score trajectory based on the 5 rounds above — improving, worsening, or stable? Why? (1 sentence)"
}`;

  const sparkSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/></svg>';
  try {
    const resp = await fetch(AI_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(`API ${resp.status}: ${e?.error || JSON.stringify(e)}`); }
    const data = await resp.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    document.getElementById('ai-stats-positive').textContent = parsed.positive || '';
    document.getElementById('ai-stats-negative').textContent = parsed.negative || '';
    document.getElementById('ai-stats-drill').textContent = parsed.drill || '';
    document.getElementById('ai-stats-handicap').textContent = parsed.handicap || '';
    document.getElementById('ai-stats-output').style.display = 'block';
    document.getElementById('ai-stats-msg').innerHTML = '';
    if (!state.gd.players[state.me]) state.gd.players[state.me] = { handicap: 0, rounds: [] };
    state.gd.players[state.me].statsAnalysis = parsed;
    state.gd.players[state.me].statsAnalysisDate = new Date().toLocaleDateString('en-GB');
    pushData();
    querySupabase('saveStatsAnalysis', {
      playerName: state.me,
      statsAnalysis: parsed,
      statsAnalysisDate: state.gd.players[state.me].statsAnalysisDate
    });
  } catch (e) {
    console.error('Stats analysis error:', e);
    document.getElementById('ai-stats-msg').innerHTML = `<div class="alert alert-err">Could not generate analysis — ${e.message || 'please try again'}.</div>`;
  }
  btn.disabled = false;
  btn.innerHTML = sparkSVG + ' Analyse My Last 5 Rounds';
}

// ── Shorthand review — punchy 2-3 sentence summary ───────────────
export async function generateShorthandReview(round) {
  if (!round?.scores || !round?.pars) return null;
  // Return cached if already generated
  if (round.shorthandReview) return round.shorthandReview;

  const totalPutts = (round.putts || []).filter(Boolean).reduce((a, b) => a + b, 0);
  const girPct = round.gir ? Math.round(round.gir.filter(v => v === 'Yes').length / 18 * 100) : null;
  const firCount = round.fir ? round.fir.filter((v, i) => v === 'Yes' && round.pars[i] !== 3).length : null;
  const firHoles = round.pars ? round.pars.filter(p => p !== 3).length : 14;
  const diff = round.diff >= 0 ? '+' + round.diff : '' + round.diff;

  const prompt = `You are a golf caddie writing a brief post-round note. UK English. Tone: friendly and direct — not overly casual, not coaching. One line on what went well, one on what to sharpen.

Round: ${round.course || 'Unknown'}, ${round.date}. Score: ${round.totalScore} (${diff}).
Birdies: ${round.birdies || 0}. Bogeys: ${round.bogeys || 0}. Doubles+: ${round.doubles || 0}.${totalPutts ? ` Putts: ${totalPutts}.` : ''}${girPct != null ? ` GIR: ${girPct}%.` : ''}${firCount != null ? ` FIR: ${firCount}/${firHoles}.` : ''}

Write exactly 2 short sentences. Respond with plain text only, no JSON, no quotes.`;

  try {
    const resp = await fetch(AI_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 120, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) { console.warn('[shorthand] API error:', resp.status); return null; }
    const data = await resp.json();
    const text = data.content?.find(b => b.type === 'text')?.text?.trim() || null;
    if (!text) { console.warn('[shorthand] No text in response:', JSON.stringify(data).slice(0, 200)); return null; }
    round.shorthandReview = text;
    // Persist to Supabase (fire-and-forget)
    querySupabase('updateRoundField', { roundId: round.id, field: 'shorthand_review', value: text }).catch(() => {});
    return text;
  } catch (e) {
    console.warn('[shorthand] failed:', e.message);
    return null;
  }
}

export function clearStatsAnalysis() {
  if (!state.gd.players[state.me]) return;
  delete state.gd.players[state.me].statsAnalysis;
  delete state.gd.players[state.me].statsAnalysisDate;
  document.getElementById('ai-stats-output').style.display = 'none';
  document.getElementById('ai-stats-msg').innerHTML = '';
  pushData();
}

function storeAIReviewInRound(roundIndex, review) {
  const p = state.gd.players[state.me];
  if (!p || !p.rounds[roundIndex]) return;
  p.rounds[roundIndex].aiReview = review;
  incrementUsage('ai_reviews');
  pushData();
}
