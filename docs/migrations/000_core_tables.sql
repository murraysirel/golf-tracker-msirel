-- Migration 000: Core tables — players, rounds, active_matches, active_rounds, drives
-- Run this FIRST in the Supabase SQL editor, before any other migration.
-- Safe to re-run (all CREATE TABLE use IF NOT EXISTS).

-- ── TABLE: players ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  email       text,
  group_code  text        NOT NULL DEFAULT '',
  handicap    numeric     NOT NULL DEFAULT 0,
  match_code  text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (name, group_code)
);

-- ── TABLE: rounds ─────────────────────────────────────────────────────────────
-- id = Date.now() (bigint) — unique per round
CREATE TABLE IF NOT EXISTS rounds (
  id            bigint      PRIMARY KEY,
  player_name   text        NOT NULL,
  group_code    text        NOT NULL DEFAULT '',
  course        text,
  loc           text,
  tee           text,
  date          text,        -- stored as DD/MM/YYYY string
  scores        jsonb,       -- int[18]
  putts         jsonb,       -- int[18]
  fir           jsonb,       -- text[18]: 'Yes'|'No'|'N/A'
  gir           jsonb,       -- text[18]: 'Yes'|'No'
  pars          jsonb,       -- int[18]
  notes         text,
  total_score   integer,
  total_par     integer,
  diff          integer,
  birdies       integer     DEFAULT 0,
  pars_count    integer     DEFAULT 0,
  bogeys        integer     DEFAULT 0,
  doubles       integer     DEFAULT 0,
  eagles        integer     DEFAULT 0,
  penalties     integer     DEFAULT 0,
  bunkers       integer     DEFAULT 0,
  chips         integer     DEFAULT 0,
  rating        numeric,
  slope         numeric,
  ai_review     jsonb,
  wolf_result   jsonb,
  match_result  jsonb,
  sixes_result  jsonb,
  played_with   text[],
  match_handicaps jsonb,
  handicaps_used  boolean,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rounds_group_code_idx ON rounds (group_code);
CREATE INDEX IF NOT EXISTS rounds_player_name_idx ON rounds (player_name);

-- ── TABLE: active_matches ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS active_matches (
  id          text        PRIMARY KEY,
  group_code  text        NOT NULL DEFAULT '',
  status      text        NOT NULL DEFAULT 'active',
  data        jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ── TABLE: active_rounds (live scoring) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS active_rounds (
  id          text        PRIMARY KEY,
  group_code  text        NOT NULL DEFAULT '',
  host        text,
  players     jsonb,
  course      text        DEFAULT '',
  tee         text        DEFAULT '',
  hole        integer     DEFAULT 0,
  scores      jsonb       DEFAULT '{}',
  putts       jsonb       DEFAULT '{}',
  pars        jsonb       DEFAULT '[]',
  updated_at  timestamptz DEFAULT now()
);

-- ── TABLE: drives (GPS drive logging) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drives (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code  text        NOT NULL DEFAULT '',
  player_name text,
  course      text,
  tee         text,
  hole        integer,
  club        text,
  yards       numeric,
  date        text,
  created_at  timestamptz DEFAULT now()
);

-- ── TABLE: api_call_log (courses function monitoring) ────────────────────────
-- Only needed if you want to track GolfAPI credit usage.
CREATE TABLE IF NOT EXISTS api_call_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp       timestamptz DEFAULT now() NOT NULL,
  endpoint        text        NOT NULL,
  course_name     text,
  was_cache_hit   boolean     NOT NULL,
  details         jsonb
);

-- ── TABLE: courses (GolfAPI cache) ───────────────────────────────────────────
-- Already exists if you ran admin/supabase-migration.sql previously.
-- This is a safe no-op if it already exists.
CREATE TABLE IF NOT EXISTS courses (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  external_course_id  text    UNIQUE,
  external_club_id    text,
  name                text    NOT NULL,
  location            text,
  country             text,
  tees                jsonb,
  green_coords        jsonb,
  overall_par         integer,
  tee_types           jsonb,
  has_hole_data       boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS courses_name_idx     ON courses USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS courses_country_idx  ON courses (country);
CREATE INDEX IF NOT EXISTS courses_hole_data_idx ON courses (has_hole_data);
