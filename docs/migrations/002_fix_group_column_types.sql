-- Migration 002: Fix groups.admin_id and group_members.player_id from uuid → text
-- The app uses player names (e.g. "Murray Sirel") not UUIDs for these columns.
-- Run in the Supabase SQL editor.

-- 1. Drop RLS policies that reference the columns we need to alter
DROP POLICY IF EXISTS "members can read their groups"    ON groups;
DROP POLICY IF EXISTS "members can read group membership" ON group_members;

-- 2. Drop FK constraints
ALTER TABLE groups        DROP CONSTRAINT IF EXISTS groups_admin_id_fkey;
ALTER TABLE group_members DROP CONSTRAINT IF EXISTS group_members_player_id_fkey;

-- 3. Change column types to text
ALTER TABLE groups        ALTER COLUMN admin_id  TYPE text USING admin_id::text;
ALTER TABLE group_members ALTER COLUMN player_id TYPE text USING player_id::text;

-- 4. No RLS policies needed — the app uses the service role key which bypasses RLS entirely.
