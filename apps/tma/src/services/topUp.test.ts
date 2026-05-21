import { describe, expect, it } from 'vitest';
import {
  findTopUpPackage,
  nextDemoBalance,
  topUpPackagesForCurrency,
  topUpStateForInvoiceStatus,
} from './topUp';

describe('top-up helpers', () => {
  it('uses the MVP package semantics for ELM and tELM', () => {
    expect(topUpPackagesForCurrency('ELM')).toMatchObject([
      { id: 'stars_1', starsAmount: 1, elmAmount: 100, currency: 'ELM' },
      { id: 'stars_5', starsAmount: 5, elmAmount: 500, currency: 'ELM' },
      { id: 'stars_10', starsAmount: 10, elmAmount: 1000, currency: 'ELM' },
    ]);
    expect(topUpPackagesForCurrency('tELM')[0]).toMatchObject({
      id: 'stars_1',
      elmAmount: 100,
      currency: 'tELM',
    });
  });

  it('maps Telegram paid to pending until server balance confirms credit', () => {
    expect(topUpStateForInvoiceStatus('paid')).toEqual({
      status: 'pending',
      message: 'Waiting for balance update.',
    });
    expect(topUpStateForInvoiceStatus('cancelled')).toEqual({
      status: 'canceled',
      message: 'Payment canceled. No ELM added.',
    });
    expect(topUpStateForInvoiceStatus('failed')).toMatchObject({ status: 'failed' });
    expect(topUpStateForInvoiceStatus('unknown')).toMatchObject({ status: 'failed' });
  });

  it('calculates deterministic demo top-up balance without payment APIs', () => {
    expect(findTopUpPackage('stars_10').elmAmount).toBe(1000);
    expect(nextDemoBalance(250, 'stars_5')).toBe(750);
  });
});
