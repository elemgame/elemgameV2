import { DbConnection } from './module_bindings/index.js';
import type { SpacetimeCreditConfig } from './config.js';
import type { MatchState, PaymentLedger, Player } from './module_bindings/types.js';

const PAID_ELM_BALANCE_KIND = 'paid_elm';
const PAYMENT_STATUS_CREDITED = 'credited';
const PAYMENT_STATUS_REFUND_PENDING = 'refund_pending';
const PAYMENT_STATUS_REFUNDED = 'refunded';

export type WalletHistoryEntryKind =
  | 'stars_purchase'
  | 'elm_credit'
  | 'stars_refund'
  | 'match_entry_fee'
  | 'match_boost_cost'
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

export interface WalletHistoryService {
  history(input: { accountId: string; telegramUserId: string }): Promise<WalletHistoryResponse>;
  dispose?(): void;
}

interface HistoryConnection {
  db: {
    paymentLedger: { iter(): Iterable<PaymentLedger> };
    player: { iter(): Iterable<Player> };
    matchState: { iter(): Iterable<MatchState> };
  };
  disconnect(): void;
}

type ConnectHistory = (config: SpacetimeCreditConfig) => Promise<HistoryConnection>;

export function createWalletHistoryService(
  config: SpacetimeCreditConfig,
  connect: ConnectHistory = connectHistory,
): WalletHistoryService {
  let connectionPromise: Promise<HistoryConnection> | null = null;
  let connection: HistoryConnection | null = null;

  async function getConnection(): Promise<HistoryConnection> {
    if (connection) return connection;
    connectionPromise ??= connect(config).then(conn => {
      connection = conn;
      return conn;
    }).catch(err => {
      connectionPromise = null;
      throw err;
    });
    return connectionPromise;
  }

  return {
    async history(input) {
      const conn = await getConnection();
      return buildWalletHistory(conn, input.accountId, input.telegramUserId);
    },

    dispose(): void {
      connection?.disconnect();
      connection = null;
      connectionPromise = null;
    },
  };
}

function buildWalletHistory(
  conn: HistoryConnection,
  accountId: string,
  telegramUserId: string,
): WalletHistoryResponse {
  const entries = [
    ...paymentEntries(conn, accountId, telegramUserId),
    ...pvpEntries(conn, accountId),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 80);

  return {
    accountId,
    telegramUserId,
    entries,
    summary: summarize(entries),
  };
}

function paymentEntries(conn: HistoryConnection, accountId: string, telegramUserId: string): WalletHistoryEntry[] {
  const entries: WalletHistoryEntry[] = [];
  const rows = [...conn.db.paymentLedger.iter()]
    .filter(row => row.accountId === accountId && row.telegramUserId === telegramUserId)
    .sort((a, b) => compareMicros(a.createdAtMicros, b.createdAtMicros));

  for (const row of rows) {
    const purchaseStatus = isCreditedStatus(row.status) ? 'settled' : 'failed';
    const paidAt = toIso(row.paidAtMicros ?? row.createdAtMicros);
    entries.push({
      id: `payment:${row.paymentId}:purchase`,
      kind: 'stars_purchase',
      status: purchaseStatus,
      title: 'Stars purchase',
      description: `${row.starsAmount} Stars for ${row.elmAmount} ELM`,
      occurredAt: paidAt,
      balanceKind: row.balanceKind,
      elmAmount: row.elmAmount,
      starsAmount: row.starsAmount,
      paymentId: row.paymentId,
    });

    if (row.creditedAtMicros !== undefined) {
      entries.push({
        id: `payment:${row.paymentId}:credit`,
        kind: 'elm_credit',
        status: purchaseStatus,
        title: 'ELM credited',
        description: `${row.elmAmount} ELM credited from Stars purchase`,
        occurredAt: toIso(row.creditedAtMicros),
        balanceKind: row.balanceKind,
        elmAmount: row.elmAmount,
        starsAmount: row.starsAmount,
        paymentId: row.paymentId,
      });
    }

    if (row.refundRequestedAtMicros !== undefined || row.refundedAtMicros !== undefined) {
      const refunded = row.status === PAYMENT_STATUS_REFUNDED && row.refundedAtMicros !== undefined;
      const starsAmount = refunded ? row.refundedStarsAmount : row.starsAmount;
      const elmAmount = refunded ? row.refundedElmAmount : row.elmAmount;
      entries.push({
        id: `payment:${row.paymentId}:refund`,
        kind: 'stars_refund',
        status: refunded ? 'settled' : row.status === PAYMENT_STATUS_REFUND_PENDING ? 'pending' : 'failed',
        title: refunded ? 'Stars refunded' : 'Stars refund pending',
        description: `${elmAmount} ELM for ${starsAmount} Stars`,
        occurredAt: toIso(row.refundedAtMicros ?? row.refundRequestedAtMicros ?? row.updatedAtMicros),
        balanceKind: row.balanceKind,
        elmAmount: -elmAmount,
        starsAmount,
        paymentId: row.paymentId,
      });
    }
  }
  return entries;
}

function pvpEntries(conn: HistoryConnection, accountId: string): WalletHistoryEntry[] {
  const identitySet = new Set(
    [...conn.db.player.iter()]
      .filter(row => row.accountId === accountId)
      .map(row => identityHex(row.identity)),
  );
  if (identitySet.size === 0) return [];

  const entries: WalletHistoryEntry[] = [];
  for (const row of conn.db.matchState.iter()) {
    if (row.status !== 'settled' || row.balanceKind !== PAID_ELM_BALANCE_KIND) continue;
    const p1 = identityHex(row.p1);
    const p2 = identityHex(row.p2);
    const side = identitySet.has(p1) ? 'p1' : identitySet.has(p2) ? 'p2' : null;
    if (!side) continue;

    const matchId = row.id.toString();
    const boostEnabled = side === 'p1' ? row.p1BoostEnabled : row.p2BoostEnabled;
    const boostStake = boostEnabled ? Math.ceil(row.stake * 0.1) : 0;
    const opponentName = side === 'p1' ? row.p2Name : row.p1Name;
    entries.push({
      id: `match:${matchId}:entry_fee`,
      kind: 'match_entry_fee',
      status: 'settled',
      title: 'Match entry fee',
      description: `Match vs ${opponentName}`,
      occurredAt: toIso(row.createdAtMicros),
      balanceKind: row.balanceKind,
      elmAmount: -row.stake,
      matchId,
    });
    if (boostStake > 0) {
      entries.push({
        id: `match:${matchId}:boost_cost`,
        kind: 'match_boost_cost',
        status: 'settled',
        title: 'Energy Boost cost',
        description: `Match vs ${opponentName}`,
        occurredAt: toIso(row.createdAtMicros),
        balanceKind: row.balanceKind,
        elmAmount: -boostStake,
        matchId,
      });
    }

  }
  return entries;
}

function summarize(entries: WalletHistoryEntry[]): WalletHistorySummary {
  return entries.reduce<WalletHistorySummary>((summary, entry) => {
    if (entry.kind === 'stars_purchase') summary.totalStarsPurchased += entry.starsAmount ?? 0;
    if (entry.kind === 'elm_credit') summary.totalElmCredited += Math.max(0, entry.elmAmount);
    if (entry.kind === 'stars_refund' && entry.status === 'settled') {
      summary.totalStarsRefunded += entry.starsAmount ?? 0;
      summary.totalElmRefunded += Math.abs(entry.elmAmount);
    }
    if (entry.kind === 'stars_refund' && entry.status === 'pending') {
      summary.pendingRefundStars += entry.starsAmount ?? 0;
    }
    if (entry.kind.startsWith('pvp_') || entry.kind.startsWith('match_')) summary.pvpNetElm += entry.elmAmount;
    return summary;
  }, {
    totalStarsPurchased: 0,
    totalElmCredited: 0,
    totalStarsRefunded: 0,
    totalElmRefunded: 0,
    pendingRefundStars: 0,
    pvpNetElm: 0,
  });
}

function isCreditedStatus(status: string): boolean {
  return status === PAYMENT_STATUS_CREDITED ||
    status === PAYMENT_STATUS_REFUND_PENDING ||
    status === PAYMENT_STATUS_REFUNDED;
}

function identityHex(identity: { toHexString(): string }): string {
  return identity.toHexString();
}

function compareMicros(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toIso(micros: bigint): string {
  return new Date(Number(micros / 1000n)).toISOString();
}

function connectHistory(config: SpacetimeCreditConfig): Promise<HistoryConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const connection = DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .withToken(config.token)
      .withCompression('none')
      .onConnect((conn, identity) => {
        console.log(`[payments] Connected wallet history service to SpacetimeDB as ${identity.toHexString()}`);
        conn.subscriptionBuilder()
          .onApplied(() => {
            settled = true;
            resolve(conn);
          })
          .onError((ctx) => {
            if (!settled) reject(new Error(`Wallet history subscription failed: ${String(ctx)}`));
          })
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, err) => {
        if (!settled) reject(err);
      })
      .onDisconnect((_ctx, err) => {
        if (err) console.error('[payments] Wallet history SpacetimeDB disconnected:', err.message);
      })
      .build();

    setTimeout(() => {
      if (!settled) {
        connection.disconnect();
        reject(new Error('Timed out connecting wallet history service to SpacetimeDB'));
      }
    }, 10_000).unref();
  });
}
