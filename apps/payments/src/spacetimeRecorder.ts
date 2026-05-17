import { DbConnection } from './module_bindings/index.js';
import type { SpacetimeCreditConfig } from './config.js';
import type { PaymentEventRecorder, SuccessfulStarsPaymentEvent } from './telegramUpdates.js';

interface SpacetimePaymentConnection {
  reducers: {
    recordStarsPayment(input: {
      paymentId: string;
      accountId: string;
      telegramUserId: string;
      starsAmount: number;
      elmAmount: number;
      telegramPaymentChargeId: string;
      invoicePayload: string;
    }): Promise<void>;
  };
  disconnect(): void;
}

type ConnectSpacetime = (config: SpacetimeCreditConfig) => Promise<SpacetimePaymentConnection>;

export function createSpacetimePaymentRecorder(
  config: SpacetimeCreditConfig,
  connect: ConnectSpacetime = connectSpacetime,
): PaymentEventRecorder {
  let connectionPromise: Promise<SpacetimePaymentConnection> | null = null;
  let connection: SpacetimePaymentConnection | null = null;
  const recordedPaymentKeys = new Set<string>();

  async function getConnection(): Promise<SpacetimePaymentConnection> {
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
    async recordSuccessfulPayment(event: SuccessfulStarsPaymentEvent): Promise<void> {
      const paymentKey = `${event.purchaseId}:${event.telegramPaymentChargeId}`;
      if (recordedPaymentKeys.has(paymentKey)) {
        console.log(`[payments] Duplicate Stars payment replay ignored purchase=${event.purchaseId} account=${event.accountId}`);
        return;
      }

      const conn = await getConnection();
      await conn.reducers.recordStarsPayment({
        paymentId: event.purchaseId,
        accountId: event.accountId,
        telegramUserId: event.telegramUserId,
        starsAmount: event.starsAmount,
        elmAmount: event.elmAmount,
        telegramPaymentChargeId: event.telegramPaymentChargeId,
        invoicePayload: event.invoicePayload,
      });
      recordedPaymentKeys.add(paymentKey);
      console.log(
        `[payments] Credited Stars payment purchase=${event.purchaseId} account=${event.accountId} charge=${event.telegramPaymentChargeId}`,
      );
    },

    dispose(): void {
      connection?.disconnect();
      connection = null;
      connectionPromise = null;
    },
  };
}

function connectSpacetime(config: SpacetimeCreditConfig): Promise<SpacetimePaymentConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const connection = DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .withToken(config.token)
      .withCompression('none')
      .withLightMode(true)
      .onConnect((conn, identity) => {
        settled = true;
        console.log(`[payments] Connected to SpacetimeDB as ${identity.toHexString()}`);
        resolve(conn);
      })
      .onConnectError((_ctx, err) => {
        if (!settled) reject(err);
      })
      .onDisconnect((_ctx, err) => {
        if (err) console.error('[payments] SpacetimeDB disconnected:', err.message);
      })
      .build();

    setTimeout(() => {
      if (!settled) {
        connection.disconnect();
        reject(new Error('Timed out connecting to SpacetimeDB'));
      }
    }, 10_000).unref();
  });
}
