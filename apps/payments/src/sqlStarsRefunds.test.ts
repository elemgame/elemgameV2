import { describe, expect, it, vi } from 'vitest';
import type { SpacetimeAdminConfig } from './config.js';
import { createSqlStarsRefundService } from './sqlStarsRefunds.js';
import { TelegramBotApiError, type TelegramBotApi, type TelegramStarTransaction } from './telegramBotApi.js';

const config: SpacetimeAdminConfig = {
  uri: 'http://localhost:3000',
  database: 'test',
  token: 'sql-token',
};

describe('SQL fallback Stars refund service', () => {
  it('quotes incoming invoice transactions covered by paid ELM balance', async () => {
    const sql = sqlFetch({ accountBalance: 100 });
    const telegram = telegramMock([incomingTransaction({ id: 'charge_1', amount: 1, date: 1 })]);
    const service = createSqlStarsRefundService(config, telegram, sql.fetchImpl);

    await expect(service.quote({
      accountId: 'telegram:99',
      telegramUserId: '99',
    })).resolves.toMatchObject({
      refundableStarsAmount: 1,
      refundableElmAmount: 100,
      nextLot: { paymentId: 'charge_1', starsAmount: 1, elmAmount: 100 },
      lots: [{ paymentId: 'charge_1', starsAmount: 1, elmAmount: 100 }],
    });
  });

  it('does not quote a lot when current paid ELM balance is below the whole purchase lot', async () => {
    const sql = sqlFetch({ accountBalance: 50 });
    const telegram = telegramMock([incomingTransaction({ id: 'charge_1', amount: 1, date: 1 })]);
    const service = createSqlStarsRefundService(config, telegram, sql.fetchImpl);

    await expect(service.quote({
      accountId: 'telegram:99',
      telegramUserId: '99',
    })).resolves.toMatchObject({
      refundableStarsAmount: 0,
      refundableElmAmount: 0,
      lots: [],
      note: 'Refund requires 100 unused ELM for the next 1 Star purchase; current paid ELM balance is 50.',
    });
  });

  it('excludes already refunded transactions from audit rows and Telegram refund rows', async () => {
    const sql = sqlFetch({ accountBalance: 200, auditReasons: ['stars_refund_fallback:charge_1'] });
    const telegram = telegramMock([
      incomingTransaction({ id: 'charge_1', amount: 1, date: 1 }),
      incomingTransaction({ id: 'charge_2', amount: 1, date: 2 }),
      {
        id: 'charge_3',
        amount: -1,
        date: 3,
        receiver: { type: 'user', user: { id: 99 } },
      },
      incomingTransaction({ id: 'charge_3', amount: 1, date: 4 }),
    ]);
    const service = createSqlStarsRefundService(config, telegram, sql.fetchImpl);

    await expect(service.quote({
      accountId: 'telegram:99',
      telegramUserId: '99',
    })).resolves.toMatchObject({
      refundableStarsAmount: 1,
      nextLot: { paymentId: 'charge_2', starsAmount: 1, elmAmount: 100 },
    });
  });

  it('debits ELM, refunds the original charge, and records an audit row', async () => {
    const sql = sqlFetch({ accountBalance: 100 });
    const telegram = telegramMock([incomingTransaction({ id: 'charge_1', amount: 1, date: 1 })]);
    const service = createSqlStarsRefundService(config, telegram, sql.fetchImpl);

    await expect(service.refund({
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 1,
    })).resolves.toMatchObject({
      refundedStarsAmount: 1,
      refundedElmAmount: 100,
      refundedLots: [{ paymentId: 'charge_1', starsAmount: 1, elmAmount: 100 }],
    });

    expect(telegram.refundStarPayment).toHaveBeenCalledWith({
      telegramUserId: '99',
      telegramPaymentChargeId: 'charge_1',
    });
    expect(sql.queries).toContain("UPDATE account SET balance = 0, balance_kind = 'paid_elm' WHERE id = 'telegram:99'");
    expect(sql.queries).toContain("UPDATE player SET balance = 0, balance_kind = 'paid_elm' WHERE account_id = 'telegram:99'");
    expect(sql.queries.some(query => query.includes('INSERT INTO admin_audit_event') && query.includes('stars_refund_fallback:charge_1'))).toBe(true);
  });

  it('restores the balance when Telegram confirms refund failure', async () => {
    const sql = sqlFetch({ accountBalance: 100 });
    const telegram = telegramMock([incomingTransaction({ id: 'charge_1', amount: 1, date: 1 })]);
    telegram.refundStarPayment = vi.fn(async () => {
      throw new TelegramBotApiError('charge cannot be refunded', { confirmedFailure: true });
    });
    const service = createSqlStarsRefundService(config, telegram, sql.fetchImpl);

    await expect(service.refund({
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 1,
    })).rejects.toThrow('charge cannot be refunded');

    expect(sql.queries).toContain("UPDATE account SET balance = 0, balance_kind = 'paid_elm' WHERE id = 'telegram:99'");
    expect(sql.queries).toContain("UPDATE account SET balance = 100, balance_kind = 'paid_elm' WHERE id = 'telegram:99'");
  });
});

function telegramMock(transactions: TelegramStarTransaction[]): TelegramBotApi {
  return {
    createInvoiceLink: vi.fn(),
    answerPreCheckoutQuery: vi.fn(),
    sendWebAppMessage: vi.fn(),
    getStarTransactions: vi.fn(async input => {
      const offset = input?.offset ?? 0;
      const limit = input?.limit ?? 100;
      return transactions.slice(offset, offset + limit);
    }),
    refundStarPayment: vi.fn(async () => 'refunded' as const),
  };
}

function incomingTransaction(input: { id: string; amount: number; date: number }): TelegramStarTransaction {
  return {
    ...input,
    source: {
      type: 'user',
      transaction_type: 'invoice_payment',
      user: { id: 99 },
    },
  };
}

function sqlFetch(input: { accountBalance: number; auditReasons?: string[] }) {
  const queries: string[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const query = String(init?.body ?? '');
    queries.push(query);
    if (query.includes('FROM account')) {
      return sqlResponse(['id', 'balance', 'balance_kind'], [['telegram:99', input.accountBalance, 'paid_elm']]);
    }
    if (query.includes('FROM admin_audit_event')) {
      return sqlResponse(['reason'], (input.auditReasons ?? []).map(reason => [reason]));
    }
    return sqlResponse([], []);
  }) as unknown as typeof fetch;
  return { fetchImpl, queries };
}

function sqlResponse(columns: string[], rows: unknown[][]): Response {
  return new Response(JSON.stringify([{
    schema: { elements: columns.map(name => ({ name: { some: name } })) },
    rows,
  }]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
