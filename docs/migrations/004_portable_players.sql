-- Migration 004: Make player data portable across groups.
-- Run this in the Supabase SQL Editor BEFORE deploying the updated supabase.js function.
--
-- What this does:
--   Phase A — Consolidate duplicate player rows into one canonical row per name.
--             (A player in two groups currently has two rows; we keep the best one.)
--   Phase B — Change the unique constraint from (name, group_code) → (name).
--             group_code is kept as a nullable audit column but is no longer used for
--             data scoping — group membership is expressed via group_members instead.
--   Phase C — Ensure the rounds(player_name) index exists for the new read path.

BEGIN;

-- ── PHASE A: Canonicalise players ────────────────────────────────────────────
-- For each name, keep the row that has:
--   1. A non-empty email  (prefer the row with identity data)
--   2. The highest handicap among ties
--   3. The earliest created_at as a final tiebreaker
-- All other rows for the same name are deleted.
-- Safe because rounds.player_name and group_members.player_id are TEXT name
-- strings — they are not foreign-keyed to players.id, so deleting duplicate
-- player rows does not orphan any rounds or membership records.

CREATE TEMP TABLE _canonical_players AS
SELECT DISTINCT ON (name)
    id, name, email, group_code, handicap, match_code, created_at
FROM players
ORDER BY
    name,
    (email IS NOT NULL AND email <> '') DESC,  -- prefer row with email
    handicap DESC,                              -- then highest handicap
    created_at ASC;                             -- then oldest row

DELETE FROM players
WHERE id NOT IN (SELECT id FROM _canonical_players);

DROP TABLE _canonical_players;

-- ── PHASE B: Change unique constraint and nullability ─────────────────────────

-- Drop old composite constraint.
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_name_group_code_key;

-- Add new single-column constraint.
ALTER TABLE players ADD CONSTRAINT players_name_key UNIQUE (name);

-- Make group_code nullable — it is now audit metadata only.
ALTER TABLE players ALTER COLUMN group_code DROP NOT NULL;
ALTER TABLE players ALTER COLUMN group_code SET DEFAULT NULL;

-- Normalise empty strings to NULL.
UPDATE players SET group_code = NULL WHERE group_code = '';

-- ── PHASE C: Index ────────────────────────────────────────────────────────────
-- The new read path queries rounds WHERE player_name IN (...) rather than
-- WHERE group_code = '...'. Ensure the player_name index exists.
CREATE INDEX IF NOT EXISTS rounds_player_name_idx ON rounds (player_name);

COMMIT;
