export type AdminTimeWindow = '24h' | '7d' | '30d';
export type AdminBalanceOperation = 'credit' | 'debit' | 'set';
export type AdminBalanceKind = 'paid_elm' | 'demo_teml';

export interface AdminSession {
  admin: {
    telegramId: number;
    firstName: string;
    username?: string;
  };
}

export interface AdminStats {
  window: AdminTimeWindow;
  generatedAt: string;
  users: {
    dau: number;
    wau: number;
    totalAccounts: number;
    totalPlayers: number;
    newUsers: number;
    onlinePlayers: number;
  };
  matches: {
    total: number;
    active: number;
    completed: number;
    queued: number;
    playersOnlyAnomalies: number;
  };
  payments: {
    count: number;
    starsAmount: number;
    creditedElm: number;
    refunds: number;
    failed: number;
  };
  balances: {
    paidElm: number;
    demoTeml: number;
    seasonPoints: number;
    entryFees: number;
    refundableElm: number;
  };
  recentEvents: AdminEventSummary[];
}

export interface AdminEventSummary {
  id: string;
  matchId?: string;
  level: string;
  event: string;
  message: string;
  createdAt: string;
}

export interface AdminUserSummary {
  accountId: string;
  playerIdentity?: string;
  name: string;
  balanceKind: string;
  balance: number;
  rating: number;
  wins: number;
  losses: number;
  seasonPoints: number;
  refundableElm: number;
  online: boolean;
  activeMatchId?: string;
  queued: boolean;
  lastActivityAt?: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  account?: Record<string, unknown>;
  player?: Record<string, unknown>;
  queue?: Record<string, unknown>;
  activeMatch?: Record<string, unknown>;
  balanceEvents: AdminBalanceEvent[];
}

export interface AdminBalanceEvent {
  idempotencyKey: string;
  accountId: string;
  balanceKind: string;
  delta: number;
  balanceAfter: number;
  reasonKind: string;
  paymentId?: string;
  matchId?: string;
  actor: string;
  createdAt: string;
}

export interface AdminAuditEvent {
  requestId: string;
  adminTelegramId: string;
  targetAccountId: string;
  balanceKind: string;
  operation: AdminBalanceOperation;
  previousBalance: number;
  newBalance: number;
  delta: number;
  reason: string;
  createdAt: string;
}

export interface AdminBalanceAdjustmentResult {
  user: AdminUserDetail;
  audit: AdminAuditEvent;
}

export async function requestAdminSession(initData: string): Promise<AdminSession> {
  return requestAdminJson<AdminSession>('/admin/session', initData);
}

export async function requestAdminStats(initData: string, window: AdminTimeWindow): Promise<AdminStats> {
  return requestAdminJson<AdminStats>('/admin/stats', initData, { window });
}

export async function searchAdminUsers(initData: string, query: string): Promise<AdminUserSummary[]> {
  const response = await requestAdminJson<{ users: AdminUserSummary[] }>('/admin/users/search', initData, { query });
  return response.users;
}

export async function requestAdminUser(initData: string, accountId: string): Promise<AdminUserDetail> {
  const response = await requestAdminJson<{ user: AdminUserDetail }>('/admin/users/detail', initData, { accountId });
  return response.user;
}

export async function adjustAdminBalance(input: {
  initData: string;
  accountId: string;
  balanceKind: AdminBalanceKind;
  operation: AdminBalanceOperation;
  amount: number;
  reason: string;
}): Promise<AdminBalanceAdjustmentResult> {
  return requestAdminJson<AdminBalanceAdjustmentResult>('/admin/balance/adjust', input.initData, {
    accountId: input.accountId,
    balanceKind: input.balanceKind,
    operation: input.operation,
    amount: input.amount,
    reason: input.reason,
  });
}

export async function requestAdminAudit(initData: string, window: AdminTimeWindow): Promise<AdminAuditEvent[]> {
  const response = await requestAdminJson<{ events: AdminAuditEvent[] }>('/admin/audit', initData, { window });
  return response.events;
}

async function requestAdminJson<T>(path: string, initData: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!initData) throw new Error('Telegram admin session is missing');
  const response = await fetch(`${configuredPaymentsUrl()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData, ...body }),
  });
  const parsed = await readJsonBody(response);
  if (!response.ok) throw new Error(readApiError(parsed) ?? 'Admin request failed');
  return parsed as T;
}

function configuredPaymentsUrl(): string {
  return (import.meta.env.VITE_PAYMENTS_URL ?? import.meta.env.VITE_PAYMENT_SERVICE_URL ?? '').trim().replace(/\/+$/, '');
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readApiError(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const error = record['error'];
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>)['message'];
    if (typeof message === 'string') return message;
  }
  return undefined;
}
