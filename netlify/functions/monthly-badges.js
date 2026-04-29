// ─────────────────────────────────────────────────────────────────
// MONTHLY BADGES — scheduled function, runs 1st of each month
// Awards "Most Consistent" badge to top player in each group.
//
// Schedule: configured in netlify.toml as a scheduled function
// ─────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  // Allow manual trigger via POST or scheduled trigger
  const now = new Date();
  const month = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  console.log(`[monthly-badges] Running for ${month}`);

  try {
    // Get all active groups
    const { data: groups, error: gErr } = await supabase
      .from('groups').select('id, code, name');
    if (gErr) throw gErr;

    let awarded = 0;

    for (const group of (groups || [])) {
      // Get approved members
      const { data: members } = await supabase
        .from('group_members')
        .select('player_id')
        .eq('group_id', group.id)
        .or('status.is.null,status.eq.approved');
      if (!members?.length) continue;

      const memberNames = members.map(m => m.player_id);

      // Get rounds from last 90 days for these members
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const { data: rounds } = await supabase
        .from('rounds')
        .select('player_name, total_score, total_par, diff, handicap, slope, created_at')
        .in('player_name', memberNames)
        .eq('group_code', group.code)
        .gte('created_at', cutoffStr);

      if (!rounds?.length) continue;

      // Group rounds by player
      const byPlayer = {};
      rounds.forEach(r => {
        if (!byPlayer[r.player_name]) byPlayer[r.player_name] = [];
        byPlayer[r.player_name].push(r);
      });

      // Calculate consistency score for each player with 5+ rounds
      let bestPlayer = null, bestScore = -Infinity;

      for (const [name, playerRounds] of Object.entries(byPlayer)) {
        if (playerRounds.length < 5) continue;

        // Score-to-handicap diff for each round
        const diffs = playerRounds.map(r => {
          const hcp = r.handicap || 0;
          const slope = r.slope || 113;
          const playingHcp = Math.round(hcp * (slope / 113));
          return (r.total_score || 0) - (r.total_par || 72) - playingHcp;
        });

        const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const variance = diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / diffs.length;
        const stdDev = Math.sqrt(variance);
        const hcp = playerRounds[0].handicap || 1; // avoid divide by zero
        const divisor = Math.max(hcp, 1);

        const score = playerRounds.length * (1 - (stdDev / divisor));

        if (score > bestScore) {
          bestScore = score;
          bestPlayer = name;
        }
      }

      if (!bestPlayer) continue;

      // Check if badge already awarded this month for this group
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { data: existing } = await supabase
        .from('user_badges')
        .select('id')
        .eq('group_code', group.code)
        .eq('month', monthKey)
        .eq('badge_type', 'most_consistent')
        .maybeSingle();

      if (existing) continue; // already awarded

      await supabase.from('user_badges').insert({
        player_name: bestPlayer,
        group_code: group.code,
        badge_type: 'most_consistent',
        month: monthKey,
        label: `Most Consistent — ${now.toLocaleString('en-GB', { month: 'long' })}`,
        score: Math.round(bestScore * 100) / 100,
      });
      awarded++;
      console.log(`[monthly-badges] ${group.name}: ${bestPlayer} (score: ${bestScore.toFixed(2)})`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, month, awarded })
    };
  } catch (e) {
    console.error('[monthly-badges] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
