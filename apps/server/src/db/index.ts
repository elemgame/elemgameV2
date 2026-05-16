import crypto from 'crypto';
import pg from 'pg';
import type { DbUser, DbMatch, DbRound } from '../types.js';
import { MatchStatus } from '@elmental/shared';
import type { GameMode, MoveId } from '@elmental/shared';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Pool singleton
// ---------------------------------------------------------------------------

let pool: pg.Pool | null = null;
let memoryMode = false;

const memory = {
  nextUserId: 1,
  nextRoundId: 1,
  users: new Map<number, DbUser>(),
  usersByTelegramId: new Map<number, number>(),
  matches: new Map<string, DbMatch>(),
  rounds: new Map<string, DbRound[]>(),
};

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initDb() first.');
  }
  return pool;
}

export async function initDb(connectionString: string): Promise<void> {
  memoryMode = false;
  pool = new Pool({ connectionString });

  pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err);
  });

  // Verify connection
  const client = await pool.connect();
  client.release();
  console.log('[db] Connected to PostgreSQL');
}

export function initMemoryDb(): void {
  if (pool) {
    void pool.end().catch((err: unknown) => {
      console.error('[db] Failed to close PostgreSQL pool:', err);
    });
    pool = null;
  }
  memoryMode = true;
  console.log('[db] Using in-memory database');
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  memoryMode = false;
}

// ---------------------------------------------------------------------------
// User queries
// ---------------------------------------------------------------------------

export async function upsertUser(
  telegramId: number,
  username: string | null,
  firstName: string,
): Promise<DbUser> {
  if (memoryMode) {
    const existingId = memory.usersByTelegramId.get(telegramId);
    if (existingId !== undefined) {
      const existing = memory.users.get(existingId);
      if (!existing) throw new Error('In-memory user index is corrupted');
      const updated: DbUser = {
        ...existing,
        username,
        first_name: firstName,
      };
      memory.users.set(existingId, updated);
      return updated;
    }

    const user: DbUser = {
      id: memory.nextUserId++,
      telegram_id: telegramId,
      username,
      first_name: firstName,
      public_key: null,
      encrypted_private_key: null,
      wallet_address: null,
      rating: 1200,
      wins: 0,
      losses: 0,
      created_at: new Date(),
    };
    memory.users.set(user.id, user);
    memory.usersByTelegramId.set(telegramId, user.id);
    return user;
  }

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
  if (memoryMode) {
    const id = memory.usersByTelegramId.get(telegramId);
    return id !== undefined ? memory.users.get(id) ?? null : null;
  }

  const db = getPool();
  const result = await db.query<DbUser>(
    'SELECT * FROM users WHERE telegram_id = $1',
    [telegramId],
  );
  return result.rows[0] ?? null;
}

export async function getUserById(id: number): Promise<DbUser | null> {
  if (memoryMode) {
    return memory.users.get(id) ?? null;
  }

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
  if (memoryMode) {
    const user = memory.users.get(userId);
    if (!user) return;
    memory.users.set(userId, {
      ...user,
      rating: newRating,
      wins: user.wins + (won ? 1 : 0),
      losses: user.losses + (won ? 0 : 1),
    });
    return;
  }

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
  if (memoryMode) {
    const user = memory.users.get(userId);
    if (!user) return;
    memory.users.set(userId, {
      ...user,
      public_key: publicKey,
      encrypted_private_key: encryptedPrivateKey,
      wallet_address: walletAddress,
    });
    return;
  }

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
  if (memoryMode) {
    const match: DbMatch = {
      id: crypto.randomUUID(),
      player1_id: player1Id,
      player2_id: player2Id,
      stake,
      mode,
      status: MatchStatus.Created,
      winner_id: null,
      replay_hash: null,
      created_at: new Date(),
      settled_at: null,
    };
    memory.matches.set(match.id, match);
    memory.rounds.set(match.id, []);
    return match;
  }

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
  if (memoryMode) {
    return memory.matches.get(matchId) ?? null;
  }

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
  if (memoryMode) {
    const match = memory.matches.get(matchId);
    if (!match) return;
    memory.matches.set(matchId, {
      ...match,
      status,
      winner_id: winnerId ?? null,
      replay_hash: replayHash ?? null,
      settled_at: status === MatchStatus.Settled ? new Date() : match.settled_at,
    });
    return;
  }

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
  if (memoryMode) {
    return Array.from(memory.matches.values())
      .filter((match) => (
        (match.player1_id === userId || match.player2_id === userId) &&
        match.status === MatchStatus.Settled
      ))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit);
  }

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
  if (memoryMode) {
    const round: DbRound = {
      id: memory.nextRoundId++,
      match_id: matchId,
      round_number: roundNumber,
      p1_move: p1Move,
      p2_move: p2Move,
      p1_energy: p1Energy,
      p2_energy: p2Energy,
      result,
    };
    const rounds = memory.rounds.get(matchId) ?? [];
    rounds.push(round);
    memory.rounds.set(matchId, rounds);
    return round;
  }

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
  if (memoryMode) {
    return [...(memory.rounds.get(matchId) ?? [])].sort(
      (a, b) => a.round_number - b.round_number,
    );
  }

  const db = getPool();
  const result = await db.query<DbRound>(
    'SELECT * FROM rounds WHERE match_id = $1 ORDER BY round_number ASC',
    [matchId],
  );
  return result.rows;
}
