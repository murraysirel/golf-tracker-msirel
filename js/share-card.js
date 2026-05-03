// ─────────────────────────────────────────────────────────────────
// SHARE CARD — canvas-based round summary for Instagram/social sharing
// Editorial layouts: trace, scorecard, story, ai
// Themes: dark, light, glass, story (transparent overlay)
// Sizes: full (1080×1920) and short (1080×660)
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { scoreCol } from './scorecard.js';
import { IS_NATIVE, APP_ORIGIN } from './config.js';

const W = 1080;
const H_FULL = 1920;
const H_SHORT = 660;
const GUTTER = 100;
const TOP_PAD = 70;

const SCORE_COLS = { eagle: '#f1c40f', birdie: '#3498db', par: '#2ecc71', bogey: '#e67e22', double: '#e74c3c' };

function _scoreCategory(score, par) {
  const d = score - par;
  if (d <= -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  return 'double';
}

function _colForDiff(d) {
  if (d <= -2) return SCORE_COLS.eagle;
  if (d === -1) return SCORE_COLS.birdie;
  if (d === 0) return SCORE_COLS.par;
  if (d === 1) return SCORE_COLS.bogey;
  return SCORE_COLS.double;
}

// ── Theme palettes ───────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: '#0b1520', bgGradTop: '#0b1520', bgGradBot: '#0f1a2a',
    primary: '#f0e8d0', gold: '#c9a84c', dim: '#8899bb',
    line: '#556', lineSoft: 'rgba(85,102,130,0.4)',
    footerBg: '#333', footerText: '#c9a84c', footerSub: '#8899bb',
    rough: 'rgba(46,204,113,0.06)', transparent: false
  },
  light: {
    bg: '#f5f3ee', bgGradTop: '#f5f3ee', bgGradBot: '#ebe8e0',
    primary: '#1a1a1a', gold: '#8b7332', dim: '#6b7280',
    line: '#bbb', lineSoft: 'rgba(0,0,0,0.08)',
    footerBg: '#e8e5de', footerText: '#8b7332', footerSub: '#6b7280',
    rough: 'rgba(46,204,113,0.05)', transparent: false
  },
  glass: {
    bg: 'rgba(11,21,32,0.55)', bgGradTop: 'rgba(30,50,82,0.7)', bgGradBot: 'rgba(11,21,32,0.5)',
    primary: '#ffffff', gold: '#c9a84c', dim: 'rgba(255,255,255,0.6)',
    line: 'rgba(255,255,255,0.25)', lineSoft: 'rgba(255,255,255,0.08)',
    footerBg: 'rgba(0,0,0,0.3)', footerText: '#c9a84c', footerSub: 'rgba(255,255,255,0.5)',
    rough: 'rgba(255,255,255,0.03)', transparent: false
  },
  story: {
    bg: 'transparent', bgGradTop: 'transparent', bgGradBot: 'transparent',
    primary: '#ffffff', gold: '#c9a84c', dim: 'rgba(255,255,255,0.65)',
    line: 'rgba(255,255,255,0.3)', lineSoft: 'rgba(255,255,255,0.1)',
    footerBg: 'rgba(0,0,0,0.25)', footerText: '#c9a84c', footerSub: 'rgba(255,255,255,0.5)',
    rough: 'rgba(255,255,255,0.02)', transparent: true
  }
};

// ── Geometry: lat/lng → canvas coords ────────────────────────────

function _makeProjector(greens, tees, rect, rotation = 0) {
  const pts = [];
  for (let h = 0; h < 18; h++) {
    const g = greens[h];
    if (g) {
      const mid = g.mid || g.front || g.back;
      if (mid?.lat) pts.push({ lat: mid.lat, lng: mid.lng });
      if (g.front?.lat) pts.push({ lat: g.front.lat, lng: g.front.lng });
      if (g.back?.lat) pts.push({ lat: g.back.lat, lng: g.back.lng });
    }
    if (tees?.[h]?.lat) pts.push({ lat: tees[h].lat, lng: tees[h].lng });
  }
  if (!pts.length) return null;

  const cosLat = Math.cos((pts.reduce((s, p) => s + p.lat, 0) / pts.length) * Math.PI / 180);
  const rad = rotation * Math.PI / 180;
  const cosR = Math.cos(rad), sinR = Math.sin(rad);

  // Project to flat coords with rotation
  const flat = pts.map(p => {
    const x = (p.lng) * cosLat;
    const y = p.lat;
    return { x: x * cosR - y * sinR, y: x * sinR + y * cosR };
  });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const f of flat) {
    if (f.x < minX) minX = f.x;
    if (f.x > maxX) maxX = f.x;
    if (f.y < minY) minY = f.y;
    if (f.y > maxY) maxY = f.y;
  }

  const rangeX = maxX - minX || 0.0001;
  const rangeY = maxY - minY || 0.0001;
  const scale = Math.min(rect.w / rangeX, rect.h / rangeY) * 0.88;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return function project(lat, lng) {
    const x = lng * cosLat;
    const y = lat;
    const rx = x * cosR - y * sinR;
    const ry = x * sinR + y * cosR;
    return [
      rect.x + rect.w / 2 + (rx - cx) * scale,
      rect.y + rect.h / 2 - (ry - cy) * scale
    ];
  };
}

// ── Draw oriented green shape from front/back GPS ────────────────

function _drawGreen(ctx, project, green, holeIdx, score, par, t) {
  const mid = green.mid || green.front || green.back;
  if (!mid?.lat) return;
  const [cx, cy] = project(mid.lat, mid.lng);

  // Calculate green orientation from front→back
  let angle = 0, greenDepth = 20;
  if (green.front?.lat && green.back?.lat) {
    const [fx, fy] = project(green.front.lat, green.front.lng);
    const [bx, by] = project(green.back.lat, green.back.lng);
    angle = Math.atan2(by - fy, bx - fx);
    greenDepth = Math.max(12, Math.min(28, Math.hypot(bx - fx, by - fy) * 0.6));
  }

  const d = score != null ? score - par : null;
  const col = d != null ? _colForDiff(d) : '#555';
  const greenW = greenDepth * 1.4;
  const greenH = greenDepth;

  // Draw oriented ellipse
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(0, 0, greenW, greenH, 0, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Hole number inside
  ctx.fillStyle = '#fff';
  ctx.font = '700 17px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(holeIdx + 1, cx, cy);
  ctx.textBaseline = 'alphabetic';

  // Score below
  if (score != null) {
    ctx.fillStyle = col;
    ctx.font = '700 22px "DM Sans", sans-serif';
    ctx.fillText(score, cx, cy + greenH + 18);
  }
}

// ── Draw routing line with arrowhead ─────────────────────────────

function _drawRouting(ctx, project, greens, tees, t) {
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';

  for (let h = 0; h < 18; h++) {
    const g = greens[h];
    const te = tees?.[h];
    if (!g) continue;
    const mid = g.mid || g.front || g.back;
    if (!mid?.lat) continue;
    const [gx, gy] = project(mid.lat, mid.lng);

    if (te?.lat) {
      const [tx, ty] = project(te.lat, te.lng);

      // Fairway line
      ctx.strokeStyle = t.lineSoft;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(gx, gy);
      ctx.stroke();

      // Tee marker
      ctx.fillStyle = t.dim;
      ctx.beginPath();
      ctx.arc(tx, ty, 5, 0, Math.PI * 2);
      ctx.fill();

      // Arrowhead near green
      const dx = gx - tx, dy = gy - ty;
      const dist = Math.hypot(dx, dy);
      if (dist > 30) {
        const arrowDist = 28; // px from green centre
        const ax = gx - (dx / dist) * arrowDist;
        const ay = gy - (dy / dist) * arrowDist;
        const angle = Math.atan2(dy, dx);
        const aLen = 10, aSpread = 0.45;
        ctx.fillStyle = t.line;
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(angle) * aLen, ay + Math.sin(angle) * aLen);
        ctx.lineTo(ax + Math.cos(angle + Math.PI - aSpread) * aLen, ay + Math.sin(angle + Math.PI - aSpread) * aLen);
        ctx.lineTo(ax + Math.cos(angle + Math.PI + aSpread) * aLen, ay + Math.sin(angle + Math.PI + aSpread) * aLen);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

// ── Draw course map ──────────────────────────────────────────────

function _drawCourseMap(ctx, r, rect, t) {
  const greens = state.gd?.greenCoords?.[r.course];
  const tees = state.gd?.teeCoords?.[r.course];
  if (!greens || Object.keys(greens).length < 9) return false;

  const paddedRect = { x: rect.x + 40, y: rect.y + 20, w: rect.w - 80, h: rect.h - 40 };
  const project = _makeProjector(greens, tees, paddedRect, 0);
  if (!project) return false;

  _drawRouting(ctx, project, greens, tees, t);

  for (let h = 0; h < 18; h++) {
    if (!greens[h]) continue;
    const score = r.scores?.[h];
    const par = r.pars?.[h] || 4;
    _drawGreen(ctx, project, greens[h], h, score, par, t);
  }
  return true;
}

// ── Scorecard grid ───────────────────────────────────────────────

function _drawScorecard(ctx, r, y, cellH, fontSize, t) {
  const pars = r.pars || Array(18).fill(4);
  const scores = r.scores || [];
  const colW = (W - GUTTER * 2) / 9;

  function drawRow(label, startHole, rowY) {
    // Row label
    ctx.fillStyle = t.dim;
    ctx.font = `600 ${Math.round(fontSize * 0.7)}px "DM Sans", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(label, GUTTER, rowY + cellH / 2 + fontSize * 0.25);

    // Hole cells
    for (let i = 0; i < 9; i++) {
      const h = startHole + i;
      const cx = GUTTER + (i) * colW + colW / 2;
      const score = scores[h];
      const par = pars[h] || 4;

      // Hole number
      ctx.fillStyle = t.dim;
      ctx.font = `500 ${Math.round(fontSize * 0.55)}px "DM Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(h + 1, cx, rowY - fontSize * 0.15);

      if (score != null) {
        const col = _colForDiff(score - par);
        // Score chip
        const chipR = cellH * 0.38;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.arc(cx, rowY + cellH / 2, chipR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Score number
        ctx.fillStyle = col;
        ctx.font = `700 ${fontSize}px "DM Sans", sans-serif`;
        ctx.fillText(score, cx, rowY + cellH / 2 + fontSize * 0.35);
      } else {
        ctx.fillStyle = t.dim;
        ctx.font = `400 ${fontSize}px "DM Sans", sans-serif`;
        ctx.fillText('·', cx, rowY + cellH / 2 + fontSize * 0.35);
      }
    }

    // Subtotal
    const subScores = scores.slice(startHole, startHole + 9).filter(s => s != null);
    const subTotal = subScores.reduce((a, b) => a + b, 0);
    const subPar = pars.slice(startHole, startHole + 9).reduce((a, b) => a + (b || 4), 0);
    if (subScores.length) {
      const totalX = W - GUTTER;
      ctx.fillStyle = t.primary;
      ctx.font = `700 ${fontSize}px "DM Sans", sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(subTotal, totalX, rowY + cellH / 2 + fontSize * 0.35);
      const diff = subTotal - subPar;
      const diffStr = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : '' + diff);
      ctx.fillStyle = _colForDiff(diff);
      ctx.font = `600 ${Math.round(fontSize * 0.6)}px "DM Sans", sans-serif`;
      ctx.fillText(diffStr, totalX, rowY + cellH + fontSize * 0.15);
    }
  }

  drawRow('OUT', 0, y);
  // Separator
  ctx.fillStyle = t.lineSoft;
  ctx.fillRect(GUTTER, y + cellH + fontSize * 0.6, W - GUTTER * 2, 1);
  drawRow('IN', 9, y + cellH + fontSize * 0.8 + 8);
}

// ── Hero header (course + score) ─────────────────────────────────

function _drawHero(ctx, r, t, heroSize, titleSize) {
  const diff = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
  const stab = _calcQuickStab(r);

  // Course name
  ctx.fillStyle = t.dim;
  ctx.font = `700 ${titleSize}px "DM Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText((r.course || 'Unknown').toUpperCase().replace(/ GOLF CLUB$| GOLF COURSE$| GOLF LINKS$/, ''), W / 2, TOP_PAD + titleSize);

  // Date + tee
  ctx.fillStyle = t.dim;
  ctx.font = `400 ${Math.round(titleSize * 0.38)}px "DM Sans", sans-serif`;
  ctx.fillText(`${r.date} · ${r.tee || ''} tees`, W / 2, TOP_PAD + titleSize + titleSize * 0.55);

  // Big score
  const scoreY = TOP_PAD + titleSize + titleSize * 0.55 + heroSize * 0.85;
  ctx.fillStyle = t.primary;
  ctx.font = `700 ${heroSize}px "DM Sans", sans-serif`;
  ctx.fillText(r.totalScore || '—', W / 2, scoreY);

  // Diff
  ctx.fillStyle = _colForDiff(r.diff);
  ctx.font = `700 ${Math.round(heroSize * 0.3)}px "DM Sans", sans-serif`;
  ctx.fillText(diff, W / 2, scoreY + heroSize * 0.32);

  // Stableford
  let bottomY = scoreY + heroSize * 0.32;
  if (stab != null) {
    bottomY += heroSize * 0.28;
    ctx.fillStyle = t.gold;
    ctx.font = `700 ${Math.round(heroSize * 0.22)}px "DM Sans", sans-serif`;
    ctx.fillText(stab + ' pts', W / 2, bottomY);
  }

  return bottomY + 30;
}

// ── Background fill ──────────────────────────────────────────────

function _fillBackground(ctx, t, h) {
  if (t.transparent) return; // story mode — no bg
  if (t.bgGradTop !== t.bgGradBot) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, t.bgGradTop);
    grad.addColorStop(1, t.bgGradBot);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = t.bg;
  }
  ctx.fillRect(0, 0, W, h);
  // Glass noise
  if (t.bg.includes && t.bg.includes('rgba')) {
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (let i = 0; i < 150; i++) {
      ctx.fillRect(Math.random() * W, Math.random() * h, 3, 3);
    }
  }
}

// ── Footer ───────────────────────────────────────────────────────

function _drawFooter(ctx, t, h) {
  const fy = h - 60;
  ctx.fillStyle = t.footerBg;
  ctx.fillRect(0, fy, W, 60);
  ctx.fillStyle = t.footerText;
  ctx.font = '700 22px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LOOPER', W / 2, fy + 28);
  ctx.fillStyle = t.footerSub;
  ctx.font = '400 16px "DM Sans", sans-serif';
  ctx.fillText('loopercaddie.com', W / 2, fy + 48);
}

// ── Layout: TRACE (hero + large map) ─────────────────────────────

function _drawTrace(ctx, r, opts, t, h) {
  const heroBottom = _drawHero(ctx, r, t, 300, 84);
  const mapRect = { x: GUTTER + 40, y: Math.max(heroBottom + 30, 820), w: W - GUTTER * 2 - 80, h: h - Math.max(heroBottom + 30, 820) - 80 };
  if (!_drawCourseMap(ctx, r, mapRect, t)) {
    _drawFlagGrid(ctx, r, t, mapRect);
  }
}

// ── Layout: SCORECARD (hero + compact map + scorecard) ───────────

function _drawScorecardLayout(ctx, r, opts, t, h) {
  const heroBottom = _drawHero(ctx, r, t, 260, 76);
  const mapH = 460;
  const mapY = Math.max(heroBottom + 20, 800);
  const mapRect = { x: GUTTER + 40, y: mapY, w: W - GUTTER * 2 - 80, h: mapH };
  if (!_drawCourseMap(ctx, r, mapRect, t)) {
    _drawFlagGrid(ctx, r, t, mapRect);
  }
  _drawScorecard(ctx, r, mapY + mapH + 30, 56, 26, t);
}

// ── Layout: STORY (hero + scorecard, no map) ─────────────────────

function _drawStoryLayout(ctx, r, opts, t, h) {
  const heroBottom = _drawHero(ctx, r, t, 260, 76);
  _drawScorecard(ctx, r, Math.max(heroBottom + 20, 760), 92, 42, t);
}

// ── Layout: AI REVIEW (score above, AI text below) ───────────────

function _drawAI(ctx, r, opts, t, h) {
  const text = opts.shorthandReview || r.shorthandReview || '';
  if (!text) {
    _drawTrace(ctx, r, opts, t, h); // fallback
    return;
  }

  // Hero header with score
  const heroBottom = _drawHero(ctx, r, t, 200, 60);

  // Divider
  const divY = heroBottom + 20;
  ctx.fillStyle = t.lineSoft;
  ctx.fillRect(GUTTER + 100, divY, W - GUTTER * 2 - 200, 1);

  // AI review text, centred
  ctx.fillStyle = t.primary;
  ctx.font = '500 40px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  const lines = _wrapText(ctx, text, W - GUTTER * 2 - 60);
  const textY = divY + 60;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, textY + i * 56);
  });

  // Match result below AI text
  let badgeY = textY + lines.length * 56 + 50;
  const matchRes = r.matchResult?.result;
  if (matchRes) {
    ctx.fillStyle = t.gold;
    ctx.font = '600 30px "DM Sans", sans-serif';
    ctx.fillText(matchRes, W / 2, badgeY);
    badgeY += 45;
  }

  // Played with
  if (r.playedWith?.length) {
    ctx.fillStyle = t.dim;
    ctx.font = '400 24px "DM Sans", sans-serif';
    ctx.fillText('Played with ' + r.playedWith.join(', '), W / 2, badgeY);
  }
}

// ── Layout: SHORT (compact strip for story append, 1080×660) ─────

function _drawShort(ctx, r, opts, t) {
  const h = H_SHORT;
  // Course + date
  ctx.fillStyle = t.dim;
  ctx.font = '600 30px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((r.course || 'Unknown').toUpperCase().replace(/ GOLF CLUB$| GOLF COURSE$| GOLF LINKS$/, ''), W / 2, 50);
  ctx.font = '400 22px "DM Sans", sans-serif';
  ctx.fillText(`${r.date} · ${r.tee || ''} tees`, W / 2, 82);

  // Score + diff inline
  const diff = r.diff >= 0 ? '+' + r.diff : '' + r.diff;
  ctx.fillStyle = t.primary;
  ctx.font = '700 120px "DM Sans", sans-serif';
  ctx.fillText(r.totalScore || '—', W / 2, 220);
  ctx.fillStyle = _colForDiff(r.diff);
  ctx.font = '700 40px "DM Sans", sans-serif';
  ctx.fillText(diff, W / 2, 268);

  // Stableford
  const stab = _calcQuickStab(r);
  if (stab != null) {
    ctx.fillStyle = t.gold;
    ctx.font = '700 32px "DM Sans", sans-serif';
    ctx.fillText(stab + ' pts', W / 2, 310);
  }

  // Compact scorecard
  _drawScorecard(ctx, r, 340, 52, 24, t);
}

// ── Flag grid fallback ───────────────────────────────────────────

function _drawFlagGrid(ctx, r, t, rect) {
  const gridCols = 6, rows = 3;
  const cellW = rect.w / gridCols, cellH = rect.h / rows;

  for (let h = 0; h < 18; h++) {
    const col = h % gridCols, row = Math.floor(h / gridCols);
    const cx = rect.x + col * cellW + cellW / 2;
    const cy = rect.y + row * cellH + cellH / 2;
    const score = r.scores?.[h];
    const par = r.pars?.[h] || 4;
    const d = score ? score - par : null;
    const flagCol = d != null ? _colForDiff(d) : '#555';

    // Flag pole
    ctx.strokeStyle = t.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 30);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    // Flag triangle
    ctx.fillStyle = flagCol;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 30);
    ctx.lineTo(cx + 22, cy - 20);
    ctx.lineTo(cx, cy - 10);
    ctx.closePath();
    ctx.fill();

    // Hole number
    ctx.fillStyle = t.dim;
    ctx.font = '500 16px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(h + 1, cx, cy + 36);

    // Score
    if (score) {
      ctx.fillStyle = flagCol;
      ctx.font = '700 22px "DM Sans", sans-serif';
      ctx.fillText(score, cx, cy + 58);
    }
  }
}

// ── Utilities ────────────────────────────────────────────────────

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

// ── Public render API ────────────────────────────────────────────

/**
 * Generate a share card canvas.
 * @param {Object} round
 * @param {'trace'|'scorecard'|'story'|'ai'} layout
 * @param {Object} opts — { shorthandReview, courseRank, theme, short }
 */
export function renderShareCard(round, layout = 'trace', opts = {}) {
  const isShort = !!opts.short;
  const h = isShort ? H_SHORT : H_FULL;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const t = THEMES[opts.theme || 'dark'];

  _fillBackground(ctx, t, h);

  if (isShort) {
    _drawShort(ctx, round, opts, t);
  } else if (layout === 'trace') {
    _drawTrace(ctx, round, opts, t, h);
  } else if (layout === 'scorecard') {
    _drawScorecardLayout(ctx, round, opts, t, h);
  } else if (layout === 'story') {
    _drawStoryLayout(ctx, round, opts, t, h);
  } else if (layout === 'ai') {
    _drawAI(ctx, round, opts, t, h);
  }

  _drawFooter(ctx, t, h);
  return canvas;
}

// ── Modal ────────────────────────────────────────────────────────

export function showShareCardModal(round, opts = {}) {
  let currentLayout = 0;
  let currentTheme = 0;
  let isShort = false;
  const layouts = ['trace', 'scorecard', 'story', 'ai'];
  const layoutLabels = ['Trace', 'Scorecard', 'Story', 'AI Review'];
  const themeKeys = ['dark', 'light', 'glass', 'story'];
  const themeLabels = ['Dark', 'Light', 'Glass', 'Story'];

  let modal = document.getElementById('share-card-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'share-card-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
    document.body.appendChild(modal);
  }

  function render() {
    const renderOpts = { ...opts, theme: themeKeys[currentTheme], short: isShort };
    const canvas = renderShareCard(round, layouts[currentLayout], renderOpts);
    const dataUrl = canvas.toDataURL('image/png');
    const aspectRatio = isShort ? '1080/660' : '9/16';

    const pillBtn = (label, isActive, cls, idx) =>
      `<button class="${cls}" data-idx="${idx}" style="padding:5px 12px;border-radius:20px;font-size:10px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${isActive ? 'var(--gold)' : 'var(--border)'};background:${isActive ? 'rgba(201,168,76,.15)' : 'transparent'};color:${isActive ? 'var(--gold)' : 'var(--dim)'}">${label}</button>`;

    modal.innerHTML = `
      <div style="position:relative;width:min(300px,80vw);aspect-ratio:${aspectRatio}">
        <img src="${dataUrl}" style="width:100%;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.6)">
      </div>
      <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;justify-content:center">
        ${layoutLabels.map((l, i) => pillBtn(l, i === currentLayout && !isShort, 'sc-layout-btn', i)).join('')}
        ${pillBtn('Short', isShort, 'sc-short-btn', 0)}
      </div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;justify-content:center">
        ${themeLabels.map((l, i) => pillBtn(l, i === currentTheme, 'sc-theme-btn', i)).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button id="sc-share-btn" style="padding:12px 28px;border-radius:24px;background:var(--gold);border:none;color:var(--navy);font-size:14px;font-weight:700;font-family:'DM Sans',sans-serif;cursor:pointer">Share</button>
        <button id="sc-close-btn" style="padding:12px 28px;border-radius:24px;background:var(--mid);border:1px solid var(--border);color:var(--dim);font-size:14px;font-family:'DM Sans',sans-serif;cursor:pointer">Close</button>
      </div>`;

    // Layout toggle
    modal.querySelectorAll('.sc-layout-btn').forEach(btn => {
      btn.addEventListener('click', () => { currentLayout = parseInt(btn.dataset.idx); isShort = false; render(); });
    });

    // Short toggle
    modal.querySelector('.sc-short-btn')?.addEventListener('click', () => { isShort = !isShort; render(); });

    // Theme toggle
    modal.querySelectorAll('.sc-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => { currentTheme = parseInt(btn.dataset.idx); render(); });
    });

    // Share
    document.getElementById('sc-share-btn')?.addEventListener('click', async () => {
      try {
        const fileName = `looper-${(round.course || 'round').replace(/[^a-zA-Z0-9]/g, '-')}-${(round.date || '').replace(/\//g, '-')}.png`;
        if (IS_NATIVE) {
          // Write to temp file so iOS share sheet offers Instagram, WhatsApp, etc.
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          const base64 = dataUrl.split(',')[1];
          const saved = await Filesystem.writeFile({
            path: fileName,
            data: base64,
            directory: Directory.Cache
          });
          const { Share } = await import('@capacitor/share');
          await Share.share({ title: 'My Looper round', files: [saved.uri] });
          // Clean up temp file (fire-and-forget)
          Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {});
        } else {
          const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
          const file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: 'My Looper round' });
          } else {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = fileName;
            a.click();
          }
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
