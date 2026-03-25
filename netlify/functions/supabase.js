// netlify/functions/supabase.js
// Supabase backend for Looper — parallel write target during Gist→Supabase migration.
// SUPABASE_SERVICE_KEY lives in Netlify env vars only — never in browser JS.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let action, groupCode, data;
  try {
    ({ action, groupCode, data } = JSON.parse(event.body || '{}'));
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  try {
    // Set group code for RLS policies
    await supabase.rpc('set_config', {
      setting: 'app.group_code',
      value: groupCode || '',
      is_local: true
    });

    // ── read ─────────────────────────────────────────────────────────
    if (action === 'read') {
      const [players, rounds, matches] = await Promise.all([
        supabase.from('players').select('*').eq('group_code', groupCode),
        supabase.from('rounds').select('*').eq('group_code', groupCode).order('id', { ascending: false }),
        supabase.from('active_matches').select('*').eq('group_code', groupCode).eq('status', 'active')
      ]);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          players: players.data || [],
          rounds: rounds.data || [],
          matches: matches.data || []
        })
      };
    }

    // ── saveRound ────────────────────────────────────────────────────
    if (action === 'saveRound') {
      const { round, playerData } = data;

      await supabase.from('players').upsert({
        name: playerData.name,
        email: playerData.email || null,
        group_code: groupCode,
        handicap: playerData.handicap || 0,
        match_code: playerData.matchCode || null
      }, { onConflict: 'name,group_code' });

      await supabase.from('rounds').upsert({
        id: round.id,
        player_name: round.player,
        group_code: groupCode,
        course: round.course,
        loc: round.loc,
        tee: round.tee,
        date: round.date,
        scores: round.scores,
        putts: round.putts,
        fir: round.fir,
        gir: round.gir,
        pars: round.pars,
        notes: round.notes,
        total_score: round.totalScore,
        total_par: round.totalPar,
        diff: round.diff,
        birdies: round.birdies,
        pars_count: round.parsCount,
        bogeys: round.bogeys,
        doubles: round.doubles,
        eagles: round.eagles,
        penalties: round.penalties || 0,
        bunkers: round.bunkers || 0,
        chips: round.chips || 0,
        rating: round.rating,
        slope: round.slope,
        ai_review: round.aiReview || null,
        wolf_result: round.wolfResult || null,
        match_result: round.matchResult || null,
        ...(round.sixesResult != null ? { sixes_result: round.sixesResult } : {})
      }, { onConflict: 'id' });

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── updateHandicap ───────────────────────────────────────────────
    if (action === 'updateHandicap') {
      const { playerName, handicap } = data;
      await supabase.from('players')
        .update({ handicap })
        .eq('name', playerName)
        .eq('group_code', groupCode);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── deleteRound ──────────────────────────────────────────────────
    if (action === 'deleteRound') {
      const { roundId } = data;
      await supabase.from('rounds')
        .delete()
        .eq('id', roundId)
        .eq('group_code', groupCode);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── saveMatch ────────────────────────────────────────────────────
    if (action === 'saveMatch') {
      const { match } = data;
      await supabase.from('active_matches').upsert(match, { onConflict: 'id' });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── saveDrive ────────────────────────────────────────────────────
    if (action === 'saveDrive') {
      const { drive } = data;
      await supabase.from('drives').insert({
        group_code: groupCode,
        player_name: drive.player,
        course: drive.course,
        tee: drive.tee,
        hole: drive.hole,
        club: drive.club,
        yards: drive.yards,
        date: drive.date
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── publishLiveRound ─────────────────────────────────────────────
    if (action === 'publishLiveRound') {
      const { round } = data;
      await supabase.from('active_rounds').upsert({
        id: round.id,
        group_code: groupCode,
        host: round.host,
        players: round.players,
        course: round.course || '',
        tee: round.tee || '',
        hole: round.hole || 0,
        scores: round.scores || {},
        putts: round.putts || {},
        pars: round.pars || [],
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── pollGroupInvites ─────────────────────────────────────────────
    if (action === 'pollGroupInvites') {
      const { data: rows, error } = await supabase
        .from('active_rounds')
        .select('*')
        .eq('group_code', groupCode)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ rounds: rows || [] }) };
    }

    // ── fetchLiveRound ───────────────────────────────────────────────
    if (action === 'fetchLiveRound') {
      const { roundId } = data;
      const { data: row } = await supabase
        .from('active_rounds')
        .select('*')
        .eq('id', roundId)
        .maybeSingle();
      return { statusCode: 200, headers, body: JSON.stringify({ round: row || null }) };
    }

    // ── updateEditorScores ───────────────────────────────────────────
    if (action === 'updateEditorScores') {
      const { roundId, player, hole, score } = data;
      // Fetch current scores, update the one hole, write back
      const { data: row } = await supabase
        .from('active_rounds')
        .select('scores')
        .eq('id', roundId)
        .maybeSingle();
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Round not found' }) };
      const scores = row.scores || {};
      if (!scores[player]) scores[player] = Array(18).fill(null);
      scores[player][hole] = score;
      await supabase.from('active_rounds')
        .update({ scores, updated_at: new Date().toISOString() })
        .eq('id', roundId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── endLiveRound ─────────────────────────────────────────────────
    if (action === 'endLiveRound') {
      const { roundId } = data;
      await supabase.from('active_rounds').delete().eq('id', roundId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error('Supabase function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
