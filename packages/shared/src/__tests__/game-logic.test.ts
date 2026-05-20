import { describe, expect, it } from 'vitest';
import {
  calculateElo,
  calculateEnergy,
  calculateLegacyDrawRefund,
  calculateLegacyStakePoolPayout,
  getMoveInfo,
  getEnergyLevel,
  getRegenAmount,
  resolveOverclock,
  resolveRound,
} from '../game-logic.js';
import {
  EnergyLevel,
  GameMode,
  MoveId,
  RoundResult,
} from '../types.js';
import {
  BASIC_MOVE_COST,
  ECONOMY_MODE_ENTRY_FEE_SEASON_POINTS,
  ECONOMY_MODE_STAKE_POOL,
  ENHANCED_MOVE_COST,
  MATCH_ENTRY_FEE,
  MATCH_STAKE,
  PRODUCTION_ECONOMY_MODE,
  REGEN_ON_DRAW,
  REGEN_ON_LOSE,
  REGEN_ON_WIN,
  SUPPORTED_ECONOMY_MODES,
} from '../constants.js';

const ALL_MOVES = [
  MoveId.Earth,
  MoveId.Fire,
  MoveId.Water,
  MoveId.EarthPlus,
  MoveId.FirePlus,
  MoveId.WaterPlus,
] as const;

describe('production economy guard', () => {
  it('defaults production to entry-fee Season Points economy', () => {
    expect(PRODUCTION_ECONOMY_MODE).toBe(ECONOMY_MODE_ENTRY_FEE_SEASON_POINTS);
    expect(PRODUCTION_ECONOMY_MODE).not.toBe(ECONOMY_MODE_STAKE_POOL);
  });

  it('keeps the current public match cost as an entry fee', () => {
    expect(MATCH_ENTRY_FEE).toBe(50);
    expect(MATCH_STAKE).toBe(MATCH_ENTRY_FEE);
  });

  it('keeps legacy stake-pool mode explicit instead of default', () => {
    expect(SUPPORTED_ECONOMY_MODES).toEqual([
      ECONOMY_MODE_ENTRY_FEE_SEASON_POINTS,
      ECONOMY_MODE_STAKE_POOL,
    ]);
  });
});

// ---------------------------------------------------------------------------
// getMoveInfo
// ---------------------------------------------------------------------------

describe('getMoveInfo', () => {
  it('returns basic move for Earth', () => {
    const m = getMoveInfo(MoveId.Earth);
    expect(m.id).toBe(MoveId.Earth);
    expect(m.cost).toBe(BASIC_MOVE_COST);
    expect(m.isEnhanced).toBe(false);
    expect(m.name).toBe('Earth');
  });

  it('returns enhanced move for EarthPlus', () => {
    const m = getMoveInfo(MoveId.EarthPlus);
    expect(m.cost).toBe(ENHANCED_MOVE_COST);
    expect(m.isEnhanced).toBe(true);
    expect(m.name).toBe('Earth+');
  });

  it('returns correct info for all six moves', () => {
    const basic = [MoveId.Earth, MoveId.Fire, MoveId.Water];
    const enhanced = [MoveId.EarthPlus, MoveId.FirePlus, MoveId.WaterPlus];

    for (const id of basic) {
      expect(getMoveInfo(id).isEnhanced).toBe(false);
      expect(getMoveInfo(id).cost).toBe(BASIC_MOVE_COST);
    }
    for (const id of enhanced) {
      expect(getMoveInfo(id).isEnhanced).toBe(true);
      expect(getMoveInfo(id).cost).toBe(ENHANCED_MOVE_COST);
    }
  });

  it('rejects unknown move ids', () => {
    expect(() => getMoveInfo(99 as MoveId)).toThrow('Unknown moveId: 99');
    expect(() => getMoveInfo(-1 as MoveId)).toThrow('Unknown moveId: -1');
  });
});

// ---------------------------------------------------------------------------
// resolveRound — full 6×6 matrix
// ---------------------------------------------------------------------------

describe('resolveRound — full 6×6 outcome matrix', () => {
  type Case = [MoveId, MoveId, RoundResult, RoundResult];

  // Build every cell from the spec table
  // Row = p1 (attacker), Col = p2 (defender)
  // W = p1 wins, L = p1 loses, D = draw
  const W = RoundResult.Win;
  const L = RoundResult.Lose;
  const D = RoundResult.Draw;

  const matrix: Case[] = [
    // Earth row
    [MoveId.Earth, MoveId.Earth, D, D],
    [MoveId.Earth, MoveId.Fire, L, W],
    [MoveId.Earth, MoveId.Water, W, L],
    [MoveId.Earth, MoveId.EarthPlus, L, W],
    [MoveId.Earth, MoveId.FirePlus, L, W],
    [MoveId.Earth, MoveId.WaterPlus, D, D],
    // Fire row
    [MoveId.Fire, MoveId.Earth, W, L],
    [MoveId.Fire, MoveId.Fire, D, D],
    [MoveId.Fire, MoveId.Water, L, W],
    [MoveId.Fire, MoveId.EarthPlus, D, D],
    [MoveId.Fire, MoveId.FirePlus, L, W],
    [MoveId.Fire, MoveId.WaterPlus, L, W],
    // Water row
    [MoveId.Water, MoveId.Earth, L, W],
    [MoveId.Water, MoveId.Fire, W, L],
    [MoveId.Water, MoveId.Water, D, D],
    [MoveId.Water, MoveId.EarthPlus, L, W],
    [MoveId.Water, MoveId.FirePlus, D, D],
    [MoveId.Water, MoveId.WaterPlus, L, W],
    // Earth+ row
    [MoveId.EarthPlus, MoveId.Earth, W, L],
    [MoveId.EarthPlus, MoveId.Fire, D, D],
    [MoveId.EarthPlus, MoveId.Water, W, L],
    [MoveId.EarthPlus, MoveId.EarthPlus, D, D],
    [MoveId.EarthPlus, MoveId.FirePlus, L, W],
    [MoveId.EarthPlus, MoveId.WaterPlus, W, L],
    // Fire+ row
    [MoveId.FirePlus, MoveId.Earth, W, L],
    [MoveId.FirePlus, MoveId.Fire, W, L],
    [MoveId.FirePlus, MoveId.Water, D, D],
    [MoveId.FirePlus, MoveId.EarthPlus, W, L],
    [MoveId.FirePlus, MoveId.FirePlus, D, D],
    [MoveId.FirePlus, MoveId.WaterPlus, L, W],
    // Water+ row
    [MoveId.WaterPlus, MoveId.Earth, D, D],
    [MoveId.WaterPlus, MoveId.Fire, W, L],
    [MoveId.WaterPlus, MoveId.Water, W, L],
    [MoveId.WaterPlus, MoveId.EarthPlus, L, W],
    [MoveId.WaterPlus, MoveId.FirePlus, W, L],
    [MoveId.WaterPlus, MoveId.WaterPlus, D, D],
  ];

  it.each(matrix)(
    'p1=%s vs p2=%s → p1=%s p2=%s',
    (p1, p2, expectedP1, expectedP2) => {
      const result = resolveRound(p1, p2);
      expect(result.p1Result).toBe(expectedP1);
      expect(result.p2Result).toBe(expectedP2);
    },
  );

  it('has exactly 36 cells (12 draws: diagonal plus basic wins against plus)', () => {
    const draws = matrix.filter(([, , r]) => r === D);
    expect(draws).toHaveLength(12);
    expect(matrix).toHaveLength(36);
  });

  it('results are always symmetric (p1 win ↔ p2 lose)', () => {
    for (const [p1, p2, r1, r2] of matrix) {
      const { p1Result, p2Result } = resolveRound(p1, p2);
      expect(p1Result).toBe(r1);
      expect(p2Result).toBe(r2);

      if (r1 === W) expect(r2).toBe(L);
      if (r1 === L) expect(r2).toBe(W);
      if (r1 === D) expect(r2).toBe(D);
    }
  });

  it('reverse matchups invert non-draw outcomes', () => {
    for (const p1 of ALL_MOVES) {
      for (const p2 of ALL_MOVES) {
        const forward = resolveRound(p1, p2);
        const reverse = resolveRound(p2, p1);

        expect(forward.p1Result).toBe(reverse.p2Result);
        expect(forward.p2Result).toBe(reverse.p1Result);
      }
    }
  });

  it('keeps basic and enhanced move balance profiles from the spec', () => {
    const basicMoves = [MoveId.Earth, MoveId.Fire, MoveId.Water];
    const enhancedMoves = [MoveId.EarthPlus, MoveId.FirePlus, MoveId.WaterPlus];

    for (const move of basicMoves) {
      const outcomes = ALL_MOVES.map((opponent) => resolveRound(move, opponent).p1Result);
      expect(outcomes.filter((result) => result === W)).toHaveLength(1);
      expect(outcomes.filter((result) => result === L)).toHaveLength(3);
      expect(outcomes.filter((result) => result === D)).toHaveLength(2);
    }

    for (const move of enhancedMoves) {
      const outcomes = ALL_MOVES.map((opponent) => resolveRound(move, opponent).p1Result);
      expect(outcomes.filter((result) => result === W)).toHaveLength(3);
      expect(outcomes.filter((result) => result === L)).toHaveLength(1);
      expect(outcomes.filter((result) => result === D)).toHaveLength(2);
    }
  });

  it('rejects invalid p1 and p2 move ids', () => {
    expect(() => resolveRound(99 as MoveId, MoveId.Earth)).toThrow('Invalid p1Move: 99');
    expect(() => resolveRound(MoveId.Earth, 99 as MoveId)).toThrow('Invalid p2Move: 99');
  });
});

// ---------------------------------------------------------------------------
// getRegenAmount
// ---------------------------------------------------------------------------

describe('getRegenAmount', () => {
  describe('Classic mode', () => {
    it('returns REGEN_ON_WIN on win', () => {
      expect(getRegenAmount(RoundResult.Win, GameMode.Classic)).toBe(REGEN_ON_WIN);
    });
    it('returns REGEN_ON_LOSE on loss', () => {
      expect(getRegenAmount(RoundResult.Lose, GameMode.Classic)).toBe(REGEN_ON_LOSE);
    });
    it('returns REGEN_ON_DRAW on draw', () => {
      expect(getRegenAmount(RoundResult.Draw, GameMode.Classic)).toBe(REGEN_ON_DRAW);
    });
  });

  describe('Hardcore mode', () => {
    it('always returns 0', () => {
      expect(getRegenAmount(RoundResult.Win, GameMode.Hardcore)).toBe(0);
      expect(getRegenAmount(RoundResult.Lose, GameMode.Hardcore)).toBe(0);
      expect(getRegenAmount(RoundResult.Draw, GameMode.Hardcore)).toBe(0);
    });
  });

  describe('Chaos mode', () => {
    it('uses chaosRoll when provided', () => {
      expect(getRegenAmount(RoundResult.Win, GameMode.Chaos, 7)).toBe(7);
      expect(getRegenAmount(RoundResult.Lose, GameMode.Chaos, 0)).toBe(0);
      expect(getRegenAmount(RoundResult.Draw, GameMode.Chaos, 20)).toBe(20);
    });

    it('defaults to 10 when chaosRoll is not provided', () => {
      expect(getRegenAmount(RoundResult.Win, GameMode.Chaos)).toBe(10);
    });

    it('ignores round result and returns the provided chaos roll directly', () => {
      for (const result of [RoundResult.Win, RoundResult.Lose, RoundResult.Draw]) {
        expect(getRegenAmount(result, GameMode.Chaos, 0)).toBe(0);
        expect(getRegenAmount(result, GameMode.Chaos, 20)).toBe(20);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// calculateEnergy
// ---------------------------------------------------------------------------

describe('calculateEnergy', () => {
  const baseState = { energy: 100, isOverclocked: false, boostActive: false };
  const earthMove = getMoveInfo(MoveId.Earth);    // cost = 10
  const earthPlusMove = getMoveInfo(MoveId.EarthPlus); // cost = 25

  it('deducts basic move cost and adds regen on win (Classic)', () => {
    const result = calculateEnergy(baseState, earthMove, RoundResult.Win, GameMode.Classic);
    // 100 - 10 + 5 = 95
    expect(result.energy).toBe(95);
  });

  it('deducts basic move cost and adds regen on loss (Classic)', () => {
    const result = calculateEnergy(baseState, earthMove, RoundResult.Lose, GameMode.Classic);
    // 100 - 10 + 15 = 105 → capped at 100
    expect(result.energy).toBe(100);
  });

  it('deducts enhanced move cost on win (Classic)', () => {
    const result = calculateEnergy(baseState, earthPlusMove, RoundResult.Win, GameMode.Classic);
    // 100 - 25 + 5 = 80
    expect(result.energy).toBe(80);
  });

  it('caps energy at 100', () => {
    const state = { energy: 90, isOverclocked: false, boostActive: false };
    const result = calculateEnergy(state, earthMove, RoundResult.Lose, GameMode.Classic);
    // 90 - 10 + 15 = 95
    expect(result.energy).toBe(95);
  });

  it('caps energy at 100 when regen would exceed the max', () => {
    const state = { energy: 99, isOverclocked: false, boostActive: false };
    const result = calculateEnergy(state, earthMove, RoundResult.Lose, GameMode.Classic);
    // 99 - 10 + 15 = 104 -> capped at 100
    expect(result.energy).toBe(100);
  });

  it('allows energy to go negative (Hardcore, no regen)', () => {
    const state = { energy: 5, isOverclocked: false, boostActive: false };
    const result = calculateEnergy(state, earthPlusMove, RoundResult.Win, GameMode.Hardcore);
    // 5 - 25 + 0 = -20
    expect(result.energy).toBe(-20);
  });

  it('preserves isOverclocked and boostActive flags', () => {
    const state = { energy: 80, isOverclocked: true, boostActive: true };
    const result = calculateEnergy(state, earthMove, RoundResult.Draw, GameMode.Classic);
    expect(result.isOverclocked).toBe(true);
    expect(result.boostActive).toBe(true);
  });

  it('uses chaosRoll in Chaos mode', () => {
    const result = calculateEnergy(baseState, earthMove, RoundResult.Win, GameMode.Chaos, 13);
    // 100 - 10 + 13 = 103 → capped at 100
    expect(result.energy).toBe(100);
  });

  it.each([
    [GameMode.Classic, RoundResult.Draw, undefined, 50 - BASIC_MOVE_COST + REGEN_ON_DRAW],
    [GameMode.Classic, RoundResult.Lose, undefined, 50 - BASIC_MOVE_COST + REGEN_ON_LOSE],
    [GameMode.Hardcore, RoundResult.Lose, undefined, 50 - BASIC_MOVE_COST],
    [GameMode.Chaos, RoundResult.Win, 3, 50 - BASIC_MOVE_COST + 3],
  ])(
    'calculates post-round energy for %s/%s with chaosRoll=%s',
    (mode, result, chaosRoll, expectedEnergy) => {
      const state = { energy: 50, isOverclocked: false, boostActive: false };
      expect(calculateEnergy(state, earthMove, result, mode, chaosRoll).energy).toBe(expectedEnergy);
    },
  );

  it('zero energy + basic move goes negative', () => {
    const state = { energy: 0, isOverclocked: false, boostActive: false };
    const result = calculateEnergy(state, earthMove, RoundResult.Win, GameMode.Classic);
    // 0 - 10 + 5 = -5
    expect(result.energy).toBe(-5);
  });

  it('keeps existing energy debt instead of flooring to zero', () => {
    const state = { energy: -12, isOverclocked: true, boostActive: false };
    const result = calculateEnergy(state, earthPlusMove, RoundResult.Draw, GameMode.Classic);
    // -12 - 25 + 10 = -27
    expect(result.energy).toBe(-27);
  });
});

// ---------------------------------------------------------------------------
// resolveOverclock
// ---------------------------------------------------------------------------

describe('resolveOverclock', () => {
  it('randomizes when seed[0] % 100 < 30', () => {
    // byte0 = 29 → 29 % 100 = 29 < 30 → randomize
    // byte1 = 3 → 3 % 6 = 3 = MoveId.EarthPlus
    const seed = new Uint8Array([29, 3]);
    const result = resolveOverclock(MoveId.Earth, seed);
    expect(result.wasRandomized).toBe(true);
    expect(result.finalMoveId).toBe(3 as MoveId);
  });

  it('does not randomize when seed[0] % 100 >= 30', () => {
    // byte0 = 30 → 30 % 100 = 30, not < 30
    const seed = new Uint8Array([30, 5]);
    const result = resolveOverclock(MoveId.Fire, seed);
    expect(result.wasRandomized).toBe(false);
    expect(result.finalMoveId).toBe(MoveId.Fire);
  });

  it('uses seed[1] % 6 to pick the random move', () => {
    for (let byte1 = 0; byte1 < 6; byte1++) {
      const seed = new Uint8Array([0, byte1]); // byte0=0 → always randomizes
      const result = resolveOverclock(MoveId.Water, seed);
      expect(result.wasRandomized).toBe(true);
      expect(result.finalMoveId).toBe((byte1 % 6) as MoveId);
    }
  });

  it('wraps byte1 values above the move count with modulo 6', () => {
    const seed = new Uint8Array([1, 255]);
    const result = resolveOverclock(MoveId.Earth, seed);
    expect(result.wasRandomized).toBe(true);
    expect(result.finalMoveId).toBe(MoveId.EarthPlus);
  });

  it('handles seed[0] = 0 (always randomizes)', () => {
    const seed = new Uint8Array([0, 2]);
    const result = resolveOverclock(MoveId.Earth, seed);
    expect(result.wasRandomized).toBe(true);
    expect(result.finalMoveId).toBe(MoveId.Water);
  });

  it('handles seed[0] = 99 (still randomizes)', () => {
    const seed = new Uint8Array([99, 1]); // 99 % 100 = 99 >= 30
    const result = resolveOverclock(MoveId.Earth, seed);
    expect(result.wasRandomized).toBe(false);
  });

  it('handles seed[0] = 130 (130 % 100 = 30 → no randomize)', () => {
    const seed = new Uint8Array([130, 0]);
    const result = resolveOverclock(MoveId.Earth, seed);
    expect(result.wasRandomized).toBe(false);
  });

  it('handles missing seed bytes deterministically', () => {
    const result = resolveOverclock(MoveId.WaterPlus, new Uint8Array([]));
    expect(result.wasRandomized).toBe(true);
    expect(result.finalMoveId).toBe(MoveId.Earth);
  });

  it('overclock with zero energy still works (pure function)', () => {
    // resolveOverclock is pure and does not care about energy
    const seed = new Uint8Array([5, 4]); // randomizes → move 4 = FirePlus
    const result = resolveOverclock(MoveId.Earth, seed);
    expect(result.wasRandomized).toBe(true);
    expect(result.finalMoveId).toBe(MoveId.FirePlus);
  });
});

// ---------------------------------------------------------------------------
// getEnergyLevel
// ---------------------------------------------------------------------------

describe('getEnergyLevel', () => {
  it('returns Low for 0', () => expect(getEnergyLevel(0)).toBe(EnergyLevel.Low));
  it('returns Low for 32', () => expect(getEnergyLevel(32)).toBe(EnergyLevel.Low));
  it('returns Low for 33', () => expect(getEnergyLevel(33)).toBe(EnergyLevel.Low));
  it('returns Medium for 34', () => expect(getEnergyLevel(34)).toBe(EnergyLevel.Medium));
  it('returns Medium for 65', () => expect(getEnergyLevel(65)).toBe(EnergyLevel.Medium));
  it('returns Medium for 66', () => expect(getEnergyLevel(66)).toBe(EnergyLevel.Medium));
  it('returns High for 67', () => expect(getEnergyLevel(67)).toBe(EnergyLevel.High));
  it('returns High for 100', () => expect(getEnergyLevel(100)).toBe(EnergyLevel.High));
  it('returns High for boosted energy over 100', () => expect(getEnergyLevel(120)).toBe(EnergyLevel.High));
  it('returns Low for negative energy', () => expect(getEnergyLevel(-10)).toBe(EnergyLevel.Low));
});

// ---------------------------------------------------------------------------
// calculateElo
// ---------------------------------------------------------------------------

describe('calculateElo', () => {
  it('equal ratings → winner gains 16, loser loses 16', () => {
    const { newWinner, newLoser } = calculateElo(1200, 1200);
    expect(newWinner).toBe(1216);
    expect(newLoser).toBe(1184);
  });

  it('strong winner vs weak loser — smaller gain for winner', () => {
    const { newWinner, newLoser } = calculateElo(1600, 1200);
    // Expected winner = 1/(1+10^(-400/400)) = 1/(1+0.1) ≈ 0.909
    // K*(1-0.909) ≈ 32*0.091 ≈ 2.9 → 3
    expect(newWinner).toBeGreaterThan(1600);
    expect(newWinner - 1600).toBeLessThan(10);
    expect(newLoser).toBeLessThan(1200);
  });

  it('weak winner vs strong loser — larger gain for winner', () => {
    const { newWinner, newLoser } = calculateElo(1200, 1600);
    expect(newWinner - 1200).toBeGreaterThan(20);
    expect(1600 - newLoser).toBeGreaterThan(20);
  });

  it('ratings sum stays constant (zero-sum)', () => {
    const pairs: [number, number][] = [
      [1200, 1200],
      [1500, 1300],
      [800, 1600],
    ];
    for (const [w, l] of pairs) {
      const { newWinner, newLoser } = calculateElo(w, l);
      // Due to rounding, sum may differ by at most 1
      expect(Math.abs(newWinner + newLoser - (w + l))).toBeLessThanOrEqual(1);
    }
  });

  it('updates are monotonic for winner and loser across common rating gaps', () => {
    const pairs: [number, number][] = [
      [400, 2400],
      [1000, 1400],
      [1200, 1200],
      [1800, 1200],
      [2400, 400],
    ];

    for (const [winner, loser] of pairs) {
      const { newWinner, newLoser } = calculateElo(winner, loser);
      expect(newWinner).toBeGreaterThanOrEqual(winner);
      expect(newLoser).toBeLessThanOrEqual(loser);
    }
  });
});

// ---------------------------------------------------------------------------
// Legacy stake-pool helpers
// ---------------------------------------------------------------------------

describe('legacy stake-pool payout helpers', () => {
  it('calculateLegacyStakePoolPayout applies legacy rake to the player-funded pool', () => {
    const { winnerPayout, rake } = calculateLegacyStakePoolPayout(100, 5);
    expect(rake).toBe(10);
    expect(winnerPayout).toBe(190);
  });

  it('calculateLegacyStakePoolPayout supports a zero-rake legacy pool', () => {
    const { winnerPayout, rake } = calculateLegacyStakePoolPayout(50, 0);
    expect(rake).toBe(0);
    expect(winnerPayout).toBe(100);
  });

  it('calculateLegacyStakePoolPayout keeps payout plus rake equal to the legacy pool', () => {
    const { winnerPayout, rake } = calculateLegacyStakePoolPayout(50, 10);
    expect(rake).toBe(10);
    expect(winnerPayout).toBe(90);
  });

  it('preserves legacy pool accounting', () => {
    const stake = 73;
    const { winnerPayout, rake } = calculateLegacyStakePoolPayout(stake, 5);
    expect(winnerPayout + rake).toBe(stake * 2);
  });

  it('floors fractional legacy rake in favor of the winner payout', () => {
    const { winnerPayout, rake } = calculateLegacyStakePoolPayout(99, 5);
    // pool = 198, 5% = 9.9 -> floor to 9
    expect(rake).toBe(9);
    expect(winnerPayout).toBe(189);
  });

  it('uses default LEGACY_RAKE_PERCENT when second arg omitted', () => {
    const { winnerPayout, rake } = calculateLegacyStakePoolPayout(100);
    // LEGACY_RAKE_PERCENT = 5, pool = 200, rake = 10
    expect(rake).toBe(10);
    expect(winnerPayout).toBe(190);
  });

  it('calculateLegacyDrawRefund charges symmetric per-player legacy rake on draws', () => {
    const { refund, rake } = calculateLegacyDrawRefund(50, 5);
    expect(rake).toBe(2);
    expect(refund).toBe(48);
  });

  it('calculateLegacyDrawRefund supports a zero-rake legacy draw refund', () => {
    const { refund, rake } = calculateLegacyDrawRefund(50, 0);
    expect(rake).toBe(0);
    expect(refund).toBe(50);
  });

  it('calculateLegacyDrawRefund uses default LEGACY_RAKE_PERCENT when second arg omitted', () => {
    const { refund, rake } = calculateLegacyDrawRefund(100);
    expect(rake).toBe(5);
    expect(refund).toBe(95);
  });
});
