// ─────────────────────────────────────────────────────────────────
// COMPETITION SETUP
// Create, join, and manage competitions via Supabase.
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { querySupabase } from './api.js';

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
export async function createCompetition(name, format, roundsConfig) {
  const code = generateCompCode();
  const res = await querySupabase('createCompetition', {
    competition: {
      code,
      name,
      created_by: state.me,
      admin_players: [state.me],
      format,
      rounds_config: roundsConfig || [],
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

// ── Setup modal ──────────────────────────────────────────────────
export function renderCompetitionSetupModal() {
  const modal = document.getElementById('comp-setup-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  const content = document.getElementById('comp-setup-content');
  if (!content) return;

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-family:'DM Sans',sans-serif;font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase">Create Competition</div>
      <button id="comp-setup-close" style="background:none;border:none;color:var(--dim);font-size:18px;cursor:pointer">&times;</button>
    </div>

    <label style="font-size:12px;color:var(--dim);margin-bottom:6px;display:block">Competition Name</label>
    <input type="text" id="comp-setup-name" placeholder="e.g. Spring Invitational 2026" style="margin-bottom:14px">

    <label style="font-size:12px;color:var(--dim);margin-bottom:6px;display:block">Format</label>
    <div class="theme-toggle-wrap" id="comp-format-wrap" style="margin-bottom:14px">
      <button class="theme-tab active" data-fmt="stableford">Stableford</button>
      <button class="theme-tab" data-fmt="stroke_gross">Gross</button>
      <button class="theme-tab" data-fmt="stroke_net">Net</button>
      <button class="theme-tab" data-fmt="matchplay">Match Play</button>
    </div>

    <label style="font-size:12px;color:var(--dim);margin-bottom:6px;display:block">Rounds</label>
    <div id="comp-rounds-list" style="margin-bottom:10px"></div>
    <button id="comp-add-round-btn" class="btn btn-ghost" style="font-size:11px;padding:6px 14px;margin-bottom:16px">+ Add round</button>

    <button id="comp-create-btn" class="btn" style="width:100%;border-radius:40px">Create Competition</button>
    <div id="comp-setup-msg" style="margin-top:8px;font-size:11px;color:var(--dim);text-align:center"></div>
  `;

  // State
  let selectedFormat = 'stableford';
  let rounds = [];
  let roundCounter = 0;

  // Format toggle
  content.querySelectorAll('#comp-format-wrap .theme-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('#comp-format-wrap .theme-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFormat = btn.dataset.fmt;
    });
  });

  // Rounds list
  const roundsList = document.getElementById('comp-rounds-list');
  function renderRounds() {
    roundsList.innerHTML = '';
    if (!rounds.length) {
      roundsList.innerHTML = '<div style="font-size:11px;color:var(--dimmer);padding:4px 0">No rounds added yet.</div>';
      return;
    }
    rounds.forEach((r, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--mid);border-radius:8px;margin-bottom:6px';
      row.innerHTML = `
        <div style="font-size:12px;color:var(--gold);font-weight:600;width:20px;flex-shrink:0">R${i + 1}</div>
        <input type="date" value="${r.date || ''}" style="flex:1;font-size:12px" data-idx="${i}" class="comp-round-date">
        <input type="text" placeholder="Course" value="${r.course || ''}" style="flex:2;font-size:12px" data-idx="${i}" class="comp-round-course">
        <button data-idx="${i}" class="comp-round-del" style="background:none;border:none;color:var(--dimmer);font-size:16px;cursor:pointer;padding:0 4px">&times;</button>
      `;
      roundsList.appendChild(row);
    });
    // Bind inputs
    roundsList.querySelectorAll('.comp-round-date').forEach(inp => {
      inp.addEventListener('change', () => { rounds[parseInt(inp.dataset.idx)].date = inp.value; });
    });
    roundsList.querySelectorAll('.comp-round-course').forEach(inp => {
      inp.addEventListener('input', () => { rounds[parseInt(inp.dataset.idx)].course = inp.value; });
    });
    roundsList.querySelectorAll('.comp-round-del').forEach(btn => {
      btn.addEventListener('click', () => { rounds.splice(parseInt(btn.dataset.idx), 1); renderRounds(); });
    });
  }
  renderRounds();

  // Add round
  document.getElementById('comp-add-round-btn')?.addEventListener('click', () => {
    roundCounter++;
    rounds.push({ day: roundCounter, date: '', course: '', tee: '' });
    renderRounds();
  });

  // Close
  document.getElementById('comp-setup-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Create
  document.getElementById('comp-create-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('comp-setup-name')?.value?.trim();
    const msg = document.getElementById('comp-setup-msg');
    if (!name) { if (msg) msg.textContent = 'Please enter a competition name.'; return; }

    const btn = document.getElementById('comp-create-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    const roundsConfig = rounds.map((r, i) => ({
      day: i + 1,
      date: r.date ? r.date.split('-').reverse().join('/') : '',
      course: r.course || '',
      tee: r.tee || '',
    }));

    try {
      const res = await createCompetition(name, selectedFormat, roundsConfig);
      if (res?.ok && res.competition) {
        const code = res.competition.code;
        if (msg) msg.innerHTML = `<span style="color:var(--par)">Created!</span> Share code: <strong style="color:var(--gold);letter-spacing:2px">${code}</strong>`;
        if (btn) { btn.textContent = 'Done'; btn.disabled = true; }
        // Copy code to clipboard
        navigator.clipboard?.writeText(code).catch(() => {});
      } else {
        if (msg) msg.textContent = 'Error creating competition. Try again.';
        if (btn) { btn.disabled = false; btn.textContent = 'Create Competition'; }
      }
    } catch (e) {
      if (msg) msg.textContent = 'Network error. Try again.';
      if (btn) { btn.disabled = false; btn.textContent = 'Create Competition'; }
    }
  });
}

// ── Join flow (called from app.js) ───────────────────────────────
export async function handleJoinCompetition() {
  const input = document.getElementById('comp-join-code');
  const msg = document.getElementById('comp-join-msg');
  const code = input?.value?.trim()?.toUpperCase();
  if (!code) { if (msg) msg.textContent = 'Enter a competition code.'; return; }

  if (msg) msg.innerHTML = '<span class="spin"></span> Looking up...';

  try {
    const lookup = await lookupCompetition(code);
    if (!lookup?.found) {
      if (msg) msg.textContent = 'Competition not found. Check the code.';
      return;
    }

    const comp = lookup.competition;
    if (comp.players?.includes(state.me)) {
      if (msg) msg.innerHTML = `You're already in <strong>${comp.name}</strong>.`;
      return;
    }

    const res = await joinCompetition(code);
    if (res?.ok) {
      if (msg) msg.innerHTML = `<span style="color:var(--par)">Joined <strong>${comp.name}</strong>!</span>`;
      if (input) input.value = '';
    } else {
      if (msg) msg.textContent = 'Could not join. Try again.';
    }
  } catch {
    if (msg) msg.textContent = 'Network error. Try again.';
  }
}
