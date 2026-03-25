-- Migration 001: groups and group_members tables for Phase 1C multi-group support
-- Run this in the Supabase SQL editor.

-- ── TABLE: groups ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text        UNIQUE NOT NULL,
  name          text        NOT NULL,
  admin_id      uuid        REFERENCES players(id),
  active_boards text[]      NOT NULL DEFAULT ARRAY[
                              'season', 'stableford', 'net_score',
                              'scoring_gross', 'scoring_net', 'best_gross',
                              'best_net', 'buffer', 'fewest_doubles'
                            ],
  created_at    timestamptz DEFAULT now(),
  season        integer     DEFAULT EXTRACT(YEAR FROM now())::integer
);

-- ── TABLE: group_members ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid        REFERENCES groups(id) ON DELETE CASCADE,
  player_id  uuid        REFERENCES players(id) ON DELETE CASCADE,
  joined_at  timestamptz DEFAULT now(),
  UNIQUE (group_id, player_id)
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Policy: a user can read a group if they appear in group_members for that group_id.
CREATE POLICY "members can read their groups"
  ON groups
  FOR SELECT
  USING (
    id IN (
      SELECT group_id
      FROM   group_members
      WHERE  player_id = auth.uid()
    )
  );

-- Policy: a user can read group_member rows where:
--   • the row belongs to them (player_id = their own ID), OR
--   • the group_id is one they already belong to.
CREATE POLICY "members can read group membership"
  ON group_members
  FOR SELECT
  USING (
    player_id = auth.uid()
    OR group_id IN (
      SELECT group_id
      FROM   group_members gm2
      WHERE  gm2.player_id = auth.uid()
    )
  );
