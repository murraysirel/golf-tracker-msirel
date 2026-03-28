-- Migration 005: Supabase Auth + Gist Retirement
-- Run Phase A+B immediately (additive, no user impact).
-- Run Phase C ONLY after auth is live, users warned, and group_members backed up.

BEGIN;

-- ── Phase A: Auth identity ────────────────────────────────────────────────────
-- Links each players row to a Supabase auth.users account.
-- ON DELETE SET NULL preserves round history if an auth account is deleted.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS players_auth_user_id_idx
  ON players (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- ── Phase B: Migrate Gist-only player data to Supabase ───────────────────────
-- practice_sessions, stats_analysis, stats_analysis_date were only stored in
-- the GitHub Gist blob. These columns receive the data via a one-off migration
-- script before the Gist is retired.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS practice_sessions   jsonb DEFAULT '[]'::jsonb;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS stats_analysis      jsonb DEFAULT NULL;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS stats_analysis_date text  DEFAULT NULL;

-- Ensure email lookup index exists for signup link-to-existing flow.
CREATE UNIQUE INDEX IF NOT EXISTS players_email_unique_idx
  ON players (lower(email))
  WHERE email IS NOT NULL AND email <> '';

COMMIT;

-- ── Phase C: Clean slate for group memberships ───────────────────────────────
-- RUN THIS SEPARATELY, AFTER:
--   1. Exporting group_members to CSV from the Supabase dashboard (keep backup 4+ weeks)
--   2. Deploying and testing the auth system end-to-end
--   3. Showing the in-app warning banner to all active users
--
-- After this runs, all players must re-join their groups post-login.
-- Groups themselves (name, code, settings, active_boards) are preserved.
-- All player and round data is preserved.
--
-- TRUNCATE group_members;
