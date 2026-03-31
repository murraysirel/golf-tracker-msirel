-- Migration: 001 | Table: players | Date: 31 March 2026
-- Documents the current state of the players table.

CREATE TABLE IF NOT EXISTS players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  email       text,
  auth_user_id uuid,                       -- links to Supabase Auth (auth.users.id)
  handicap    numeric DEFAULT 0,
  dob         text,                        -- DD/MM/YYYY format string, not a date type
  avatar_url  text,                        -- base64 data URL (resized to 256px)
  match_code  text,                        -- legacy, largely unused
  group_code  text,                        -- legacy single-group field, replaced by group_members
  home_course text,                        -- free-text home course name, shown in friend search
  practice_sessions jsonb DEFAULT '[]',    -- array of practice session objects
  stats_analysis    jsonb,                 -- { positive, negative, drill, handicap }
  stats_analysis_date text,                -- date string of last AI analysis
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- auth_user_id is used for player lookup on every app boot (getPlayerByAuthId)
-- If this column is null or mismatched, the player sees no data.
CREATE INDEX IF NOT EXISTS idx_players_auth_user_id ON players(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
