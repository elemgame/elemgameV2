import type { GameMode, MatchStatus, MoveId, RoundEntry } from '@elmental/shared';
import type { Socket } from 'socket.io';

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

export interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  language_code?: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface SessionPayload {
  userId: number;
  telegramId: number;
  iat: number;
  exp: number;
}

// ---------------------------------------------------------------------------
// Database rows
// ---------------------------------------------------------------------------

export interface DbUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  public_key: string | null;
  encrypted_private_key: string | null;
  wallet_address: string | null;
  rating: number;
  wins: number;
  losses: number;
  created_at: Date;
}

export interface DbMatch {
  id: string;
  player1_id: number;
  player2_id: number;
  stake: number;
  mode: GameMode;
  status: MatchStatus;
  winner_id: number | null;
  replay_hash: string | null;
  created_at: Date;
  settled_at: Date | null;
}

export interface DbRound {
  id: number;
  match_id: string;
  round_number: number;
  p1_move: MoveId | null;
  p2_move: MoveId | null;
  p1_energy: number;
  p2_energy: number;
  result: string | null;
}

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

export interface QueueEntry {
  userId: number;
  rating: number;
  stake: number;
  mode: GameMode;
  socketId: string;
  joinedAt: number;
}

// ---------------------------------------------------------------------------
// Active match state (in-memory)
// ---------------------------------------------------------------------------

export interface CommitEntry {
  hash: string; // hex
  receivedAt: number;
}

export interface RevealEntry {
  move: MoveId;
  salt: string;
  receivedAt: number;
}

export interface ActiveMatch {
  matchId: string;
  player1Id: number;
  player2Id: number;
  p1SocketId: string;
  p2SocketId: string;
  stake: number;
  mode: GameMode;
  p1Score: number;
  p2Score: number;
  p1Energy: number;
  p2Energy: number;
  currentRound: number;
  p1Commit: CommitEntry | null;
  p2Commit: CommitEntry | null;
  p1Reveal: RevealEntry | null;
  p2Reveal: RevealEntry | null;
  rounds: RoundEntry[];
  commitTimer: ReturnType<typeof setTimeout> | null;
  revealTimer: ReturnType<typeof setTimeout> | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Socket.io typed events
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  'join-queue': (data: { stake: number; mode: GameMode }) => void;
  'leave-queue': () => void;
  'commit-move': (data: { matchId: string; hash: string }) => void;
  'reveal-move': (data: { matchId: string; move: MoveId; salt: string }) => void;
}

export interface ServerToClientEvents {
  'match-found': (data: {
    matchId: string;
    opponentId: number;
    opponentName: string;
    stake: number;
    mode: GameMode;
    isPlayer1: boolean;
  }) => void;
  'round-commit-received': (data: { matchId: string; round: number }) => void;
  'round-result': (data: {
    matchId: string;
    round: number;
    p1Move: MoveId;
    p2Move: MoveId;
    p1Energy: number;
    p2Energy: number;
    p1Score: number;
    p2Score: number;
    yourResult: string;
  }) => void;
  'match-result': (data: {
    matchId: string;
    winnerId: number | null;
    p1Score: number;
    p2Score: number;
    replayHash: string;
    rounds: RoundEntry[];
  }) => void;
  'round-timeout': (data: { matchId: string; round: number; reason: string }) => void;
  error: (data: { message: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: number;
  telegramId: number;
  username?: string;
  firstName: string;
}

export type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
