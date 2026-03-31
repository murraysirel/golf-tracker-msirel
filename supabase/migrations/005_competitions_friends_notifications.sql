-- Migration: 005 | Tables: competitions, active_matches, active_rounds,
--                         friendships, notifications, feedback, app_errors, drives
-- Date: 31 March 2026
-- Documents the current state of all remaining tables.

CREATE TABLE IF NOT EXISTS competitions (
  id              text PRIMARY KEY,
  code            text UNIQUE,               -- format: COMP + 2 letters + 4 digits (e.g. COMPAB1234)
  name            text,
  created_by      text,                      -- player name of creator
  admin_players   text[],                    -- array of player names with admin access
  format          text,                      -- 'stableford'|'stableford_gross'|'stroke_gross'|'stroke_net'|'matchplay'
  team_format     boolean,
  team_a          text[],
  team_b          text[],
  rounds_config   jsonb,                     -- [{ day, date, course, courseId, tee }]
  tee_groups      jsonb,                     -- { "round_1": [{ id, startHole, teeTime, players[] }], ... }
  players         text[],                    -- all player names in this competition
  status          text DEFAULT 'setup',      -- 'setup'|'active'|'complete'
  hcp_overrides   jsonb,                     -- { "Player Name": handicapValue }
  commentary      jsonb,                     -- { preview, halftime, final }
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitions_code ON competitions(code);

CREATE TABLE IF NOT EXISTS active_matches (
  id           text PRIMARY KEY,
  name         text,
  course       text,
  date         text,
  created_by   text,
  group_code   text,
  match_type   text,
  status       text,                         -- 'active'|'complete'
  players      jsonb,
  scores       jsonb,
  tee_groups   jsonb,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_matches_group ON active_matches(group_code, status);

CREATE TABLE IF NOT EXISTS active_rounds (
  id           text PRIMARY KEY,
  group_code   text,
  host         text,
  players      text[],
  course       text,
  tee          text,
  hole         integer,
  scores       jsonb,
  putts        jsonb,
  pars         jsonb,
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS friendships (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  requester   text NOT NULL,
  addressee   text NOT NULL,
  status      text DEFAULT 'pending',        -- 'pending'|'accepted'|'blocked'
  created_at  timestamptz DEFAULT now(),
  UNIQUE(requester, addressee)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee);

CREATE TABLE IF NOT EXISTS notifications (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  to_player   text NOT NULL,
  from_player text,
  type        text,                          -- 'friend_request'|'friend_accepted'|'join_request'|'join_approved'
  payload     jsonb,
  read        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_to ON notifications(to_player);

CREATE TABLE IF NOT EXISTS feedback (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_name   text,
  type          text,                        -- feedback category
  message       text,
  rating        integer,                     -- 1-5 star rating
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_errors (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_name   text,
  error_type    text,                        -- 'uncaught'|'promise'|'validation'|etc.
  message       text NOT NULL,
  context       text,                        -- source:line or function name
  url           text,
  user_agent    text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drives (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_code    text,
  player_name   text,
  course        text,
  tee           text,
  hole          integer,
  club          text,
  yards         numeric,
  date          text,
  created_at    timestamptz DEFAULT now()
);
