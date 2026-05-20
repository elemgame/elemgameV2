import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import type { SpacetimeAdminConfig } from './config.js';
import { createSpacetimeSqlQuery, numberValue, sqlString, stringValue } from './spacetimeSql.js';
import type { PaymentEventRecorder, SuccessfulStarsPaymentEvent } from './telegramUpdates.js';

interface FallbackPaymentLedgerRow {
  paymentId: string;
  accountId: string;
  telegramUserId: string;
  starsAmount: number;
  elmAmount: number;
  telegramPaymentChargeId: string;
  creditedAt: string;
}

export function createSqlPaymentRecorder(
  config: SpacetimeAdminConfig,
  ledgerPath?: string,
  fetchImpl: typeof fetch = fetch,
): PaymentEventRecorder {
  const recordedPaymentKeys = new Set<string>();
  let initialized = false;
  const sql = createSpacetimeSqlQuery(config, fetchImpl);

  async function initializeRecordedKeys(): Promise<void> {
    if (initialized || !ledgerPath) {
      initialized = true;
      return;
    }
    for (const row of await readLedgerRows(ledgerPath)) {
      recordedPaymentKeys.add(paymentKey(row.paymentId, row.telegramPaymentChargeId));
    }
    initialized = true;
  }

  return {
    async recordSuccessfulPayment(event: SuccessfulStarsPaymentEvent): Promise<void> {
      await initializeRecordedKeys();
      const key = paymentKey(event.purchaseId, event.telegramPaymentChargeId);
      if (recordedPaymentKeys.has(key)) {
        console.log(`[payments] Duplicate SQL fallback Stars payment ignored purchase=${event.purchaseId} account=${event.accountId}`);
        return;
      }

      const accountId = normalizeAccountId(event.accountId);
      const accounts = await sql('SELECT * FROM account');
      const existing = accounts.find(row => stringValue(row['id']) === accountId);
      const previousBalance = existing ? numberValue(existing['balance']) : 0;
      const nextBalance = previousBalance + event.elmAmount;

      if (existing) {
        await sql(
          `UPDATE account SET balance = ${nextBalance}, balance_kind = 'paid_elm' WHERE id = ${sqlString(accountId)}`,
        );
      } else {
        await sql(
          `INSERT INTO account (id, name, rating, wins, losses, balance, balance_kind, season_points) VALUES (` +
            [
              sqlString(accountId),
              sqlString(accountId),
              '1200',
              '0',
              '0',
              String(nextBalance),
              "'paid_elm'",
              '0',
            ].join(', ') +
            ')',
        );
      }
      await sql(
        `UPDATE player SET balance = ${nextBalance}, balance_kind = 'paid_elm' WHERE account_id = ${sqlString(accountId)}`,
      );

      recordedPaymentKeys.add(key);
      if (ledgerPath) {
        await appendLedgerRow(ledgerPath, {
          paymentId: event.purchaseId,
          accountId,
          telegramUserId: event.telegramUserId,
          starsAmount: event.starsAmount,
          elmAmount: event.elmAmount,
          telegramPaymentChargeId: event.telegramPaymentChargeId,
          creditedAt: new Date().toISOString(),
        });
      }
      console.log(
        `[payments] Credited Stars payment via SQL fallback purchase=${event.purchaseId} account=${accountId} stars=${event.starsAmount} elm=${event.elmAmount}`,
      );
    },
  };
}

let ledgerAppendQueue = Promise.resolve();

async function appendLedgerRow(filePath: string, row: FallbackPaymentLedgerRow): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  ledgerAppendQueue = ledgerAppendQueue.then(async () => {
    let existing = '';
    try {
      existing = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${existing}${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, filePath);
  });
  return ledgerAppendQueue;
}

async function readLedgerRows(filePath: string): Promise<FallbackPaymentLedgerRow[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line) as unknown)
      .map(toLedgerRow)
      .filter((row): row is FallbackPaymentLedgerRow => row !== null);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function toLedgerRow(value: unknown): FallbackPaymentLedgerRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const paymentId = stringValue(row['paymentId']);
  const telegramPaymentChargeId = stringValue(row['telegramPaymentChargeId']);
  if (!paymentId || !telegramPaymentChargeId) return null;
  return {
    paymentId,
    accountId: stringValue(row['accountId']),
    telegramUserId: stringValue(row['telegramUserId']),
    starsAmount: numberValue(row['starsAmount']),
    elmAmount: numberValue(row['elmAmount']),
    telegramPaymentChargeId,
    creditedAt: stringValue(row['creditedAt']),
  };
}

function normalizeAccountId(accountId: string): string {
  const normalized = accountId.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '_').slice(0, 128);
  if (!normalized.startsWith('telegram:')) {
    throw new Error('Fallback payment recorder only supports Telegram accounts');
  }
  return normalized;
}

function paymentKey(paymentId: string, chargeId: string): string {
  return `${paymentId}:${chargeId}`;
}
