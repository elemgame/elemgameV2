import { describe, expect, it, vi } from 'vitest';
import {
  openTelegramStarsInvoice,
  requestStarsInvoice,
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
        elmAmount: 600,
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
      package: { id: 'stars_5', starsAmount: 5, elmAmount: 600 },
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
});
