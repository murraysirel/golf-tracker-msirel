-- ============================================================
-- Supabase Migration: Course caching architecture v2
-- Run this in the Supabase SQL editor BEFORE running the
-- import script or deploying the updated Netlify function.
-- ============================================================

-- 1. Add has_hole_data flag (true = validated hole-by-hole data is stored)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS has_hole_data BOOLEAN DEFAULT false;

-- 2. Add overall_par (useful for display in search results without fetching tees)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS overall_par INTEGER;

-- 3. Add tee_types (array of tee names available at list level, e.g. ["Blue","White","Red"])
ALTER TABLE courses ADD COLUMN IF NOT EXISTS tee_types JSONB;

-- 4. Mark any existing records that already have valid per-hole data as has_hole_data = true.
--    A record is considered valid if tees is a non-empty array and tees[0].pars_per_hole
--    exists, has exactly 18 entries, and at least one par value is not 4.
--    (We cannot filter out all-4 pars purely in SQL cheaply, so we mark them all true
--     here and the fix-bad-data action below will reset the broken ones.)
UPDATE courses
SET has_hole_data = true
WHERE
  tees IS NOT NULL
  AND jsonb_typeof(tees) = 'array'
  AND jsonb_array_length(tees) > 0
  AND (tees->0->'pars_per_hole') IS NOT NULL
  AND jsonb_typeof(tees->0->'pars_per_hole') = 'array'
  AND jsonb_array_length(tees->0->'pars_per_hole') = 18;

-- 5. Create api_call_log table for Part F monitoring
CREATE TABLE IF NOT EXISTS api_call_log (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp   TIMESTAMPTZ DEFAULT now() NOT NULL,
  endpoint    TEXT        NOT NULL,
  course_name TEXT,
  was_cache_hit BOOLEAN   NOT NULL,
  details     JSONB
);

-- Index for fast monitoring queries
CREATE INDEX IF NOT EXISTS api_call_log_timestamp ON api_call_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS api_call_log_cache_hit  ON api_call_log (was_cache_hit);

-- 6. Useful indexes for the new architecture (search is now Supabase-only)
CREATE INDEX IF NOT EXISTS courses_name_trgm
  ON courses USING gin (name gin_trgm_ops);

-- Fallback standard index if pg_trgm extension is not enabled
CREATE INDEX IF NOT EXISTS courses_name_lower
  ON courses ((lower(name)));

CREATE INDEX IF NOT EXISTS courses_country
  ON courses (country);

CREATE INDEX IF NOT EXISTS courses_has_hole_data
  ON courses (has_hole_data);

-- ============================================================
-- NOTE: After running this migration, call the fix-bad-data
-- action in the Netlify function to reset all records where
-- pars are all-4 (corrupted default data):
--
--   curl "https://<your-site>/.netlify/functions/courses?action=fix-bad-data&secret=<SYNC_SECRET>"
--
-- Or run it from the admin panel once the function is deployed.
-- ============================================================
