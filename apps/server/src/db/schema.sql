-- Elmental game server schema
-- Run with: psql $DATABASE_URL -f src/db/schema.sql

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                   SERIAL PRIMARY KEY,
  telegram_id          BIGINT  NOT NULL UNIQUE,
  username             VARCHAR(64),
  first_name           VARCHAR(128) NOT NULL,
  public_key           VARCHAR(128),
  encrypted_private_key TEXT,
  wallet_address       VARCHAR(128),
  rating               INTEGER NOT NULL DEFAULT 1200,
  wins                 INTEGER NOT NULL DEFAULT 0,
  losses               INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id   INTEGER NOT NULL REFERENCES users(id),
  player2_id   INTEGER NOT NULL REFERENCES users(id),
  stake        BIGINT  NOT NULL DEFAULT 0,  -- in nano-tokens
  mode         VARCHAR(16) NOT NULL DEFAULT 'classic',
  status       VARCHAR(16) NOT NULL DEFAULT 'created',
  winner_id    INTEGER REFERENCES users(id),
  replay_hash  VARCHAR(128),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_matches_player1  ON matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2  ON matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_status   ON matches(status);

-- ---------------------------------------------------------------------------
-- rounds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rounds (
  id           SERIAL PRIMARY KEY,
  match_id     UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  p1_move      SMALLINT,   -- MoveId enum value (0-5), NULL until revealed
  p2_move      SMALLINT,
  p1_energy    INTEGER NOT NULL DEFAULT 100,
  p2_energy    INTEGER NOT NULL DEFAULT 100,
  result       VARCHAR(8),  -- 'win'|'lose'|'draw' from p1 perspective
  UNIQUE (match_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_rounds_match_id ON rounds(match_id);
