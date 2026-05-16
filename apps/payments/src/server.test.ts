import crypto from 'crypto';
import type http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';
import { createPaymentsServer } from './server.js';
import type { TelegramBotApi } from './telegramBotApi.js';

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
});

async function listen(telegram: TelegramBotApi): Promise<string> {
  server = createPaymentsServer({ config, telegram });
  await new Promise<void>(resolve => server?.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not listen on a TCP port');
  return `http://127.0.0.1:${address.port}`;
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
