-- Migration: 003 | Tables: groups, group_members | Date: 31 March 2026
-- Documents the current state of groups and group_members tables.

CREATE TABLE IF NOT EXISTS groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,               -- short shareable code (e.g. K39GQ5)
  name          text NOT NULL,
  admin_id      text,                        -- player name of group admin
  active_boards text[],                      -- which leaderboard boards are enabled
  season        integer,
  settings      jsonb,                       -- group-level settings (courses, coords, seasons, etc.)
  created_at    timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_code ON groups(code);

CREATE TABLE IF NOT EXISTS group_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid REFERENCES groups(id),
  player_id  text NOT NULL,                  -- matches players.name
  joined_at  timestamptz DEFAULT now(),      -- used for leaderboard join-date filtering
  status     text DEFAULT 'approved'         -- 'approved'|'pending' — pending members excluded from leaderboards
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_player_id ON group_members(player_id);
