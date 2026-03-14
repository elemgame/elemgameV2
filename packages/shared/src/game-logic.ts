import type { EnergyState, Move } from './types.js';
import { EnergyLevel, GameMode, MoveId, RoundResult } from './types.js';
import {
  BASIC_MOVE_COST,
  ELO_K_FACTOR,
  ENERGY_LOW_THRESHOLD,
  ENERGY_MED_THRESHOLD,
  ENHANCED_MOVE_COST,
  OVERCLOCK_RANDOM_CHANCE,
  RAKE_PERCENT,
  REGEN_ON_DRAW,
  REGEN_ON_LOSE,
  REGEN_ON_WIN,
} from './constants.js';

// ---------------------------------------------------------------------------
// getMoveInfo
// ---------------------------------------------------------------------------

const MOVE_INFO: Readonly<Record<MoveId, Move>> = {
  [MoveId.Earth]: { id: MoveId.Earth, cost: BASIC_MOVE_COST, name: 'Earth', isEnhanced: false },
  [MoveId.Fire]: { id: MoveId.Fire, cost: BASIC_MOVE_COST, name: 'Fire', isEnhanced: false },
  [MoveId.Water]: { id: MoveId.Water, cost: BASIC_MOVE_COST, name: 'Water', isEnhanced: false },
  [MoveId.EarthPlus]: { id: MoveId.EarthPlus, cost: ENHANCED_MOVE_COST, name: 'Earth+', isEnhanced: true },
  [MoveId.FirePlus]: { id: MoveId.FirePlus, cost: ENHANCED_MOVE_COST, name: 'Fire+', isEnhanced: true },
  [MoveId.WaterPlus]: { id: MoveId.WaterPlus, cost: ENHANCED_MOVE_COST, name: 'Water+', isEnhanced: true },
};

export function getMoveInfo(moveId: MoveId): Move {
  const move = MOVE_INFO[moveId];
  if (move === undefined) {
    throw new Error(`Unknown moveId: ${moveId}`);
  }
  return move;
}

// ---------------------------------------------------------------------------
// resolveRound — 6×6 outcome matrix (rows = attacker, cols = defender)
//
// | ATK\DEF | Earth | Fire  | Water | Earth+| Fire+ | Water+|
// |---------|-------|-------|-------|-------|-------|-------|
// | Earth   | Draw  | WIN   | LOSE  | LOSE  | LOSE  | WIN   |
// | Fire    | LOSE  | Draw  | WIN   | WIN   | LOSE  | LOSE  |
// | Water   | WIN   | LOSE  | Draw  | LOSE  | WIN   | LOSE  |
// | Earth+  | WIN   | LOSE  | WIN   | Draw  | WIN   | LOSE  |
// | Fire+   | WIN   | WIN   | LOSE  | LOSE  | Draw  | WIN   |
// | Water+  | LOSE  | LOSE  | WIN   | WIN   | LOSE  | Draw  |
// ---------------------------------------------------------------------------

// Encode as p1 perspective: W = win, L = lose, D = draw
// Indexed by [p1Move][p2Move]
type Outcome = 'W' | 'L' | 'D';

const OUTCOME_MATRIX: Readonly<Outcome[][]> = [
  // vs: Earth  Fire   Water  Earth+ Fire+  Water+
  ['D', 'W', 'L', 'L', 'L', 'W'], // Earth
  ['L', 'D', 'W', 'W', 'L', 'L'], // Fire
  ['W', 'L', 'D', 'L', 'W', 'L'], // Water
  ['W', 'L', 'W', 'D', 'W', 'L'], // Earth+
  ['W', 'W', 'L', 'L', 'D', 'W'], // Fire+
  ['L', 'L', 'W', 'W', 'L', 'D'], // Water+
];

export function resolveRound(
  p1Move: MoveId,
  p2Move: MoveId,
): { p1Result: RoundResult; p2Result: RoundResult } {
  const row = OUTCOME_MATRIX[p1Move];
  if (row === undefined) throw new Error(`Invalid p1Move: ${p1Move}`);
  const outcome = row[p2Move];
  if (outcome === undefined) throw new Error(`Invalid p2Move: ${p2Move}`);

  if (outcome === 'D') {
    return { p1Result: RoundResult.Draw, p2Result: RoundResult.Draw };
  }
  if (outcome === 'W') {
    return { p1Result: RoundResult.Win, p2Result: RoundResult.Lose };
  }
  return { p1Result: RoundResult.Lose, p2Result: RoundResult.Win };
}

// ---------------------------------------------------------------------------
// getRegenAmount
// ---------------------------------------------------------------------------

/**
 * Returns the energy regen amount for the given result/mode.
 * For Chaos mode the caller must provide a `chaosRoll` (0-20 inclusive).
 * For other modes `chaosRoll` is ignored.
 */
export function getRegenAmount(
  result: RoundResult,
  mode: GameMode,
  chaosRoll?: number,
): number {
  switch (mode) {
    case GameMode.Hardcore:
      return 0;

    case GameMode.Chaos:
      // Caller provides a roll in [0, 20]; default to 10 if omitted.
      return chaosRoll !== undefined ? chaosRoll : 10;

    case GameMode.Classic:
    default:
      switch (result) {
        case RoundResult.Win:
          return REGEN_ON_WIN;
        case RoundResult.Lose:
          return REGEN_ON_LOSE;
        case RoundResult.Draw:
          return REGEN_ON_DRAW;
      }
  }
}

// ---------------------------------------------------------------------------
// calculateEnergy
// ---------------------------------------------------------------------------

export function calculateEnergy(
  state: EnergyState,
  move: Move,
  roundResult: RoundResult,
  mode: GameMode,
  chaosRoll?: number,
): EnergyState {
  // Deduct move cost (can go negative / to zero)
  const afterCost = state.energy - move.cost;

  // Apply regen
  const regen = getRegenAmount(roundResult, mode, chaosRoll);
  const afterRegen = afterCost + regen;

  // Cap at 100; allow negative (energy debt)
  const finalEnergy = Math.min(100, afterRegen);

  return {
    energy: finalEnergy,
    isOverclocked: state.isOverclocked,
    boostActive: state.boostActive,
  };
}

// ---------------------------------------------------------------------------
// resolveOverclock
// ---------------------------------------------------------------------------

export function resolveOverclock(
  moveId: MoveId,
  seed: Uint8Array,
): { finalMoveId: MoveId; wasRandomized: boolean } {
  const byte0 = seed[0] ?? 0;
  const byte1 = seed[1] ?? 0;

  const isRandomized = byte0 % 100 < OVERCLOCK_RANDOM_CHANCE;
  if (!isRandomized) {
    return { finalMoveId: moveId, wasRandomized: false };
  }

  const randomMoveId = (byte1 % 6) as MoveId;
  return { finalMoveId: randomMoveId, wasRandomized: true };
}

// ---------------------------------------------------------------------------
// getEnergyLevel
// ---------------------------------------------------------------------------

export function getEnergyLevel(energy: number): EnergyLevel {
  if (energy <= ENERGY_LOW_THRESHOLD) return EnergyLevel.Low;
  if (energy <= ENERGY_MED_THRESHOLD) return EnergyLevel.Medium;
  return EnergyLevel.High;
}

// ---------------------------------------------------------------------------
// calculateElo
// ---------------------------------------------------------------------------

export function calculateElo(
  winnerRating: number,
  loserRating: number,
): { newWinner: number; newLoser: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinner = Math.round(winnerRating + ELO_K_FACTOR * (1 - expectedWinner));
  const newLoser = Math.round(loserRating + ELO_K_FACTOR * (0 - expectedLoser));

  return { newWinner, newLoser };
}

// ---------------------------------------------------------------------------
// calculatePayout
// ---------------------------------------------------------------------------

export function calculatePayout(
  stake: number,
  rakePercent: number = RAKE_PERCENT,
): { winnerPayout: number; rake: number } {
  const pool = stake * 2;
  const rake = Math.floor((pool * rakePercent) / 100);
  const winnerPayout = pool - rake;
  return { winnerPayout, rake };
}
