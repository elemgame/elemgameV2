import { describe, expect, it, vi } from 'vitest';
import { createSpacetimePaymentRecorder } from './spacetimeRecorder.js';

describe('SpacetimeDB payment recorder', () => {
  it('calls the trusted payment reducer with successful payment fields', async () => {
    const recordStarsPayment = vi.fn(async () => undefined);
    const recorder = createSpacetimePaymentRecorder(
      {
        uri: 'http://localhost:3000',
        database: 'elmental-test',
        token: 'test-token',
      },
      async () => ({
        reducers: { recordStarsPayment },
        disconnect: vi.fn(),
      }),
    );

    await recorder.recordSuccessfulPayment({
      purchaseId: '0123456789abcdef',
      accountId: 'telegram:99',
      telegramUserId: '99',
      packageId: 'stars_10',
      starsAmount: 10,
      elmAmount: 1000,
      telegramPaymentChargeId: 'charge_123',
      invoicePayload: 'payload',
    });

    expect(recordStarsPayment).toHaveBeenCalledWith({
      paymentId: '0123456789abcdef',
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 10,
      elmAmount: 1000,
      telegramPaymentChargeId: 'charge_123',
      invoicePayload: 'payload',
    });
  });

  it('does not replay exact duplicate successful payment credits in one process', async () => {
    const recordStarsPayment = vi.fn(async () => undefined);
    const recorder = createSpacetimePaymentRecorder(
      {
        uri: 'http://localhost:3000',
        database: 'elmental-test',
        token: 'test-token',
      },
      async () => ({
        reducers: { recordStarsPayment },
        disconnect: vi.fn(),
      }),
    );
    const event = {
      purchaseId: '0123456789abcdef',
      accountId: 'telegram:99',
      telegramUserId: '99',
      packageId: 'stars_1',
      starsAmount: 1,
      elmAmount: 100,
      telegramPaymentChargeId: 'charge_123',
      invoicePayload: 'payload',
    };

    await recorder.recordSuccessfulPayment(event);
    await recorder.recordSuccessfulPayment(event);

    expect(recordStarsPayment).toHaveBeenCalledTimes(1);
  });
});
