-- Migration 006: Add avatar_url column to players table
-- Stores profile pictures as base64 JPEG data URLs (64×64px, ~4 KB each)
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url text;
