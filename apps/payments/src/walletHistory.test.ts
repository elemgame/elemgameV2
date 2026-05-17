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

  it('includes paid ELM PvP stake, winnings, and boost return entries', async () => {
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
      expect.objectContaining({ kind: 'pvp_stake', elmAmount: -100, matchId: '7' }),
      expect.objectContaining({ kind: 'pvp_boost_stake', elmAmount: -10, matchId: '7' }),
      expect.objectContaining({ kind: 'pvp_win', elmAmount: 190, matchId: '7' }),
      expect.objectContaining({ kind: 'pvp_boost_return', elmAmount: 10, matchId: '7' }),
    ]));
    expect(history.summary.pvpNetElm).toBe(90);
  });
});

function fakeConnection(input: {
  ledgerRows?: ReturnType<typeof ledger>[];
  players?: ReturnType<typeof player>[];
  matches?: ReturnType<typeof match>[];
}) {
  return {
    db: {
      account: { iter: () => [] },
      paymentLedger: { iter: () => input.ledgerRows ?? [] },
      player: { iter: () => input.players ?? [] },
      matchState: { iter: () => input.matches ?? [] },
    },
    disconnect: vi.fn(),
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
