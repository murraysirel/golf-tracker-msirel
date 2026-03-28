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
    // Set group code for RLS policies — wrapped in its own try-catch so a missing
    // set_config function or wrong parameter names never kills other actions.
    try {
      await supabase.rpc('set_config', {
        setting: 'app.group_code',
        value: groupCode || '',
        is_local: true
      });
    } catch (_rpcErr) {
      // Non-fatal — RLS config, ignore silently
    }

    // ── read ─────────────────────────────────────────────────────────
    // Rounds belong to the player, not the group. We scope by group membership
    // (group_members join table) so a player's rounds are visible on every
    // leaderboard they belong to.
    if (action === 'read') {
      const { data: groupRow } = groupCode
        ? await supabase.from('groups').select('id, settings').eq('code', groupCode).maybeSingle()
        : { data: null };

      if (!groupRow) {
        // Unknown group code — return empty payload without error.
        // loadGroupData() in api.js detects this via the noSupabasePresence guard.
        return {
          statusCode: 200, headers,
          body: JSON.stringify({ players: [], rounds: [], matches: [], settings: {} })
        };
      }

      const groupId  = groupRow.id;
      const settings = groupRow.settings || {};

      // Get all member names for this group.
      const { data: memberRows, error: mErr } = await supabase
        .from('group_members').select('player_id').eq('group_id', groupId);
      if (mErr) throw mErr;

      const memberNames = (memberRows || []).map(m => m.player_id);

      if (memberNames.length === 0) {
        const { data: matches } = await supabase
          .from('active_matches').select('*').eq('group_code', groupCode).eq('status', 'active');
        return {
          statusCode: 200, headers,
          body: JSON.stringify({ players: [], rounds: [], matches: matches || [], settings })
        };
      }

      // Fetch players and ALL their rounds (no group_code filter on rounds).
      const [playersRes, roundsRes, matchesRes] = await Promise.all([
        supabase.from('players').select('*').in('name', memberNames),
        supabase.from('rounds').select('*').in('player_name', memberNames).order('id', { ascending: false }),
        supabase.from('active_matches').select('*').eq('group_code', groupCode).eq('status', 'active')
      ]);

      // Synthetic placeholder for members who joined but have no players row yet
      // (race window between joinGroup writing group_members and the first saveRound).
      const knownNames = new Set((playersRes.data || []).map(p => p.name));
      const syntheticPlayers = memberNames
        .filter(n => !knownNames.has(n))
        .map(n => ({ id: null, name: n, email: null, group_code: null, handicap: 0, match_code: null }));

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          players: [...(playersRes.data || []), ...syntheticPlayers],
          rounds:  roundsRes.data  || [],
          matches: matchesRes.data || [],
          settings
        })
      };
    }

    // ── upsertPlayer ─────────────────────────────────────────────────
    // Called when a player creates or joins a group so they appear in
    // the player picker immediately (before saving their first round).
    if (action === 'upsertPlayer') {
      const { playerName, handicap, email, dob, avatarUrl } = data;
      if (!playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName required' }) };
      await supabase.from('players').upsert(
        {
          name: playerName,
          handicap: handicap || 0,
          ...(email ? { email } : {}),
          ...(dob   ? { dob }   : {}),
          ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {})
        },
        { onConflict: 'name' }
      );
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── saveGroupSettings ─────────────────────────────────────────────
    if (action === 'saveGroupSettings') {
      const { groupCode: code, settings } = data;
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'groupCode required' }) };
      await supabase.from('groups').update({ settings }).eq('code', code);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── getGroupSettings ──────────────────────────────────────────────
    if (action === 'getGroupSettings') {
      const { data: row } = await supabase.from('groups')
        .select('settings').eq('code', groupCode).maybeSingle();
      return { statusCode: 200, headers, body: JSON.stringify({ settings: row?.settings || {} }) };
    }

    // ── saveRound ────────────────────────────────────────────────────
    if (action === 'saveRound') {
      const { round, playerData } = data;

      await supabase.from('players').upsert({
        name: playerData.name,
        email: playerData.email || null,
        dob: playerData.dob || null,
        handicap: playerData.handicap || 0,
        match_code: playerData.matchCode || null
        // group_code intentionally omitted — nullable audit-only column post-migration
      }, { onConflict: 'name' });

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
      // One canonical row per player name post-migration — no group_code filter needed.
      await supabase.from('players')
        .update({ handicap })
        .eq('name', playerName);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── deleteRound ──────────────────────────────────────────────────
    if (action === 'deleteRound') {
      const { roundId } = data;
      // Round id is Date.now() — globally unique. No group_code filter needed.
      await supabase.from('rounds')
        .delete()
        .eq('id', roundId);
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

    // ── renameGroup ───────────────────────────────────────────────────
    if (action === 'renameGroup') {
      const { groupId, adminId, name } = data;
      if (!name?.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name required' }) };
      const { error } = await supabase
        .from('groups')
        .update({ name: name.trim() })
        .eq('id', groupId)
        .eq('admin_id', adminId);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── getGroupMembers ───────────────────────────────────────────────
    if (action === 'getGroupMembers') {
      const { groupId } = data;
      if (!groupId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'groupId required' }) };
      const { data: members, error: mErr } = await supabase
        .from('group_members')
        .select('player_id, joined_at')
        .eq('group_id', groupId);
      if (mErr) throw mErr;
      if (!members?.length) return { statusCode: 200, headers, body: JSON.stringify({ members: [] }) };
      // One canonical row per player name — no group_code filter needed.
      const { data: players } = await supabase
        .from('players')
        .select('name, handicap')
        .in('name', members.map(m => m.player_id));
      const hcpMap = {};
      (players || []).forEach(p => { hcpMap[p.name] = p.handicap; });
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          members: members.map(m => ({
            playerId: m.player_id,
            handicap: hcpMap[m.player_id] ?? null,
            joinedAt: m.joined_at
          }))
        })
      };
    }

    // ── removeGroupMember ─────────────────────────────────────────────
    if (action === 'removeGroupMember') {
      const { groupId, playerId, adminId } = data;
      if (!groupId || !playerId || !adminId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'groupId, playerId and adminId required' }) };
      }
      if (playerId === adminId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Admin cannot remove themselves' }) };
      }
      const { data: grp } = await supabase.from('groups').select('admin_id').eq('id', groupId).maybeSingle();
      if (!grp || grp.admin_id !== adminId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized' }) };
      }
      await supabase.from('group_members').delete().eq('group_id', groupId).eq('player_id', playerId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── regenerateGroupCode ───────────────────────────────────────────
    if (action === 'regenerateGroupCode') {
      const { groupId, adminId } = data;
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = require('crypto').randomBytes(6);
      let code = '';
      for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
      const { error } = await supabase.from('groups').update({ code }).eq('id', groupId).eq('admin_id', adminId);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, code }) };
    }

    // ── getGroupByCode ────────────────────────────────────────────────
    if (action === 'getGroupByCode') {
      const { code, playerName } = data;
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'code required' }) };
      const { data: group, error } = await supabase
        .from('groups')
        .select('id, name, code, admin_id, active_boards')
        .eq('code', code.toUpperCase().trim())
        .maybeSingle();
      if (error) throw error;
      if (!group) return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
      let isMember = false;
      if (playerName) {
        const { data: mem } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', group.id)
          .eq('player_id', playerName)
          .maybeSingle();
        isMember = !!mem;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ found: true, isMember, group }) };
    }

    // ── updateGroupBoards ─────────────────────────────────────────────
    if (action === 'updateGroupBoards') {
      const { groupId, adminId, activeBoards } = data;
      if (!groupId || !adminId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'groupId and adminId required' }) };
      }
      const { error } = await supabase
        .from('groups')
        .update({ active_boards: activeBoards })
        .eq('id', groupId)
        .eq('admin_id', adminId);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── createGroup ──────────────────────────────────────────────────
    if (action === 'createGroup') {
      const { name, code, adminId, activeBoards, season } = data;
      if (!name || !code || !adminId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'name, code and adminId required' }) };
      }
      const { data: group, error: gErr } = await supabase
        .from('groups')
        .insert({ name, code, admin_id: adminId, active_boards: activeBoards || [], season: season || new Date().getFullYear() })
        .select('id, code, name')
        .single();
      if (gErr) throw gErr;
      const { error: mErr } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, player_id: adminId });
      if (mErr) throw mErr;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, group }) };
    }

    // ── lookupGroup ──────────────────────────────────────────────────
    if (action === 'lookupGroup') {
      const { code, playerName } = data;
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'code required' }) };
      const { data: group, error: gErr } = await supabase
        .from('groups')
        .select('id, name, code, admin_id')
        .eq('code', code.toUpperCase().trim())
        .maybeSingle();
      if (gErr) throw gErr;
      if (!group) return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id);
      let alreadyMember = false;
      if (playerName) {
        const { data: mem } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', group.id)
          .eq('player_id', playerName)
          .maybeSingle();
        alreadyMember = !!mem;
      }
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ found: true, alreadyMember, group: { ...group, memberCount: count || 0 } })
      };
    }

    // ── joinGroup ─────────────────────────────────────────────────────
    if (action === 'joinGroup') {
      const { groupId, playerName } = data;
      if (!groupId || !playerName) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'groupId and playerName required' }) };
      }
      const { data: existing } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('player_id', playerName)
        .maybeSingle();
      if (existing) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadyMember: true }) };
      const { error: insErr } = await supabase
        .from('group_members')
        .insert({ group_id: groupId, player_id: playerName });
      if (insErr) throw insErr;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadyMember: false }) };
    }

    // ── checkGroupMembership ──────────────────────────────────────────
    // Returns whether the given player is in any group_members row.
    // Used on app load to decide whether to show the group fork screen.
    if (action === 'checkGroupMembership') {
      const { playerName } = data;
      if (!playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName required' }) };
      const { data: rows, error: mErr } = await supabase
        .from('group_members')
        .select('group_id, groups(id, name, code, admin_id, active_boards)')
        .eq('player_id', playerName)
        .limit(5);
      if (mErr) throw mErr;
      const memberships = (rows || []).map(r => ({
        groupId:      r.group_id,
        name:         r.groups?.name || '',
        code:         r.groups?.code || '',
        adminId:      r.groups?.admin_id || '',
        activeBoards: r.groups?.active_boards || [],
      })).filter(m => m.code);
      return { statusCode: 200, headers, body: JSON.stringify({ isMember: memberships.length > 0, memberships }) };
    }

    // ── cleanupUnnamedGroups ──────────────────────────────────────────
    // Admin action: find groups with null/empty/literal-"undefined" names,
    // delete their group_members rows, then delete the groups themselves.
    // Does NOT touch the players or rounds tables.
    if (action === 'cleanupUnnamedGroups') {
      // Find unnamed groups
      const { data: badGroups, error: bgErr } = await supabase
        .from('groups')
        .select('id, name, code')
        .or('name.is.null,name.eq.,name.eq.undefined');
      if (bgErr) throw bgErr;

      if (!badGroups || badGroups.length === 0) {
        return { statusCode: 200, headers, body: JSON.stringify({ cleaned: 0, message: 'No unnamed groups found.' }) };
      }

      const ids = badGroups.map(g => g.id);
      let membersDeleted = 0;
      for (const id of ids) {
        const { count } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', id);
        await supabase.from('group_members').delete().eq('group_id', id);
        membersDeleted += count || 0;
      }

      await supabase.from('groups').delete().in('id', ids);

      console.log('[cleanupUnnamedGroups] removed', badGroups.length, 'groups,', membersDeleted, 'member rows');
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          cleaned:        badGroups.length,
          membersRemoved: membersDeleted,
          removedGroups:  badGroups.map(g => ({ id: g.id, name: g.name, code: g.code })),
          message:        `Removed ${badGroups.length} unnamed group(s) and ${membersDeleted} member row(s). All player and round data is intact.`,
        }),
      };
    }

    // ── getPlayerByAuthId ─────────────────────────────────────────────
    // Returns player name, group codes, and personal data (practice sessions,
    // stats analysis) for the given auth UUID. Called on each app boot.
    if (action === 'getPlayerByAuthId') {
      const { authUserId } = data;
      if (!authUserId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'authUserId required' }) };
      const { data: player } = await supabase
        .from('players')
        .select('name, practice_sessions, stats_analysis, stats_analysis_date')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (!player) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Player not found' }) };
      const { data: memberships } = await supabase
        .from('group_members')
        .select('groups(code)')
        .eq('player_id', player.name);
      const groupCodes = (memberships || []).map(m => m.groups?.code).filter(Boolean);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          name:               player.name,
          groupCodes,
          practiceSessions:   player.practice_sessions  || [],
          statsAnalysis:      player.stats_analysis     || null,
          statsAnalysisDate:  player.stats_analysis_date || null,
        }),
      };
    }

    // ── savePracticeSessions ──────────────────────────────────────────
    if (action === 'savePracticeSessions') {
      const { playerName, sessions } = data;
      if (!playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName required' }) };
      const { error: upErr } = await supabase
        .from('players')
        .update({ practice_sessions: sessions || [] })
        .eq('name', playerName);
      if (upErr) throw upErr;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── saveStatsAnalysis ─────────────────────────────────────────────
    if (action === 'saveStatsAnalysis') {
      const { playerName, statsAnalysis, statsAnalysisDate } = data;
      if (!playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName required' }) };
      const { error: upErr } = await supabase
        .from('players')
        .update({ stats_analysis: statsAnalysis || null, stats_analysis_date: statsAnalysisDate || null })
        .eq('name', playerName);
      if (upErr) throw upErr;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── linkAuthToPlayer ──────────────────────────────────────────────
    // Safety action: set auth_user_id on an existing player row by email.
    // Only links if the row has no auth_user_id yet (avoids overwriting).
    if (action === 'linkAuthToPlayer') {
      const { authUserId, email } = data;
      if (!authUserId || !email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'authUserId and email required' }) };
      const { error: upErr } = await supabase
        .from('players')
        .update({ auth_user_id: authUserId })
        .ilike('email', email)
        .is('auth_user_id', null);
      if (upErr) throw upErr;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── getApiCallLog ─────────────────────────────────────────────────
    if (action === 'getApiCallLog') {
      const { data: rows, error: logErr } = await supabase
        .from('api_call_log')
        .select('endpoint, course_name, was_cache_hit, timestamp')
        .order('timestamp', { ascending: false })
        .limit(200);
      if (logErr) throw logErr;
      return { statusCode: 200, headers, body: JSON.stringify({ rows: rows || [] }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error('Supabase function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
