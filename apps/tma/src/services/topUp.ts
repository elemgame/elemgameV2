import {
  ELM_STARS_PACKAGES,
  type ElmStarsPackageId,
  type TelegramInvoiceStatus,
} from './payments';
import type { EconomyCurrency } from './economy';

export type TopUpMode = 'demo' | 'telegram';

export type TopUpStatus =
  | 'idle'
  | 'loading_invoice'
  | 'pending'
  | 'success'
  | 'canceled'
  | 'failed'
  | 'unavailable';

export interface TopUpPackage {
  id: ElmStarsPackageId;
  starsAmount: number;
  elmAmount: number;
  currency: EconomyCurrency;
}

export interface TopUpState {
  status: TopUpStatus;
  packageId?: ElmStarsPackageId;
  message?: string;
}

export const TOP_UP_PACKAGES: readonly TopUpPackage[] = ELM_STARS_PACKAGES.map((pkg) => ({
  id: pkg.id,
  starsAmount: pkg.starsAmount,
  elmAmount: pkg.elmAmount,
  currency: 'ELM',
}));

export function topUpPackagesForCurrency(currency: EconomyCurrency): readonly TopUpPackage[] {
  return TOP_UP_PACKAGES.map((pkg) => ({ ...pkg, currency }));
}

export function findTopUpPackage(packageId: ElmStarsPackageId): TopUpPackage {
  const pkg = TOP_UP_PACKAGES.find((item) => item.id === packageId);
  if (!pkg) throw new Error('Unknown top-up package');
  return pkg;
}

export function topUpStateForInvoiceStatus(status: TelegramInvoiceStatus): TopUpState {
  switch (status) {
    case 'paid':
      return { status: 'pending', message: 'Waiting for balance update.' };
    case 'cancelled':
      return { status: 'canceled', message: 'Payment canceled. No ELM added.' };
    case 'pending':
      return { status: 'pending', message: 'Payment pending.' };
    case 'failed':
      return { status: 'failed', message: 'Payment failed.' };
    case 'unknown':
      return { status: 'failed', message: 'Payment status unknown.' };
  }
}

export function nextDemoBalance(currentBalance: number, packageId: ElmStarsPackageId): number {
  return currentBalance + findTopUpPackage(packageId).elmAmount;
}
