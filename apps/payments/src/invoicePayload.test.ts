import { describe, expect, it } from 'vitest';
import { createSignedInvoicePayload, verifySignedInvoicePayload } from './invoicePayload.js';

const secret = 'test_secret';

describe('invoice payload signing', () => {
  it('creates a compact Telegram-safe signed payload', () => {
    const claims = {
      purchaseId: '0123456789abcdef',
      packageId: 'stars_5',
      telegramUserId: '123456789',
      accountId: 'telegram:123456789',
    };

    const payload = createSignedInvoicePayload(claims, secret);

    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(128);
    expect(verifySignedInvoicePayload(payload, secret)).toEqual(claims);
  });

  it('rejects tampered payloads', () => {
    const payload = createSignedInvoicePayload(
      {
        purchaseId: '0123456789abcdef',
        packageId: 'stars_1',
        telegramUserId: '123456789',
        accountId: 'telegram:123456789',
      },
      secret,
    );

    expect(verifySignedInvoicePayload(payload.replace('stars_1', 'stars_10'), secret)).toBeNull();
  });
});
