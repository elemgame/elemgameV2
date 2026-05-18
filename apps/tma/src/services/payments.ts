import { getTelegramWebApp } from './telegram';

export const ELM_STARS_PACKAGES = [
  { id: 'stars_1', starsAmount: 1, elmAmount: 100 },
  { id: 'stars_5', starsAmount: 5, elmAmount: 500 },
  { id: 'stars_10', starsAmount: 10, elmAmount: 1000 },
] as const;

export type ElmStarsPackage = (typeof ELM_STARS_PACKAGES)[number];
export type ElmStarsPackageId = ElmStarsPackage['id'];

export interface StarsInvoiceResponse {
  purchaseId: string;
  accountId: string;
  currency: 'XTR';
  invoiceLink: string;
  package: ElmStarsPackage;
}

export interface StarsRefundLot {
  paymentId: string;
  starsAmount: number;
  elmAmount: number;
}

export interface StarsRefundQuote {
  accountId: string;
  telegramUserId: string;
  refundableStarsAmount: number;
  refundableElmAmount: number;
  lots: StarsRefundLot[];
  nextLot?: StarsRefundLot;
  note?: string;
}

export interface StarsRefundResult {
  accountId: string;
  telegramUserId: string;
  refundedStarsAmount: number;
  refundedElmAmount: number;
  refundedLots: StarsRefundLot[];
}

export type WalletHistoryEntryKind =
  | 'stars_purchase'
  | 'elm_credit'
  | 'stars_refund'
  | 'pvp_stake'
  | 'pvp_boost_stake'
  | 'pvp_win'
  | 'pvp_draw_refund'
  | 'pvp_boost_return';

export type WalletHistoryStatus = 'settled' | 'pending' | 'failed';

export interface WalletHistoryEntry {
  id: string;
  kind: WalletHistoryEntryKind;
  status: WalletHistoryStatus;
  title: string;
  description: string;
  occurredAt: string;
  balanceKind: string;
  elmAmount: number;
  starsAmount?: number;
  paymentId?: string;
  matchId?: string;
}

export interface WalletHistorySummary {
  totalStarsPurchased: number;
  totalElmCredited: number;
  totalStarsRefunded: number;
  totalElmRefunded: number;
  pendingRefundStars: number;
  pvpNetElm: number;
}

export interface WalletHistoryResponse {
  accountId: string;
  telegramUserId: string;
  entries: WalletHistoryEntry[];
  summary: WalletHistorySummary;
}

export interface WalletBalanceResponse {
  accountId: string;
  telegramUserId: string;
  name: string;
  balance: number;
  balanceKind: string;
  rating: number;
  wins: number;
  losses: number;
}

export type TelegramInvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending' | 'unknown';

interface RequestStarsInvoiceInput {
  initData: string;
  packageId: ElmStarsPackageId;
  paymentsUrl?: string;
  fetchImpl?: typeof fetch;
}

interface RequestStarsRefundInput {
  initData: string;
  starsAmount: number;
  paymentsUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function requestStarsInvoice(input: RequestStarsInvoiceInput): Promise<StarsInvoiceResponse> {
  if (!input.initData) {
    throw new Error('Telegram session is missing');
  }

  const selectedPackage = findElmStarsPackage(input.packageId);
  if (!selectedPackage) {
    throw new Error('Unknown ELM package');
  }

  const paymentsUrl = normalizePaymentsUrl(input.paymentsUrl ?? configuredPaymentsUrl());
  if (!paymentsUrl) {
    throw new Error('Payments service URL is not configured');
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${paymentsUrl}/payments/stars/invoice`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      initData: input.initData,
      packageId: input.packageId,
    }),
  });

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw new Error(readApiError(body) ?? 'Invoice request failed');
  }

  return parseInvoiceResponse(body, selectedPackage);
}

export function openTelegramStarsInvoice(invoiceLink: string): Promise<TelegramInvoiceStatus> {
  const twa = getTelegramWebApp();
  const openInvoice = twa?.openInvoice;
  if (!twa || !openInvoice) {
    throw new Error('Telegram invoices are unavailable in this session');
  }

  return new Promise((resolve) => {
    openInvoice.call(twa, invoiceLink, status => {
      resolve(normalizeInvoiceStatus(status));
    });
  });
}

export async function requestStarsRefundQuote(input: Omit<RequestStarsRefundInput, 'starsAmount'>): Promise<StarsRefundQuote> {
  return requestPaymentsJson<StarsRefundQuote>({
    path: '/payments/stars/refund/quote',
    initData: input.initData,
    paymentsUrl: input.paymentsUrl,
    fetchImpl: input.fetchImpl,
  });
}

export async function requestStarsRefund(input: RequestStarsRefundInput): Promise<StarsRefundResult> {
  if (!Number.isInteger(input.starsAmount) || input.starsAmount <= 0) {
    throw new Error('Refund Stars amount must be positive');
  }
  return requestPaymentsJson<StarsRefundResult>({
    path: '/payments/stars/refund',
    initData: input.initData,
    paymentsUrl: input.paymentsUrl,
    fetchImpl: input.fetchImpl,
    body: { starsAmount: input.starsAmount },
  });
}

export async function requestWalletHistory(input: Omit<RequestStarsRefundInput, 'starsAmount'>): Promise<WalletHistoryResponse> {
  return requestPaymentsJson<WalletHistoryResponse>({
    path: '/payments/wallet/history',
    initData: input.initData,
    paymentsUrl: input.paymentsUrl,
    fetchImpl: input.fetchImpl,
  });
}

export async function requestWalletBalance(input: Omit<RequestStarsRefundInput, 'starsAmount'>): Promise<WalletBalanceResponse> {
  return requestPaymentsJson<WalletBalanceResponse>({
    path: '/payments/wallet/balance',
    initData: input.initData,
    paymentsUrl: input.paymentsUrl,
    fetchImpl: input.fetchImpl,
  });
}

export function findElmStarsPackage(packageId: string): ElmStarsPackage | undefined {
  return ELM_STARS_PACKAGES.find(pkg => pkg.id === packageId);
}

function configuredPaymentsUrl(): string {
  return import.meta.env.VITE_PAYMENTS_URL ?? import.meta.env.VITE_PAYMENT_SERVICE_URL ?? '';
}

async function requestPaymentsJson<T>(input: {
  path: string;
  initData: string;
  paymentsUrl?: string;
  fetchImpl?: typeof fetch;
  body?: Record<string, unknown>;
}): Promise<T> {
  if (!input.initData) throw new Error('Telegram session is missing');
  const paymentsUrl = normalizePaymentsUrl(input.paymentsUrl ?? configuredPaymentsUrl());
  if (!paymentsUrl) throw new Error('Payments service URL is not configured');

  const response = await (input.fetchImpl ?? fetch)(`${paymentsUrl}${input.path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      initData: input.initData,
      ...input.body,
    }),
  });
  const body = await readJsonBody(response);
  if (!response.ok) throw new Error(readApiError(body) ?? 'Payments request failed');
  if (!isRecord(body)) throw new Error('Invalid payments response');
  return body as T;
}

function normalizePaymentsUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readApiError(body: unknown): string | null {
  if (!isRecord(body) || typeof body.error !== 'string') return null;
  return body.error;
}

function parseInvoiceResponse(body: unknown, fallbackPackage: ElmStarsPackage): StarsInvoiceResponse {
  if (!isRecord(body)) throw new Error('Invalid invoice response');
  const invoiceLink = typeof body.invoiceLink === 'string' ? body.invoiceLink : '';
  const purchaseId = typeof body.purchaseId === 'string' ? body.purchaseId : '';
  const accountId = typeof body.accountId === 'string' ? body.accountId : '';
  const currency = body.currency === 'XTR' ? body.currency : null;
  const responsePackage = parsePackage(body.package) ?? fallbackPackage;

  if (!invoiceLink || !purchaseId || !accountId || !currency) {
    throw new Error('Invalid invoice response');
  }

  return {
    purchaseId,
    accountId,
    currency,
    invoiceLink,
    package: responsePackage,
  };
}

function parsePackage(value: unknown): ElmStarsPackage | null {
  if (!isRecord(value)) return null;
  const packageId = typeof value.id === 'string' ? value.id : '';
  const knownPackage = findElmStarsPackage(packageId);
  if (!knownPackage) return null;
  return knownPackage;
}

function normalizeInvoiceStatus(status: string | undefined): TelegramInvoiceStatus {
  if (status === 'paid' || status === 'cancelled' || status === 'failed' || status === 'pending') {
    return status;
  }
  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
