import crypto from 'crypto';
import type http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminStore } from './adminStore.js';
import { loadConfig } from './config.js';
import { createSignedInvoicePayload } from './invoicePayload.js';
import { createPaymentsServer } from './server.js';
import type { StarsRefundService } from './starsRefunds.js';
import type { TelegramBotApi } from './telegramBotApi.js';
import type { PaymentEventRecorder } from './telegramUpdates.js';
import type { WalletHistoryService } from './walletHistory.js';

const botToken = '123456:test_bot_token';
const config = loadConfig({
  NODE_ENV: 'test',
  TELEGRAM_BOT_TOKEN: botToken,
  TELEGRAM_WEBAPP_URL: 'https://game.example/',
  PAYMENT_PAYLOAD_SECRET: 'test_payment_secret',
  PAYMENTS_PORT: '3002',
  ADMIN_TELEGRAM_IDS: '99',
});

let server: http.Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>(resolve => server?.close(() => resolve()));
  server = null;
});

describe('payments server', () => {
  it('creates a Telegram Stars invoice for a valid Telegram user', async () => {
    const telegram: TelegramBotApi = {
      createInvoiceLink: vi.fn(async () => 'https://t.me/$invoice/test'),
      answerPreCheckoutQuery: vi.fn(async () => undefined),
      sendWebAppMessage: vi.fn(async () => undefined),
      getStarTransactions: vi.fn(async () => []),
      refundStarPayment: vi.fn(async () => 'refunded' as const),
    };
    const baseUrl = await listen(telegram);

    const response = await fetch(`${baseUrl}/payments/stars/invoice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        initData: signedInitData({ id: 99, first_name: 'Buyer' }),
        packageId: 'stars_10',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body['accountId']).toBe('telegram:99');
    expect(body['currency']).toBe('XTR');
    expect(body['invoiceLink']).toBe('https://t.me/$invoice/test');
    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(expect.objectContaining({
      starsAmount: 10,
      elmAmount: 1000,
    }));
  });

  it('rejects browser/demo requests without Telegram init data', async () => {
    const telegram: TelegramBotApi = {
      createInvoiceLink: vi.fn(async () => 'unused'),
      answerPreCheckoutQuery: vi.fn(async () => undefined),
      sendWebAppMessage: vi.fn(async () => undefined),
      getStarTransactions: vi.fn(async () => []),
      refundStarPayment: vi.fn(async () => 'refunded' as const),
    };
    const baseUrl = await listen(telegram);

    const response = await fetch(`${baseUrl}/payments/stars/invoice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packageId: 'stars_1' }),
    });

    expect(response.status).toBe(401);
    expect(telegram.createInvoiceLink).not.toHaveBeenCalled();
  });

  it('accepts valid Telegram pre-checkout updates', async () => {
    const telegram: TelegramBotApi = {
      createInvoiceLink: vi.fn(async () => 'unused'),
      answerPreCheckoutQuery: vi.fn(async () => undefined),
      sendWebAppMessage: vi.fn(async () => undefined),
      getStarTransactions: vi.fn(async () => []),
      refundStarPayment: vi.fn(async () => 'refunded' as const),
    };
    const baseUrl = await listen(telegram);
    const payload = createPayload('stars_1', 99);

    const response = await fetch(`${baseUrl}/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pre_checkout_query: {
          id: 'pcq_1',
          from: { id: 99 },
          currency: 'XTR',
          total_amount: 1,
          invoice_payload: payload,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(telegram.answerPreCheckoutQuery).toHaveBeenCalledWith({
      preCheckoutQueryId: 'pcq_1',
      ok: true,
    });
  });

  it('records valid successful payment updates', async () => {
    const telegram: TelegramBotApi = {
      createInvoiceLink: vi.fn(async () => 'unused'),
      answerPreCheckoutQuery: vi.fn(async () => undefined),
      sendWebAppMessage: vi.fn(async () => undefined),
      getStarTransactions: vi.fn(async () => []),
      refundStarPayment: vi.fn(async () => 'refunded' as const),
    };
    const recorder: PaymentEventRecorder = {
      recordSuccessfulPayment: vi.fn(async () => undefined),
    };
    const baseUrl = await listen(telegram, recorder);
    const payload = createPayload('stars_10', 99);

    const response = await fetch(`${baseUrl}/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          from: { id: 99 },
          successful_payment: {
            currency: 'XTR',
            total_amount: 10,
            invoice_payload: payload,
            telegram_payment_charge_id: 'charge_123',
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(recorder.recordSuccessfulPayment).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'telegram:99',
      packageId: 'stars_10',
      starsAmount: 10,
      elmAmount: 1000,
      telegramPaymentChargeId: 'charge_123',
    }));
  });

  it('sends the configured WebApp link for /play commands', async () => {
    const telegram = createTelegramMock();
    const baseUrl = await listen(telegram);

    const response = await fetch(`${baseUrl}/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          chat: { id: 99 },
          from: { id: 99 },
          text: '/play',
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(telegram.sendWebAppMessage).toHaveBeenCalledWith({
      chatId: 99,
      text: 'Open Elmental from this button to use your Telegram account balance.',
      webAppUrl: 'https://game.example/',
    });
  });

  it('returns refund quotes for Telegram users', async () => {
    const telegram = createTelegramMock();
    const refundService: StarsRefundService = {
      quote: vi.fn(async () => ({
        accountId: 'telegram:99',
        telegramUserId: '99',
        refundableStarsAmount: 1,
        refundableElmAmount: 100,
        lots: [{ paymentId: 'purchase_1', starsAmount: 1, elmAmount: 100 }],
        nextLot: { paymentId: 'purchase_1', starsAmount: 1, elmAmount: 100 },
      })),
      refund: vi.fn(),
    };
    const baseUrl = await listen(telegram, undefined, refundService);

    const response = await fetch(`${baseUrl}/payments/stars/refund/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signedInitData({ id: 99, first_name: 'Buyer' }) }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body['refundableStarsAmount']).toBe(1);
    expect(refundService.quote).toHaveBeenCalledWith({
      accountId: 'telegram:99',
      telegramUserId: '99',
    });
  });

  it('requests refund execution through the refund service', async () => {
    const telegram = createTelegramMock();
    const refundService: StarsRefundService = {
      quote: vi.fn(),
      refund: vi.fn(async () => ({
        accountId: 'telegram:99',
        telegramUserId: '99',
        refundedStarsAmount: 1,
        refundedElmAmount: 100,
        refundedLots: [{ paymentId: 'purchase_1', starsAmount: 1, elmAmount: 100 }],
      })),
    };
    const baseUrl = await listen(telegram, undefined, refundService);

    const response = await fetch(`${baseUrl}/payments/stars/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        initData: signedInitData({ id: 99, first_name: 'Buyer' }),
        starsAmount: 1,
      }),
    });

    expect(response.status).toBe(200);
    expect(refundService.refund).toHaveBeenCalledWith({
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 1,
    });
  });

  it('returns sanitized wallet history for Telegram users', async () => {
    const telegram = createTelegramMock();
    const walletHistoryService: WalletHistoryService = {
      history: vi.fn(async () => ({
        accountId: 'telegram:99',
        telegramUserId: '99',
        entries: [{
          id: 'payment:purchase_1:credit',
          kind: 'elm_credit' as const,
          status: 'settled' as const,
          title: 'ELM credited',
          description: '100 ELM credited from Stars purchase',
          occurredAt: '2026-05-17T00:00:00.000Z',
          balanceKind: 'paid_elm',
          elmAmount: 100,
          starsAmount: 1,
          paymentId: 'purchase_1',
        }],
        summary: {
          totalStarsPurchased: 1,
          totalElmCredited: 100,
          totalStarsRefunded: 0,
          totalElmRefunded: 0,
          pendingRefundStars: 0,
          pvpNetElm: 0,
        },
      })),
    };
    const baseUrl = await listen(telegram, undefined, undefined, walletHistoryService);

    const response = await fetch(`${baseUrl}/payments/wallet/history`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signedInitData({ id: 99, first_name: 'Buyer' }) }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body['entries']).toEqual([expect.objectContaining({
      kind: 'elm_credit',
      paymentId: 'purchase_1',
    })]);
    expect(JSON.stringify(body)).not.toContain('telegramPaymentChargeId');
    expect(walletHistoryService.history).toHaveBeenCalledWith({
      accountId: 'telegram:99',
      telegramUserId: '99',
    });
  });

  it('returns the current Telegram wallet balance from the account store', async () => {
    const telegram = createTelegramMock();
    const adminStore = createAdminStoreMock();
    vi.mocked(adminStore.getUser).mockResolvedValueOnce({
      accountId: 'telegram:99',
      name: 'Buyer',
      balanceKind: 'paid_elm',
      balance: 450,
      rating: 1210,
      wins: 2,
      losses: 1,
      seasonPoints: 75,
      online: false,
      queued: false,
      balanceEvents: [],
      account: {
        id: 'telegram:99',
        name: 'Buyer',
        rating: 1210,
        wins: 2,
        losses: 1,
        balance: 450,
        balanceKind: 'paid_elm',
        seasonPoints: 75,
      },
      player: undefined,
    });
    const baseUrl = await listen(telegram, undefined, undefined, undefined, adminStore);

    const response = await fetch(`${baseUrl}/payments/wallet/balance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signedInitData({ id: 99, first_name: 'Buyer' }) }),
    });

    expect(response.status).toBe(200);
    expect(adminStore.getUser).toHaveBeenCalledWith('telegram:99');
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      accountId: 'telegram:99',
      telegramUserId: '99',
      balance: 450,
      balanceKind: 'paid_elm',
      rating: 1210,
      wins: 2,
      losses: 1,
      seasonPoints: 75,
    }));
  });

  it('authenticates configured admin users', async () => {
    const telegram = createTelegramMock();
    const adminStore = createAdminStoreMock();
    const baseUrl = await listen(telegram, undefined, undefined, undefined, adminStore);

    const response = await fetch(`${baseUrl}/admin/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signedInitData({ id: 99, first_name: 'Admin' }) }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body['admin']).toEqual(expect.objectContaining({ telegramId: 99 }));
  });

  it('rejects non-admin Telegram users from admin endpoints', async () => {
    const telegram = createTelegramMock();
    const adminStore = createAdminStoreMock();
    const baseUrl = await listen(telegram, undefined, undefined, undefined, adminStore);

    const response = await fetch(`${baseUrl}/admin/stats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signedInitData({ id: 100, first_name: 'NotAdmin' }) }),
    });

    expect(response.status).toBe(403);
    const body = await response.json() as Record<string, unknown>;
    expect(body['error']).toEqual(expect.objectContaining({ code: 'admin_forbidden' }));
    expect(adminStore.getStats).not.toHaveBeenCalled();
  });

  it('returns admin stats for authorized admins', async () => {
    const telegram = createTelegramMock();
    const adminStore = createAdminStoreMock();
    const baseUrl = await listen(telegram, undefined, undefined, undefined, adminStore);

    const response = await fetch(`${baseUrl}/admin/stats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signedInitData({ id: 99, first_name: 'Admin' }), window: '7d' }),
    });

    expect(response.status).toBe(200);
    expect(adminStore.getStats).toHaveBeenCalledWith('7d');
    const body = await response.json() as Record<string, unknown>;
    expect(body['window']).toBe('7d');
  });

  it('submits admin balance adjustments through the admin store', async () => {
    const telegram = createTelegramMock();
    const adminStore = createAdminStoreMock();
    const baseUrl = await listen(telegram, undefined, undefined, undefined, adminStore);

    const response = await fetch(`${baseUrl}/admin/balance/adjust`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        initData: signedInitData({ id: 99, first_name: 'Admin' }),
        accountId: 'telegram:99',
        balanceKind: 'paid_elm',
        operation: 'credit',
        amount: 100,
        reason: 'support correction',
      }),
    });

    expect(response.status).toBe(200);
    expect(adminStore.adjustBalance).toHaveBeenCalledWith({
      admin: { telegramId: 99 },
      accountId: 'telegram:99',
      balanceKind: 'paid_elm',
      operation: 'credit',
      amount: 100,
      reason: 'support correction',
    });
  });
});

async function listen(
  telegram: TelegramBotApi,
  paymentRecorder?: PaymentEventRecorder,
  refundService?: StarsRefundService,
  walletHistoryService?: WalletHistoryService,
  adminStore?: AdminStore,
): Promise<string> {
  server = createPaymentsServer({ config, telegram, paymentRecorder, refundService, walletHistoryService, adminStore });
  await new Promise<void>(resolve => server?.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not listen on a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

function createAdminStoreMock(): AdminStore {
  return {
    getStats: vi.fn(async window => ({
      window,
      generatedAt: '2026-05-17T00:00:00.000Z',
      users: { dau: 1, wau: 1, totalAccounts: 1, totalPlayers: 1, newUsers: 1, onlinePlayers: 1 },
      matches: { total: 0, active: 0, completed: 0, queued: 0, botFallback: 0 },
      payments: { count: 0, starsAmount: 0, creditedElm: 0, refunds: 0, failed: 0 },
      balances: { paidElm: 0, demoTeml: 0 },
      recentEvents: [],
    })),
    searchUsers: vi.fn(async () => []),
    getUser: vi.fn(async () => null),
    adjustBalance: vi.fn(async () => ({
      account: {
        id: 'telegram:99',
        name: 'Admin',
        rating: 1200,
        wins: 0,
        losses: 0,
        balance: 100,
        balanceKind: 'paid_elm',
        seasonPoints: 0,
      },
      user: {
        accountId: 'telegram:99',
        name: 'Admin',
        balanceKind: 'paid_elm',
        balance: 100,
        rating: 1200,
        wins: 0,
        losses: 0,
        seasonPoints: 0,
        online: false,
        queued: false,
        balanceEvents: [],
      },
      audit: {
        requestId: 'req_1',
        adminTelegramId: '99',
        targetAccountId: 'telegram:99',
        balanceKind: 'paid_elm',
        operation: 'credit',
        previousBalance: 0,
        newBalance: 100,
        delta: 100,
        reason: 'support correction',
        createdAt: '2026-05-17T00:00:00.000Z',
      },
    })),
    getAuditEvents: vi.fn(async () => []),
  };
}

function createTelegramMock(): TelegramBotApi {
  return {
    createInvoiceLink: vi.fn(async () => 'unused'),
    answerPreCheckoutQuery: vi.fn(async () => undefined),
    sendWebAppMessage: vi.fn(async () => undefined),
    getStarTransactions: vi.fn(async () => []),
    refundStarPayment: vi.fn(async () => 'refunded' as const),
  };
}

function createPayload(packageId: string, telegramUserId: number): string {
  return createSignedInvoicePayload(
    {
      purchaseId: '0123456789abcdef',
      packageId,
      telegramUserId: String(telegramUserId),
      accountId: `telegram:${telegramUserId}`,
    },
    config.payloadSecret,
  );
}

function signedInitData(user: { id: number; first_name: string }): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify(user),
  });
  const entries = [...params.entries()].map(([key, value]) => `${key}=${value}`).sort();
  const dataCheckString = entries.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}
