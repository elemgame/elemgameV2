import { describe, expect, it, vi } from 'vitest';
import {
  openTelegramStarsInvoice,
  requestStarsRefund,
  requestStarsRefundQuote,
  requestStarsInvoice,
  requestWalletBalance,
  requestWalletHistory,
} from './payments';

describe('TMA Stars payments', () => {
  it('requests a Stars invoice from the configured payment service', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      purchaseId: 'purchase_1',
      accountId: 'telegram:123',
      currency: 'XTR',
      invoiceLink: 'https://t.me/$invoice/test',
      package: {
        id: 'stars_5',
        starsAmount: 5,
        elmAmount: 500,
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    const invoice = await requestStarsInvoice({
      initData: 'signed-init-data',
      packageId: 'stars_5',
      paymentsUrl: 'https://payments.example.test/',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://payments.example.test/payments/stars/invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        initData: 'signed-init-data',
        packageId: 'stars_5',
      }),
    });
    expect(invoice).toMatchObject({
      purchaseId: 'purchase_1',
      accountId: 'telegram:123',
      currency: 'XTR',
      invoiceLink: 'https://t.me/$invoice/test',
      package: { id: 'stars_5', starsAmount: 5, elmAmount: 500 },
    });
  });

  it('does not request invoices without a payment service URL', async () => {
    await expect(requestStarsInvoice({
      initData: 'signed-init-data',
      packageId: 'stars_1',
      paymentsUrl: '',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })).rejects.toThrow('Payments service URL is not configured');
  });

  it('opens invoices through Telegram WebApp openInvoice', async () => {
    const openInvoice = vi.fn((_url: string, cb?: (status: string) => void) => {
      cb?.('paid');
    });
    Object.defineProperty(globalThis, 'window', {
      value: {
        Telegram: {
          WebApp: {
            initData: 'signed-init-data',
            initDataUnsafe: {},
            openInvoice,
          },
        },
      },
      configurable: true,
      writable: true,
    });

    await expect(openTelegramStarsInvoice('https://t.me/$invoice/test')).resolves.toBe('paid');
    expect(openInvoice).toHaveBeenCalledWith('https://t.me/$invoice/test', expect.any(Function));
  });

  it('normalizes Telegram invoice statuses and rejects missing invoice support', async () => {
    const openInvoice = vi.fn((_url: string, cb?: (status: string) => void) => {
      cb?.('cancelled');
    });
    Object.defineProperty(globalThis, 'window', {
      value: {
        Telegram: {
          WebApp: {
            initData: 'signed-init-data',
            initDataUnsafe: {},
            openInvoice,
          },
        },
      },
      configurable: true,
      writable: true,
    });

    await expect(openTelegramStarsInvoice('https://t.me/$invoice/test')).resolves.toBe('cancelled');

    openInvoice.mockImplementationOnce((_url: string, cb?: (status: string) => void) => {
      cb?.('unexpected');
    });
    await expect(openTelegramStarsInvoice('https://t.me/$invoice/test')).resolves.toBe('unknown');

    Object.defineProperty(globalThis, 'window', {
      value: { Telegram: { WebApp: { initData: 'signed-init-data', initDataUnsafe: {} } } },
      configurable: true,
      writable: true,
    });
    expect(() => openTelegramStarsInvoice('https://t.me/$invoice/test')).toThrow('Telegram invoices are unavailable');
  });

  it('requests a Stars refund quote from the payment service', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      accountId: 'telegram:123',
      telegramUserId: '123',
      refundableStarsAmount: 1,
      refundableElmAmount: 100,
      lots: [{ paymentId: 'purchase_1', starsAmount: 1, elmAmount: 100 }],
      nextLot: { paymentId: 'purchase_1', starsAmount: 1, elmAmount: 100 },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(requestStarsRefundQuote({
      initData: 'signed-init-data',
      paymentsUrl: 'https://payments.example.test',
      fetchImpl,
    })).resolves.toMatchObject({
      refundableStarsAmount: 1,
      nextLot: { starsAmount: 1, elmAmount: 100 },
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://payments.example.test/payments/stars/refund/quote', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ initData: 'signed-init-data' }),
    }));
  });

  it('requests a Stars refund execution from the payment service', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      accountId: 'telegram:123',
      telegramUserId: '123',
      refundedStarsAmount: 1,
      refundedElmAmount: 100,
      refundedLots: [{ paymentId: 'purchase_1', starsAmount: 1, elmAmount: 100 }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(requestStarsRefund({
      initData: 'signed-init-data',
      starsAmount: 1,
      paymentsUrl: 'https://payments.example.test',
      fetchImpl,
    })).resolves.toMatchObject({
      refundedStarsAmount: 1,
      refundedElmAmount: 100,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://payments.example.test/payments/stars/refund', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ initData: 'signed-init-data', starsAmount: 1 }),
    }));
  });

  it('requests sanitized wallet history from the payment service', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      accountId: 'telegram:123',
      telegramUserId: '123',
      entries: [{
        id: 'payment:purchase_1:credit',
        kind: 'elm_credit',
        status: 'settled',
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
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(requestWalletHistory({
      initData: 'signed-init-data',
      paymentsUrl: 'https://payments.example.test',
      fetchImpl,
    })).resolves.toMatchObject({
      summary: { totalElmCredited: 100 },
      entries: [expect.objectContaining({ kind: 'elm_credit' })],
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://payments.example.test/payments/wallet/history', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ initData: 'signed-init-data' }),
    }));
  });

  it('requests the current wallet balance from the payment service', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      accountId: 'telegram:123',
      telegramUserId: '123',
      name: 'Buyer',
      balance: 450,
      balanceKind: 'paid_elm',
      rating: 1210,
      wins: 2,
      losses: 1,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(requestWalletBalance({
      initData: 'signed-init-data',
      paymentsUrl: 'https://payments.example.test',
      fetchImpl,
    })).resolves.toMatchObject({
      accountId: 'telegram:123',
      balance: 450,
      balanceKind: 'paid_elm',
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://payments.example.test/payments/wallet/balance', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ initData: 'signed-init-data' }),
    }));
  });
});
