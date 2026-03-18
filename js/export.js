// ─────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';

export function exportXlsx() {
  const p = state.gd.players[state.me];
  if (!p || !p.rounds.length) { alert('No rounds to export yet!'); return; }
  const rs = p.rounds;
  const wb = XLSX.utils.book_new();
  const sum = [['Player','Course','Tee','Date','Score','vs Par','Birdies','Pars','Bogeys','Dbl+','Eagles','Putts','FIR%','GIR%','Penalties','Notes']];
  rs.forEach(r => {
    const tp = (r.putts || []).filter(Boolean).reduce((a, b) => a + b, 0);
    const fh = r.pars.filter(p => p !== 3).length;
    const fy = r.fir.filter(v => v === 'Yes').length;
    const gy = r.gir.filter(v => v === 'Yes').length;
    sum.push([r.player, r.course, r.tee || '', r.date, r.totalScore, r.diff >= 0 ? '+' + r.diff : '' + r.diff,
      r.birdies, r.parsCount, r.bogeys, r.doubles, r.eagles || 0, tp || '',
      fh ? Math.round(fy / fh * 100) + '%' : 'N/A', Math.round(gy / 18 * 100) + '%', r.penalties || 0, r.notes || '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'All Rounds');
  const holes = [['Round','Date','Course','Tee','Hole','Par','Score','vs Par','Putts','FIR','GIR']];
  rs.forEach((r, ri) => {
    (r.scores || []).forEach((s, h) => {
      const dv = s != null ? s - r.pars[h] : '';
      holes.push([ri+1, r.date, r.course, r.tee || '', h+1, r.pars[h], s || '',
        dv === '' ? '' : dv >= 0 ? '+' + dv : '' + dv, (r.putts || [])[h] || '', (r.fir || [])[h] || '', (r.gir || [])[h] || '']);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(holes), 'Hole Data');
  XLSX.writeFile(wb, state.me.replace(/\s+/g, '_') + '_golf_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}
