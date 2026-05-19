import { describe, expect, it, vi } from 'vitest';
import { createStarsRefundService } from './starsRefunds.js';
import type { SpacetimeCreditConfig } from './config.js';
import { TelegramBotApiError } from './telegramBotApi.js';
import type { TelegramBotApi } from './telegramBotApi.js';

const config: SpacetimeCreditConfig = {
  uri: 'http://localhost:3000',
  database: 'test',
  token: 'token',
};

describe('Stars refund service', () => {
  it('quotes only whole unused FIFO payment lots covered by current balance', async () => {
    const service = createStarsRefundService(config, telegramMock(), async () => fakeConnection({
      accountBalance: 650,
      ledgerRows: [
        ledger({ paymentId: 'p1', starsAmount: 1, elmAmount: 100, createdAtMicros: 1n }),
        ledger({ paymentId: 'p2', starsAmount: 5, elmAmount: 500, createdAtMicros: 2n }),
        ledger({ paymentId: 'p3', starsAmount: 10, elmAmount: 1000, createdAtMicros: 3n }),
      ],
    }));

    await expect(service.quote({
      accountId: 'telegram:99',
      telegramUserId: '99',
    })).resolves.toMatchObject({
      refundableStarsAmount: 1,
      refundableElmAmount: 100,
      nextLot: { paymentId: 'p1', starsAmount: 1, elmAmount: 100 },
      lots: [{ paymentId: 'p1', starsAmount: 1, elmAmount: 100 }],
    });
  });

  it('reserves, refunds, and records selected whole lots', async () => {
    const telegram = telegramMock();
    const connection = fakeConnection({
      accountBalance: 100,
      ledgerRows: [ledger({ paymentId: 'p1', starsAmount: 1, elmAmount: 100, createdAtMicros: 1n })],
    });
    const service = createStarsRefundService(config, telegram, async () => connection);

    await expect(service.refund({
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 1,
    })).resolves.toMatchObject({
      refundedStarsAmount: 1,
      refundedElmAmount: 100,
    });

    expect(connection.reducers.reserveStarsRefund).toHaveBeenCalledWith({
      paymentId: 'p1',
      accountId: 'telegram:99',
      telegramUserId: '99',
    });
    expect(telegram.refundStarPayment).toHaveBeenCalledWith({
      telegramUserId: '99',
      telegramPaymentChargeId: 'charge_p1',
    });
    expect(connection.reducers.recordStarsRefund).toHaveBeenCalledWith({
      paymentId: 'p1',
      accountId: 'telegram:99',
      telegramUserId: '99',
      telegramPaymentChargeId: 'charge_p1',
    });
  });

  it('quotes pending reserved lots without requiring current spendable balance', async () => {
    const service = createStarsRefundService(config, telegramMock(), async () => fakeConnection({
      accountBalance: 0,
      ledgerRows: [
        ledger({
          paymentId: 'p1',
          starsAmount: 1,
          elmAmount: 100,
          status: 'refund_pending',
          createdAtMicros: 1n,
        }),
      ],
    }));

    await expect(service.quote({
      accountId: 'telegram:99',
      telegramUserId: '99',
    })).resolves.toMatchObject({
      refundableStarsAmount: 1,
      refundableElmAmount: 100,
      nextLot: { paymentId: 'p1', starsAmount: 1, elmAmount: 100 },
    });
  });

  it('does not quote current ELM that is not backed by unused refundable Stars purchases', async () => {
    const service = createStarsRefundService(config, telegramMock(), async () => fakeConnection({
      accountBalance: 100,
      ledgerRows: [
        ledger({
          paymentId: 'spent',
          starsAmount: 1,
          elmAmount: 100,
          refundableElmAmount: 0,
          createdAtMicros: 1n,
        }),
      ],
    }));

    await expect(service.quote({
      accountId: 'telegram:99',
      telegramUserId: '99',
    })).resolves.toMatchObject({
      refundableStarsAmount: 0,
      refundableElmAmount: 0,
      lots: [],
      note: 'Current ELM is not backed by unused refundable Stars purchases.',
    });
  });

  it('keeps the reservation when Telegram refunded but ledger recording fails', async () => {
    const connection = fakeConnection({
      accountBalance: 100,
      ledgerRows: [ledger({ paymentId: 'p1', starsAmount: 1, elmAmount: 100, createdAtMicros: 1n })],
    });
    connection.reducers.recordStarsRefund.mockRejectedValue(new Error('record failed'));
    const service = createStarsRefundService(config, telegramMock(), async () => connection);

    await expect(service.refund({
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 1,
    })).rejects.toThrow('record failed');

    expect(connection.reducers.cancelStarsRefund).not.toHaveBeenCalled();
  });

  it('releases the reservation when Telegram confirms the refund failed', async () => {
    const telegram = telegramMock();
    telegram.refundStarPayment = vi.fn(async () => {
      throw new TelegramBotApiError('charge cannot be refunded', { confirmedFailure: true });
    });
    const connection = fakeConnection({
      accountBalance: 100,
      ledgerRows: [ledger({ paymentId: 'p1', starsAmount: 1, elmAmount: 100, createdAtMicros: 1n })],
    });
    const service = createStarsRefundService(config, telegram, async () => connection);

    await expect(service.refund({
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 1,
    })).rejects.toThrow('charge cannot be refunded');

    expect(connection.reducers.cancelStarsRefund).toHaveBeenCalledWith({
      paymentId: 'p1',
      accountId: 'telegram:99',
      telegramUserId: '99',
    });
  });

  it('rejects refund amounts that do not match FIFO whole lots', async () => {
    const service = createStarsRefundService(config, telegramMock(), async () => fakeConnection({
      accountBalance: 700,
      ledgerRows: [
        ledger({ paymentId: 'p1', starsAmount: 1, elmAmount: 100, createdAtMicros: 1n }),
        ledger({ paymentId: 'p2', starsAmount: 5, elmAmount: 500, createdAtMicros: 2n }),
      ],
    }));

    await expect(service.refund({
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 5,
    })).rejects.toThrow('Refund amount must match whole refundable purchase lots in FIFO order');
  });

  it('rejects refund amounts above the refundable lot total', async () => {
    const service = createStarsRefundService(config, telegramMock(), async () => fakeConnection({
      accountBalance: 100,
      ledgerRows: [ledger({ paymentId: 'p1', starsAmount: 1, elmAmount: 100, createdAtMicros: 1n })],
    }));

    await expect(service.refund({
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 10,
    })).rejects.toThrow('Refund amount must match whole refundable purchase lots in FIFO order');
  });
});

function telegramMock(): TelegramBotApi {
  return {
    createInvoiceLink: vi.fn(),
    answerPreCheckoutQuery: vi.fn(),
    sendWebAppMessage: vi.fn(),
    getStarTransactions: vi.fn(async () => []),
    refundStarPayment: vi.fn(async () => 'refunded' as const),
  };
}

function fakeConnection(input: { accountBalance: number; ledgerRows: ReturnType<typeof ledger>[] }) {
  return {
    db: {
      account: {
        iter: () => [{
          id: 'telegram:99',
          name: 'telegram:99',
          rating: 1200,
          wins: 0,
          losses: 0,
          balance: input.accountBalance,
          balanceKind: 'paid_elm',
        }],
      },
      paymentLedger: {
        iter: () => input.ledgerRows,
      },
    },
    reducers: {
      reserveStarsRefund: vi.fn(async () => undefined),
      recordStarsRefund: vi.fn(async () => undefined),
      cancelStarsRefund: vi.fn(async () => undefined),
    },
    disconnect: vi.fn(),
  };
}

function ledger(overrides: Partial<Record<string, unknown>>) {
  return {
    paymentId: 'p1',
    accountId: 'telegram:99',
    telegramUserId: '99',
    starsAmount: 1,
    elmAmount: 100,
    refundableElmAmount: 100,
    refundedStarsAmount: 0,
    refundedElmAmount: 0,
    invoicePayload: 'payload',
    balanceKind: 'paid_elm',
    status: 'credited',
    createdAtMicros: 1n,
    paidAtMicros: 1n,
    creditedAtMicros: 1n,
    refundRequestedAtMicros: undefined,
    refundedAtMicros: undefined,
    updatedAtMicros: 1n,
    ...overrides,
    telegramPaymentChargeId: `charge_${overrides.paymentId ?? 'p1'}`,
  };
}
