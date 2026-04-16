// netlify/functions/supabase.js
// Supabase backend for Looper — parallel write target during Gist→Supabase migration.
// SUPABASE_SERVICE_KEY lives in Netlify env vars only — never in browser JS.

const { createClient } = require('@supabase/supabase-js');
const { sendPushToPlayer } = require('../lib/push');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function makeHeaders(event) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': event?.headers?.origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

exports.handler = async (event) => {
  const headers = makeHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let action, groupCode, data, requestingPlayer;
  try {
    ({ action, groupCode, data, requestingPlayer } = JSON.parse(event.body || '{}'));
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

      // Get all approved member names for this group (pending members excluded from leaderboards).
      const { data: memberRows, error: mErr } = await supabase
        .from('group_members').select('player_id, joined_at, status').eq('group_id', groupId);
      if (mErr) throw mErr;

      // Include members with status 'approved' or NULL (backwards compat for rows without status column)
      // Always include the requesting player so they can see their own data even if pending
      const reqPlayer = requestingPlayer || '';
      const approvedRows = (memberRows || []).filter(m =>
        m.player_id === reqPlayer || !m.status || m.status === 'approved'
      );
      const memberNames = approvedRows.map(m => m.player_id);
      const memberJoinDates = {};
      approvedRows.forEach(m => { if (m.joined_at) memberJoinDates[m.player_id] = m.joined_at; });

      if (memberNames.length === 0) {
        const { data: matches } = await supabase
          .from('active_matches').select('*').eq('group_code', groupCode).eq('status', 'active');
        return {
          statusCode: 200, headers,
          body: JSON.stringify({ players: [], rounds: [], matches: matches || [], settings })
        };
      }

      // Fetch players and their rounds. Default: last 50 rounds per member (covers
      // home stats, leaderboard, and recent history). Pass roundLimit=0 for full history.
      const roundLimit = data?.roundLimit ?? 50;
      let roundsQuery = supabase.from('rounds').select('*').in('player_name', memberNames).order('id', { ascending: false });
      if (roundLimit > 0) roundsQuery = roundsQuery.limit(roundLimit * memberNames.length);
      const [playersRes, roundsRes, matchesRes] = await Promise.all([
        supabase.from('players').select('*').in('name', memberNames),
        roundsQuery,
        supabase.from('active_matches').select('*').eq('group_code', groupCode).eq('status', 'active')
      ]);

      // Synthetic placeholder for members who joined but have no players row yet
      // (race window between joinGroup writing group_members and the first saveRound).
      const knownNames = new Set((playersRes.data || []).map(p => p.name));
      const syntheticPlayers = memberNames
        .filter(n => !knownNames.has(n))
        .map(n => ({ id: null, name: n, email: null, group_code: null, handicap: 0, match_code: null }));

      const fetchedRounds = roundsRes.data || [];
      const maxExpected = roundLimit > 0 ? roundLimit * memberNames.length : 0;

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          players: [...(playersRes.data || []), ...syntheticPlayers],
          rounds:  fetchedRounds,
          matches: matchesRes.data || [],
          settings,
          memberJoinDates,
          hasMoreRounds: roundLimit > 0 && fetchedRounds.length >= maxExpected
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

      const { error: plErr } = await supabase.from('players').upsert({
        name: playerData.name,
        email: playerData.email || null,
        dob: playerData.dob || null,
        handicap: playerData.handicap || 0,
        match_code: playerData.matchCode || null
        // group_code intentionally omitted — nullable audit-only column post-migration
      }, { onConflict: 'name' });
      if (plErr) console.error('[saveRound] player upsert failed:', plErr.message);

      const { error: roundErr } = await supabase.from('rounds').upsert({
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

      if (roundErr) {
        console.error('[saveRound] rounds upsert failed:', roundErr.message, roundErr.details);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Round save failed: ' + roundErr.message }) };
      }

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
      try {
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
        // Push to invited players on first publish only (insert, not hole update)
        if (Array.isArray(round.players)) {
          const { data: row } = await supabase.from('active_rounds').select('created_at, updated_at').eq('id', round.id).maybeSingle();
          const isNew = row && (new Date(row.updated_at) - new Date(row.created_at)) < 2000;
          if (isNew) {
            for (const p of round.players) {
              if (p !== round.host) {
                sendPushToPlayer(supabase, p, { type: 'live_invite', fromPlayer: round.host, payload: { course: round.course || '' } });
              }
            }
          }
        }
      } catch (e) {
        console.warn('[publishLiveRound]', e.message);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── pollGroupInvites ─────────────────────────────────────────────
    if (action === 'pollGroupInvites') {
      try {
        // Only return rounds updated in the last 30 minutes (prevents zombie rounds)
        const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: rows, error } = await supabase
          .from('active_rounds')
          .select('*')
          .eq('group_code', groupCode)
          .gt('updated_at', staleThreshold)
          .order('updated_at', { ascending: false });
        if (error) {
          // Graceful: return empty instead of 500 (table may not exist yet)
          console.warn('[pollGroupInvites]', error.message);
          return { statusCode: 200, headers, body: JSON.stringify({ rounds: [] }) };
        }
        // Garbage collect zombie rows older than 60 minutes (fire-and-forget)
        supabase.from('active_rounds').delete().lt('updated_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()).then(() => {}).catch(() => {});
        return { statusCode: 200, headers, body: JSON.stringify({ rounds: rows || [] }) };
      } catch (e) {
        return { statusCode: 200, headers, body: JSON.stringify({ rounds: [] }) };
      }
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
        .select('player_id, joined_at, status')
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
            joinedAt: m.joined_at,
            status: m.status || 'approved'
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
        .select('id, status')
        .eq('group_id', groupId)
        .eq('player_id', playerName)
        .maybeSingle();
      if (existing) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadyMember: true, status: existing.status || 'approved' }) };
      }
      // Insert as pending — admin must approve
      const { error: insErr } = await supabase
        .from('group_members')
        .insert({ group_id: groupId, player_id: playerName, status: 'pending' });
      if (insErr) throw insErr;
      // Notify the group admin
      const { data: grp } = await supabase.from('groups').select('admin_id, name').eq('id', groupId).maybeSingle();
      if (grp?.admin_id) {
        await supabase.from('notifications').insert({
          to_player: grp.admin_id,
          from_player: playerName,
          type: 'join_request',
          payload: { groupId, groupName: grp.name || '' }
        }).catch(() => {});
        sendPushToPlayer(supabase, grp.admin_id, { type: 'join_request', fromPlayer: playerName, payload: {} });
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadyMember: false, status: 'pending' }) };
    }

    // ── approveGroupMember ───────────────────────────────────────────
    if (action === 'approveGroupMember') {
      const { groupId, playerName, adminId, approve } = data;
      if (!groupId || !playerName || !adminId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'groupId, playerName, adminId required' }) };
      }
      const { data: grp } = await supabase.from('groups').select('admin_id').eq('id', groupId).maybeSingle();
      if (!grp || grp.admin_id !== adminId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized' }) };
      }
      if (approve) {
        const { error } = await supabase.from('group_members')
          .update({ status: 'approved' })
          .eq('group_id', groupId).eq('player_id', playerName);
        if (error) throw error;
        // Notify the player they were approved
        await supabase.from('notifications').insert({
          to_player: playerName,
          from_player: adminId,
          type: 'join_approved',
          payload: { groupId, groupName: '' }
        }).catch(() => {});
        sendPushToPlayer(supabase, playerName, { type: 'join_approved', fromPlayer: adminId, payload: {} });
      } else {
        // Decline — remove the pending member
        await supabase.from('group_members')
          .delete()
          .eq('group_id', groupId).eq('player_id', playerName).eq('status', 'pending');
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
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
      const { authUserId, playerName } = data;
      if (!authUserId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'authUserId required' }) };
      // subscription column added when ready: ALTER TABLE players ADD COLUMN IF NOT EXISTS subscription JSONB DEFAULT '{"tier":"free"}'::jsonb;
      const selectCols = 'name, dob, home_course, practice_sessions, stats_analysis, stats_analysis_date';

      // Primary lookup: by auth_user_id (use .limit(1) instead of .maybeSingle() to avoid
      // errors when duplicate rows exist — maybeSingle throws on >1 match)
      let player = null;
      const { data: authRows, error: authErr } = await supabase
        .from('players').select(selectCols).eq('auth_user_id', authUserId).limit(1);
      if (!authErr && authRows?.length > 0) player = authRows[0];

      // Fallback: lookup by name (handles auth_user_id mismatch, accidental edits, etc.)
      if (!player && playerName) {
        const { data: nameRows, error: nameErr } = await supabase
          .from('players').select(selectCols).eq('name', playerName).limit(1);
        if (!nameErr && nameRows?.length > 0) {
          player = nameRows[0];
          // Repair: set auth_user_id so future lookups work directly
          await supabase.from('players').update({ auth_user_id: authUserId }).eq('name', playerName);
        }
      }
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
          dob:                player.dob || null,
          homeCourse:         player.home_course || null,
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

    // ── createCompetition ──────────────────────────────────────────────
    if (action === 'createCompetition') {
      const { competition } = data;
      if (!competition?.code || !competition?.name || !competition?.created_by) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'code, name and created_by required' }) };
      }
      const { data: row, error: cErr } = await supabase
        .from('competitions')
        .insert({
          code:          competition.code,
          name:          competition.name,
          created_by:    competition.created_by,
          admin_players: competition.admin_players || [competition.created_by],
          format:        competition.format || 'stableford',
          team_format:   competition.team_format || false,
          rounds_config: competition.rounds_config || [],
          players:       [competition.created_by],
          status:        'setup',
        })
        .select('*')
        .single();
      if (cErr) throw cErr;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, competition: row }) };
    }

    // ── lookupCompetition ────────────────────────────────────────────
    if (action === 'lookupCompetition') {
      const { code } = data;
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'code required' }) };
      const { data: row, error: lErr } = await supabase
        .from('competitions')
        .select('*')
        .eq('code', code.toUpperCase().trim())
        .maybeSingle();
      if (lErr) throw lErr;
      if (!row) return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
      return { statusCode: 200, headers, body: JSON.stringify({ found: true, competition: row }) };
    }

    // ── joinCompetition ──────────────────────────────────────────────
    if (action === 'joinCompetition') {
      const { code, playerName } = data;
      if (!code || !playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'code and playerName required' }) };
      const { data: row, error: fErr } = await supabase
        .from('competitions')
        .select('id, players')
        .eq('code', code.toUpperCase().trim())
        .maybeSingle();
      if (fErr) throw fErr;
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Competition not found' }) };
      const players = row.players || [];
      if (players.includes(playerName)) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadyJoined: true }) };
      }
      players.push(playerName);
      const { error: uErr } = await supabase
        .from('competitions')
        .update({ players })
        .eq('id', row.id);
      if (uErr) throw uErr;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadyJoined: false }) };
    }

    // ── getCompetition ─────────────────────────────────────────────────
    if (action === 'getCompetition') {
      const { id, code } = data;
      if (!id && !code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or code required' }) };
      let query = supabase.from('competitions').select('*');
      if (id) query = query.eq('id', id);
      else query = query.eq('code', code.toUpperCase().trim());
      const { data: row, error: gErr } = await query.maybeSingle();
      if (gErr) throw gErr;
      if (!row) return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
      return { statusCode: 200, headers, body: JSON.stringify({ found: true, competition: row }) };
    }

    // ── getMyCompetitions ────────────────────────────────────────────
    if (action === 'getMyCompetitions') {
      const { playerName } = data;
      if (!playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName required' }) };
      const { data: rows, error: mcErr } = await supabase
        .from('competitions')
        .select('id, code, name, format, status, players, rounds_config, tee_groups, created_by, admin_players, hcp_overrides')
        .contains('players', [playerName])
        .order('created_at', { ascending: false });
      if (mcErr) throw mcErr;
      return { statusCode: 200, headers, body: JSON.stringify({ competitions: rows || [] }) };
    }

    // ── updateCompetition ────────────────────────────────────────────
    if (action === 'updateCompetition') {
      const { competitionId, playerName, updates } = data;
      if (!competitionId || !playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'competitionId and playerName required' }) };
      // Auth check: player must be in admin_players
      const { data: comp } = await supabase.from('competitions').select('admin_players').eq('id', competitionId).maybeSingle();
      if (!comp || !(comp.admin_players || []).includes(playerName)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized — admin access required' }) };
      }
      const allowed = {};
      if (updates.hcp_overrides !== undefined) allowed.hcp_overrides = updates.hcp_overrides;
      if (updates.admin_players !== undefined) allowed.admin_players = updates.admin_players;
      if (updates.status !== undefined) allowed.status = updates.status;
      if (updates.team_a !== undefined) allowed.team_a = updates.team_a;
      if (updates.team_b !== undefined) allowed.team_b = updates.team_b;
      if (updates.rounds_config !== undefined) allowed.rounds_config = updates.rounds_config;
      if (updates.tee_groups !== undefined) allowed.tee_groups = updates.tee_groups;
      if (updates.commentary !== undefined) allowed.commentary = updates.commentary;
      const { error: uErr } = await supabase.from('competitions').update(allowed).eq('id', competitionId);
      if (uErr) throw uErr;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── searchPlayers — fuzzy name search for friend-add ──────────────
    if (action === 'searchPlayers') {
      const { query, excludeName } = data;
      if (!query || query.length < 2) return { statusCode: 200, headers, body: JSON.stringify({ players: [] }) };
      const { data: rows, error: sErr } = await supabase
        .from('players')
        .select('name, handicap, home_course')
        .ilike('name', `%${query}%`)
        .limit(15);
      if (sErr) throw sErr;
      const filtered = (rows || []).filter(r => r.name !== excludeName);
      return { statusCode: 200, headers, body: JSON.stringify({ players: filtered }) };
    }

    // ── updateHomeCourse ────────────────────────────────────────────
    if (action === 'updateHomeCourse') {
      const { playerName, homeCourse } = data;
      if (!playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName required' }) };
      const { error: hErr } = await supabase
        .from('players')
        .update({ home_course: homeCourse || null })
        .eq('name', playerName);
      if (hErr) throw hErr;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── sendFriendRequest ──────────────────────────────────────────────
    if (action === 'sendFriendRequest') {
      const { from, to } = data;
      if (!from || !to) return { statusCode: 400, headers, body: JSON.stringify({ error: 'from and to required' }) };
      if (from === to) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot friend yourself' }) };
      // Check for existing friendship in either direction
      const { data: existing } = await supabase
        .from('friendships')
        .select('id, status')
        .or(`and(requester.eq.${from},addressee.eq.${to}),and(requester.eq.${to},addressee.eq.${from})`)
        .maybeSingle();
      if (existing) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadyExists: true, status: existing.status }) };
      }
      const { data: row, error: fErr } = await supabase
        .from('friendships')
        .insert({ requester: from, addressee: to, status: 'pending' })
        .select('*')
        .single();
      if (fErr) throw fErr;
      // Create notification + push
      await supabase.from('notifications').insert({
        to_player: to,
        from_player: from,
        type: 'friend_request',
        payload: { friendshipId: row.id }
      });
      sendPushToPlayer(supabase, to, { type: 'friend_request', fromPlayer: from, payload: {} });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, friendship: row }) };
    }

    // ── respondFriendRequest ─────────────────────────────────────────
    if (action === 'respondFriendRequest') {
      const { friendshipId, playerName, accept } = data;
      if (!friendshipId || !playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'friendshipId and playerName required' }) };
      const newStatus = accept ? 'accepted' : 'blocked';
      const { error: uErr } = await supabase
        .from('friendships')
        .update({ status: newStatus })
        .eq('id', friendshipId)
        .eq('addressee', playerName);
      if (uErr) throw uErr;
      // If accepted, notify the requester
      if (accept) {
        const { data: fr } = await supabase.from('friendships').select('requester').eq('id', friendshipId).maybeSingle();
        if (fr?.requester) {
          await supabase.from('notifications').insert({
            to_player: fr.requester,
            from_player: playerName,
            type: 'friend_accepted',
            payload: { friendshipId }
          });
          sendPushToPlayer(supabase, fr.requester, { type: 'friend_accepted', fromPlayer: playerName, payload: {} });
        }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── getFriends ───────────────────────────────────────────────────
    if (action === 'getFriends') {
      const { playerName } = data;
      if (!playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName required' }) };
      const { data: rows, error: fErr } = await supabase
        .from('friendships')
        .select('*')
        .or(`requester.eq.${playerName},addressee.eq.${playerName}`);
      if (fErr) throw fErr;
      return { statusCode: 200, headers, body: JSON.stringify({ friendships: rows || [] }) };
    }

    // ── getNotifications ─────────────────────────────────────────────
    if (action === 'getNotifications') {
      const { playerName } = data;
      if (!playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName required' }) };
      const { data: rows, error: nErr } = await supabase
        .from('notifications')
        .select('*')
        .eq('to_player', playerName)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (nErr) throw nErr;
      return { statusCode: 200, headers, body: JSON.stringify({ notifications: rows || [] }) };
    }

    // ── markNotificationsRead ────────────────────────────────────────
    if (action === 'markNotificationsRead') {
      const { ids } = data;
      if (!ids?.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      const { error: mErr } = await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', ids);
      if (mErr) throw mErr;
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

    // ── getDashboardStats ──────────────────────────────────────────
    if (action === 'getDashboardStats') {
      const [playersRes, roundsRes, coursesRes, reportsRes, logRes] = await Promise.all([
        supabase.from('players').select('name, handicap, created_at', { count: 'exact' }),
        supabase.from('rounds').select('id, player_name, date, created_at', { count: 'exact' }),
        supabase.from('courses').select('id, name, has_hole_data, has_gps', { count: 'exact' }),
        supabase.from('course_reports').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('api_call_log').select('*').order('timestamp', { ascending: false }).limit(200),
      ]);
      const logs = logRes.data || [];
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      return { statusCode: 200, headers, body: JSON.stringify({
        players: { count: playersRes.count || 0, list: (playersRes.data || []).slice(0, 100) },
        rounds: { count: roundsRes.count || 0 },
        courses: {
          count: coursesRes.count || 0,
          withData: (coursesRes.data || []).filter(c => c.has_hole_data).length,
          withGps: (coursesRes.data || []).filter(c => c.has_gps).length,
        },
        reports: reportsRes.data || [],
        apiLog: {
          total: logs.length,
          today: logs.filter(l => l.timestamp?.startsWith(today)).length,
          thisWeek: logs.filter(l => l.timestamp >= weekAgo).length,
          cacheHitRate: logs.length ? Math.round(logs.filter(l => l.was_cache_hit).length / logs.length * 100) : 0,
          lastCall: logs[0]?.timestamp || null,
          creditsLeft: logs.find(l => l.details?.apiRequestsLeft != null)?.details?.apiRequestsLeft ?? null,
        },
      })};
    }

    // ── getDashboardHealth ─────────────────────────────────────────────
    if (action === 'getDashboardHealth') {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const [recentRounds, lastRound, pendingMembers, nullAuth, allMembers, allPlayers] = await Promise.all([
        supabase.from('rounds').select('player_name', { count: 'exact' }).gte('created_at', dayAgo),
        supabase.from('rounds').select('created_at, player_name, course').order('created_at', { ascending: false }).limit(1),
        supabase.from('group_members').select('player_id, group_id, status').eq('status', 'pending'),
        supabase.from('players').select('name').is('auth_user_id', null),
        supabase.from('group_members').select('player_id'),
        supabase.from('players').select('name'),
      ]);
      // Orphaned members: in group_members but not in players
      const playerNames = new Set((allPlayers.data || []).map(p => p.name));
      const orphaned = (allMembers.data || []).filter(m => !playerNames.has(m.player_id));
      // Active users: distinct player names from rounds in last 24h
      const activeUsers = new Set((recentRounds.data || []).map(r => r.player_name));
      // Last round
      const lr = lastRound.data?.[0];
      // Errors (if table exists)
      let errors = [];
      try {
        const { data: errRows } = await supabase.from('app_errors').select('*').order('created_at', { ascending: false }).limit(50);
        errors = errRows || [];
      } catch (_) { /* table may not exist yet */ }
      // Recent activity: last 20 rounds + last 5 new players
      const { data: recentActivity } = await supabase.from('rounds').select('player_name, course, date, diff, created_at').order('created_at', { ascending: false }).limit(20);
      const { data: newPlayers } = await supabase.from('players').select('name, created_at').order('created_at', { ascending: false }).limit(5);
      return { statusCode: 200, headers, body: JSON.stringify({
        activeUsers24h: activeUsers.size,
        lastRound: lr ? { player: lr.player_name, course: lr.course, ago: lr.created_at } : null,
        pendingMembers: (pendingMembers.data || []).map(m => m.player_id),
        nullAuthPlayers: (nullAuth.data || []).map(p => p.name),
        orphanedMembers: orphaned.map(m => m.player_id),
        errors,
        recentRounds: recentActivity || [],
        newPlayers: newPlayers || [],
      })};
    }

    // ── likeRound ────────────────────────────────────────────────────
    if (action === 'likeRound') {
      const { playerName, roundId, roundPlayer, roundCourse, roundDate } = data;
      if (!playerName || !roundId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName and roundId required' }) };
      // Check duplicate
      const { data: existing } = await supabase.from('feed_likes').select('id').eq('liker', playerName).eq('round_id', roundId).maybeSingle();
      if (existing) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, already: true }) };
      await supabase.from('feed_likes').insert({ liker: playerName, round_id: roundId });
      // Notify round owner (don't notify yourself)
      if (roundPlayer && roundPlayer !== playerName) {
        await supabase.from('notifications').insert({ to_player: roundPlayer, from_player: playerName, type: 'round_liked', payload: { roundId, roundCourse: roundCourse || '', roundDate: roundDate || '' } });
        sendPushToPlayer(supabase, roundPlayer, { type: 'round_liked', fromPlayer: playerName, payload: { course: roundCourse || '' } });
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── unlikeRound ─────────────────────────────────────────────────
    if (action === 'unlikeRound') {
      const { playerName, roundId } = data;
      if (!playerName || !roundId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName and roundId required' }) };
      await supabase.from('feed_likes').delete().eq('liker', playerName).eq('round_id', roundId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── getLikes ─────────────────────────────────────────────────────
    if (action === 'getLikes') {
      const { roundIds } = data;
      if (!roundIds?.length) return { statusCode: 200, headers, body: JSON.stringify({ likes: {} }) };
      const { data: rows } = await supabase.from('feed_likes').select('round_id, liker').in('round_id', roundIds);
      const likes = {};
      (rows || []).forEach(r => { if (!likes[r.round_id]) likes[r.round_id] = []; likes[r.round_id].push(r.liker); });
      return { statusCode: 200, headers, body: JSON.stringify({ likes }) };
    }

    // ── addComment ───────────────────────────────────────────────────
    if (action === 'addComment') {
      const { playerName, roundId, roundPlayer, text } = data;
      if (!playerName || !roundId || !text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName, roundId, text required' }) };
      const { data: row, error: cErr } = await supabase.from('feed_comments').insert({ commenter: playerName, round_id: roundId, text: text.substring(0, 280) }).select('id, created_at').single();
      if (cErr) return { statusCode: 500, headers, body: JSON.stringify({ error: cErr.message }) };
      // Notify round owner
      if (roundPlayer && roundPlayer !== playerName) {
        await supabase.from('notifications').insert({ to_player: roundPlayer, from_player: playerName, type: 'round_comment', payload: { roundId, text: text.substring(0, 100) } });
        sendPushToPlayer(supabase, roundPlayer, { type: 'round_comment', fromPlayer: playerName, payload: { text: text.substring(0, 100) } });
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, comment: row }) };
    }

    // ── getCommentCounts ─────────────────────────────────────────────
    if (action === 'getCommentCounts') {
      const { roundIds } = data;
      if (!roundIds?.length) return { statusCode: 200, headers, body: JSON.stringify({ counts: {} }) };
      const { data: rows } = await supabase.from('feed_comments').select('round_id, commenter, text, created_at').in('round_id', roundIds).order('created_at', { ascending: true });
      const counts = {};
      const previews = {};
      for (const r of (rows || [])) {
        if (!counts[r.round_id]) { counts[r.round_id] = 0; previews[r.round_id] = []; }
        counts[r.round_id]++;
        previews[r.round_id].push({ commenter: r.commenter, text: r.text });
      }
      // Keep only first and last comment per round for preview
      const trimmed = {};
      for (const [rid, arr] of Object.entries(previews)) {
        if (arr.length <= 2) { trimmed[rid] = arr; }
        else { trimmed[rid] = [arr[0], arr[arr.length - 1]]; }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ counts, previews: trimmed }) };
    }

    // ── getComments ──────────────────────────────────────────────────
    if (action === 'getComments') {
      const { roundId } = data;
      if (!roundId) return { statusCode: 200, headers, body: JSON.stringify({ comments: [] }) };
      const { data: rows } = await supabase.from('feed_comments').select('*').eq('round_id', roundId).order('created_at', { ascending: true }).limit(50);
      return { statusCode: 200, headers, body: JSON.stringify({ comments: rows || [] }) };
    }

    // ── logAppError ──────────────────────────────────────────────────
    // ── uploadRoundPhoto ──────────────────────────────────────────
    if (action === 'uploadRoundPhoto') {
      const { playerName, roundId, photoBase64, mimeType } = data;
      if (!playerName || !roundId || !photoBase64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName, roundId, photoBase64 required' }) };
      const ext = (mimeType || 'image/jpeg').split('/')[1] || 'jpg';
      const filePath = `rounds/${playerName}/${roundId}.${ext}`;
      const buffer = Buffer.from(photoBase64, 'base64');
      const { error: upErr } = await supabase.storage.from('round-photos').upload(filePath, buffer, { contentType: mimeType || 'image/jpeg', upsert: true });
      if (upErr) { console.error('[uploadRoundPhoto]', upErr.message); return { statusCode: 500, headers, body: JSON.stringify({ error: 'Upload failed' }) }; }
      const { data: urlData } = supabase.storage.from('round-photos').getPublicUrl(filePath);
      // Save URL to rounds table
      await supabase.from('rounds').update({ photo_url: urlData.publicUrl }).eq('id', roundId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, photoUrl: urlData.publicUrl }) };
    }

    // ── getRoundPhotos ───────────────────────────────────────────
    if (action === 'getRoundPhotos') {
      const { roundIds } = data;
      if (!roundIds?.length) return { statusCode: 200, headers, body: JSON.stringify({ photos: {} }) };
      const { data: rows } = await supabase.from('rounds').select('id, photo_url').in('id', roundIds).not('photo_url', 'is', null);
      const photos = {};
      (rows || []).forEach(r => { if (r.photo_url) photos[r.id] = r.photo_url; });
      return { statusCode: 200, headers, body: JSON.stringify({ photos }) };
    }

    if (action === 'logAppError') {
      try {
        await supabase.from('app_errors').insert({
          player_name: data.player || null,
          error_type: data.type || 'unknown',
          message: (data.message || 'No message').substring(0, 500),
          context: (data.context || '').substring(0, 200),
          url: (data.url || '').substring(0, 300),
          user_agent: (event.headers?.['user-agent'] || '').substring(0, 300),
        });
      } catch (_) { /* table may not exist — non-fatal */ }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── getAllCourses ─────────────────────────────────────────────────
    if (action === 'getAllCourses') {
      const { data: rows, error } = await supabase
        .from('courses').select('*').order('name');
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ courses: rows || [] }) };
    }

    // ── getCourseReports ─────────────────────────────────────────────
    if (action === 'getCourseReports') {
      const { data: rows, error } = await supabase
        .from('course_reports').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ reports: rows || [] }) };
    }

    // ── updateCourseReport ───────────────────────────────────────────
    if (action === 'updateCourseReport') {
      const { reportId, status } = data;
      if (!reportId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'reportId required' }) };
      await supabase.from('course_reports').update({ status }).eq('id', reportId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── submitFeedback ───────────────────────────────────────────────
    if (action === 'submitFeedback') {
      const { playerName, type, message, rating } = data;
      if (!message) return { statusCode: 400, headers, body: JSON.stringify({ error: 'message required' }) };
      await supabase.from('feedback').insert({
        player_name: playerName || 'Anonymous',
        type: type || 'general',
        message,
        rating: rating || null,
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── getFeedback ──────────────────────────────────────────────────
    if (action === 'getFeedback') {
      const { data: rows, error } = await supabase
        .from('feedback').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ feedback: rows || [] }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error('Supabase function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
