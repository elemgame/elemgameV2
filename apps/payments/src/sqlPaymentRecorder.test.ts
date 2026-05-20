import { describe, expect, it, vi } from 'vitest';
import type { SpacetimeAdminConfig } from './config.js';
import { createSqlPaymentRecorder } from './sqlPaymentRecorder.js';

const config: SpacetimeAdminConfig = {
  uri: 'http://localhost:3000',
  database: 'test',
  token: 'sql-token',
};

describe('SQL fallback payment recorder', () => {
  it('creates new paid Telegram accounts with the current account schema', async () => {
    const sql = sqlFetch([]);
    const recorder = createSqlPaymentRecorder(config, undefined, sql.fetchImpl);

    await recorder.recordSuccessfulPayment({
      purchaseId: 'purchase_1',
      packageId: 'stars_1',
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 1,
      elmAmount: 100,
      telegramPaymentChargeId: 'charge_1',
      invoicePayload: 'payload',
    });

    expect(sql.queries).toContain(
      "INSERT INTO account (id, name, rating, wins, losses, balance, balance_kind, season_points) VALUES ('telegram:99', 'telegram:99', 1200, 0, 0, 100, 'paid_elm', 0)",
    );
    expect(sql.queries).toContain("UPDATE player SET balance = 100, balance_kind = 'paid_elm' WHERE account_id = 'telegram:99'");
  });

  it('credits existing Telegram accounts without inserting duplicates', async () => {
    const sql = sqlFetch([['telegram:99', 50, 'paid_elm']]);
    const recorder = createSqlPaymentRecorder(config, undefined, sql.fetchImpl);

    await recorder.recordSuccessfulPayment({
      purchaseId: 'purchase_1',
      packageId: 'stars_1',
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 1,
      elmAmount: 100,
      telegramPaymentChargeId: 'charge_1',
      invoicePayload: 'payload',
    });

    expect(sql.queries).toContain("UPDATE account SET balance = 150, balance_kind = 'paid_elm' WHERE id = 'telegram:99'");
    expect(sql.queries.some(query => query.includes('INSERT INTO account'))).toBe(false);
  });
});

function sqlFetch(accountRows: unknown[][]) {
  const queries: string[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const query = String(init?.body ?? '');
    queries.push(query);
    if (query.includes('FROM account')) {
      return sqlResponse(['id', 'balance', 'balance_kind'], accountRows);
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
