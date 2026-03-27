-- Migration 004: Identity foundation — email + DOB, email uniqueness, portable players.
-- Run in the Supabase SQL Editor BEFORE deploying the updated supabase.js function.
--
-- What this does:
--   Phase A — Add dob column to players.
--   Phase B — Consolidate duplicate player rows by email (players in multiple groups
--             currently have one row per group; keep the best row per email).
--   Phase C — Add a partial unique index on email so duplicate emails are rejected
--             at DB level while NULL emails (pre-existing players) are still allowed.
--   Phase D — Change the (name, group_code) unique constraint to (name) only;
--             make group_code nullable (audit metadata, no longer used for scoping).
--   Phase E — Ensure the rounds(player_name) index exists for the membership-based
--             read path introduced in the previous migration.

BEGIN;

-- ── PHASE A: Add date-of-birth column ────────────────────────────────────────
ALTER TABLE players ADD COLUMN IF NOT EXISTS dob text;   -- stored as 'DD/MM/YYYY'

-- ── PHASE B: Consolidate duplicate rows by email ─────────────────────────────
-- For each email address, keep one canonical row:
--   1. Prefer a row where name is populated
--   2. Then highest handicap
--   3. Then oldest created_at (original record)
-- Players with no email are left untouched — they will be prompted to add
-- email on next sign-in. Safe because rounds.player_name and
-- group_members.player_id are TEXT name strings, not FKs to players.id.
CREATE TEMP TABLE _canonical_by_email AS
SELECT DISTINCT ON (email)
    id, name, email, group_code, handicap, match_code, dob, created_at
FROM players
WHERE email IS NOT NULL AND email <> ''
ORDER BY
    email,
    (name IS NOT NULL AND name <> '') DESC,
    handicap DESC,
    created_at ASC;

DELETE FROM players
WHERE email IS NOT NULL AND email <> ''
  AND id NOT IN (SELECT id FROM _canonical_by_email);

DROP TABLE _canonical_by_email;

-- ── PHASE C: Partial unique index on email ────────────────────────────────────
-- NULL / empty emails are not covered (multiple legacy rows may have no email).
-- Non-null, non-empty emails must be unique across the table.
CREATE UNIQUE INDEX IF NOT EXISTS players_email_unique_idx
  ON players (lower(email))
  WHERE email IS NOT NULL AND email <> '';

-- ── PHASE D: Change unique constraint from (name, group_code) → (name) ────────
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_name_group_code_key;
ALTER TABLE players ADD CONSTRAINT players_name_key UNIQUE (name);

-- Make group_code nullable — kept as historical audit metadata only.
ALTER TABLE players ALTER COLUMN group_code DROP NOT NULL;
ALTER TABLE players ALTER COLUMN group_code SET DEFAULT NULL;
UPDATE players SET group_code = NULL WHERE group_code = '';

-- ── PHASE E: Ensure index on rounds(player_name) exists ──────────────────────
CREATE INDEX IF NOT EXISTS rounds_player_name_idx ON rounds (player_name);

COMMIT;
