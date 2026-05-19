import crypto from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import type { SpacetimeAdminConfig } from './config.js';
import { createSpacetimeSqlQuery, numberValue, sqlString, stringValue } from './spacetimeSql.js';

export type AdminTimeWindow = '24h' | '7d' | '30d';
export type BalanceOperation = 'credit' | 'debit' | 'set';
export type BalanceKind = 'paid_elm' | 'demo_teml';

export interface AdminIdentityInput {
  telegramId: number;
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
  account?: AccountRow;
  player?: PlayerRow;
  queue?: QueueEntryRow;
  activeMatch?: MatchStateRow;
  balanceEvents: AdminBalanceEvent[];
}

export interface AdminAuditEvent {
  requestId: string;
  adminTelegramId: string;
  targetAccountId: string;
  balanceKind: string;
  operation: BalanceOperation;
  previousBalance: number;
  newBalance: number;
  delta: number;
  reason: string;
  createdAt: string;
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

export interface BalanceAdjustmentInput {
  admin: AdminIdentityInput;
  accountId: string;
  balanceKind: BalanceKind;
  operation: BalanceOperation;
  amount: number;
  reason?: string;
}

export interface BalanceAdjustmentResult {
  account: AccountRow;
  user: AdminUserDetail;
  audit: AdminAuditEvent;
}

export interface AdminStore {
  getStats(window: AdminTimeWindow): Promise<AdminStats>;
  searchUsers(query: string): Promise<AdminUserSummary[]>;
  getUser(accountId: string): Promise<AdminUserDetail | null>;
  adjustBalance(input: BalanceAdjustmentInput): Promise<BalanceAdjustmentResult>;
  getAuditEvents(filter?: { accountId?: string; adminTelegramId?: string; operation?: BalanceOperation; window?: AdminTimeWindow }): Promise<AdminAuditEvent[]>;
}

interface AccountRow {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  balance: number;
  balanceKind: string;
  seasonPoints: number;
}

interface PlayerRow {
  identity: string;
  name: string;
  online: boolean;
  rating: number;
  wins: number;
  losses: number;
  balance: number;
  balanceKind: string;
  accountId: string;
  seasonPoints: number;
}

interface QueueEntryRow {
  identity: string;
  accountId: string;
  room: string;
  mode: string;
  stake: number;
  balanceKind: string;
  joinedAtMicros: number;
}

interface MatchStateRow {
  id: string;
  p1: string;
  p2: string;
  p1Name: string;
  p2Name: string;
  room: string;
  phase: string;
  status: string;
  stake: number;
  balanceKind: string;
  createdAtMicros: number;
  updatedAtMicros: number;
}

interface GameEventRow {
  id: string;
  matchId?: string;
  level: string;
  event: string;
  message: string;
  data: string;
  createdAtMicros: number;
}

interface PaymentLedgerRow {
  paymentId: string;
  accountId: string;
  starsAmount: number;
  elmAmount: number;
  refundableElmAmount: number;
  balanceKind: string;
  status: string;
  updatedAtMicros: number;
}

interface BalanceEventRow {
  idempotencyKey: string;
  accountId: string;
  balanceKind: string;
  delta: number;
  balanceAfter: number;
  reasonKind: string;
  paymentId?: string;
  matchId?: string;
  actor: string;
  createdAtMicros: number;
}

interface AdminAuditEventRow {
  requestId: string;
  adminTelegramId: string;
  targetAccountId: string;
  balanceKind: string;
  operation: BalanceOperation;
  previousBalance: number;
  newBalance: number;
  delta: number;
  reason: string;
  createdAtMicros: number;
}

export interface AdminAuditLog {
  append(row: AdminAuditEventRow): Promise<void>;
  read(): Promise<AdminAuditEventRow[]>;
}

const WINDOW_MICROS: Record<AdminTimeWindow, number> = {
  '24h': 24 * 60 * 60 * 1_000_000,
  '7d': 7 * 24 * 60 * 60 * 1_000_000,
  '30d': 30 * 24 * 60 * 60 * 1_000_000,
};

export function createSpacetimeAdminStore(
  config: SpacetimeAdminConfig,
  fetchImpl: typeof fetch = fetch,
  auditLog?: AdminAuditLog,
): AdminStore {
  const sql = createSpacetimeSqlQuery(config, fetchImpl);

  const safeSelect = async (tableName: string): Promise<Record<string, unknown>[]> => {
    try {
      return await sql(`SELECT * FROM ${tableName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('not found') ||
        message.includes('unknown') ||
        message.includes('does not exist') ||
        message.includes('no such table') ||
        message.includes('marked private')
      ) return [];
      throw err;
    }
  };

  const readState = async () => {
    const [accountsRaw, playersRaw, queueRaw, matchesRaw, eventsRaw, paymentsRaw, balanceEventsRaw, auditRows] = await Promise.all([
      safeSelect('account'),
      safeSelect('player'),
      safeSelect('queue_entry'),
      safeSelect('match_state'),
      safeSelect('game_event'),
      safeSelect('payment_ledger'),
      safeSelect('balance_event'),
      auditLog ? auditLog.read() : safeSelect('admin_audit_event').then(rows => rows.map(toAdminAuditEventRow)),
    ]);

    return {
      accounts: accountsRaw.map(toAccountRow),
      players: playersRaw.map(toPlayerRow),
      queue: queueRaw.map(toQueueEntryRow),
      matches: matchesRaw.map(toMatchStateRow),
      events: eventsRaw.map(toGameEventRow),
      payments: paymentsRaw.map(toPaymentLedgerRow),
      balanceEvents: balanceEventsRaw.map(toBalanceEventRow),
      audit: auditRows,
    };
  };

  return {
    async getStats(window) {
      const state = await readState();
      const nowMicros = Date.now() * 1000;
      const cutoff = nowMicros - WINDOW_MICROS[window];
      const dayCutoff = nowMicros - WINDOW_MICROS['24h'];
      const weekCutoff = nowMicros - WINDOW_MICROS['7d'];
      const recentEvents = state.events.filter(event => event.createdAtMicros >= cutoff);
      const activeMatches = state.matches.filter(match => match.status === 'active');
      const completedMatches = state.matches.filter(match => match.status !== 'active');
      const recentMatches = state.matches.filter(match => match.createdAtMicros >= cutoff || match.updatedAtMicros >= cutoff);
      const recentPayments = state.payments.filter(payment => payment.updatedAtMicros >= cutoff);
      const recentBalanceEvents = state.balanceEvents.filter(event => event.createdAtMicros >= cutoff);

      return {
        window,
        generatedAt: new Date().toISOString(),
        users: {
          dau: uniqueActivityCount(state.events, dayCutoff),
          wau: uniqueActivityCount(state.events, weekCutoff),
          totalAccounts: state.accounts.length,
          totalPlayers: state.players.length,
          newUsers: uniqueActivityCount(
            state.events.filter(event => event.event === 'player.connected'),
            cutoff,
          ),
          onlinePlayers: state.players.filter(player => player.online).length,
        },
        matches: {
          total: recentMatches.length,
          active: activeMatches.length,
          completed: completedMatches.filter(match => match.updatedAtMicros >= cutoff).length,
          queued: state.queue.length,
          playersOnlyAnomalies: recentMatches.filter(match => match.p2Name === 'AI Practice Bot' || match.p2.startsWith('0xb000')).length,
        },
        payments: {
          count: recentPayments.length,
          starsAmount: sum(recentPayments, payment => payment.starsAmount),
          creditedElm: sum(recentPayments.filter(payment => payment.status === 'credited'), payment => payment.elmAmount),
          refunds: recentPayments.filter(payment => payment.status === 'refunded').length,
          failed: recentPayments.filter(payment => payment.status.includes('failed')).length,
        },
        balances: {
          paidElm: sum(state.accounts.filter(account => account.balanceKind === 'paid_elm'), account => account.balance),
          demoTeml: sum(state.accounts.filter(account => account.balanceKind === 'demo_teml'), account => account.balance),
          seasonPoints: sum(state.accounts, account => account.seasonPoints),
          entryFees: Math.abs(sum(
            recentBalanceEvents.filter(event => event.reasonKind === 'match_entry_fee' && event.delta < 0),
            event => event.delta,
          )),
          refundableElm: sum(
            state.payments.filter(payment => payment.status === 'credited' && payment.balanceKind === 'paid_elm'),
            payment => payment.refundableElmAmount,
          ),
        },
        recentEvents: recentEvents
          .filter(event => event.level === 'warn' || event.level === 'error')
          .sort((a, b) => b.createdAtMicros - a.createdAtMicros)
          .slice(0, 20)
          .map(toAdminEventSummary),
      };
    },

    async searchUsers(query) {
      const state = await readState();
      const needle = query.trim().toLowerCase();
      if (!needle) return [];
      return buildUserSummaries(state)
        .filter(user => {
          const telegramId = user.accountId.startsWith('telegram:') ? user.accountId.slice('telegram:'.length) : '';
          return (
            user.accountId.toLowerCase() === needle ||
            user.playerIdentity?.toLowerCase() === needle ||
            telegramId === needle ||
            user.name.toLowerCase().includes(needle)
          );
        })
        .slice(0, 25);
    },

    async getUser(accountId) {
      const state = await readState();
      return buildUserDetail(state, accountId);
    },

    async adjustBalance(input) {
      const accountId = normalizeAccountId(input.accountId);
      const amount = validateAmount(input.operation, input.amount);
      const reason = sanitizeReason(input.reason);
      const state = await readState();
      const account = state.accounts.find(row => row.id === accountId);
      if (!account) throw new AdminStoreError('not_found', 'Account not found');
      if (account.balanceKind !== input.balanceKind) {
        throw new AdminStoreError('invalid_input', `Account balance kind is ${account.balanceKind}`);
      }

      const previousBalance = account.balance;
      const nextBalance = nextBalanceForOperation(previousBalance, input.operation, amount);
      const delta = nextBalance - previousBalance;
      const requestId = crypto.randomUUID();
      const createdAtMicros = Date.now() * 1000;

      await sql(`UPDATE account SET balance = ${nextBalance} WHERE id = ${sqlString(accountId)}`);
      await sql(`UPDATE player SET balance = ${nextBalance} WHERE account_id = ${sqlString(accountId)}`);
      if (delta !== 0) {
        await sql(
          `INSERT INTO balance_event (idempotency_key, account_id, balance_kind, delta, balance_after, reason_kind, payment_id, match_id, actor, created_at_micros) VALUES (` +
            [
              sqlString(`admin:${requestId}:balance`),
              sqlString(accountId),
              sqlString(input.balanceKind),
              String(delta),
              String(nextBalance),
              sqlString(`admin_balance_${input.operation}`),
              'NULL',
              'NULL',
              sqlString(`admin:${input.admin.telegramId}`),
              String(createdAtMicros),
            ].join(', ') +
            ')',
        );
      }
      const auditRow: AdminAuditEventRow = {
        requestId,
        adminTelegramId: String(input.admin.telegramId),
        targetAccountId: accountId,
        balanceKind: input.balanceKind,
        operation: input.operation,
        previousBalance,
        newBalance: nextBalance,
        delta,
        reason,
        createdAtMicros,
      };
      if (auditLog) {
        await auditLog.append(auditRow);
      } else {
        await sql(
          `INSERT INTO admin_audit_event (request_id, admin_telegram_id, target_account_id, balance_kind, operation, previous_balance, new_balance, delta, reason, created_at_micros) VALUES (` +
            [
              sqlString(requestId),
              sqlString(String(input.admin.telegramId)),
              sqlString(accountId),
              sqlString(input.balanceKind),
              sqlString(input.operation),
              String(previousBalance),
              String(nextBalance),
              String(delta),
              sqlString(reason),
              String(createdAtMicros),
            ].join(', ') +
            ')',
        );
      }

      const updatedAccount = { ...account, balance: nextBalance };
      const updatedState = await readState();
      const updatedUser = buildUserDetail(updatedState, accountId);
      if (!updatedUser) throw new AdminStoreError('not_found', 'Updated account not found');
      return {
        account: updatedAccount,
        user: updatedUser,
        audit: {
          ...auditRow,
          createdAt: microsToIso(auditRow.createdAtMicros),
        },
      };
    },

    async getAuditEvents(filter = {}) {
      const state = await readState();
      const cutoff = filter.window ? Date.now() * 1000 - WINDOW_MICROS[filter.window] : 0;
      return state.audit
        .filter(row => !filter.accountId || row.targetAccountId === filter.accountId)
        .filter(row => !filter.adminTelegramId || row.adminTelegramId === filter.adminTelegramId)
        .filter(row => !filter.operation || row.operation === filter.operation)
        .filter(row => row.createdAtMicros >= cutoff)
        .sort((a, b) => b.createdAtMicros - a.createdAtMicros)
        .slice(0, 100)
        .map(row => ({
          requestId: row.requestId,
          adminTelegramId: row.adminTelegramId,
          targetAccountId: row.targetAccountId,
          balanceKind: row.balanceKind,
          operation: row.operation,
          previousBalance: row.previousBalance,
          newBalance: row.newBalance,
          delta: row.delta,
          reason: row.reason,
          createdAt: microsToIso(row.createdAtMicros),
        }));
    },
  };
}

export function createJsonlAdminAuditLog(filePath: string): AdminAuditLog {
  return {
    async append(row) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendLineLocked(filePath, JSON.stringify(row));
    },
    async read() {
      try {
        const raw = await readFile(filePath, 'utf8');
        return raw
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => JSON.parse(line) as unknown)
          .map(value => toAdminAuditEventRowFromJson(value))
          .filter((row): row is AdminAuditEventRow => row !== null);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw err;
      }
    },
  };
}

let auditAppendQueue = Promise.resolve();

function appendLineLocked(filePath: string, line: string): Promise<void> {
  auditAppendQueue = auditAppendQueue.then(async () => {
    let existing = '';
    try {
      existing = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${existing}${line}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, filePath);
  });
  return auditAppendQueue;
}

function toAdminAuditEventRowFromJson(value: unknown): AdminAuditEventRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const operation = row['operation'];
  if (operation !== 'credit' && operation !== 'debit' && operation !== 'set') return null;
  return {
    requestId: stringValue(row['requestId']),
    adminTelegramId: stringValue(row['adminTelegramId']),
    targetAccountId: stringValue(row['targetAccountId']),
    balanceKind: stringValue(row['balanceKind']),
    operation,
    previousBalance: numberValue(row['previousBalance']),
    newBalance: numberValue(row['newBalance']),
    delta: numberValue(row['delta']),
    reason: stringValue(row['reason']),
    createdAtMicros: numberValue(row['createdAtMicros']),
  };
}

export class AdminStoreError extends Error {
  constructor(
    public readonly code: 'invalid_input' | 'not_found' | 'conflict',
    message: string,
  ) {
    super(message);
  }
}

function toAccountRow(row: Record<string, unknown>): AccountRow {
  return {
    id: stringValue(row['id']),
    name: stringValue(row['name']),
    rating: numberValue(row['rating']),
    wins: numberValue(row['wins']),
    losses: numberValue(row['losses']),
    balance: numberValue(row['balance']),
    balanceKind: stringValue(row['balance_kind']),
    seasonPoints: numberValue(row['season_points']),
  };
}

function toPlayerRow(row: Record<string, unknown>): PlayerRow {
  return {
    identity: stringValue(row['identity']),
    name: stringValue(row['name']),
    online: Boolean(row['online']),
    rating: numberValue(row['rating']),
    wins: numberValue(row['wins']),
    losses: numberValue(row['losses']),
    balance: numberValue(row['balance']),
    balanceKind: stringValue(row['balance_kind']),
    accountId: stringValue(row['account_id']),
    seasonPoints: numberValue(row['season_points']),
  };
}

function toQueueEntryRow(row: Record<string, unknown>): QueueEntryRow {
  return {
    identity: stringValue(row['identity']),
    accountId: stringValue(row['account_id']),
    room: stringValue(row['room']),
    mode: stringValue(row['mode']),
    stake: numberValue(row['stake']),
    balanceKind: stringValue(row['balance_kind']),
    joinedAtMicros: numberValue(row['joined_at_micros']),
  };
}

function toMatchStateRow(row: Record<string, unknown>): MatchStateRow {
  return {
    id: stringValue(row['id']),
    p1: stringValue(row['p_1']),
    p2: stringValue(row['p_2']),
    p1Name: stringValue(row['p_1_name']),
    p2Name: stringValue(row['p_2_name']),
    room: stringValue(row['room']),
    phase: stringValue(row['phase']),
    status: stringValue(row['status']),
    stake: numberValue(row['stake']),
    balanceKind: stringValue(row['balance_kind']),
    createdAtMicros: numberValue(row['created_at_micros']),
    updatedAtMicros: numberValue(row['updated_at_micros']),
  };
}

function toGameEventRow(row: Record<string, unknown>): GameEventRow {
  return {
    id: stringValue(row['id']),
    matchId: maybeStringValue(row['match_id']),
    level: stringValue(row['level']),
    event: stringValue(row['event']),
    message: stringValue(row['message']),
    data: stringValue(row['data']),
    createdAtMicros: numberValue(row['created_at_micros']),
  };
}

function toPaymentLedgerRow(row: Record<string, unknown>): PaymentLedgerRow {
  return {
    paymentId: stringValue(row['payment_id']),
    accountId: stringValue(row['account_id']),
    starsAmount: numberValue(row['stars_amount']),
    elmAmount: numberValue(row['elm_amount']),
    refundableElmAmount: numberValue(row['refundable_elm_amount']),
    balanceKind: stringValue(row['balance_kind']),
    status: stringValue(row['status']),
    updatedAtMicros: numberValue(row['updated_at_micros']),
  };
}

function toBalanceEventRow(row: Record<string, unknown>): BalanceEventRow {
  return {
    idempotencyKey: stringValue(row['idempotency_key']),
    accountId: stringValue(row['account_id']),
    balanceKind: stringValue(row['balance_kind']),
    delta: numberValue(row['delta']),
    balanceAfter: numberValue(row['balance_after']),
    reasonKind: stringValue(row['reason_kind']),
    matchId: maybeStringValue(row['match_id']),
    paymentId: maybeStringValue(row['payment_id']),
    actor: stringValue(row['actor']),
    createdAtMicros: numberValue(row['created_at_micros']),
  };
}

function toAdminAuditEventRow(row: Record<string, unknown>): AdminAuditEventRow {
  return {
    requestId: stringValue(row['request_id']),
    adminTelegramId: stringValue(row['admin_telegram_id']),
    targetAccountId: stringValue(row['target_account_id']),
    balanceKind: stringValue(row['balance_kind']),
    operation: balanceOperationValue(row['operation']),
    previousBalance: numberValue(row['previous_balance']),
    newBalance: numberValue(row['new_balance']),
    delta: numberValue(row['delta']),
    reason: stringValue(row['reason']),
    createdAtMicros: numberValue(row['created_at_micros']),
  };
}

function buildUserSummaries(state: Awaited<ReturnType<ReturnType<typeof createStateReader>>>): AdminUserSummary[] {
  return state.accounts.map(account => summarizeUser(state, account)).sort((a, b) => a.accountId.localeCompare(b.accountId));
}

function createStateReader() {
  return async () => ({
    accounts: [] as AccountRow[],
    players: [] as PlayerRow[],
    queue: [] as QueueEntryRow[],
    matches: [] as MatchStateRow[],
    events: [] as GameEventRow[],
    payments: [] as PaymentLedgerRow[],
    balanceEvents: [] as BalanceEventRow[],
    audit: [] as AdminAuditEventRow[],
  });
}

type AdminState = Awaited<ReturnType<ReturnType<typeof createStateReader>>>;

function buildUserDetail(state: AdminState, accountId: string): AdminUserDetail | null {
  const account = state.accounts.find(row => row.id === accountId);
  if (!account) return null;
  const summary = summarizeUser(state, account);
  const player = state.players.find(row => row.accountId === account.id);
  const queue = player ? state.queue.find(row => row.identity === player.identity) : undefined;
  const activeMatch = player
    ? state.matches.find(row => row.status === 'active' && (row.p1 === player.identity || row.p2 === player.identity))
    : undefined;
  return {
    ...summary,
    account,
    ...(player ? { player } : {}),
    ...(queue ? { queue } : {}),
    ...(activeMatch ? { activeMatch } : {}),
    balanceEvents: state.balanceEvents
      .filter(event => event.accountId === account.id)
      .sort((a, b) => b.createdAtMicros - a.createdAtMicros)
      .slice(0, 20)
      .map(toAdminBalanceEvent),
  };
}

function summarizeUser(state: AdminState, account: AccountRow): AdminUserSummary {
  const player = state.players.find(row => row.accountId === account.id);
  const queue = player ? state.queue.find(row => row.identity === player.identity) : undefined;
  const activeMatch = player
    ? state.matches.find(row => row.status === 'active' && (row.p1 === player.identity || row.p2 === player.identity))
    : undefined;
  const lastActivityMicros = player
    ? Math.max(
        0,
        ...state.events
          .filter(event => event.data.includes(player.identity.replace(/^0x/, '')) || event.message.includes(player.name))
          .map(event => event.createdAtMicros),
      )
    : 0;
  return {
    accountId: account.id,
    ...(player ? { playerIdentity: player.identity } : {}),
    name: player?.name || account.name,
    balanceKind: account.balanceKind,
    balance: account.balance,
    rating: player?.rating ?? account.rating,
    wins: player?.wins ?? account.wins,
    losses: player?.losses ?? account.losses,
    seasonPoints: player?.seasonPoints ?? account.seasonPoints,
    refundableElm: sum(
      state.payments.filter(payment => (
        payment.accountId === account.id &&
        payment.status === 'credited' &&
        payment.balanceKind === 'paid_elm'
      )),
      payment => payment.refundableElmAmount,
    ),
    online: player?.online ?? false,
    ...(activeMatch ? { activeMatchId: activeMatch.id } : {}),
    queued: Boolean(queue),
    ...(lastActivityMicros > 0 ? { lastActivityAt: microsToIso(lastActivityMicros) } : {}),
  };
}

function uniqueActivityCount(events: GameEventRow[], cutoffMicros: number): number {
  const identities = new Set<string>();
  for (const event of events) {
    if (event.createdAtMicros < cutoffMicros) continue;
    const match = event.data.match(/[a-f0-9]{64}/i);
    if (match) identities.add(match[0].toLowerCase());
  }
  return identities.size;
}

function toAdminEventSummary(event: GameEventRow): AdminEventSummary {
  return {
    id: event.id,
    ...(event.matchId ? { matchId: event.matchId } : {}),
    level: event.level,
    event: event.event,
    message: event.message,
    createdAt: microsToIso(event.createdAtMicros),
  };
}

function toAdminBalanceEvent(event: BalanceEventRow): AdminBalanceEvent {
  return {
    idempotencyKey: event.idempotencyKey,
    accountId: event.accountId,
    balanceKind: event.balanceKind,
    delta: event.delta,
    balanceAfter: event.balanceAfter,
    reasonKind: event.reasonKind,
    ...(event.paymentId ? { paymentId: event.paymentId } : {}),
    ...(event.matchId ? { matchId: event.matchId } : {}),
    actor: event.actor,
    createdAt: microsToIso(event.createdAtMicros),
  };
}

function nextBalanceForOperation(previousBalance: number, operation: BalanceOperation, amount: number): number {
  if (operation === 'credit') return previousBalance + amount;
  if (operation === 'set') return amount;
  const next = previousBalance - amount;
  if (next < 0) throw new AdminStoreError('conflict', 'Debit would make balance negative');
  return next;
}

function validateAmount(operation: BalanceOperation, amount: number): number {
  if (!['credit', 'debit', 'set'].includes(operation)) {
    throw new AdminStoreError('invalid_input', 'Unknown balance operation');
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new AdminStoreError('invalid_input', 'Amount must be a non-negative integer');
  }
  if ((operation === 'credit' || operation === 'debit') && amount <= 0) {
    throw new AdminStoreError('invalid_input', 'Amount must be positive');
  }
  return amount;
}

function normalizeAccountId(accountId: string): string {
  const trimmed = accountId.trim().toLowerCase();
  if (!trimmed || trimmed.length > 128 || !/^[a-z0-9:_-]+$/.test(trimmed)) {
    throw new AdminStoreError('invalid_input', 'Invalid account ID');
  }
  return trimmed;
}

function sanitizeReason(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 240);
}

function maybeStringValue(value: unknown): string | undefined {
  const string = stringValue(value);
  return string || undefined;
}

function balanceOperationValue(value: unknown): BalanceOperation {
  return value === 'credit' || value === 'debit' || value === 'set' ? value : 'credit';
}

function sum<T>(rows: T[], selector: (row: T) => number): number {
  return rows.reduce((total, row) => total + selector(row), 0);
}

function microsToIso(value: number): string {
  return new Date(Math.floor(value / 1000)).toISOString();
}
