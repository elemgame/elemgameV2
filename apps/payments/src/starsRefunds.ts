import { DbConnection } from './module_bindings/index.js';
import type { SpacetimeCreditConfig } from './config.js';
import type { Account, PaymentLedger } from './module_bindings/types.js';
import { TelegramBotApiError, type TelegramBotApi } from './telegramBotApi.js';

const PAID_ELM_BALANCE_KIND = 'paid_elm';
const PAYMENT_STATUS_CREDITED = 'credited';
const PAYMENT_STATUS_REFUND_PENDING = 'refund_pending';

export interface RefundableLotSummary {
  paymentId: string;
  starsAmount: number;
  elmAmount: number;
}

export interface StarsRefundQuote {
  accountId: string;
  telegramUserId: string;
  refundableStarsAmount: number;
  refundableElmAmount: number;
  lots: RefundableLotSummary[];
  nextLot?: RefundableLotSummary;
  note?: string;
}

export interface StarsRefundResult {
  accountId: string;
  telegramUserId: string;
  refundedStarsAmount: number;
  refundedElmAmount: number;
  refundedLots: RefundableLotSummary[];
}

export interface StarsRefundService {
  quote(input: { accountId: string; telegramUserId: string }): Promise<StarsRefundQuote>;
  refund(input: { accountId: string; telegramUserId: string; starsAmount: number }): Promise<StarsRefundResult>;
  dispose?(): void;
}

interface RefundConnection {
  db: {
    account: { iter(): Iterable<Account> };
    paymentLedger: { iter(): Iterable<PaymentLedger> };
  };
  reducers: {
    reserveStarsRefund(input: { paymentId: string; accountId: string; telegramUserId: string }): Promise<void>;
    recordStarsRefund(input: {
      paymentId: string;
      accountId: string;
      telegramUserId: string;
      telegramPaymentChargeId: string;
    }): Promise<void>;
    cancelStarsRefund(input: { paymentId: string; accountId: string; telegramUserId: string }): Promise<void>;
  };
  disconnect(): void;
}

type ConnectRefunds = (config: SpacetimeCreditConfig) => Promise<RefundConnection>;

export function createStarsRefundService(
  config: SpacetimeCreditConfig,
  telegram: TelegramBotApi,
  connect: ConnectRefunds = connectRefunds,
): StarsRefundService {
  let connectionPromise: Promise<RefundConnection> | null = null;
  let connection: RefundConnection | null = null;

  async function getConnection(): Promise<RefundConnection> {
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
    async quote(input) {
      const conn = await getConnection();
      return buildQuote(conn, input.accountId, input.telegramUserId);
    },

    async refund(input) {
      const conn = await getConnection();
      const quote = buildQuote(conn, input.accountId, input.telegramUserId);
      const selectedLots = selectRefundLots(quote.lots, input.starsAmount);
      let refundedStarsAmount = 0;
      let refundedElmAmount = 0;
      const refundedLots: RefundableLotSummary[] = [];

      for (const lot of selectedLots) {
        const ledger = findLedger(conn, lot.paymentId);
        if (!ledger) throw new Error('Refund lot disappeared');

        await conn.reducers.reserveStarsRefund({
          paymentId: ledger.paymentId,
          accountId: input.accountId,
          telegramUserId: input.telegramUserId,
        });

        try {
          await telegram.refundStarPayment({
            telegramUserId: input.telegramUserId,
            telegramPaymentChargeId: ledger.telegramPaymentChargeId,
          });
        } catch (err) {
          if (err instanceof TelegramBotApiError && err.confirmedFailure) {
            await releaseRefundReservation(conn, ledger, input.accountId, input.telegramUserId);
          } else {
            console.error('[payments] Stars refund status is unknown; keeping ELM reservation:', err);
          }
          throw err;
        }

        try {
          await conn.reducers.recordStarsRefund({
            paymentId: ledger.paymentId,
            accountId: input.accountId,
            telegramUserId: input.telegramUserId,
            telegramPaymentChargeId: ledger.telegramPaymentChargeId,
          });
        } catch (err) {
          console.error('[payments] Stars were refunded but ledger update failed; keeping ELM reservation:', err);
          throw err;
        }

        refundedStarsAmount += lot.starsAmount;
        refundedElmAmount += lot.elmAmount;
        refundedLots.push(lot);
      }

      return {
        accountId: input.accountId,
        telegramUserId: input.telegramUserId,
        refundedStarsAmount,
        refundedElmAmount,
        refundedLots,
      };
    },

    dispose(): void {
      connection?.disconnect();
      connection = null;
      connectionPromise = null;
    },
  };
}

function buildQuote(conn: RefundConnection, accountId: string, telegramUserId: string): StarsRefundQuote {
  const account = findAccount(conn, accountId);
  const availableBalance = Math.max(0, account?.balance ?? 0);
  let remainingBalance = availableBalance;
  const lots: RefundableLotSummary[] = [];

  for (const row of refundableRows(conn, accountId, telegramUserId)) {
    if (row.status !== PAYMENT_STATUS_REFUND_PENDING) {
      if (row.elmAmount > remainingBalance) break;
      remainingBalance -= row.elmAmount;
    }
    lots.push({
      paymentId: row.paymentId,
      starsAmount: row.starsAmount,
      elmAmount: row.elmAmount,
    });
  }

  const refundableStarsAmount = lots.reduce((sum, lot) => sum + lot.starsAmount, 0);
  const refundableElmAmount = lots.reduce((sum, lot) => sum + lot.elmAmount, 0);
  return {
    accountId,
    telegramUserId,
    refundableStarsAmount,
    refundableElmAmount,
    lots,
    ...(lots[0] ? { nextLot: lots[0] } : {}),
    ...(refundableStarsAmount <= 0 && availableBalance > 0
      ? { note: 'Current ELM is not backed by unused refundable Stars purchases.' }
      : {}),
  };
}

function refundableRows(conn: RefundConnection, accountId: string, telegramUserId: string): PaymentLedger[] {
  return [...conn.db.paymentLedger.iter()]
    .filter(row => (
      row.accountId === accountId &&
      row.telegramUserId === telegramUserId &&
      row.balanceKind === PAID_ELM_BALANCE_KIND &&
      (row.status === PAYMENT_STATUS_CREDITED || row.status === PAYMENT_STATUS_REFUND_PENDING) &&
      row.refundedStarsAmount === 0 &&
      row.refundedElmAmount === 0 &&
      row.refundedAtMicros === undefined &&
      row.refundableElmAmount >= row.elmAmount &&
      row.telegramPaymentChargeId.length > 0
    ))
    .sort((a, b) => compareMicros(a.paidAtMicros ?? a.createdAtMicros, b.paidAtMicros ?? b.createdAtMicros));
}

function selectRefundLots(lots: RefundableLotSummary[], starsAmount: number): RefundableLotSummary[] {
  if (!Number.isInteger(starsAmount) || starsAmount <= 0) {
    throw new Error('Refund Stars amount must be positive');
  }

  const selected: RefundableLotSummary[] = [];
  let total = 0;
  for (const lot of lots) {
    if (total >= starsAmount) break;
    selected.push(lot);
    total += lot.starsAmount;
  }

  if (total !== starsAmount) {
    throw new Error('Refund amount must match whole refundable purchase lots in FIFO order');
  }
  return selected;
}

async function releaseRefundReservation(
  conn: RefundConnection,
  ledger: PaymentLedger,
  accountId: string,
  telegramUserId: string,
): Promise<void> {
  await conn.reducers.cancelStarsRefund({
    paymentId: ledger.paymentId,
    accountId,
    telegramUserId,
  }).catch(cancelErr => {
    console.error('[payments] Failed to release refund reservation:', cancelErr);
  });
}

function findAccount(conn: RefundConnection, accountId: string): Account | undefined {
  for (const row of conn.db.account.iter()) {
    if (row.id === accountId) return row;
  }
  return undefined;
}

function findLedger(conn: RefundConnection, paymentId: string): PaymentLedger | undefined {
  for (const row of conn.db.paymentLedger.iter()) {
    if (row.paymentId === paymentId) return row;
  }
  return undefined;
}

function compareMicros(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function connectRefunds(config: SpacetimeCreditConfig): Promise<RefundConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const connection = DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .withToken(config.token)
      .withCompression('none')
      .onConnect((conn, identity) => {
        console.log(`[payments] Connected refund service to SpacetimeDB as ${identity.toHexString()}`);
        conn.subscriptionBuilder()
          .onApplied(() => {
            settled = true;
            resolve(conn);
          })
          .onError((ctx) => {
            if (!settled) reject(new Error(`Refund subscription failed: ${String(ctx)}`));
          })
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, err) => {
        if (!settled) reject(err);
      })
      .onDisconnect((_ctx, err) => {
        if (err) console.error('[payments] Refund SpacetimeDB disconnected:', err.message);
      })
      .build();

    setTimeout(() => {
      if (!settled) {
        connection.disconnect();
        reject(new Error('Timed out connecting refund service to SpacetimeDB'));
      }
    }, 10_000).unref();
  });
}
