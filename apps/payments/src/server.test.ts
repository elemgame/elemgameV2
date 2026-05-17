import crypto from 'crypto';
import type http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  PAYMENT_PAYLOAD_SECRET: 'test_payment_secret',
  PAYMENTS_PORT: '3002',
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
      elmAmount: 1300,
    }));
  });

  it('rejects browser/demo requests without Telegram init data', async () => {
    const telegram: TelegramBotApi = {
      createInvoiceLink: vi.fn(async () => 'unused'),
      answerPreCheckoutQuery: vi.fn(async () => undefined),
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
      elmAmount: 1300,
      telegramPaymentChargeId: 'charge_123',
    }));
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
});

async function listen(
  telegram: TelegramBotApi,
  paymentRecorder?: PaymentEventRecorder,
  refundService?: StarsRefundService,
  walletHistoryService?: WalletHistoryService,
): Promise<string> {
  server = createPaymentsServer({ config, telegram, paymentRecorder, refundService, walletHistoryService });
  await new Promise<void>(resolve => server?.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not listen on a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

function createTelegramMock(): TelegramBotApi {
  return {
    createInvoiceLink: vi.fn(async () => 'unused'),
    answerPreCheckoutQuery: vi.fn(async () => undefined),
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
