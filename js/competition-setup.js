// ─────────────────────────────────────────────────────────────────
// COMPETITION SETUP
// Create, join, and manage competitions via Supabase.
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { querySupabase } from './api.js';
import { checkAccess, showUpgradePrompt } from './subscription.js';
import { API_BASE } from './config.js';

// ── Code generator ───────────────────────────────────────────────
// Format: COMP + 2 uppercase letters + 4 digits  (e.g. COMPAB1234)
export function generateCompCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits  = '0123456789';
  let code = 'COMP';
  for (let i = 0; i < 2; i++) code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) code += digits[Math.floor(Math.random() * digits.length)];
  return code;
}

// ── Create competition ───────────────────────────────────────────
export async function createCompetition(name, format, roundsConfig, players) {
  const code = generateCompCode();
  const playerList = players?.length ? players : [state.me];
  const res = await querySupabase('createCompetition', {
    competition: {
      code,
      name,
      created_by: state.me,
      admin_players: [state.me],
      format,
      rounds_config: roundsConfig || [],
      players: playerList,
    }
  });
  return res;
}

// ── Join competition ─────────────────────────────────────────────
export async function joinCompetition(code) {
  return querySupabase('joinCompetition', { code, playerName: state.me });
}

// ── Lookup competition ───────────────────────────────────────────
export async function lookupCompetition(code) {
  return querySupabase('lookupCompetition', { code });
}

// ── Course search helper (lightweight, no global state) ─────────
let _searchTimer = null;
async function searchCourses(query) {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/courses?action=search&name=${encodeURIComponent(query)}`);
    const data = await res.json();
    return data?.courses || [];
  } catch { return []; }
}

// Tee colour dot map
const TEE_DOTS = { blue:'#5dade2', yellow:'#f4d03f', white:'#f0e8d0', red:'#e74c3c', black:'#333' };

// ── Setup modal ──────────────────────────────────────────────────
export function renderCompetitionSetupModal() {
  if (!checkAccess('competitions')) { showUpgradePrompt('competitions'); return; }
  const modal = document.getElementById('comp-setup-modal');
  if (!modal) return;
  modal.style.display = 'block';
  modal.scrollTop = 0;

  const content = document.getElementById('comp-setup-content');
  if (!content) return;

  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
      <button id="comp-setup-close" style="background:none;border:none;color:var(--cream);font-size:20px;cursor:pointer;padding:4px">←</button>
      <div style="font-size:17px;font-weight:700;color:var(--cream)">Create Competition</div>
    </div>

    <label style="font-size:12px;color:var(--dim);margin-bottom:6px;display:block">Competition Name</label>
    <input type="text" id="comp-setup-name" placeholder="e.g. Spring Invitational 2026" style="width:100%;box-sizing:border-box;margin-bottom:16px;padding:12px;background:var(--mid);border:1px solid var(--border);border-radius:10px;color:var(--cream);font-size:14px;font-family:'DM Sans',sans-serif">

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <label style="font-size:12px;color:var(--dim);margin:0">Rounds</label>
      <button id="comp-add-round-btn" class="btn btn-ghost" style="font-size:10px;padding:4px 12px;width:auto">+ Add round</button>
    </div>
    <div id="comp-rounds-list" style="margin-bottom:16px"></div>

    <label style="font-size:12px;color:var(--dim);margin-bottom:6px;display:block">Scoring</label>
    <div class="theme-toggle-wrap" id="comp-scoring-wrap" style="margin-bottom:12px">
      <button class="theme-tab active" data-scoring="stableford">Stableford</button>
      <button class="theme-tab" data-scoring="stroke">Stroke</button>
      <button class="theme-tab" data-scoring="matchplay">Match Play</button>
    </div>

    <label style="font-size:12px;color:var(--dim);margin-bottom:6px;display:block">Handicap</label>
    <div class="theme-toggle-wrap" id="comp-hcp-wrap" style="margin-bottom:18px">
      <button class="theme-tab active" data-hcp="net">Net</button>
      <button class="theme-tab" data-hcp="gross">Gross</button>
    </div>

    <label style="font-size:12px;color:var(--dim);margin-bottom:6px;display:block">Players</label>
    <div style="font-size:11px;color:var(--dimmer);margin-bottom:8px">Tap to invite league members. Players can also join with the competition code.</div>
    <div id="comp-player-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px"></div>

    <button id="comp-create-btn" class="btn" style="width:100%;border-radius:40px;padding:16px;font-size:15px">Create Competition →</button>
    <div id="comp-setup-msg" style="margin-top:8px;font-size:11px;color:var(--dim);text-align:center"></div>
    <button id="comp-setup-cancel" style="width:100%;padding:12px;margin-top:8px;border-radius:40px;background:transparent;border:1px solid var(--border);color:var(--dim);font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer">Cancel</button>
  `;

  // State
  let selectedScoring = 'stableford';
  let selectedHcp = 'net';
  let rounds = [];

  // Toggle helpers
  function wireToggle(wrapId, attr, setter) {
    content.querySelectorAll(`#${wrapId} .theme-tab`).forEach(btn => {
      btn.addEventListener('click', () => {
        content.querySelectorAll(`#${wrapId} .theme-tab`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setter(btn.dataset[attr]);
      });
    });
  }
  wireToggle('comp-scoring-wrap', 'scoring', v => { selectedScoring = v; });
  wireToggle('comp-hcp-wrap', 'hcp', v => { selectedHcp = v; });

  // Player chips — league members as tappable invite pills
  const invitedPlayers = new Set([state.me]);
  function renderPlayerChips() {
    const chipsEl = document.getElementById('comp-player-chips');
    if (!chipsEl) return;
    const allPlayers = Object.keys(state.gd.players || {});
    chipsEl.innerHTML = allPlayers.map(name => {
      const on = invitedPlayers.has(name);
      const isMe = name === state.me;
      return `<button class="comp-invite-chip" data-player="${name}" style="padding:6px 12px;border-radius:20px;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:${isMe ? 'default' : 'pointer'};border:1.5px solid ${on ? 'var(--gold)' : 'var(--border)'};background:${on ? 'rgba(201,168,76,.12)' : 'transparent'};color:${on ? 'var(--gold)' : 'var(--dim)'};opacity:${isMe ? '.6' : '1'}">${name}${isMe ? ' (you)' : ''}</button>`;
    }).join('');
    chipsEl.querySelectorAll('.comp-invite-chip').forEach(chip => {
      const name = chip.dataset.player;
      if (name === state.me) return; // can't remove yourself
      chip.addEventListener('click', () => {
        invitedPlayers.has(name) ? invitedPlayers.delete(name) : invitedPlayers.add(name);
        renderPlayerChips();
      });
    });
  }
  renderPlayerChips();

  // Rounds list
  const roundsList = document.getElementById('comp-rounds-list');

  function renderRounds() {
    roundsList.innerHTML = '';
    if (!rounds.length) {
      roundsList.innerHTML = '<div style="font-size:11px;color:var(--dimmer);padding:8px 0;text-align:center">No rounds added yet — tap "+ Add round"</div>';
      return;
    }
    rounds.forEach((r, i) => {
      const teeHtml = (r.tees || []).map(t => {
        const dot = TEE_DOTS[t.colour] || '#888';
        const sel = r.tee === t.colour;
        return `<button class="comp-tee-pill" data-idx="${i}" data-tee="${t.colour}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:14px;font-size:10px;border:1px solid ${sel ? 'rgba(201,168,76,.5)' : 'var(--wa-12)'};background:${sel ? 'rgba(201,168,76,.08)' : 'transparent'};color:${sel ? 'var(--gold)' : 'var(--dim)'};cursor:pointer;font-family:'DM Sans',sans-serif"><span style="width:6px;height:6px;border-radius:50%;background:${dot}"></span>${t.colour}</button>`;
      }).join('');

      const card = document.createElement('div');
      card.style.cssText = 'background:var(--mid);border-radius:10px;padding:12px;margin-bottom:8px';
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:12px;font-weight:600;color:var(--gold)">Round ${i + 1}</div>
          <button data-idx="${i}" class="comp-round-del" style="background:none;border:none;color:var(--dimmer);font-size:16px;cursor:pointer;padding:0 4px">&times;</button>
        </div>
        <label style="font-size:10px;color:var(--dimmer);margin-bottom:4px;display:block">Date</label>
        <input type="date" value="${r.date || ''}" style="width:100%;box-sizing:border-box;margin-bottom:10px;font-size:14px;padding:10px 12px;background:var(--navy);border:1px solid var(--border);border-radius:8px;color:var(--cream)" data-idx="${i}" class="comp-round-date">
        <label style="font-size:10px;color:var(--dimmer);margin-bottom:4px;display:block">Course</label>
        <div style="position:relative">
          <input type="text" placeholder="Search courses..." value="${r.course || ''}" style="width:100%;box-sizing:border-box;font-size:13px;padding:10px 12px;background:var(--navy);border:1px solid var(--border);border-radius:8px;color:var(--cream)" data-idx="${i}" class="comp-round-course">
          <div class="comp-course-results" data-idx="${i}" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;background:var(--card);border:1px solid var(--wa-12);border-radius:0 0 9px 9px;max-height:150px;overflow-y:auto"></div>
        </div>
        ${teeHtml ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${teeHtml}</div>` : ''}
      `;
      roundsList.appendChild(card);
    });

    // Bind date inputs
    roundsList.querySelectorAll('.comp-round-date').forEach(inp => {
      inp.addEventListener('change', () => { rounds[parseInt(inp.dataset.idx)].date = inp.value; });
    });

    // Bind course search inputs
    roundsList.querySelectorAll('.comp-round-course').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.idx);
        rounds[idx].course = inp.value;
        clearTimeout(_searchTimer);
        const resultsEl = roundsList.querySelector(`.comp-course-results[data-idx="${idx}"]`);
        if (inp.value.length < 2) { if (resultsEl) resultsEl.style.display = 'none'; return; }
        _searchTimer = setTimeout(async () => {
          const results = await searchCourses(inp.value);
          if (!resultsEl) return;
          if (!results.length) { resultsEl.style.display = 'none'; return; }
          resultsEl.style.display = 'block';
          resultsEl.innerHTML = results.slice(0, 6).map((c, ri) =>
            `<div class="comp-course-result" data-idx="${idx}" data-ri="${ri}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--wa-06);font-size:12px;color:var(--cream)">${c.name}<div style="font-size:10px;color:var(--dimmer)">${c.location || ''}</div></div>`
          ).join('');
          // Store results for selection
          resultsEl._results = results.slice(0, 6);
          resultsEl.querySelectorAll('.comp-course-result').forEach(row => {
            row.addEventListener('click', async () => {
              const ri = parseInt(row.dataset.ri);
              const selected = resultsEl._results[ri];
              rounds[idx].course = selected.name;
              rounds[idx].courseId = selected.external_course_id;
              // Fetch full course detail for tees
              try {
                const fetchRes = await fetch(`${API_BASE}/.netlify/functions/courses?action=fetch&courseId=${encodeURIComponent(selected.external_course_id)}&clubId=${encodeURIComponent(selected.external_club_id || '')}`);
                const fetchData = await fetchRes.json();
                if (fetchData?.course?.tees) {
                  rounds[idx].tees = fetchData.course.tees;
                  rounds[idx].tee = fetchData.course.tees[0]?.colour || '';
                }
              } catch { /* tee fetch failed — continue without */ }
              renderRounds();
            });
          });
        }, 400);
      });
      // Hide dropdown on blur (slight delay so click registers)
      inp.addEventListener('blur', () => {
        setTimeout(() => {
          const resultsEl = roundsList.querySelector(`.comp-course-results[data-idx="${inp.dataset.idx}"]`);
          if (resultsEl) resultsEl.style.display = 'none';
        }, 200);
      });
    });

    // Bind tee pills
    roundsList.querySelectorAll('.comp-tee-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        rounds[idx].tee = btn.dataset.tee;
        renderRounds();
      });
    });

    // Bind delete
    roundsList.querySelectorAll('.comp-round-del').forEach(btn => {
      btn.addEventListener('click', () => { rounds.splice(parseInt(btn.dataset.idx), 1); renderRounds(); });
    });
  }
  renderRounds();

  // Add round
  document.getElementById('comp-add-round-btn')?.addEventListener('click', () => {
    rounds.push({ date: '', course: '', courseId: '', tee: '', tees: [] });
    renderRounds();
  });

  // Close / Cancel
  const closeSetup = () => { modal.style.display = 'none'; };
  document.getElementById('comp-setup-close')?.addEventListener('click', closeSetup);
  document.getElementById('comp-setup-cancel')?.addEventListener('click', closeSetup);

  // Create
  document.getElementById('comp-create-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('comp-setup-name')?.value?.trim();
    const msg = document.getElementById('comp-setup-msg');
    if (!name) { if (msg) msg.textContent = 'Please enter a competition name.'; return; }

    // Combine scoring + handicap into format string
    let format;
    if (selectedScoring === 'matchplay') format = 'matchplay';
    else if (selectedScoring === 'stableford') format = selectedHcp === 'gross' ? 'stableford_gross' : 'stableford';
    else format = selectedHcp === 'net' ? 'stroke_net' : 'stroke_gross';

    const btn = document.getElementById('comp-create-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    const roundsConfig = rounds.map((r, i) => ({
      day: i + 1,
      date: r.date ? r.date.split('-').reverse().join('/') : '',
      course: r.course || '',
      courseId: r.courseId || '',
      tee: r.tee || '',
    }));

    try {
      const res = await createCompetition(name, format, roundsConfig, [...invitedPlayers]);
      if (res?.ok && res.competition) {
        const code = res.competition.code;
        navigator.clipboard?.writeText(code).catch(() => {});
        // Show success with code, then auto-close after brief display
        if (msg) msg.innerHTML = `<span style="color:var(--par)">Created!</span> Code copied: <strong style="color:var(--gold);letter-spacing:2px;font-size:16px">${code}</strong>`;
        if (btn) {
          btn.textContent = 'Go to competition →';
          btn.disabled = false;
          btn.onclick = () => {
            modal.style.display = 'none';
            import('./nav.js').then(m => m.goTo('competition'));
          };
        }
      } else {
        if (msg) msg.textContent = 'Error creating competition. Try again.';
        if (btn) { btn.disabled = false; btn.textContent = 'Create Competition →'; }
      }
    } catch (e) {
      if (msg) msg.textContent = 'Network error. Try again.';
      if (btn) { btn.disabled = false; btn.textContent = 'Create Competition →'; }
    }
  });
}

// ── My Competitions list (shown in Round tab) ───────────────────

export async function renderMyCompetitions() {
  const el = document.getElementById('my-competitions-list');
  if (!el) return;
  if (!state.me) { el.innerHTML = ''; return; }

  let comps = [];
  try {
    const res = await querySupabase('getMyCompetitions', { playerName: state.me });
    comps = res?.competitions || [];
  } catch { /* ignore */ }

  if (!comps.length) {
    el.innerHTML = '';
    return;
  }

  const statusLabel = { setup: 'Setting up', active: 'Live', complete: 'Complete' };
  const statusColor = { setup: 'var(--dim)', active: 'var(--par)', complete: 'var(--gold)' };

  el.innerHTML = `<div style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--dim);margin-bottom:8px;padding:0 2px">My Competitions</div>` +
    comps.map(c => {
      const players = c.players?.length || 0;
      const rounds = c.rounds_config?.length || 0;
      const fmt = (c.format || '').replace('_', ' ');
      const status = statusLabel[c.status] || c.status;
      const sColor = statusColor[c.status] || 'var(--dim)';
      return `<div class="comp-list-item" data-comp-id="${c.id}" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--mid);border-radius:10px;margin-bottom:6px;cursor:pointer;border:1px solid var(--wa-06);transition:border-color .15s">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
          <div style="font-size:10px;color:var(--dim);margin-top:2px">${fmt} · ${players} player${players !== 1 ? 's' : ''} · ${rounds} round${rounds !== 1 ? 's' : ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:10px;font-weight:600;color:${sColor}">${status}</div>
          <div style="font-size:10px;color:var(--dimmer);margin-top:1px">${c.code}</div>
        </div>
      </div>`;
    }).join('');

  // Wire click → navigate to competition view
  el.querySelectorAll('.comp-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const compId = item.dataset.compId;
      const comp = comps.find(c => c.id === compId);
      state.activeCompetitionId = compId;
      state.activeCompetition = comp || null;
      import('./nav.js').then(({ goTo }) => goTo('competition'));
    });
  });
}

// ── AI Commentary ────────────────────────────────────────────────

async function callAI(prompt) {
  const res = await fetch(API_BASE + '/.netlify/functions/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  return data?.content?.[0]?.text || data?.error || '';
}

function buildPlayerSummary(comp) {
  const players = comp.players || [];
  return players.map(name => {
    const p = state.gd.players?.[name];
    const hcp = comp.hcp_overrides?.[name] ?? p?.handicap ?? '?';
    const recentWith = (p?.rounds || []).slice(-5).flatMap(r => r.playedWith || []);
    const rivals = [...new Set(recentWith)].filter(n => players.includes(n)).slice(0, 2);
    return `${name} (HCP ${hcp})${rivals.length ? ' — recently played with ' + rivals.join(', ') : ''}`;
  }).join('\n');
}

export async function generateCompPreview(comp) {
  const courses = (comp.rounds_config || []).map(r => r.course).filter(Boolean).join(', ') || 'TBC';
  const numRounds = (comp.rounds_config || []).length || '?';
  const fmt = (comp.format || '').replace('_', ' ');
  const prompt = `Competition: "${comp.name}"
Format: ${fmt}, ${numRounds} round(s), Course(s): ${courses}
Players:
${buildPlayerSummary(comp)}

Write a short, punchy, tongue-in-cheek competition preview for a group of amateur golfers. 2-3 sentences max. Mention 1-2 players by name. Tone: sports desk meets golf club bar. End with a one-line call to action to join. Do not use markdown formatting.`;
  return callAI(prompt);
}

export async function generateHalftimeSummary(comp, standings) {
  const fmt = (comp.format || '').replace('_', ' ');
  const leader = standings[0];
  const leaderStr = leader ? `${leader.name} leads with ${leader.aggregate} ${fmt === 'stableford' ? 'pts' : 'total'}` : 'No clear leader';
  const prompt = `Competition: "${comp.name}" (${fmt})
Current standings after round 1:
${standings.map((s, i) => `${i + 1}. ${s.name} — ${s.aggregate} (${s.roundsPlayed} round(s))`).join('\n')}

Write a half-time summary for an amateur golf competition. 2-3 sentences. Tongue-in-cheek tone. Mention the leader by name, one notable performance (good or bad), and raise the stakes for the next round. Do not use markdown formatting.`;
  return callAI(prompt);
}

export async function generateFinalSummary(comp, standings) {
  const fmt = (comp.format || '').replace('_', ' ');
  const winner = standings[0];
  const prompt = `Competition: "${comp.name}" (${fmt})
Final standings:
${standings.map((s, i) => `${i + 1}. ${s.name} — ${s.aggregate} (${s.roundsPlayed} round(s))`).join('\n')}

Write the final summary for an amateur golf competition. 3-4 sentences. Announce the winner by name. Mention one heroic moment and one disaster. Tone: mock-serious sports commentary. End with a one-liner that will get a laugh in the group chat. Do not use markdown formatting.`;
  return callAI(prompt);
}

// ── Join modal ───────────────────────────────────────────────────
const COMP_CODE_RE = /^COMP[A-Z]{2}\d{4}$/;

export function renderJoinCompetitionModal() {
  const modal = document.getElementById('comp-setup-modal');
  if (!modal) return;
  modal.style.display = 'block';
  modal.scrollTop = 0;

  const content = document.getElementById('comp-setup-content');
  if (!content) return;

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-family:'DM Sans',sans-serif;font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase">Join Competition</div>
      <button id="comp-join-close" style="background:none;border:none;color:var(--dim);font-size:18px;cursor:pointer">&times;</button>
    </div>
    <div style="font-size:12px;color:var(--dim);margin-bottom:14px;line-height:1.5">Enter the competition code shared by your organiser.</div>
    <input type="text" id="comp-join-modal-code" placeholder="e.g. COMPAB1234" style="text-transform:uppercase;letter-spacing:3px;font-size:16px;text-align:center;margin-bottom:6px" maxlength="10">
    <div id="comp-join-modal-preview" style="min-height:40px;margin-bottom:10px"></div>
    <button id="comp-join-modal-btn" class="btn" style="width:100%;border-radius:40px" disabled>Join Competition</button>
    <div id="comp-join-modal-msg" style="margin-top:8px;font-size:11px;color:var(--dim);text-align:center"></div>
  `;

  let lookedUpComp = null;

  // Close
  document.getElementById('comp-join-close')?.addEventListener('click', () => { modal.style.display = 'none'; });

  // Live validation + preview on input
  const codeInput = document.getElementById('comp-join-modal-code');
  const preview = document.getElementById('comp-join-modal-preview');
  const joinBtn = document.getElementById('comp-join-modal-btn');

  codeInput?.addEventListener('input', async () => {
    const code = codeInput.value.trim().toUpperCase();
    lookedUpComp = null;
    if (joinBtn) joinBtn.disabled = true;

    if (!code) { if (preview) preview.innerHTML = ''; return; }

    if (!COMP_CODE_RE.test(code)) {
      if (preview) preview.innerHTML = '<div style="font-size:11px;color:var(--dimmer)">Format: COMP + 2 letters + 4 digits</div>';
      return;
    }

    if (preview) preview.innerHTML = '<div style="font-size:11px;color:var(--dim)"><span class="spin"></span> Looking up...</div>';

    try {
      const res = await lookupCompetition(code);
      if (res?.found) {
        lookedUpComp = res.competition;
        const playerCount = res.competition.players?.length || 0;
        const fmt = res.competition.format?.replace('_', ' ') || '';
        if (preview) preview.innerHTML = `
          <div style="padding:10px 12px;background:var(--mid);border-radius:8px;border:1px solid rgba(201,168,76,.2)">
            <div style="font-size:14px;font-weight:600;color:var(--cream)">${res.competition.name}</div>
            <div style="font-size:11px;color:var(--dim);margin-top:3px">${fmt} · ${playerCount} player${playerCount !== 1 ? 's' : ''}</div>
          </div>`;
        if (joinBtn) joinBtn.disabled = false;
      } else {
        if (preview) preview.innerHTML = '<div style="font-size:11px;color:var(--double)">Competition not found. Check the code.</div>';
      }
    } catch {
      if (preview) preview.innerHTML = '<div style="font-size:11px;color:var(--double)">Network error.</div>';
    }
  });

  // Join button
  joinBtn?.addEventListener('click', async () => {
    if (!lookedUpComp) return;
    const msg = document.getElementById('comp-join-modal-msg');
    const code = codeInput?.value?.trim()?.toUpperCase();

    if (lookedUpComp.players?.includes(state.me)) {
      if (msg) msg.innerHTML = `You're already in <strong>${lookedUpComp.name}</strong>.`;
      return;
    }

    if (joinBtn) { joinBtn.disabled = true; joinBtn.textContent = 'Joining...'; }

    try {
      const res = await joinCompetition(code);
      if (res?.ok) {
        if (msg) msg.innerHTML = `<span style="color:var(--par)">Joined <strong>${lookedUpComp.name}</strong>!</span>`;
        if (joinBtn) { joinBtn.textContent = 'Done'; }
      } else {
        if (msg) msg.textContent = 'Could not join. Try again.';
        if (joinBtn) { joinBtn.disabled = false; joinBtn.textContent = 'Join Competition'; }
      }
    } catch {
      if (msg) msg.textContent = 'Network error. Try again.';
      if (joinBtn) { joinBtn.disabled = false; joinBtn.textContent = 'Join Competition'; }
    }
  });

  // Enter key
  codeInput?.addEventListener('keydown', e => { if (e.key === 'Enter' && !joinBtn?.disabled) joinBtn?.click(); });
}
