// ─────────────────────────────────────────────────────────────────
// SHARE CARD — canvas-based round summary for Instagram/social sharing
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { scoreCol } from './scorecard.js';
import { IS_NATIVE, APP_ORIGIN } from './config.js';

const W = 1080, H = 1920;
const NAVY = '#0b1520';
const CARD_BG = '#182538';
const GOLD = '#c9a84c';
const CREAM = '#f0e8d0';
const DIM = '#8899bb';
const SCORE_COLS = { eagle: '#f1c40f', birdie: '#3498db', par: '#2ecc71', bogey: '#e67e22', double: '#e74c3c' };

function _colForDiff(d) {
  if (d <= -2) return SCORE_COLS.eagle;
  if (d === -1) return SCORE_COLS.birdie;
  if (d === 0) return SCORE_COLS.par;
  if (d === 1) return SCORE_COLS.bogey;
  return SCORE_COLS.double;
}

/**
 * Generate a share card as a canvas element.
 * @param {Object} round — Round object from state
 * @param {'summary'|'heatmap'|'ai'} layout
 * @param {Object} opts — { courseRank, shorthandReview }
 * @returns {HTMLCanvasElement}
 */
export function renderShareCard(round, layout = 'summary', opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);

  if (layout === 'summary') _drawSummary(ctx, round, opts);
  else if (layout === 'heatmap') _drawHeatmap(ctx, round, opts);
  else if (layout === 'ai') _drawAI(ctx, round, opts);

  // Footer — always
  _drawFooter(ctx);

  return canvas;
}

function _drawSummary(ctx, r, opts) {
  const diff = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
  const diffCol = _colForDiff(r.diff);

  // Course + date
  ctx.fillStyle = DIM;
  ctx.font = '600 36px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((r.course || 'Unknown').toUpperCase(), W / 2, 200);
  ctx.font = '400 28px "DM Sans", sans-serif';
  ctx.fillText(`${r.date} · ${r.tee || ''} tees`, W / 2, 250);

  // Big score
  ctx.fillStyle = CREAM;
  ctx.font = '700 180px "DM Sans", sans-serif';
  ctx.fillText(r.totalScore || '—', W / 2, 500);

  // vs par
  ctx.fillStyle = diffCol;
  ctx.font = '700 64px "DM Sans", sans-serif';
  ctx.fillText(diff, W / 2, 590);

  // Stableford points (if available)
  const stab = _calcQuickStab(r);
  if (stab != null) {
    ctx.fillStyle = GOLD;
    ctx.font = '700 72px "DM Sans", sans-serif';
    ctx.fillText(stab + ' pts', W / 2, 720);
  }

  // Scoring breakdown
  const y = 850;
  const cols = [
    { label: 'Birdies', val: r.birdies || 0, col: SCORE_COLS.birdie },
    { label: 'Pars', val: r.parsCount || 0, col: SCORE_COLS.par },
    { label: 'Bogeys', val: r.bogeys || 0, col: SCORE_COLS.bogey },
    { label: 'Doubles+', val: r.doubles || 0, col: SCORE_COLS.double },
  ];
  const cw = W / cols.length;
  cols.forEach((c, i) => {
    const cx = cw * i + cw / 2;
    ctx.fillStyle = c.col;
    ctx.font = '700 48px "DM Sans", sans-serif';
    ctx.fillText(c.val, cx, y);
    ctx.fillStyle = DIM;
    ctx.font = '500 22px "DM Sans", sans-serif';
    ctx.fillText(c.label, cx, y + 36);
  });

  // Stats row
  const totalPutts = (r.putts || []).filter(Boolean).reduce((a, b) => a + b, 0);
  const girPct = r.gir ? Math.round(r.gir.filter(v => v === 'Yes').length / 18 * 100) : null;
  const firCount = r.fir ? r.fir.filter((v, i) => v === 'Yes' && (r.pars || [])[i] !== 3).length : null;
  const firHoles = (r.pars || []).filter(p => p !== 3).length || 14;
  const stats = [];
  if (totalPutts) stats.push({ label: 'Putts', val: totalPutts });
  if (firCount != null) stats.push({ label: 'FIR', val: `${firCount}/${firHoles}` });
  if (girPct != null) stats.push({ label: 'GIR', val: girPct + '%' });
  if (stats.length) {
    const sy = 980;
    const sw = W / stats.length;
    stats.forEach((s, i) => {
      const cx = sw * i + sw / 2;
      ctx.fillStyle = CREAM;
      ctx.font = '700 40px "DM Sans", sans-serif';
      ctx.fillText(s.val, cx, sy);
      ctx.fillStyle = DIM;
      ctx.font = '500 22px "DM Sans", sans-serif';
      ctx.fillText(s.label, cx, sy + 34);
    });
  }

  // Course rank badge
  if (opts.courseRank && opts.courseRank <= 3) {
    const ry = 1120;
    ctx.fillStyle = GOLD;
    ctx.font = '600 28px "DM Sans", sans-serif';
    ctx.fillText(`Top ${opts.courseRank} at ${(r.course || '').replace(/ Golf Club$| Golf Course$| Golf Links$/, '')} this month`, W / 2, ry);
  }
}

function _drawHeatmap(ctx, r) {
  // Title
  ctx.fillStyle = DIM;
  ctx.font = '600 36px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((r.course || 'Unknown').toUpperCase(), W / 2, 200);

  const diff = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
  ctx.fillStyle = CREAM;
  ctx.font = '700 56px "DM Sans", sans-serif';
  ctx.fillText(`${r.totalScore} (${diff})`, W / 2, 300);

  const stab = _calcQuickStab(r);
  if (stab != null) {
    ctx.fillStyle = GOLD;
    ctx.font = '600 36px "DM Sans", sans-serif';
    ctx.fillText(stab + ' stableford pts', W / 2, 360);
  }

  // 6x3 grid of hole flags
  const cols = 6, rows = 3;
  const cellW = 140, cellH = 160;
  const gridW = cols * cellW, gridH = rows * cellH;
  const ox = (W - gridW) / 2, oy = 450;

  for (let h = 0; h < 18; h++) {
    const col = h % cols, row = Math.floor(h / cols);
    const cx = ox + col * cellW + cellW / 2;
    const cy = oy + row * cellH + cellH / 2;
    const score = r.scores?.[h];
    const par = r.pars?.[h] || 4;
    const d = score ? score - par : null;
    const flagCol = d != null ? _colForDiff(d) : '#555';

    // Flag pole
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 40);
    ctx.lineTo(cx, cy + 30);
    ctx.stroke();

    // Flag triangle
    ctx.fillStyle = flagCol;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 40);
    ctx.lineTo(cx + 30, cy - 28);
    ctx.lineTo(cx, cy - 16);
    ctx.closePath();
    ctx.fill();

    // Hole number
    ctx.fillStyle = DIM;
    ctx.font = '500 20px "DM Sans", sans-serif';
    ctx.fillText(h + 1, cx, cy + 55);

    // Score
    if (score) {
      ctx.fillStyle = flagCol;
      ctx.font = '700 28px "DM Sans", sans-serif';
      ctx.fillText(score, cx, cy + 85);
    }
  }
}

function _drawAI(ctx, r, opts) {
  const text = opts.shorthandReview || r.shorthandReview || '';
  if (!text) {
    _drawSummary(ctx, r, opts); // fallback if no AI text
    return;
  }

  // AI review text, centred
  ctx.fillStyle = CREAM;
  ctx.font = '500 40px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  const lines = _wrapText(ctx, text, W - 160);
  const textY = 500;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, textY + i * 56);
  });

  // Score summary below
  const diff = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
  const sy = textY + lines.length * 56 + 80;
  ctx.fillStyle = DIM;
  ctx.font = '600 32px "DM Sans", sans-serif';
  ctx.fillText(`${r.course || ''} · ${r.date}`, W / 2, sy);
  ctx.fillStyle = CREAM;
  ctx.font = '700 64px "DM Sans", sans-serif';
  ctx.fillText(`${r.totalScore} (${diff})`, W / 2, sy + 80);
}

function _drawFooter(ctx) {
  ctx.fillStyle = '#333';
  ctx.fillRect(0, H - 100, W, 100);
  ctx.fillStyle = GOLD;
  ctx.font = '700 28px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LOOPER', W / 2, H - 55);
  ctx.fillStyle = DIM;
  ctx.font = '400 20px "DM Sans", sans-serif';
  ctx.fillText('loopercaddie.com', W / 2, H - 25);
}

function _wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function _calcQuickStab(r) {
  if (!r.scores || !r.pars) return null;
  let pts = 0;
  for (let i = 0; i < 18; i++) {
    const s = r.scores[i], p = r.pars?.[i] || 4;
    if (!s) continue;
    const d = s - p;
    if (d <= -3) pts += 5;
    else if (d === -2) pts += 4;
    else if (d === -1) pts += 3;
    else if (d === 0) pts += 2;
    else if (d === 1) pts += 1;
  }
  return pts;
}

/**
 * Show the share card modal with layout switching.
 */
export function showShareCardModal(round, opts = {}) {
  let currentLayout = 0;
  const layouts = ['summary', 'heatmap', 'ai'];

  let modal = document.getElementById('share-card-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'share-card-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);
  }

  function render() {
    const canvas = renderShareCard(round, layouts[currentLayout], opts);
    const dataUrl = canvas.toDataURL('image/png');
    modal.innerHTML = `
      <div style="position:relative;width:min(300px,80vw);aspect-ratio:9/16">
        <img src="${dataUrl}" style="width:100%;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.6)">
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        ${layouts.map((l, i) => `<button class="sc-layout-btn" data-idx="${i}" style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${i === currentLayout ? 'var(--gold)' : 'var(--border)'};background:${i === currentLayout ? 'rgba(201,168,76,.15)' : 'transparent'};color:${i === currentLayout ? 'var(--gold)' : 'var(--dim)'}">${l === 'summary' ? 'Score' : l === 'heatmap' ? 'Heatmap' : 'AI Review'}</button>`).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button id="sc-share-btn" style="padding:12px 28px;border-radius:24px;background:var(--gold);border:none;color:var(--navy);font-size:14px;font-weight:700;font-family:'DM Sans',sans-serif;cursor:pointer">Share</button>
        <button id="sc-close-btn" style="padding:12px 28px;border-radius:24px;background:var(--mid);border:1px solid var(--border);color:var(--dim);font-size:14px;font-family:'DM Sans',sans-serif;cursor:pointer">Close</button>
      </div>`;

    // Layout toggle
    modal.querySelectorAll('.sc-layout-btn').forEach(btn => {
      btn.addEventListener('click', () => { currentLayout = parseInt(btn.dataset.idx); render(); });
    });

    // Share
    document.getElementById('sc-share-btn')?.addEventListener('click', async () => {
      try {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const file = new File([blob], `looper-${round.course || 'round'}-${round.date?.replace(/\//g, '-')}.png`, { type: 'image/png' });
        if (IS_NATIVE) {
          const { Share } = await import('@capacitor/share');
          // Capacitor Share can't share files directly from blob — use data URL
          await Share.share({ title: 'My Looper round', url: dataUrl });
        } else if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'My Looper round' });
        } else {
          // Download fallback
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = file.name;
          a.click();
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('[share]', e);
      }
    });

    // Close
    document.getElementById('sc-close-btn')?.addEventListener('click', () => { modal.style.display = 'none'; });
  }

  modal.style.display = 'flex';
  render();
}
