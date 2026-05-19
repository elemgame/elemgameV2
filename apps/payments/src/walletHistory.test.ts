import { describe, expect, it, vi } from 'vitest';
import { createWalletHistoryService } from './walletHistory.js';
import type { SpacetimeCreditConfig } from './config.js';

const config: SpacetimeCreditConfig = {
  uri: 'http://localhost:3000',
  database: 'test',
  token: 'token',
};

describe('wallet history service', () => {
  it('returns sanitized payment credit and refund entries', async () => {
    const service = createWalletHistoryService(config, async () => fakeConnection({
      ledgerRows: [ledger({
        status: 'refunded',
        refundedStarsAmount: 1,
        refundedElmAmount: 100,
        refundRequestedAtMicros: 4_000_000n,
        refundedAtMicros: 5_000_000n,
      })],
    }));

    const history = await service.history({
      accountId: 'telegram:99',
      telegramUserId: '99',
    });

    expect(history.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'stars_purchase', starsAmount: 1, elmAmount: 100 }),
      expect.objectContaining({ kind: 'elm_credit', status: 'settled', elmAmount: 100 }),
      expect.objectContaining({ kind: 'stars_refund', status: 'settled', elmAmount: -100 }),
    ]));
    expect(history.summary).toMatchObject({
      totalStarsPurchased: 1,
      totalElmCredited: 100,
      totalStarsRefunded: 1,
      totalElmRefunded: 100,
    });
    expect(JSON.stringify(history)).not.toContain('charge_');
    expect(JSON.stringify(history)).not.toContain('invoicePayload');
  });

  it('includes paid ELM match entry fee and boost cost entries', async () => {
    const service = createWalletHistoryService(config, async () => fakeConnection({
      players: [player({ identity: identity('p1'), accountId: 'telegram:99' })],
      matches: [match({
        p1: identity('p1'),
        p2: identity('p2'),
        p1BoostEnabled: true,
        winner: identity('p1'),
      })],
    }));

    const history = await service.history({
      accountId: 'telegram:99',
      telegramUserId: '99',
    });

    expect(history.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'match_entry_fee', elmAmount: -100, matchId: '7' }),
      expect.objectContaining({ kind: 'match_boost_cost', elmAmount: -10, matchId: '7' }),
    ]));
    expect(history.summary.pvpNetElm).toBe(-110);
  });

  it('prefers append-only balance events for match wallet history', async () => {
    const service = createWalletHistoryService(config, async () => fakeConnection({
      balanceEvents: [
        balanceEvent({
          idempotencyKey: 'match:7:telegram:99:entry_fee',
          delta: -50,
          balanceAfter: 450,
          reasonKind: 'match_entry_fee',
          matchId: 7n,
          createdAtMicros: 4_000_000n,
        }),
        balanceEvent({
          idempotencyKey: 'match:7:telegram:99:boost_cost',
          delta: -5,
          balanceAfter: 445,
          reasonKind: 'match_boost_cost',
          matchId: 7n,
          createdAtMicros: 4_000_001n,
        }),
      ],
      players: [player({ identity: identity('p1'), accountId: 'telegram:99' })],
      matches: [match({
        p1: identity('p1'),
        p2: identity('p2'),
        p2Name: 'Ledger Opponent',
        stake: 50,
      })],
    }));

    const history = await service.history({
      accountId: 'telegram:99',
      telegramUserId: '99',
    });

    expect(history.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'match_entry_fee',
        elmAmount: -50,
        matchId: '7',
        description: 'Match vs Ledger Opponent',
      }),
      expect.objectContaining({ kind: 'match_boost_cost', elmAmount: -5, matchId: '7' }),
    ]));
    expect(history.summary.pvpNetElm).toBe(-55);
  });

  it('does not create draw refunds in paid ELM match history', async () => {
    const service = createWalletHistoryService(config, async () => fakeConnection({
      players: [player({ identity: identity('p1'), accountId: 'telegram:99' })],
      matches: [match({
        p1: identity('p1'),
        p2: identity('p2'),
        stake: 50,
        p1Score: 0,
        p2Score: 0,
        winner: undefined,
      })],
    }));

    const history = await service.history({
      accountId: 'telegram:99',
      telegramUserId: '99',
    });

    expect(history.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'match_entry_fee', elmAmount: -50, matchId: '7' }),
    ]));
    expect(history.entries).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'pvp_draw_refund', matchId: '7' }),
    ]));
    expect(history.summary.pvpNetElm).toBe(-50);
  });
});

function fakeConnection(input: {
  balanceEvents?: ReturnType<typeof balanceEvent>[];
  ledgerRows?: ReturnType<typeof ledger>[];
  players?: ReturnType<typeof player>[];
  matches?: ReturnType<typeof match>[];
}) {
  return {
    db: {
      account: { iter: () => [] },
      balanceEvent: { iter: () => input.balanceEvents ?? [] },
      paymentLedger: { iter: () => input.ledgerRows ?? [] },
      player: { iter: () => input.players ?? [] },
      matchState: { iter: () => input.matches ?? [] },
    },
    disconnect: vi.fn(),
  };
}

function balanceEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    idempotencyKey: 'match:7:telegram:99:entry_fee',
    accountId: 'telegram:99',
    balanceKind: 'paid_elm',
    delta: -50,
    balanceAfter: 950,
    reasonKind: 'match_entry_fee',
    paymentId: undefined,
    matchId: 7n,
    actor: 'p1',
    createdAtMicros: 4_000_000n,
    ...overrides,
  };
}

function ledger(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    paymentId: 'purchase_1',
    accountId: 'telegram:99',
    telegramUserId: '99',
    starsAmount: 1,
    elmAmount: 100,
    refundableElmAmount: 100,
    refundedStarsAmount: 0,
    refundedElmAmount: 0,
    telegramPaymentChargeId: 'charge_secret',
    invoicePayload: 'signed_payload_secret',
    balanceKind: 'paid_elm',
    status: 'credited',
    createdAtMicros: 1_000_000n,
    paidAtMicros: 2_000_000n,
    creditedAtMicros: 3_000_000n,
    refundRequestedAtMicros: undefined,
    refundedAtMicros: undefined,
    updatedAtMicros: 3_000_000n,
    ...overrides,
  };
}

function player(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    identity: identity('p1'),
    name: 'Player',
    online: true,
    rating: 1200,
    wins: 0,
    losses: 0,
    balance: 1000,
    balanceKind: 'paid_elm',
    accountId: 'telegram:99',
    seasonPoints: 0,
    ...overrides,
  };
}

function match(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7n,
    p1: identity('p1'),
    p2: identity('p2'),
    p1Name: 'Player',
    p2Name: 'Opponent',
    p1Rating: 1200,
    p2Rating: 1200,
    stake: 100,
    balanceKind: 'paid_elm',
    economyModel: 'entry_fee_season_points',
    mode: 'classic',
    room: 'test',
    phase: 'complete',
    status: 'settled',
    currentRound: 4,
    p1Score: 3,
    p2Score: 0,
    p1Energy: 80,
    p2Energy: 100,
    p1BoostEnabled: false,
    p2BoostEnabled: false,
    p1SeasonPointsAwarded: 30,
    p2SeasonPointsAwarded: 10,
    p1CommitHash: undefined,
    p2CommitHash: undefined,
    p1RevealMove: undefined,
    p2RevealMove: undefined,
    p1RevealSalt: undefined,
    p2RevealSalt: undefined,
    winner: identity('p1'),
    replayHash: undefined,
    createdAtMicros: 10_000_000n,
    updatedAtMicros: 20_000_000n,
    roundStartedAtMicros: 10_000_000n,
    nextRoundReadyAtMicros: undefined,
    ...overrides,
  };
}

function identity(value: string): any {
  return {
    toHexString: () => value,
  };
}
