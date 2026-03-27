-- Migration 003: Add settings JSONB column to groups table
-- Stores group-level metadata previously embedded in the shared Gist:
-- customCourses, teeCoords, greenCoords, seasons, deletionLog,
-- courseCorrections, requireGroupCode
-- Run in the Supabase SQL editor.

ALTER TABLE groups ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
