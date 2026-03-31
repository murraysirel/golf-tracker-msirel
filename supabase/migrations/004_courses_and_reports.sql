-- Migration: 004 | Tables: courses, course_reports, api_call_log | Date: 31 March 2026
-- Documents the current state of course-related tables.

CREATE TABLE IF NOT EXISTS courses (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_course_id  text UNIQUE,           -- GolfAPI course ID
  external_club_id    text,                  -- GolfAPI club ID
  name                text NOT NULL,
  club_name           text,
  location            text,
  country             text,
  city                text,
  holes               integer,
  tees                jsonb,                 -- array of { colour, name, yardage, rating, slope, yards_per_hole, pars_per_hole, si_per_hole }
  pars                jsonb,                 -- NOT IN DB on some environments — strip from upsert if errors occur
  stroke_indexes      jsonb,                 -- NOT IN DB on some environments — strip from upsert if errors occur
  green_coords        jsonb,                 -- { [hole]: { front, middle, back } }
  has_gps             boolean,
  has_hole_data       boolean,
  data_source         text,                  -- 'golfapi'|'manual'|etc.
  data_quality        text,
  report_count        integer DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- NOTE: The following fields are calculated in courses.js parseCourseDetail()
-- but INTENTIONALLY NOT persisted to the database. They are stripped before
-- every upsert to avoid "column does not exist" errors:
--   overall_par  — NOT IN DB — strip from all upserts
--   tee_types    — NOT IN DB — strip from all upserts

CREATE INDEX IF NOT EXISTS idx_courses_external_id ON courses(external_course_id);
CREATE INDEX IF NOT EXISTS idx_courses_name ON courses(name);

CREATE TABLE IF NOT EXISTS course_reports (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id     text,                        -- external_course_id or internal reference
  player_name   text,
  group_code    text,
  issue         text NOT NULL,
  status        text DEFAULT 'pending',      -- 'pending'|'reviewed'|'resolved'
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_call_log (
  id            serial PRIMARY KEY,
  timestamp     timestamptz DEFAULT now(),
  endpoint      text,
  course_name   text,
  was_cache_hit boolean,
  details       jsonb                        -- { country, results, source, apiRequestsLeft, ... }
);
