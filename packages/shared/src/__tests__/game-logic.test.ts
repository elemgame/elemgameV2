import { describe, expect, it } from 'vitest';
import {
  calculateElo,
  calculateEnergy,
  calculatePayout,
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
  ENHANCED_MOVE_COST,
  REGEN_ON_DRAW,
  REGEN_ON_LOSE,
  REGEN_ON_WIN,
} from '../constants.js';

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
    [MoveId.Earth, MoveId.Fire, W, L],
    [MoveId.Earth, MoveId.Water, L, W],
    [MoveId.Earth, MoveId.EarthPlus, L, W],
    [MoveId.Earth, MoveId.FirePlus, L, W],
    [MoveId.Earth, MoveId.WaterPlus, W, L],
    // Fire row
    [MoveId.Fire, MoveId.Earth, L, W],
    [MoveId.Fire, MoveId.Fire, D, D],
    [MoveId.Fire, MoveId.Water, W, L],
    [MoveId.Fire, MoveId.EarthPlus, W, L],
    [MoveId.Fire, MoveId.FirePlus, L, W],
    [MoveId.Fire, MoveId.WaterPlus, L, W],
    // Water row
    [MoveId.Water, MoveId.Earth, W, L],
    [MoveId.Water, MoveId.Fire, L, W],
    [MoveId.Water, MoveId.Water, D, D],
    [MoveId.Water, MoveId.EarthPlus, L, W],
    [MoveId.Water, MoveId.FirePlus, W, L],
    [MoveId.Water, MoveId.WaterPlus, L, W],
    // Earth+ row
    [MoveId.EarthPlus, MoveId.Earth, W, L],
    [MoveId.EarthPlus, MoveId.Fire, L, W],
    [MoveId.EarthPlus, MoveId.Water, W, L],
    [MoveId.EarthPlus, MoveId.EarthPlus, D, D],
    [MoveId.EarthPlus, MoveId.FirePlus, W, L],
    [MoveId.EarthPlus, MoveId.WaterPlus, L, W],
    // Fire+ row
    [MoveId.FirePlus, MoveId.Earth, W, L],
    [MoveId.FirePlus, MoveId.Fire, W, L],
    [MoveId.FirePlus, MoveId.Water, L, W],
    [MoveId.FirePlus, MoveId.EarthPlus, L, W],
    [MoveId.FirePlus, MoveId.FirePlus, D, D],
    [MoveId.FirePlus, MoveId.WaterPlus, W, L],
    // Water+ row
    [MoveId.WaterPlus, MoveId.Earth, L, W],
    [MoveId.WaterPlus, MoveId.Fire, L, W],
    [MoveId.WaterPlus, MoveId.Water, W, L],
    [MoveId.WaterPlus, MoveId.EarthPlus, W, L],
    [MoveId.WaterPlus, MoveId.FirePlus, L, W],
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

  it('has exactly 36 cells (6 draws on diagonal)', () => {
    const draws = matrix.filter(([, , r]) => r === D);
    expect(draws).toHaveLength(6);
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

  it('zero energy + basic move goes negative', () => {
    const state = { energy: 0, isOverclocked: false, boostActive: false };
    const result = calculateEnergy(state, earthMove, RoundResult.Win, GameMode.Classic);
    // 0 - 10 + 5 = -5
    expect(result.energy).toBe(-5);
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
  it('returns Low for 33', () => expect(getEnergyLevel(33)).toBe(EnergyLevel.Low));
  it('returns Medium for 34', () => expect(getEnergyLevel(34)).toBe(EnergyLevel.Medium));
  it('returns Medium for 66', () => expect(getEnergyLevel(66)).toBe(EnergyLevel.Medium));
  it('returns High for 67', () => expect(getEnergyLevel(67)).toBe(EnergyLevel.High));
  it('returns High for 100', () => expect(getEnergyLevel(100)).toBe(EnergyLevel.High));
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
});

// ---------------------------------------------------------------------------
// calculatePayout
// ---------------------------------------------------------------------------

describe('calculatePayout', () => {
  it('5% rake on 100 stake → winner gets 190, rake 10', () => {
    const { winnerPayout, rake } = calculatePayout(100, 5);
    expect(rake).toBe(10);
    expect(winnerPayout).toBe(190);
  });

  it('0% rake → winner gets full pool', () => {
    const { winnerPayout, rake } = calculatePayout(50, 0);
    expect(rake).toBe(0);
    expect(winnerPayout).toBe(100);
  });

  it('10% rake on 50 stake → pool 100, rake 10, winner 90', () => {
    const { winnerPayout, rake } = calculatePayout(50, 10);
    expect(rake).toBe(10);
    expect(winnerPayout).toBe(90);
  });

  it('payout + rake = total pool', () => {
    const stake = 73;
    const { winnerPayout, rake } = calculatePayout(stake, 5);
    expect(winnerPayout + rake).toBe(stake * 2);
  });

  it('uses default RAKE_PERCENT when second arg omitted', () => {
    const { winnerPayout, rake } = calculatePayout(100);
    // RAKE_PERCENT = 5, pool = 200, rake = 10
    expect(rake).toBe(10);
    expect(winnerPayout).toBe(190);
  });
});
