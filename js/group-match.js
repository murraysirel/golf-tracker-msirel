// ─────────────────────────────────────────────────────────────────
// GROUP MATCH — creation, joining, and active-match UI helpers
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { pushGist } from './api.js';

// ── Helpers ───────────────────────────────────────────────────────

function generateMatchId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function todayGB() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function showMatchToast(msg) {
  let toast = document.getElementById('match-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'match-toast';
    toast.style.cssText = [
      'position:fixed',
      'top:calc(var(--safe-top) + 64px)',
      'left:50%',
      'transform:translateX(-50%)',
      'background:var(--card)',
      'border:1px solid rgba(201,168,76,.4)',
      'border-radius:20px',
      'padding:10px 22px',
      'font-size:13px',
      'font-family:"DM Sans",sans-serif',
      'z-index:9999',
      'pointer-events:none',
      'box-shadow:0 4px 20px rgba(0,0,0,.4)',
      'white-space:nowrap',
      'transition:opacity .3s'
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.style.color = 'var(--gold)';
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 320);
  }, 2500);
}

// ── Button visibility ─────────────────────────────────────────────

export function updateGroupMatchButtonVisibility() {
  const row = document.getElementById('group-match-btns');
  if (row) row.style.display = state.gameMode === 'stroke' ? '' : 'none';
}

// ── Active match badge ────────────────────────────────────────────

export function updateActiveMatchBadge() {
  const badge = document.getElementById('active-match-badge');
  if (!badge) return;
  if (state.currentMatchId && state.gd.matches?.[state.currentMatchId]) {
    const m = state.gd.matches[state.currentMatchId];
    badge.textContent = '🏆 Active match: ' + m.name;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

// ── Create match — Screen 1 ───────────────────────────────────────

export function openCreateMatchModal() {
  const modal = document.getElementById('create-match-modal');
  if (!modal) return;
  _renderScreen1(modal);
  modal.style.display = 'flex';
}

function _renderScreen1(modal) {
  const inner = document.getElementById('create-match-inner');
  if (!inner) return;

  // Copy course options from the main selector (already populated by populateCourses)
  const mainSel = document.getElementById('course-sel');
  const courseOptionsHTML = mainSel ? mainSel.innerHTML : '<option value="">— Select Course —</option>';

  const allPlayers = Object.keys(state.gd.players || {});
  const today = todayGB();

  const chipsHtml = allPlayers.map(name => {
    const isMe = name === state.me;
    const hcp = state.gd.players[name]?.handicap ?? 0;
    const safeId = 'mcr-hcp-' + name.replace(/[^a-z0-9]/gi, '-');
    const selBorder = isMe ? 'var(--gold)' : 'var(--border)';
    const selBg = isMe ? 'rgba(201,168,76,.1)' : 'transparent';
    const nameColor = isMe ? 'var(--gold)' : 'var(--cream)';
    const nameFw = isMe ? '600' : '400';
    const checkBorder = isMe ? 'var(--gold)' : 'var(--border)';
    const checkBg = isMe ? 'var(--gold)' : 'transparent';
    return `
      <div class="mcr-chip" data-player="${name}" data-selected="${isMe ? '1' : ''}"
        style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;
          border:1.5px solid ${selBorder};background:${selBg};margin-bottom:6px;cursor:pointer;
          -webkit-tap-highlight-color:transparent">
        <div style="flex:1">
          <span class="mcr-chip-name" style="font-size:13px;font-weight:${nameFw};color:${nameColor}">
            ${name}${isMe ? ' <span style="font-size:10px;opacity:.7">(you)</span>' : ''}
          </span>
        </div>
        <span style="font-size:11px;color:var(--dim)">Gets</span>
        <input type="number" id="${safeId}" value="${hcp}" min="0" max="54"
          style="width:44px;text-align:center;font-size:13px;padding:4px;border-radius:6px;
            background:var(--mid);border:1px solid var(--border);color:var(--cream)"
          onclick="event.stopPropagation()">
        <span style="font-size:11px;color:var(--dim)">strokes</span>
        <div class="mcr-chip-check" style="width:16px;height:16px;border-radius:50%;flex-shrink:0;
          border:2px solid ${checkBorder};background:${checkBg}"></div>
      </div>`;
  }).join('');

  inner.innerHTML = `
    <div style="font-size:19px;font-weight:700;color:var(--cream);margin-bottom:18px;
      font-family:'Cormorant Garamond',serif">Start a Group Match</div>

    <div style="margin-bottom:12px">
      <label style="font-size:10px;color:var(--dim);letter-spacing:1.5px;text-transform:uppercase">Match Name</label>
      <input type="text" id="mcr-name" placeholder="e.g. Princes Away Day"
        style="width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border-radius:8px;
          background:var(--mid);border:1px solid var(--border);color:var(--cream);
          font-size:14px;font-family:'DM Sans',sans-serif">
    </div>

    <div style="margin-bottom:12px">
      <label style="font-size:10px;color:var(--dim);letter-spacing:1.5px;text-transform:uppercase">Course</label>
      <select id="mcr-course"
        style="width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border-radius:8px;
          background:var(--mid);border:1px solid var(--border);color:var(--cream);font-size:13px">
        ${courseOptionsHTML}
      </select>
    </div>

    <div style="margin-bottom:16px">
      <label style="font-size:10px;color:var(--dim);letter-spacing:1.5px;text-transform:uppercase">Date</label>
      <input type="text" id="mcr-date" value="${today}" placeholder="DD/MM/YYYY"
        style="width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border-radius:8px;
          background:var(--mid);border:1px solid var(--border);color:var(--cream);
          font-size:14px;font-family:'DM Sans',sans-serif">
    </div>

    <div style="margin-bottom:18px">
      <label style="font-size:10px;color:var(--dim);letter-spacing:1.5px;text-transform:uppercase">
        Players &amp; Playing Handicaps
      </label>
      <div style="margin-top:8px" id="mcr-chips">${chipsHtml}</div>
    </div>

    <div id="mcr-err" style="display:none;font-size:12px;color:var(--double);margin-bottom:8px"></div>
    <button id="mcr-create-btn"
      style="width:100%;padding:14px;border-radius:10px;background:var(--gold);border:none;
        color:var(--navy);font-size:15px;font-weight:700;font-family:'DM Sans',sans-serif;cursor:pointer">
      Create match →
    </button>
    <button id="mcr-cancel-btn"
      style="width:100%;padding:10px;margin-top:8px;border-radius:10px;background:transparent;
        border:1px solid var(--border);color:var(--dim);font-size:13px;
        font-family:'DM Sans',sans-serif;cursor:pointer">
      Cancel
    </button>`;

  // Track selected players
  inner.querySelectorAll('.mcr-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const name = chip.dataset.player;
      const currently = chip.dataset.selected === '1';
      if (currently && name === state.me) return; // can't deselect yourself
      const next = !currently;
      chip.dataset.selected = next ? '1' : '';
      const gold = 'var(--gold)', border = 'var(--border)';
      chip.style.borderColor = next ? gold : border;
      chip.style.background = next ? 'rgba(201,168,76,.1)' : 'transparent';
      const nameEl = chip.querySelector('.mcr-chip-name');
      if (nameEl) { nameEl.style.color = next ? gold : 'var(--cream)'; nameEl.style.fontWeight = next ? '600' : '400'; }
      const check = chip.querySelector('.mcr-chip-check');
      if (check) { check.style.borderColor = next ? gold : border; check.style.background = next ? gold : 'transparent'; }
    });
  });

  document.getElementById('mcr-cancel-btn').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('mcr-create-btn').addEventListener('click', () => {
    _handleCreate(modal, inner);
  });
}

function _handleCreate(modal, inner) {
  const errEl = document.getElementById('mcr-err');
  const matchName = document.getElementById('mcr-name')?.value.trim();
  const courseSel = document.getElementById('mcr-course');
  const courseRef = courseSel?.value;
  const date = document.getElementById('mcr-date')?.value.trim() || todayGB();

  if (!matchName) { errEl.textContent = 'Please enter a match name.'; errEl.style.display = 'block'; return; }
  if (!courseRef) { errEl.textContent = 'Please select a course.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  // Collect selected players
  const players = [];
  inner.querySelectorAll('.mcr-chip').forEach(chip => {
    if (chip.dataset.selected !== '1') return;
    const name = chip.dataset.player;
    const safeId = 'mcr-hcp-' + name.replace(/[^a-z0-9]/gi, '-');
    const hcp = parseInt(document.getElementById(safeId)?.value) || 0;
    players.push({ name, handicap: hcp, enrolled: name === state.me });
  });
  if (!players.length) { errEl.textContent = 'Select at least one player.'; errEl.style.display = 'block'; return; }

  // Resolve course name (strip parenthetical location suffix added by populateCourses)
  const selOpt = courseSel.options[courseSel.selectedIndex];
  const courseName = selOpt ? selOpt.textContent.replace(/\s*\(.*\)$/, '') : courseRef;

  const matchId = generateMatchId();
  if (!state.gd.matches) state.gd.matches = {};
  state.gd.matches[matchId] = {
    id: matchId,
    name: matchName,
    course: courseName,
    date,
    format: 'stroke',
    createdBy: state.me,
    players,
    status: 'setup',
    scores: {}
  };
  state.currentMatchId = matchId;

  _renderScreen2(modal, matchId, matchName);
}

// ── Create match — Screen 2 ───────────────────────────────────────

function _renderScreen2(modal, matchId, matchName) {
  const inner = document.getElementById('create-match-inner');
  if (!inner) return;

  inner.innerHTML = `
    <div style="text-align:center;padding:8px 0 4px">
      <div style="font-size:13px;color:var(--dim);margin-bottom:20px;line-height:1.6">
        Share this code with other players to join
      </div>
      <div id="mcr-code-display"
        style="font-size:40px;font-family:'Cormorant Garamond',serif;color:var(--gold);
          font-weight:700;letter-spacing:6px;margin-bottom:6px">
        ${matchId}
      </div>
      <div style="font-size:12px;color:var(--dimmer);margin-bottom:24px">${matchName}</div>
      <button id="mcr-copy-btn"
        style="padding:10px 28px;border-radius:20px;background:var(--mid);
          border:1px solid var(--border);color:var(--cream);font-size:13px;
          font-family:'DM Sans',sans-serif;cursor:pointer;margin-bottom:20px">
        Copy code
      </button>
      <br>
      <button id="mcr-start-btn"
        style="width:100%;padding:14px;border-radius:10px;background:var(--gold);border:none;
          color:var(--navy);font-size:15px;font-weight:700;font-family:'DM Sans',sans-serif;
          cursor:pointer;margin-top:4px">
        Start playing →
      </button>
    </div>`;

  document.getElementById('mcr-copy-btn').addEventListener('click', () => {
    navigator.clipboard?.writeText(matchId)
      .then(() => {
        const btn = document.getElementById('mcr-copy-btn');
        if (!btn) return;
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      })
      .catch(() => alert('Match code: ' + matchId));
  });

  document.getElementById('mcr-start-btn').addEventListener('click', async () => {
    if (state.gd.matches?.[matchId]) {
      state.gd.matches[matchId].status = 'active';
    }
    await pushGist();
    modal.style.display = 'none';
    updateActiveMatchBadge();
    showMatchToast('Match created — good luck!');
  });
}

// ── Join match modal ──────────────────────────────────────────────

export function openJoinMatchModal() {
  const modal = document.getElementById('join-match-modal');
  if (!modal) return;
  const inner = document.getElementById('join-match-inner');
  if (!inner) return;

  inner.innerHTML = `
    <div style="font-size:19px;font-weight:700;color:var(--cream);margin-bottom:16px;
      font-family:'Cormorant Garamond',serif">Join a match</div>
    <input type="text" id="jm-code-inp" placeholder="XXXXXX" maxlength="6"
      autocapitalize="characters" autocomplete="off" spellcheck="false"
      style="width:100%;box-sizing:border-box;padding:14px;border-radius:8px;
        background:var(--mid);border:1px solid var(--border);color:var(--gold);
        font-size:28px;text-align:center;letter-spacing:6px;
        font-family:'Cormorant Garamond',serif;text-transform:uppercase;font-weight:700">
    <div id="jm-err" style="display:none;font-size:12px;color:var(--double);margin-top:8px"></div>
    <div id="jm-info"
      style="display:none;margin-top:12px;padding:12px;border-radius:8px;
        background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2)">
    </div>
    <button id="jm-join-btn"
      style="width:100%;padding:14px;border-radius:10px;background:var(--gold);border:none;
        color:var(--navy);font-size:15px;font-weight:700;font-family:'DM Sans',sans-serif;
        cursor:pointer;margin-top:16px">
      Join →
    </button>
    <button id="jm-cancel-btn"
      style="width:100%;padding:10px;margin-top:8px;border-radius:10px;background:transparent;
        border:1px solid var(--border);color:var(--dim);font-size:13px;
        font-family:'DM Sans',sans-serif;cursor:pointer">
      Cancel
    </button>`;

  modal.style.display = 'flex';

  const codeInp = document.getElementById('jm-code-inp');
  codeInp?.addEventListener('input', () => {
    codeInp.value = codeInp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    document.getElementById('jm-err').style.display = 'none';
    if (codeInp.value.length === 6) _livePreviewMatch(codeInp.value);
    else document.getElementById('jm-info').style.display = 'none';
  });

  document.getElementById('jm-cancel-btn').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('jm-join-btn').addEventListener('click', () => {
    _handleJoin(modal);
  });
}

function _livePreviewMatch(code) {
  const match = state.gd.matches?.[code];
  const infoEl = document.getElementById('jm-info');
  if (!infoEl) return;
  if (!match) { infoEl.style.display = 'none'; return; }
  const pCount = (match.players || []).length;
  infoEl.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--cream)">${match.name}</div>
    <div style="font-size:11px;color:var(--dim);margin-top:3px">
      ${match.course} · ${match.date} · ${pCount} player${pCount !== 1 ? 's' : ''}
    </div>`;
  infoEl.style.display = 'block';
}

async function _handleJoin(modal) {
  const code = document.getElementById('jm-code-inp')?.value.trim().toUpperCase();
  const errEl = document.getElementById('jm-err');
  if (!code || code.length !== 6) {
    errEl.textContent = 'Please enter a 6-character code.';
    errEl.style.display = 'block';
    return;
  }
  const match = state.gd.matches?.[code];
  if (!match) {
    errEl.textContent = 'Match not found — check the code.';
    errEl.style.display = 'block';
    return;
  }

  // Enrol current player
  if (!match.players) match.players = [];
  const existing = match.players.find(p => p.name === state.me);
  if (!existing) {
    const hcp = state.gd.players[state.me]?.handicap ?? 0;
    match.players.push({ name: state.me, handicap: hcp, enrolled: true });
  } else {
    existing.enrolled = true;
  }

  state.currentMatchId = code;
  await pushGist();
  modal.style.display = 'none';
  updateActiveMatchBadge();
  showMatchToast('Joined ' + match.name + ' — good luck!');
}
