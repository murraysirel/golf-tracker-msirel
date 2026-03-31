-- Migration: 002 | Table: rounds | Date: 31 March 2026
-- Documents the current state of the rounds table.

CREATE TABLE IF NOT EXISTS rounds (
  id              bigint PRIMARY KEY,        -- Date.now() + random offset
  player_name     text NOT NULL,             -- matches players.name (not a FK — text match)
  group_code      text NOT NULL,             -- group this round belongs to
  date            text,                      -- DD/MM/YYYY format
  course          text,
  loc             text,
  tee             text,                      -- 'blue'|'yellow'|'white'|'red'|'black'
  scores          integer[],                 -- 18 hole scores
  pars            integer[],                 -- 18 hole pars
  putts           integer[],                 -- 18 hole putts
  fir             text[],                    -- 18 values: 'Yes'|'No'|'N/A'
  gir             text[],                    -- 18 values: 'Yes'|'No'
  notes           text,
  total_score     integer,
  total_par       integer,
  diff            integer,                   -- total_score - total_par
  birdies         integer,
  pars_count      integer,
  bogeys          integer,
  doubles         integer,
  eagles          integer,
  penalties       integer,
  bunkers         integer,
  chips           integer,
  rating          numeric,                   -- course rating for tee played
  slope           integer,                   -- slope rating for tee played
  ai_review       jsonb,                     -- { positive, negative, drill }
  match_result    jsonb,                     -- match play outcome
  wolf_result     jsonb,                     -- Wolf game result
  sixes_result    jsonb,                     -- Sixes game result
  played_with     text[],                    -- names of playing partners
  match_handicaps jsonb,                     -- handicaps used in match context
  handicaps_used  boolean,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rounds_player_name ON rounds(player_name);
CREATE INDEX IF NOT EXISTS idx_rounds_group_code ON rounds(group_code);
CREATE INDEX IF NOT EXISTS idx_rounds_date ON rounds(date);
