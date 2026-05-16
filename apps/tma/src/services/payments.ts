import { getTelegramWebApp } from './telegram';

export const ELM_STARS_PACKAGES = [
  { id: 'stars_1', starsAmount: 1, elmAmount: 100 },
  { id: 'stars_5', starsAmount: 5, elmAmount: 600 },
  { id: 'stars_10', starsAmount: 10, elmAmount: 1300 },
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

export type TelegramInvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending' | 'unknown';

interface RequestStarsInvoiceInput {
  initData: string;
  packageId: ElmStarsPackageId;
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

export function findElmStarsPackage(packageId: string): ElmStarsPackage | undefined {
  return ELM_STARS_PACKAGES.find(pkg => pkg.id === packageId);
}

function configuredPaymentsUrl(): string {
  return import.meta.env.VITE_PAYMENTS_URL ?? import.meta.env.VITE_PAYMENT_SERVICE_URL ?? '';
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
