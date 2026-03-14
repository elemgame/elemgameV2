import crypto from 'crypto';
import type { RoundEntry } from '@elmental/shared';

// ---------------------------------------------------------------------------
// Replay log building
// ---------------------------------------------------------------------------

export interface ReplayLog {
  matchId: string;
  player1Id: number;
  player2Id: number;
  rounds: RoundEntry[];
  winnerId: number | null;
  timestamp: number;
}

export function buildReplayLog(
  matchId: string,
  player1Id: number,
  player2Id: number,
  rounds: RoundEntry[],
  winnerId: number | null,
): ReplayLog {
  return {
    matchId,
    player1Id,
    player2Id,
    rounds,
    winnerId,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Replay hash generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic hash of the replay data.
 *
 * TODO: Replace with proper keccak256(abi.encode(allRounds)) using @eversdk
 * once blockchain integration is in place.
 *
 * For now, we use SHA-256 over the canonical JSON of the replay.
 */
export function generateReplayHash(log: ReplayLog): string {
  // Canonical serialization: sort keys, no extra whitespace
  const canonical = JSON.stringify(log, Object.keys(log).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Encode a single round entry into a deterministic byte sequence.
 * Used for per-round commit verification.
 */
export function encodeRoundForHash(entry: RoundEntry): string {
  return [
    entry.round,
    entry.p1Move,
    entry.p2Move,
    entry.p1Energy,
    entry.p2Energy,
    entry.p1Result,
    entry.p2Result,
    entry.overclockSeed ?? '',
  ].join(':');
}

/**
 * Verify a player's commit hash matches the revealed move + salt.
 * commit = SHA-256(moveId + ":" + salt)
 */
export function verifyCommit(
  commitHash: string,
  move: number,
  salt: string,
): boolean {
  const expected = crypto
    .createHash('sha256')
    .update(`${move}:${salt}`)
    .digest('hex');
  return expected === commitHash;
}
