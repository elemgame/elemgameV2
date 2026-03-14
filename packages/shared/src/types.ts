// Move enum: 0-5
export enum MoveId {
  Earth = 0,
  Fire = 1,
  Water = 2,
  EarthPlus = 3,
  FirePlus = 4,
  WaterPlus = 5,
}

export enum RoundResult {
  Win = 'win',
  Lose = 'lose',
  Draw = 'draw',
}

export enum EnergyLevel {
  Low = 'low',       // 0-33
  Medium = 'medium',  // 34-66
  High = 'high',     // 67+
}

export enum MatchStatus {
  Created = 'created',
  Active = 'active',
  Settled = 'settled',
  Disputed = 'disputed',
  Expired = 'expired',
}

export enum GameMode {
  Classic = 'classic',
  Hardcore = 'hardcore',
  Chaos = 'chaos',
}

export interface Move {
  id: MoveId;
  cost: number;
  name: string;
  isEnhanced: boolean;
}

export interface EnergyState {
  energy: number;
  isOverclocked: boolean;
  boostActive: boolean;
}

export interface RoundEntry {
  round: number;
  p1Move: MoveId;
  p2Move: MoveId;
  p1Energy: number;
  p2Energy: number;
  p1Result: RoundResult;
  p2Result: RoundResult;
  overclockSeed?: string; // hex string if overclock happened
}

export interface MatchState {
  id: string;
  player1: string;
  player2: string;
  stake: number;
  mode: GameMode;
  p1Energy: EnergyState;
  p2Energy: EnergyState;
  p1Score: number;
  p2Score: number;
  rounds: RoundEntry[];
  currentRound: number;
  status: MatchStatus;
}
