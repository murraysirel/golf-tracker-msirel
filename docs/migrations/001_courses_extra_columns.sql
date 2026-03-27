-- Migration 001: Add missing columns to the courses table.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to re-run (all use ADD COLUMN IF NOT EXISTS).
--
-- After running this, the course search will cache and display club names,
-- city, hole counts, and GPS availability without needing to hit GolfAPI again.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS club_name  text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS city       text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS holes      integer DEFAULT 18;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS has_gps    boolean DEFAULT false;

-- Optional: add a text-search index on club_name once the column exists
-- CREATE INDEX IF NOT EXISTS courses_club_name_idx ON courses USING gin(to_tsvector('english', coalesce(club_name, '')));
