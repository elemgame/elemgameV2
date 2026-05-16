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
      elmAmount: 1300,
      telegramPaymentChargeId: 'charge_123',
      invoicePayload: 'payload',
    });

    expect(recordStarsPayment).toHaveBeenCalledWith({
      paymentId: '0123456789abcdef',
      accountId: 'telegram:99',
      telegramUserId: '99',
      starsAmount: 10,
      elmAmount: 1300,
      telegramPaymentChargeId: 'charge_123',
      invoicePayload: 'payload',
    });
  });
});
