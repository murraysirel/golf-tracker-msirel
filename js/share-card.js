// ─────────────────────────────────────────────────────────────────
// SHARE CARD — canvas-based round summary for Instagram/social sharing
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { scoreCol } from './scorecard.js';
import { IS_NATIVE, APP_ORIGIN } from './config.js';

const W = 1080, H = 1920;

const SCORE_COLS = { eagle: '#f1c40f', birdie: '#3498db', par: '#2ecc71', bogey: '#e67e22', double: '#e74c3c' };

// ── Theme palettes ───────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: '#0b1520', card: '#182538', gold: '#c9a84c', primary: '#f0e8d0',
    dim: '#8899bb', footerBg: '#333', footerText: '#c9a84c', footerSub: '#8899bb',
    poleLine: '#444'
  },
  light: {
    bg: '#f5f3ee', card: '#ffffff', gold: '#8b7332', primary: '#1a1a1a',
    dim: '#6b7280', footerBg: '#e8e5de', footerText: '#8b7332', footerSub: '#6b7280',
    poleLine: '#bbb'
  },
  glass: {
    bg: 'rgba(11,21,32,0.55)', card: 'rgba(24,37,56,0.4)', gold: '#c9a84c', primary: '#ffffff',
    dim: 'rgba(255,255,255,0.6)', footerBg: 'rgba(0,0,0,0.3)', footerText: '#c9a84c', footerSub: 'rgba(255,255,255,0.5)',
    poleLine: 'rgba(255,255,255,0.2)'
  }
};

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
 * @param {Object} opts — { courseRank, shorthandReview, theme }
 * @returns {HTMLCanvasElement}
 */
export function renderShareCard(round, layout = 'summary', opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const t = THEMES[opts.theme || 'dark'];

  // Background
  if (opts.theme === 'glass') {
    // Frosted gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(30,50,82,0.7)');
    grad.addColorStop(0.5, 'rgba(11,21,32,0.5)');
    grad.addColorStop(1, 'rgba(30,50,82,0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Subtle noise overlay via small rectangles
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      ctx.fillRect(x, y, 3, 3);
    }
  } else {
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
  }

  if (layout === 'summary') _drawSummary(ctx, round, opts, t);
  else if (layout === 'heatmap') _drawHeatmap(ctx, round, opts, t);
  else if (layout === 'ai') _drawAI(ctx, round, opts, t);

  // Footer — always
  _drawFooter(ctx, t);

  return canvas;
}

function _drawSummary(ctx, r, opts, t) {
  const diff = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
  const diffCol = _colForDiff(r.diff);

  // Course + date
  ctx.fillStyle = t.dim;
  ctx.font = '600 36px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((r.course || 'Unknown').toUpperCase(), W / 2, 200);
  ctx.font = '400 28px "DM Sans", sans-serif';
  ctx.fillText(`${r.date} · ${r.tee || ''} tees`, W / 2, 250);

  // Big score
  ctx.fillStyle = t.primary;
  ctx.font = '700 180px "DM Sans", sans-serif';
  ctx.fillText(r.totalScore || '—', W / 2, 490);

  // vs par
  ctx.fillStyle = diffCol;
  ctx.font = '700 64px "DM Sans", sans-serif';
  ctx.fillText(diff, W / 2, 575);

  // Stableford points
  let nextY = 640;
  const stab = _calcQuickStab(r);
  if (stab != null) {
    ctx.fillStyle = t.gold;
    ctx.font = '700 56px "DM Sans", sans-serif';
    ctx.fillText(stab + ' pts', W / 2, nextY);
    nextY += 80;
  }

  // Scoring breakdown
  const y = nextY + 30;
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
    ctx.fillStyle = t.dim;
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
  const sy = y + 100;
  if (stats.length) {
    const sw = W / stats.length;
    stats.forEach((s, i) => {
      const cx = sw * i + sw / 2;
      ctx.fillStyle = t.primary;
      ctx.font = '700 40px "DM Sans", sans-serif';
      ctx.fillText(s.val, cx, sy);
      ctx.fillStyle = t.dim;
      ctx.font = '500 22px "DM Sans", sans-serif';
      ctx.fillText(s.label, cx, sy + 34);
    });
  }

  // Match result (if match/wolf/sixes was played)
  let badgeY = sy + 100;
  const matchRes = r.matchResult?.result;
  const wolfRes = r.wolfResult;
  const sixesRes = r.sixesResult;
  if (matchRes) {
    ctx.fillStyle = t.gold;
    ctx.font = '600 32px "DM Sans", sans-serif';
    ctx.fillText(matchRes, W / 2, badgeY);
    badgeY += 50;
  } else if (wolfRes) {
    const wolfLine = typeof wolfRes === 'string' ? wolfRes : wolfRes.summary || '';
    if (wolfLine) {
      ctx.fillStyle = t.gold;
      ctx.font = '600 32px "DM Sans", sans-serif';
      ctx.fillText(wolfLine, W / 2, badgeY);
      badgeY += 50;
    }
  } else if (sixesRes) {
    const sixesLine = typeof sixesRes === 'string' ? sixesRes : sixesRes.summary || '';
    if (sixesLine) {
      ctx.fillStyle = t.gold;
      ctx.font = '600 32px "DM Sans", sans-serif';
      ctx.fillText(sixesLine, W / 2, badgeY);
      badgeY += 50;
    }
  }

  // Played with
  if (r.playedWith?.length) {
    ctx.fillStyle = t.dim;
    ctx.font = '400 24px "DM Sans", sans-serif';
    ctx.fillText('Played with ' + r.playedWith.join(', '), W / 2, badgeY);
    badgeY += 50;
  }

  // Course rank badge
  if (opts.courseRank && opts.courseRank <= 3) {
    ctx.fillStyle = t.gold;
    ctx.font = '600 28px "DM Sans", sans-serif';
    ctx.fillText(`Top ${opts.courseRank} at ${(r.course || '').replace(/ Golf Club$| Golf Course$| Golf Links$/, '')} this month`, W / 2, badgeY);
  }
}

function _drawHeatmap(ctx, r, opts, t) {
  // Title
  ctx.fillStyle = t.dim;
  ctx.font = '600 36px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((r.course || 'Unknown').toUpperCase(), W / 2, 200);

  const diff = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
  ctx.fillStyle = t.primary;
  ctx.font = '700 56px "DM Sans", sans-serif';
  ctx.fillText(`${r.totalScore} (${diff})`, W / 2, 300);

  const stab = _calcQuickStab(r);
  if (stab != null) {
    ctx.fillStyle = t.gold;
    ctx.font = '600 36px "DM Sans", sans-serif';
    ctx.fillText(stab + ' stableford pts', W / 2, 360);
  }

  // Try GPS course map first, fall back to flag grid
  const greens = state.gd?.greenCoords?.[r.course];
  const tees = state.gd?.teeCoords?.[r.course];
  const hasGps = greens && Object.keys(greens).length >= 9;

  if (hasGps) {
    _drawGpsCourseMap(ctx, r, greens, tees, t);
  } else {
    _drawFlagGrid(ctx, r, t);
  }
}

function _drawGpsCourseMap(ctx, r, greens, tees, t) {
  // Collect all coordinates to compute bounding box
  const pts = [];
  for (let h = 0; h < 18; h++) {
    const g = greens[h];
    if (!g) continue;
    const mid = g.mid || g.front || g.back;
    if (mid?.lat && mid?.lng) pts.push({ h, lat: mid.lat, lng: mid.lng, type: 'green' });
    if (tees?.[h]?.lat && tees?.[h]?.lng) pts.push({ h, lat: tees[h].lat, lng: tees[h].lng, type: 'tee' });
  }
  if (pts.length < 9) { _drawFlagGrid(ctx, r, t); return; }

  // Bounding box with padding
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  // Map area on canvas
  const mapX = 80, mapY = 420, mapW = W - 160, mapH = 1200;
  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;

  // Aspect-ratio-preserving scale (lat/lng ratio adjusted for cos(latitude))
  const cosLat = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const scaleX = mapW / (lngRange * cosLat);
  const scaleY = mapH / latRange;
  const scale = Math.min(scaleX, scaleY) * 0.85; // 85% to leave margin

  const centLat = (minLat + maxLat) / 2;
  const centLng = (minLng + maxLng) / 2;

  function toCanvas(lat, lng) {
    const x = mapX + mapW / 2 + (lng - centLng) * cosLat * scale;
    const y = mapY + mapH / 2 - (lat - centLat) * scale; // flip Y: north=up
    return [x, y];
  }

  // Draw tee-to-green fairway lines
  if (tees) {
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let h = 0; h < 18; h++) {
      const g = greens[h];
      const te = tees[h];
      if (!g || !te?.lat) continue;
      const mid = g.mid || g.front || g.back;
      if (!mid?.lat) continue;
      const [tx, ty] = toCanvas(te.lat, te.lng);
      const [gx, gy] = toCanvas(mid.lat, mid.lng);

      // Subtle fairway line
      ctx.strokeStyle = t.poleLine;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(gx, gy);
      ctx.stroke();

      // Small tee marker
      ctx.fillStyle = t.dim;
      ctx.beginPath();
      ctx.arc(tx, ty, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw greens as ovals with score colour
  for (let h = 0; h < 18; h++) {
    const g = greens[h];
    if (!g) continue;
    const mid = g.mid || g.front || g.back;
    if (!mid?.lat) continue;
    const [cx, cy] = toCanvas(mid.lat, mid.lng);
    const score = r.scores?.[h];
    const par = r.pars?.[h] || 4;
    const d = score ? score - par : null;
    const col = d != null ? _colForDiff(d) : '#555';

    // Green oval
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Hole number inside green
    ctx.fillStyle = '#fff';
    ctx.font = '700 16px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(h + 1, cx, cy);

    // Score label below green
    if (score) {
      ctx.fillStyle = col;
      ctx.font = '700 22px "DM Sans", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(score, cx, cy + 34);
    }
  }

  // Reset baseline
  ctx.textBaseline = 'alphabetic';

  // Legend
  const legendY = mapY + mapH + 40;
  const legendItems = [
    { label: 'Eagle', col: SCORE_COLS.eagle },
    { label: 'Birdie', col: SCORE_COLS.birdie },
    { label: 'Par', col: SCORE_COLS.par },
    { label: 'Bogey', col: SCORE_COLS.bogey },
    { label: 'Double+', col: SCORE_COLS.double },
  ];
  const lw = W / legendItems.length;
  legendItems.forEach((item, i) => {
    const lx = lw * i + lw / 2;
    ctx.fillStyle = item.col;
    ctx.beginPath();
    ctx.arc(lx - 30, legendY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.dim;
    ctx.font = '500 18px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.label, lx - 20, legendY + 6);
  });
  ctx.textAlign = 'center';
}

function _drawFlagGrid(ctx, r, t) {
  // Fallback 6x3 grid of hole flags (when no GPS coords)
  const gridCols = 6, rows = 3;
  const cellW = 140, cellH = 160;
  const gridW = gridCols * cellW;
  const ox = (W - gridW) / 2, oy = 450;

  for (let h = 0; h < 18; h++) {
    const col = h % gridCols, row = Math.floor(h / gridCols);
    const cx = ox + col * cellW + cellW / 2;
    const cy = oy + row * cellH + cellH / 2;
    const score = r.scores?.[h];
    const par = r.pars?.[h] || 4;
    const d = score ? score - par : null;
    const flagCol = d != null ? _colForDiff(d) : '#555';

    // Flag pole
    ctx.strokeStyle = t.poleLine;
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
    ctx.fillStyle = t.dim;
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

function _drawAI(ctx, r, opts, t) {
  const text = opts.shorthandReview || r.shorthandReview || '';
  if (!text) {
    _drawSummary(ctx, r, opts, t); // fallback if no AI text
    return;
  }

  // AI review text, centred
  ctx.fillStyle = t.primary;
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
  ctx.fillStyle = t.dim;
  ctx.font = '600 32px "DM Sans", sans-serif';
  ctx.fillText(`${r.course || ''} · ${r.date}`, W / 2, sy);
  ctx.fillStyle = t.primary;
  ctx.font = '700 64px "DM Sans", sans-serif';
  ctx.fillText(`${r.totalScore} (${diff})`, W / 2, sy + 80);
}

function _drawFooter(ctx, t) {
  ctx.fillStyle = t.footerBg;
  ctx.fillRect(0, H - 100, W, 100);
  ctx.fillStyle = t.footerText;
  ctx.font = '700 28px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LOOPER', W / 2, H - 55);
  ctx.fillStyle = t.footerSub;
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
 * Show the share card modal with layout + theme switching.
 */
export function showShareCardModal(round, opts = {}) {
  let currentLayout = 0;
  let currentTheme = 0;
  const layouts = ['summary', 'heatmap', 'ai'];
  const themeKeys = ['dark', 'light', 'glass'];
  const themeLabels = ['Dark', 'Light', 'Glass'];

  let modal = document.getElementById('share-card-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'share-card-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);
  }

  function render() {
    const renderOpts = { ...opts, theme: themeKeys[currentTheme] };
    const canvas = renderShareCard(round, layouts[currentLayout], renderOpts);
    const dataUrl = canvas.toDataURL('image/png');

    const pillBtn = (label, isActive, cls, idx) =>
      `<button class="${cls}" data-idx="${idx}" style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${isActive ? 'var(--gold)' : 'var(--border)'};background:${isActive ? 'rgba(201,168,76,.15)' : 'transparent'};color:${isActive ? 'var(--gold)' : 'var(--dim)'}">${label}</button>`;

    modal.innerHTML = `
      <div style="position:relative;width:min(300px,80vw);aspect-ratio:9/16">
        <img src="${dataUrl}" style="width:100%;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.6)">
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        ${layouts.map((l, i) => pillBtn(l === 'summary' ? 'Score' : l === 'heatmap' ? 'Heatmap' : 'AI Review', i === currentLayout, 'sc-layout-btn', i)).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        ${themeLabels.map((l, i) => pillBtn(l, i === currentTheme, 'sc-theme-btn', i)).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button id="sc-share-btn" style="padding:12px 28px;border-radius:24px;background:var(--gold);border:none;color:var(--navy);font-size:14px;font-weight:700;font-family:'DM Sans',sans-serif;cursor:pointer">Share</button>
        <button id="sc-close-btn" style="padding:12px 28px;border-radius:24px;background:var(--mid);border:1px solid var(--border);color:var(--dim);font-size:14px;font-family:'DM Sans',sans-serif;cursor:pointer">Close</button>
      </div>`;

    // Layout toggle
    modal.querySelectorAll('.sc-layout-btn').forEach(btn => {
      btn.addEventListener('click', () => { currentLayout = parseInt(btn.dataset.idx); render(); });
    });

    // Theme toggle
    modal.querySelectorAll('.sc-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => { currentTheme = parseInt(btn.dataset.idx); render(); });
    });

    // Share
    document.getElementById('sc-share-btn')?.addEventListener('click', async () => {
      try {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const file = new File([blob], `looper-${round.course || 'round'}-${round.date?.replace(/\//g, '-')}.png`, { type: 'image/png' });
        if (IS_NATIVE) {
          const { Share } = await import('@capacitor/share');
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
