import type { GameMode, MoveId } from '@elmental/shared';

export interface PlayerProfileInput {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  source?: 'telegram' | 'web';
  initData?: string;
}

export type ProviderEnergyLevel = 'low' | 'medium' | 'high';
export type ProviderRoundPhase = 'select' | 'commit' | 'reveal' | 'result';

export interface MatchmakingRequest {
  name: string;
  accountId: string;
  stake: number;
  mode: GameMode;
  room: string;
  boostEnabled: boolean;
  botFallbackSeconds: number;
}

export interface MatchFoundEvent {
  type: 'matchFound';
  matchId: string;
  balanceKind: string;
  opponentName: string;
  opponentRating: number;
  isPlayer1: boolean;
  stake: number;
  boostStake: number;
  currentRound: number;
  myEnergy: number;
  opponentEnergy: number;
  myScore: number;
  opponentScore: number;
}

export interface MatchUpdateEvent {
  type: 'matchUpdate';
  matchId: string;
  balanceKind: string;
  phase: ProviderRoundPhase;
  status: 'active' | 'settled';
  currentRound: number;
  selectedMove: MoveId | null;
  myEnergy: number;
  opponentEnergy: number;
  myScore: number;
  opponentScore: number;
}

export interface RoundResultEvent {
  type: 'roundResult';
  matchId: string;
  balanceKind: string;
  round: number;
  myMove: MoveId;
  opponentMove: MoveId;
  result: 'win' | 'lose' | 'draw';
  myEnergyBefore: number;
  myEnergyAfter: number;
  opponentEnergy: number;
  myScore: number;
  opponentScore: number;
  wasOverclocked: boolean;
}

export interface MatchSettledEvent {
  type: 'matchSettled';
  matchId: string;
  balanceKind: string;
  winner: 'me' | 'opponent' | 'draw';
  myScore: number;
  opponentScore: number;
  stake: number;
  myRating: number;
  opponentRating: number;
}

export type GameplayProviderEvent =
  | { type: 'trace'; event: string; data: Record<string, unknown> }
  | { type: 'error'; code: string; message: string; source: string; metadata?: Record<string, unknown> }
  | { type: 'playerStats'; name: string; elmBalance: number; balanceKind: string; rating: number; wins: number; losses: number }
  | { type: 'queueActive'; name: string; room: string; mode: string; stake: number; balanceKind: string }
  | { type: 'queueRemoved'; name: string; room: string; mode: string; stake: number; balanceKind: string }
  | MatchFoundEvent
  | MatchUpdateEvent
  | RoundResultEvent
  | MatchSettledEvent;

export interface GameplayProviderContext {
  emit: (event: GameplayProviderEvent) => void;
}

export interface GameplayProvider {
  initialize(user: PlayerProfileInput): Promise<void>;
  updateProfile(user: PlayerProfileInput): Promise<void>;
  startMatchmaking(request: MatchmakingRequest): Promise<void>;
  cancelMatchmaking(): void | Promise<void>;
  submitMove(moveId: MoveId): Promise<void>;
  advanceRound(): void | Promise<void>;
  forfeitMatch(): void | Promise<void>;
  applyResults(action: 'home' | 'playAgain'): void | Promise<void>;
  dispose(): void;
}
