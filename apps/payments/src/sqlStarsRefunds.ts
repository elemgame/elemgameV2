import crypto from 'crypto';
import type { SpacetimeAdminConfig } from './config.js';
import { ELM_STARS_PACKAGES } from './packages.js';
import { createSpacetimeSqlQuery, numberValue, sqlString, stringValue } from './spacetimeSql.js';
import { TelegramBotApiError, type TelegramBotApi, type TelegramStarTransaction } from './telegramBotApi.js';
import type { RefundableLotSummary, StarsRefundQuote, StarsRefundResult, StarsRefundService } from './starsRefunds.js';

const PAID_ELM_BALANCE_KIND = 'paid_elm';
const AUDIT_ADMIN_ID = 'payments-service';
const REFUND_REASON_PREFIX = 'stars_refund_fallback:';
const STAR_TRANSACTION_PAGE_SIZE = 100;
const STAR_TRANSACTION_MAX_SCAN = 500;

interface AccountRow {
  id: string;
  balance: number;
  balanceKind: string;
}

interface RefundState {
  account?: AccountRow;
  balance: number;
  lots: RefundableLotSummary[];
  blockedNextLot?: RefundableLotSummary;
}

export function createSqlStarsRefundService(
  config: SpacetimeAdminConfig,
  telegram: TelegramBotApi,
  fetchImpl: typeof fetch = fetch,
): StarsRefundService {
  const sql = createSpacetimeSqlQuery(config, fetchImpl);
  const locallyReservedPaymentIds = new Set<string>();

  return {
    async quote(input) {
      const state = await readRefundState(sql, telegram, input.accountId, input.telegramUserId, locallyReservedPaymentIds);
      return buildQuote(input.accountId, input.telegramUserId, state);
    },

    async refund(input) {
      if (!config.token) {
        throw new Error('PAYMENTS_SQL_TOKEN is required for SQL fallback Stars refunds');
      }

      const state = await readRefundState(sql, telegram, input.accountId, input.telegramUserId, locallyReservedPaymentIds);
      if (state.lots.length === 0) {
        throw new Error(refundNote(state));
      }
      const selectedLots = selectRefundLots(state.lots, input.starsAmount);
      let refundedStarsAmount = 0;
      let refundedElmAmount = 0;
      const refundedLots: RefundableLotSummary[] = [];

      for (const lot of selectedLots) {
        if (locallyReservedPaymentIds.has(lot.paymentId)) {
          throw new Error('Refund lot is already being processed');
        }
        locallyReservedPaymentIds.add(lot.paymentId);

        const currentAccount = await readAccount(sql, input.accountId);
        const previousBalance = currentAccount?.balance ?? 0;
        if (!currentAccount || currentAccount.balanceKind !== PAID_ELM_BALANCE_KIND) {
          locallyReservedPaymentIds.delete(lot.paymentId);
          throw new Error('Paid ELM account not found');
        }
        if (previousBalance < lot.elmAmount) {
          locallyReservedPaymentIds.delete(lot.paymentId);
          throw new Error(`Insufficient refundable ELM balance: need ${lot.elmAmount}, have ${previousBalance}`);
        }

        const nextBalance = previousBalance - lot.elmAmount;
        await updateBalances(sql, input.accountId, nextBalance);

        try {
          await telegram.refundStarPayment({
            telegramUserId: input.telegramUserId,
            telegramPaymentChargeId: lot.paymentId,
          });
        } catch (err) {
          if (err instanceof TelegramBotApiError && err.confirmedFailure) {
            await updateBalances(sql, input.accountId, previousBalance).catch(restoreErr => {
              console.error('[payments] Failed to restore SQL fallback refund balance:', restoreErr);
            });
            locallyReservedPaymentIds.delete(lot.paymentId);
          } else {
            console.error('[payments] SQL fallback Stars refund status is unknown; keeping ELM reservation:', err);
          }
          throw err;
        }

        await appendRefundAudit(sql, {
          accountId: input.accountId,
          paymentId: lot.paymentId,
          previousBalance,
          nextBalance,
          elmAmount: lot.elmAmount,
        }).catch(err => {
          console.error('[payments] SQL fallback Stars refund audit insert failed:', err);
        });

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
  };
}

type SqlQuery = ReturnType<typeof createSpacetimeSqlQuery>;

async function readRefundState(
  sql: SqlQuery,
  telegram: TelegramBotApi,
  accountId: string,
  telegramUserId: string,
  locallyReservedPaymentIds: Set<string>,
): Promise<RefundState> {
  const [account, transactions, auditedRefundIds] = await Promise.all([
    readAccount(sql, accountId),
    readStarTransactions(telegram),
    readAuditedRefundIds(sql, accountId),
  ]);
  const refundedPaymentIds = new Set([
    ...auditedRefundIds,
    ...refundedTransactionIds(transactions, telegramUserId),
    ...locallyReservedPaymentIds,
  ]);
  const balance = account?.balanceKind === PAID_ELM_BALANCE_KIND ? Math.max(0, account.balance) : 0;
  let remainingBalance = balance;
  let blockedNextLot: RefundableLotSummary | undefined;
  const lots: RefundableLotSummary[] = [];

  for (const lot of incomingPurchaseLots(transactions, telegramUserId)) {
    if (refundedPaymentIds.has(lot.paymentId)) continue;
    if (lot.elmAmount > remainingBalance) {
      blockedNextLot = lot;
      break;
    }
    remainingBalance -= lot.elmAmount;
    lots.push(lot);
  }

  return { account, balance, lots, ...(blockedNextLot ? { blockedNextLot } : {}) };
}

function buildQuote(accountId: string, telegramUserId: string, state: RefundState): StarsRefundQuote {
  const refundableStarsAmount = state.lots.reduce((sum, lot) => sum + lot.starsAmount, 0);
  const refundableElmAmount = state.lots.reduce((sum, lot) => sum + lot.elmAmount, 0);
  return {
    accountId,
    telegramUserId,
    refundableStarsAmount,
    refundableElmAmount,
    lots: state.lots,
    ...(state.lots[0] ? { nextLot: state.lots[0] } : {}),
    ...(refundableStarsAmount <= 0 ? { note: refundNote(state) } : {}),
  };
}

function refundNote(state: RefundState): string {
  if (!state.account) return 'Paid ELM account was not found for this Telegram user.';
  if (state.account.balanceKind !== PAID_ELM_BALANCE_KIND) return 'This account does not use paid ELM.';
  if (state.blockedNextLot) {
    return `Refund requires ${state.blockedNextLot.elmAmount} unused ELM for the next ${state.blockedNextLot.starsAmount} Star purchase; current paid ELM balance is ${state.balance}.`;
  }
  return 'No refundable unused purchase lots.';
}

function incomingPurchaseLots(transactions: TelegramStarTransaction[], telegramUserId: string): RefundableLotSummary[] {
  return transactions
    .filter(transaction => (
      transaction.amount > 0 &&
      transaction.source?.type === 'user' &&
      String(transaction.source.user?.id ?? '') === telegramUserId &&
      (!transaction.source.transaction_type || transaction.source.transaction_type === 'invoice_payment')
    ))
    .map(transaction => {
      const elmAmount = elmAmountForStars(transaction.amount);
      if (!elmAmount) return null;
      return {
        paymentId: transaction.id,
        starsAmount: transaction.amount,
        elmAmount,
      };
    })
    .filter((lot): lot is RefundableLotSummary => lot !== null)
    .sort((a, b) => compareTransactionDate(transactions, a.paymentId, b.paymentId));
}

function refundedTransactionIds(transactions: TelegramStarTransaction[], telegramUserId: string): Set<string> {
  const ids = new Set<string>();
  for (const transaction of transactions) {
    if (
      transaction.amount < 0 &&
      transaction.receiver?.type === 'user' &&
      String(transaction.receiver.user?.id ?? '') === telegramUserId
    ) {
      ids.add(transaction.id);
    }
  }
  return ids;
}

async function readStarTransactions(telegram: TelegramBotApi): Promise<TelegramStarTransaction[]> {
  const transactions: TelegramStarTransaction[] = [];
  for (let offset = 0; offset < STAR_TRANSACTION_MAX_SCAN; offset += STAR_TRANSACTION_PAGE_SIZE) {
    const page = await telegram.getStarTransactions({ offset, limit: STAR_TRANSACTION_PAGE_SIZE });
    transactions.push(...page);
    if (page.length < STAR_TRANSACTION_PAGE_SIZE) break;
  }
  return transactions;
}

async function readAccount(sql: SqlQuery, accountId: string): Promise<AccountRow | undefined> {
  const rows = await sql(`SELECT id, balance, balance_kind FROM account WHERE id = ${sqlString(accountId)}`);
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: stringValue(row['id']),
    balance: numberValue(row['balance']),
    balanceKind: stringValue(row['balance_kind']),
  };
}

async function readAuditedRefundIds(sql: SqlQuery, accountId: string): Promise<Set<string>> {
  try {
    const rows = await sql(
      `SELECT reason FROM admin_audit_event WHERE target_account_id = ${sqlString(accountId)} AND operation = 'debit'`,
    );
    return new Set(
      rows
        .map(row => stringValue(row['reason']))
        .filter(reason => reason.startsWith(REFUND_REASON_PREFIX))
        .map(reason => reason.slice(REFUND_REASON_PREFIX.length)),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes('not found') ||
      message.includes('unknown') ||
      message.includes('does not exist') ||
      message.includes('no such table') ||
      message.includes('marked private') ||
      message.includes('not authorized')
    ) return new Set();
    throw err;
  }
}

async function updateBalances(sql: SqlQuery, accountId: string, balance: number): Promise<void> {
  await sql(`UPDATE account SET balance = ${balance}, balance_kind = 'paid_elm' WHERE id = ${sqlString(accountId)}`);
  await sql(`UPDATE player SET balance = ${balance}, balance_kind = 'paid_elm' WHERE account_id = ${sqlString(accountId)}`);
}

async function appendRefundAudit(
  sql: SqlQuery,
  input: {
    accountId: string;
    paymentId: string;
    previousBalance: number;
    nextBalance: number;
    elmAmount: number;
  },
): Promise<void> {
  await sql(
    `INSERT INTO admin_audit_event (request_id, admin_telegram_id, target_account_id, balance_kind, operation, previous_balance, new_balance, delta, reason, created_at_micros) VALUES (` +
      [
        sqlString(crypto.randomUUID()),
        sqlString(AUDIT_ADMIN_ID),
        sqlString(input.accountId),
        sqlString(PAID_ELM_BALANCE_KIND),
        "'debit'",
        String(input.previousBalance),
        String(input.nextBalance),
        String(-input.elmAmount),
        sqlString(`${REFUND_REASON_PREFIX}${input.paymentId}`),
        String(Date.now() * 1000),
      ].join(', ') +
      ')',
  );
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

function elmAmountForStars(starsAmount: number): number | null {
  return ELM_STARS_PACKAGES.find(pkg => pkg.starsAmount === starsAmount)?.elmAmount ?? null;
}

function compareTransactionDate(transactions: TelegramStarTransaction[], a: string, b: string): number {
  const aDate = transactions.find(transaction => transaction.id === a)?.date ?? 0;
  const bDate = transactions.find(transaction => transaction.id === b)?.date ?? 0;
  return aDate - bDate || a.localeCompare(b);
}
