import type { PlayerProfileInput } from './gameProvider/types';

export type EconomyCurrency = 'ELM' | 'tELM';
export type EconomyBalanceKind = 'paid_elm' | 'demo_teml';

export function normalizeBalanceKind(value?: string | null): EconomyBalanceKind {
  return value === 'paid_elm' ? 'paid_elm' : 'demo_teml';
}

export function currencyForUser(user?: Pick<PlayerProfileInput, 'source'> | null): EconomyCurrency {
  return user?.source === 'telegram' ? 'ELM' : 'tELM';
}

export function currencyForBalanceKind(balanceKind?: string | null): EconomyCurrency {
  return normalizeBalanceKind(balanceKind) === 'paid_elm' ? 'ELM' : 'tELM';
}

export function balanceKindForUser(user?: Pick<PlayerProfileInput, 'source'> | null): EconomyBalanceKind {
  return user?.source === 'telegram' ? 'paid_elm' : 'demo_teml';
}

export function formatCurrencyAmount(amount: number, currency: EconomyCurrency, options: { signed?: boolean } = {}): string {
  const sign = options.signed && amount > 0 ? '+' : '';
  return `${sign}${amount.toLocaleString()} ${currency}`;
}
