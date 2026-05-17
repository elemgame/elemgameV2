import { loadConfig } from './config.js';
import { createJsonlAdminAuditLog, createSpacetimeAdminStore } from './adminStore.js';
import { createPaymentsServer } from './server.js';
import { createSpacetimePaymentRecorder } from './spacetimeRecorder.js';
import { createSqlPaymentRecorder } from './sqlPaymentRecorder.js';
import { createStarsRefundService } from './starsRefunds.js';
import { createTelegramBotApi } from './telegramBotApi.js';
import { createWalletHistoryService } from './walletHistory.js';

const config = loadConfig();
const telegram = createTelegramBotApi(config.botToken, config.botApiBaseUrl);
const paymentRecorder = config.spacetime
  ? createSpacetimePaymentRecorder(config.spacetime)
  : createSqlPaymentRecorder(config.adminSpacetime, config.paymentFallbackLedgerPath);
const refundService = config.spacetime
  ? createStarsRefundService(config.spacetime, telegram)
  : undefined;
const walletHistoryService = config.spacetime
  ? createWalletHistoryService(config.spacetime)
  : undefined;
const adminAuditLog = config.adminAuditLogPath ? createJsonlAdminAuditLog(config.adminAuditLogPath) : undefined;
const adminStore = createSpacetimeAdminStore(config.adminSpacetime, fetch, adminAuditLog);
if (!paymentRecorder) {
  console.warn('[payments] PAYMENTS_SPACETIME_TOKEN is not set; successful payments will be logged but not credited, wallet history and refunds are disabled');
}
if (!config.spacetime) {
  console.warn('[payments] PAYMENTS_SPACETIME_TOKEN is not set; using SQL fallback crediting without private SpacetimeDB payment ledger, wallet history, or refunds');
}
const server = createPaymentsServer({ config, telegram, paymentRecorder, refundService, walletHistoryService, adminStore });

server.listen(config.port, () => {
  console.log(`[payments] Service listening on port ${config.port}`);
});

function shutdown(): void {
  console.log('[payments] Shutting down...');
  paymentRecorder?.dispose?.();
  refundService?.dispose?.();
  walletHistoryService?.dispose?.();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
