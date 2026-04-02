// ─────────────────────────────────────────────────────────────────
// PRACTICE
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { pushData, querySupabase } from './api.js';
import { parseDateGB } from './stats.js';

let _emptyState = null;
function _es(icon, headline, sub, ctaText, ctaAction) {
  if (_emptyState === null) { import('./empty-states.js').then(m => { _emptyState = m.emptyState; }).catch(() => { _emptyState = false; }); }
  return typeof _emptyState === 'function' ? _emptyState(icon, headline, sub, ctaText, ctaAction) : null;
}

const AREA_LABELS = {
  putting: 'Putting', chipping: 'Chipping', pitching: 'Pitching',
  irons: 'Iron Play', driving: 'Driving',
  course_management: 'Course Management', bunker: 'Bunker Play',
  ai_recommended: 'AI Recommended'
};

export function renderPracticePage() {
  renderPracticeRecs();
  renderPracticeHistory();
}

function renderPracticeRecs() {
  const p = state.gd.players[state.me];
  if (!p) return;
  const rs = [...(p.rounds || [])].reverse();
  const withReview = rs.find(r => r.aiReview);
  const card = document.getElementById('c-practice-recs');
  const content = document.getElementById('practice-recs-content');
  if (!withReview || !card || !content) { if (card) card.style.display = 'none'; return; }
  card.style.display = 'block';
  const rev = withReview.aiReview;
  content.innerHTML = `
    <div style="margin-bottom:10px;padding:10px;background:rgba(46,204,113,.06);border-radius:8px;border-left:3px solid #2ecc71">
      <div style="font-size:9px;letter-spacing:1.5px;display:flex;align-items:center;gap:5px;color:#2ecc71;text-transform:uppercase;margin-bottom:4px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> What you did well</div>
      <div style="font-size:12px;color:var(--cream);line-height:1.5">${rev.positive || '—'}</div>
    </div>
    <div style="margin-bottom:10px;padding:10px;background:rgba(230,126,34,.06);border-radius:8px;border-left:3px solid #e67e22">
      <div style="font-size:9px;letter-spacing:1.5px;display:flex;align-items:center;gap:5px;color:#e67e22;text-transform:uppercase;margin-bottom:4px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg> Focus area</div>
      <div style="font-size:12px;color:var(--cream);line-height:1.5">${rev.negative || '—'}</div>
    </div>
    <div style="padding:10px;background:rgba(52,152,219,.06);border-radius:8px;border-left:3px solid #3498db">
      <div style="font-size:9px;letter-spacing:1.5px;display:flex;align-items:center;gap:5px;color:#3498db;text-transform:uppercase;margin-bottom:4px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/></svg> Recommended drill</div>
      <div style="font-size:12px;color:var(--cream);line-height:1.5">${rev.drill || '—'}</div>
    </div>
    <div style="font-size:10px;color:var(--dimmer);margin-top:8px">From round: ${withReview.course} \u00B7 ${withReview.date}</div>`;
}

function renderPracticeHistory() {
  const p = state.gd.players[state.me];
  let sessions = p?.practiceSessions || [];

  // Auto-clear sessions older than 90 days
  const now = Date.now();
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  const before = sessions.length;
  sessions = sessions.filter(s => {
    if (!s.date) return true;
    const parts = s.date.split('/');
    if (parts.length !== 3) return true;
    const d = new Date(parts[2], parts[1] - 1, parts[0]);
    return (now - d.getTime()) < NINETY_DAYS;
  });
  if (sessions.length !== before && p) {
    p.practiceSessions = sessions;
    import('./api.js').then(m => { m.pushData(); m.querySupabase('savePracticeSessions', { playerName: state.me, sessions }); }).catch(() => {});
  }

  const card = document.getElementById('c-practice-history');
  const list = document.getElementById('practice-history-list');
  if (!card || !list) return;
  if (!sessions.length) {
    card.style.display = 'block';
    list.innerHTML = _es('target', 'No practice sessions yet', 'Generate a plan, work through the drills, and your sessions log here.', 'Build a practice plan', "import('./practice.js').then(m=>m.selectPracticeArea('ai_recommended'))")
      || '<div style="font-size:12px;color:var(--dimmer);padding:12px 0;text-align:center">No sessions logged yet.</div>';
    return;
  }
  card.style.display = 'block';
  list.innerHTML = '';
  [...sessions].reverse().slice(0, 10).forEach(s => {
    const div = document.createElement('div');
    div.style.cssText = 'border-bottom:1px solid rgba(255,255,255,.06);padding:10px 0';
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:500;color:var(--cream)">${AREA_LABELS[s.area] || s.area}</div>
          <div style="font-size:10px;color:var(--dim);margin-top:2px">${s.date} \u00B7 ${s.shotsLogged || 0} shots${s.note ? ` \u00B7 "${s.note}"` : ''}</div>
        </div>
        <div style="font-size:20px;color:var(--gold)">${s.shotsLogged || 0}</div>
      </div>`;
    list.appendChild(div);
  });
}

export function selectPracticeArea(area) {
  state.practiceState.area = area;
  document.querySelectorAll('.parea-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.area === area));
  generatePracticePlan(area);
}

export async function generatePracticePlan(area, customRequest) {
  const msg = document.getElementById('practice-gen-msg');
  const planCard = document.getElementById('c-practice-plan');
  msg.innerHTML = '<div class="alert"><span class="spin"></span> Building your session plan...</div>';
  planCard.style.display = 'none';

  const p = state.gd.players[state.me];
  const rs = [...(p?.rounds || [])].sort((a, b) => parseDateGB(a.date) - parseDateGB(b.date));
  const recent = rs.slice(-5);

  const avgPutts = recent.length
    ? (recent.reduce((a, r) => a + (r.putts || []).filter(Boolean).reduce((x, y) => x + y, 0), 0) / recent.length).toFixed(1)
    : null;
  const avgGIR = recent.length
    ? Math.round(recent.reduce((a, r) => a + (r.gir || []).filter(v => v === 'Yes').length, 0) / (recent.length * 18) * 100)
    : null;
  const avgDiff = recent.length
    ? (recent.reduce((a, r) => a + (r.diff || 0), 0) / recent.length).toFixed(1)
    : null;

  const lastReview = [...rs].reverse().find(r => r.aiReview);
  const reviewContext = lastReview?.aiReview
    ? `The AI previously identified this weakness: "${lastReview.aiReview.negative}". The recommended drill was: "${lastReview.aiReview.drill}".`
    : '';

  const areaLabel = AREA_LABELS[area] || area;
  const focusText = customRequest || areaLabel;
  const prompt = `You are an expert golf coach. Build a focused practice session for ${state.me} (handicap: ${p?.handicap || '?'}, avg vs par: ${avgDiff ? (avgDiff >= 0 ? '+' : '') + avgDiff : '?'}, GIR: ${avgGIR != null ? avgGIR + '%' : '?'}, putts/round: ${avgPutts || '?'}).
${reviewContext}
Focus: ${focusText}. Total shots: 50. Be specific and concise — no filler sentences.

Respond ONLY with valid JSON:
{
  "title": "Short session title",
  "totalShots": 50,
  "focus": "One sentence on the key improvement goal",
  "warmup": "One sentence warmup",
  "drills": [
    {
      "name": "Drill name",
      "shots": 10,
      "instruction": "What to do and how (2 sentences max)",
      "target": "Specific measurable target",
      "successMetric": "Pass/fail criterion",
      "tip": "One coaching cue"
    }
  ],
  "cooldown": "One sentence reflection",
  "keyTakeaway": "One sentence takeaway"
}`;

  try {
    const resp = await fetch('/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1800, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const data = await resp.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const plan = JSON.parse(text.replace(/```json|```/g, '').trim());
    state.practiceState.plan = plan;
    msg.innerHTML = '';
    renderPracticePlan(plan);
  } catch (e) {
    msg.innerHTML = `<div class="alert alert-err">\u26A0\uFE0F Could not generate plan \u2014 ${e.message}. Please try again.</div>`;
  }
}

export function renderPracticePlan(plan) {
  const card = document.getElementById('c-practice-plan');
  const title = document.getElementById('practice-plan-title');
  const shots = document.getElementById('practice-plan-shots');
  const content = document.getElementById('practice-plan-content');
  if (!card || !content) return;

  title.textContent = plan.title || 'Practice Session';
  shots.textContent = `${plan.totalShots || 50} shots`;

  let html = `
    <div style="font-size:13px;color:var(--gold);font-style:italic;margin-bottom:14px;line-height:1.5">"${plan.focus}"</div>
    <div style="padding:10px;background:rgba(255,255,255,.04);border-radius:8px;margin-bottom:12px">
      <div style="font-size:9px;letter-spacing:1.5px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Warm Up</div>
      <div style="font-size:12px;color:var(--cream);line-height:1.5">${plan.warmup || ''}</div>
    </div>`;

  (plan.drills || []).forEach((d, i) => {
    html += `
      <div style="border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:var(--cream)">Drill ${i+1}: ${d.name}</div>
          <div style="font-size:18px;color:var(--gold)">${d.shots} shots</div>
        </div>
        <div style="font-size:12px;color:var(--cream);line-height:1.6;margin-bottom:8px">${d.instruction}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
          <div style="padding:7px;background:rgba(52,152,219,.08);border-radius:6px;border-left:2px solid #3498db">
            <div style="font-size:9px;color:#3498db;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Target</div>
            <div style="font-size:11px;color:var(--cream)">${d.target}</div>
          </div>
          <div style="padding:7px;background:rgba(46,204,113,.08);border-radius:6px;border-left:2px solid #2ecc71">
            <div style="font-size:9px;color:#2ecc71;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Success = </div>
            <div style="font-size:11px;color:var(--cream)">${d.successMetric}</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--gold);font-style:italic"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> ${d.tip}</div>
      </div>`;
  });

  html += `
    <div style="padding:10px;background:rgba(201,168,76,.06);border-radius:8px;margin-bottom:10px">
      <div style="font-size:9px;letter-spacing:1.5px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Cool Down</div>
      <div style="font-size:12px;color:var(--cream);line-height:1.5">${plan.cooldown || ''}</div>
    </div>
    <div style="padding:10px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.2);border-radius:8px">
      <div style="font-size:9px;letter-spacing:1.5px;color:var(--gold);text-transform:uppercase;margin-bottom:4px">Key takeaway</div>
      <div style="font-size:12px;color:var(--cream);font-weight:500;line-height:1.5">${plan.keyTakeaway || ''}</div>
    </div>`;

  content.innerHTML = html;
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function regeneratePlan() {
  if (state.practiceState.area) generatePracticePlan(state.practiceState.area);
}

export function startPracticeSession() {
  const plan = state.practiceState.plan;
  if (!plan) return;
  state.practiceState.shotsLogged = 0;
  state.practiceState.currentDrillIndex = 0;
  state.practiceState.sessionId = Date.now();

  document.getElementById('c-practice-plan').style.display = 'none';
  document.getElementById('c-practice-active').style.display = 'block';
  document.getElementById('c-practice-active').scrollIntoView({ behavior: 'smooth', block: 'start' });

  updateActiveDrillDisplay();
}

function updateActiveDrillDisplay() {
  const plan = state.practiceState.plan;
  if (!plan) return;
  const drills = plan.drills || [];
  const shots = state.practiceState.shotsLogged;
  const total = plan.totalShots || 50;

  document.getElementById('practice-shot-count').textContent = `${shots} / ${total}`;
  document.getElementById('practice-progress-bar').style.width = Math.min(shots / total * 100, 100) + '%';

  let cumulative = 0;
  let drillIdx = 0;
  for (let i = 0; i < drills.length; i++) {
    cumulative += drills[i].shots || 0;
    if (shots < cumulative) { drillIdx = i; break; }
    if (i === drills.length - 1) drillIdx = i;
  }
  state.practiceState.currentDrillIndex = drillIdx;
  const d = drills[drillIdx];

  if (d) {
    document.getElementById('practice-active-drill').innerHTML = `
      <div style="font-size:9px;letter-spacing:1.5px;color:var(--gold);text-transform:uppercase;margin-bottom:6px">Drill ${drillIdx+1} of ${drills.length}: ${d.name}</div>
      <div style="font-size:13px;color:var(--cream);line-height:1.6;margin-bottom:8px">${d.instruction}</div>
      <div style="font-size:11px;color:#3498db;margin-bottom:4px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> ${d.target}</div>
      <div style="font-size:11px;color:var(--gold);font-style:italic"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> ${d.tip}</div>`;
  }
}

export function logPracticeShots(n) {
  const total = state.practiceState.plan?.totalShots || 50;
  state.practiceState.shotsLogged = Math.min(state.practiceState.shotsLogged + n, total);
  updateActiveDrillDisplay();
  if (state.practiceState.shotsLogged >= total) completePracticeSession();
}

export function completePracticeSession() {
  const plan = state.practiceState.plan;
  if (!plan) return;
  const note = document.getElementById('practice-session-note')?.value?.trim() || '';
  const session = {
    id: state.practiceState.sessionId || Date.now(),
    date: new Date().toLocaleDateString('en-GB'),
    area: state.practiceState.area,
    title: plan.title,
    shotsLogged: state.practiceState.shotsLogged,
    note,
    completed: state.practiceState.shotsLogged >= (plan.totalShots || 50)
  };

  if (!state.gd.players[state.me].practiceSessions) state.gd.players[state.me].practiceSessions = [];
  state.gd.players[state.me].practiceSessions.push(session);
  pushData();
  querySupabase('savePracticeSessions', { playerName: state.me, sessions: state.gd.players[state.me].practiceSessions });

  document.getElementById('c-practice-active').style.display = 'none';
  document.getElementById('c-practice-plan').style.display = 'none';
  document.querySelectorAll('.parea-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('practice-gen-msg').innerHTML =
    `<div class="alert alert-ok">\u2705 Session saved \u2014 ${session.shotsLogged} shots logged${note ? ` \u00B7 "${note}"` : ''}.</div>`;
  state.practiceState = { area: null, plan: null, currentDrillIndex: 0, shotsLogged: 0, sessionId: null };
  renderPracticeHistory();
}
