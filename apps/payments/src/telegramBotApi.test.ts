import { describe, expect, it, vi } from 'vitest';
import { createTelegramBotApi, TelegramBotApiError } from './telegramBotApi.js';

describe('Telegram Bot API client', () => {
  it('creates Stars invoice links with XTR currency and package price', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      result: 'https://t.me/$invoice/test',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
    const telegram = createTelegramBotApi('123:test', 'https://api.telegram.test', fetchImpl);

    await expect(telegram.createInvoiceLink({
      title: '100 ELM',
      description: 'Top up 100 paid ELM',
      payload: 'signed_payload',
      starsAmount: 1,
      elmAmount: 100,
    })).resolves.toBe('https://t.me/$invoice/test');

    expect(fetchImpl).toHaveBeenCalledWith('https://api.telegram.test/bot123:test/createInvoiceLink', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        title: '100 ELM',
        description: 'Top up 100 paid ELM',
        payload: 'signed_payload',
        currency: 'XTR',
        prices: [{ label: '100 ELM', amount: 1 }],
      }),
    }));
  });

  it('marks confirmed Stars refund API failures as confirmed failures', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      description: 'BAD_REQUEST',
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
    const telegram = createTelegramBotApi('123:test', 'https://api.telegram.test', fetchImpl);

    await expect(telegram.refundStarPayment({
      telegramUserId: '99',
      telegramPaymentChargeId: 'charge_123',
    })).rejects.toMatchObject({
      name: 'TelegramBotApiError',
      confirmedFailure: true,
    } satisfies Partial<TelegramBotApiError>);
  });
});
