import pg from 'pg';
import type { DbUser, DbMatch, DbRound } from '../types.js';
import type { GameMode, MatchStatus, MoveId } from '@elmental/shared';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Pool singleton
// ---------------------------------------------------------------------------

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initDb() first.');
  }
  return pool;
}

export async function initDb(connectionString: string): Promise<void> {
  pool = new Pool({ connectionString });

  pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err);
  });

  // Verify connection
  const client = await pool.connect();
  client.release();
  console.log('[db] Connected to PostgreSQL');
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ---------------------------------------------------------------------------
// User queries
// ---------------------------------------------------------------------------

export async function upsertUser(
  telegramId: number,
  username: string | null,
  firstName: string,
): Promise<DbUser> {
  const db = getPool();
  const result = await db.query<DbUser>(
    `INSERT INTO users (telegram_id, username, first_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE
       SET username   = EXCLUDED.username,
           first_name = EXCLUDED.first_name
     RETURNING *`,
    [telegramId, username, firstName],
  );
  const row = result.rows[0];
  if (!row) throw new Error('upsertUser returned no row');
  return row;
}

export async function getUserByTelegramId(
  telegramId: number,
): Promise<DbUser | null> {
  const db = getPool();
  const result = await db.query<DbUser>(
    'SELECT * FROM users WHERE telegram_id = $1',
    [telegramId],
  );
  return result.rows[0] ?? null;
}

export async function getUserById(id: number): Promise<DbUser | null> {
  const db = getPool();
  const result = await db.query<DbUser>(
    'SELECT * FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateUserRating(
  userId: number,
  newRating: number,
  won: boolean,
): Promise<void> {
  const db = getPool();
  const col = won ? 'wins' : 'losses';
  await db.query(
    `UPDATE users SET rating = $1, ${col} = ${col} + 1 WHERE id = $2`,
    [newRating, userId],
  );
}

export async function updateUserWallet(
  userId: number,
  publicKey: string,
  encryptedPrivateKey: string,
  walletAddress: string,
): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE users
     SET public_key = $1, encrypted_private_key = $2, wallet_address = $3
     WHERE id = $4`,
    [publicKey, encryptedPrivateKey, walletAddress, userId],
  );
}

// ---------------------------------------------------------------------------
// Match queries
// ---------------------------------------------------------------------------

export async function createMatch(
  player1Id: number,
  player2Id: number,
  stake: number,
  mode: GameMode,
): Promise<DbMatch> {
  const db = getPool();
  const result = await db.query<DbMatch>(
    `INSERT INTO matches (player1_id, player2_id, stake, mode)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [player1Id, player2Id, stake, mode],
  );
  const row = result.rows[0];
  if (!row) throw new Error('createMatch returned no row');
  return row;
}

export async function getMatchById(matchId: string): Promise<DbMatch | null> {
  const db = getPool();
  const result = await db.query<DbMatch>(
    'SELECT * FROM matches WHERE id = $1',
    [matchId],
  );
  return result.rows[0] ?? null;
}

export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus,
  winnerId?: number | null,
  replayHash?: string,
): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE matches
     SET status     = $1,
         winner_id  = $2,
         replay_hash = $3,
         settled_at = CASE WHEN $1 = 'settled' THEN NOW() ELSE settled_at END
     WHERE id = $4`,
    [status, winnerId ?? null, replayHash ?? null, matchId],
  );
}

export async function getMatchHistory(
  userId: number,
  limit = 20,
): Promise<DbMatch[]> {
  const db = getPool();
  const result = await db.query<DbMatch>(
    `SELECT * FROM matches
     WHERE (player1_id = $1 OR player2_id = $1)
       AND status = 'settled'
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Round queries
// ---------------------------------------------------------------------------

export async function insertRound(
  matchId: string,
  roundNumber: number,
  p1Move: MoveId | null,
  p2Move: MoveId | null,
  p1Energy: number,
  p2Energy: number,
  result: string | null,
): Promise<DbRound> {
  const db = getPool();
  const res = await db.query<DbRound>(
    `INSERT INTO rounds (match_id, round_number, p1_move, p2_move, p1_energy, p2_energy, result)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [matchId, roundNumber, p1Move, p2Move, p1Energy, p2Energy, result],
  );
  const row = res.rows[0];
  if (!row) throw new Error('insertRound returned no row');
  return row;
}

export async function getRoundsForMatch(matchId: string): Promise<DbRound[]> {
  const db = getPool();
  const result = await db.query<DbRound>(
    'SELECT * FROM rounds WHERE match_id = $1 ORDER BY round_number ASC',
    [matchId],
  );
  return result.rows;
}
