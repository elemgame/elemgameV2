import http from 'http';
import { authenticateAdmin, type AdminIdentity } from './adminAuth.js';
import { AdminStoreError, type AdminStore, type AdminTimeWindow, type BalanceKind, type BalanceOperation } from './adminStore.js';
import { createPurchaseId, createSignedInvoicePayload } from './invoicePayload.js';
import { ELM_STARS_PACKAGES, findElmStarsPackage } from './packages.js';
import { validateTelegramInitData } from './telegramInitData.js';
import { handleTelegramUpdate, noopPaymentEventRecorder } from './telegramUpdates.js';
import type { PaymentsConfig } from './config.js';
import type { StarsRefundService } from './starsRefunds.js';
import type { TelegramBotApi } from './telegramBotApi.js';
import type { PaymentEventRecorder } from './telegramUpdates.js';
import type { WalletHistoryService } from './walletHistory.js';

interface ServerDeps {
  config: PaymentsConfig;
  telegram: TelegramBotApi;
  paymentRecorder?: PaymentEventRecorder;
  refundService?: StarsRefundService;
  walletHistoryService?: WalletHistoryService;
  adminStore?: AdminStore;
}

interface InvoiceRequestBody {
  initData?: unknown;
  packageId?: unknown;
}

interface RefundRequestBody {
  initData?: unknown;
  starsAmount?: unknown;
}

interface AdminRequestBody {
  initData?: unknown;
  window?: unknown;
  query?: unknown;
  accountId?: unknown;
  balanceKind?: unknown;
  operation?: unknown;
  amount?: unknown;
  reason?: unknown;
  adminTelegramId?: unknown;
}

export function createPaymentsServer({
  config,
  telegram,
  paymentRecorder = noopPaymentEventRecorder,
  refundService,
  walletHistoryService,
  adminStore,
}: ServerDeps): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res, config, telegram, paymentRecorder, refundService, walletHistoryService, adminStore).catch(err => {
      console.error('[payments] Request failed:', err);
      sendJson(res, 500, { error: 'Internal server error' });
    });
  });
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PaymentsConfig,
  telegram: TelegramBotApi,
  paymentRecorder: PaymentEventRecorder,
  refundService?: StarsRefundService,
  walletHistoryService?: WalletHistoryService,
  adminStore?: AdminStore,
): Promise<void> {
  setCors(req, res, config);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://payments.local');

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok', service: 'payments', ts: Date.now() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/payments/stars/packages') {
    sendJson(res, 200, { packages: ELM_STARS_PACKAGES });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/payments/stars/invoice') {
    await handleCreateInvoice(req, res, config, telegram);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/payments/stars/refund/quote') {
    await handleRefundQuote(req, res, config, refundService);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/payments/stars/refund') {
    await handleRefund(req, res, config, refundService);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/payments/wallet/history') {
    await handleWalletHistory(req, res, config, walletHistoryService);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/payments/wallet/balance') {
    await handleWalletBalance(req, res, config, adminStore);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/telegram/webhook') {
    await handleTelegramWebhook(req, res, config, telegram, paymentRecorder);
    return;
  }

  if (url.pathname.startsWith('/admin/')) {
    await handleAdminRequest(req, res, url.pathname, config, adminStore);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function handleAdminRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  config: PaymentsConfig,
  adminStore?: AdminStore,
): Promise<void> {
  if (req.method !== 'POST') {
    sendAdminError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }
  if (!adminStore) {
    sendAdminError(res, 503, 'admin_backend_unavailable', 'Admin backend is unavailable');
    return;
  }

  const auth = await readAdminRequest(req, res, config);
  if (!auth) return;
  const { admin, body } = auth;

  try {
    if (pathname === '/admin/session') {
      sendJson(res, 200, {
        admin: {
          telegramId: admin.telegramId,
          firstName: admin.user.first_name,
          username: admin.user.username,
        },
      });
      return;
    }

    if (pathname === '/admin/stats') {
      const window = parseAdminWindow(body.window);
      sendJson(res, 200, await adminStore.getStats(window));
      return;
    }

    if (pathname === '/admin/users/search') {
      const query = typeof body.query === 'string' ? body.query : '';
      sendJson(res, 200, { users: await adminStore.searchUsers(query) });
      return;
    }

    if (pathname === '/admin/users/detail') {
      const accountId = typeof body.accountId === 'string' ? body.accountId : '';
      if (!accountId) {
        sendAdminError(res, 400, 'invalid_input', 'accountId is required');
        return;
      }
      const user = await adminStore.getUser(accountId);
      if (!user) {
        sendAdminError(res, 404, 'not_found', 'User not found');
        return;
      }
      sendJson(res, 200, { user });
      return;
    }

    if (pathname === '/admin/balance/adjust') {
      const accountId = typeof body.accountId === 'string' ? body.accountId : '';
      const balanceKind = parseBalanceKind(body.balanceKind);
      const operation = parseBalanceOperation(body.operation);
      const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
      const reason = typeof body.reason === 'string' ? body.reason : undefined;
      const result = await adminStore.adjustBalance({
        admin: { telegramId: admin.telegramId },
        accountId,
        balanceKind,
        operation,
        amount,
        reason,
      });
      sendJson(res, 200, result);
      return;
    }

    if (pathname === '/admin/audit') {
      const window = parseOptionalAdminWindow(body.window);
      const accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : undefined;
      const adminTelegramId = typeof body.adminTelegramId === 'string' && body.adminTelegramId ? body.adminTelegramId : undefined;
      const operation = body.operation === undefined || body.operation === '' ? undefined : parseBalanceOperation(body.operation);
      sendJson(res, 200, {
        events: await adminStore.getAuditEvents({ accountId, adminTelegramId, operation, window }),
      });
      return;
    }

    sendAdminError(res, 404, 'not_found', 'Not found');
  } catch (err) {
    if (err instanceof AdminStoreError) {
      const status = err.code === 'not_found' ? 404 : err.code === 'conflict' ? 409 : 400;
      sendAdminError(res, status, err.code, err.message);
      return;
    }
    throw err;
  }
}

async function readAdminRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PaymentsConfig,
): Promise<{ admin: AdminIdentity; body: AdminRequestBody } | null> {
  const body = await readJsonBody<AdminRequestBody>(req);
  const auth = authenticateAdmin(body.initData, config);
  if (!auth.ok) {
    sendAdminError(res, auth.status, auth.code, auth.message);
    return null;
  }
  return { admin: auth.admin, body };
}

async function handleRefundQuote(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PaymentsConfig,
  refundService?: StarsRefundService,
): Promise<void> {
  if (!refundService) {
    sendJson(res, 503, { error: 'Refund service is not configured' });
    return;
  }

  const user = await readTelegramUser(req, res, config);
  if (!user) return;

  const telegramUserId = String(user.id);
  const accountId = `telegram:${telegramUserId}`;
  try {
    const quote = await refundService.quote({ accountId, telegramUserId });
    sendJson(res, 200, quote);
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : 'Refund quote failed' });
  }
}

async function handleRefund(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PaymentsConfig,
  refundService?: StarsRefundService,
): Promise<void> {
  if (!refundService) {
    sendJson(res, 503, { error: 'Refund service is not configured' });
    return;
  }

  const body = await readJsonBody<RefundRequestBody>(req);
  const initData = typeof body.initData === 'string' ? body.initData : '';
  const user = validateTelegramInitData(initData, config.botToken);
  if (!user) {
    sendJson(res, 401, { error: 'Invalid Telegram init data' });
    return;
  }

  const starsAmount = typeof body.starsAmount === 'number' ? body.starsAmount : 0;
  const telegramUserId = String(user.id);
  const accountId = `telegram:${telegramUserId}`;
  console.log(`[payments] Stars refund requested account=${accountId} stars=${starsAmount}`);
  try {
    const result = await refundService.refund({ accountId, telegramUserId, starsAmount });
    console.log(
      `[payments] Stars refund completed account=${accountId} stars=${result.refundedStarsAmount} lots=${result.refundedLots.length}`,
    );
    sendJson(res, 200, result);
  } catch (err) {
    console.warn(
      `[payments] Stars refund failed account=${accountId} stars=${starsAmount} error=${err instanceof Error ? err.message : String(err)}`,
    );
    sendJson(res, 400, { error: err instanceof Error ? err.message : 'Refund failed' });
  }
}

async function handleWalletHistory(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PaymentsConfig,
  walletHistoryService?: WalletHistoryService,
): Promise<void> {
  if (!walletHistoryService) {
    sendJson(res, 503, { error: 'Wallet history service is not configured' });
    return;
  }

  const user = await readTelegramUser(req, res, config);
  if (!user) return;

  const telegramUserId = String(user.id);
  const accountId = `telegram:${telegramUserId}`;
  try {
    const history = await walletHistoryService.history({ accountId, telegramUserId });
    sendJson(res, 200, history);
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : 'Wallet history failed' });
  }
}

async function handleWalletBalance(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PaymentsConfig,
  adminStore?: AdminStore,
): Promise<void> {
  if (!adminStore) {
    sendJson(res, 503, { error: 'Balance service is not configured' });
    return;
  }

  const user = await readTelegramUser(req, res, config);
  if (!user) return;

  const telegramUserId = String(user.id);
  const accountId = `telegram:${telegramUserId}`;
  const detail = await adminStore.getUser(accountId);
  const account = detail?.account;
  sendJson(res, 200, {
    accountId,
    telegramUserId,
    name: account?.name ?? accountId,
    balance: account?.balance ?? 0,
    balanceKind: account?.balanceKind ?? 'paid_elm',
    rating: account?.rating ?? 1200,
    wins: account?.wins ?? 0,
    losses: account?.losses ?? 0,
  });
}

async function readTelegramUser(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PaymentsConfig,
): Promise<{ id: number } | null> {
  const body = await readJsonBody<RefundRequestBody>(req);
  const initData = typeof body.initData === 'string' ? body.initData : '';
  const user = validateTelegramInitData(initData, config.botToken);
  if (!user) {
    sendJson(res, 401, { error: 'Invalid Telegram init data' });
    return null;
  }
  return user;
}

async function handleTelegramWebhook(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PaymentsConfig,
  telegram: TelegramBotApi,
  paymentRecorder: PaymentEventRecorder,
): Promise<void> {
  if (config.webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== config.webhookSecret) {
    console.warn('[payments] Rejected Telegram webhook with invalid secret');
    sendJson(res, 401, { error: 'Invalid webhook secret' });
    return;
  }

  const update = await readJsonBody<unknown>(req);
  const result = await handleTelegramUpdate(update, {
    payloadSecret: config.payloadSecret,
    webAppUrl: config.telegramWebAppUrl,
    telegram,
    recorder: paymentRecorder,
  });
  console.log(`[payments] Telegram webhook handled type=${telegramUpdateType(update)} result=${result}`);
  sendJson(res, 200, { ok: true, result });
}

async function handleCreateInvoice(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PaymentsConfig,
  telegram: TelegramBotApi,
): Promise<void> {
  const body = await readJsonBody<InvoiceRequestBody>(req);
  const initData = typeof body.initData === 'string' ? body.initData : '';
  const packageId = typeof body.packageId === 'string' ? body.packageId : '';

  const user = validateTelegramInitData(initData, config.botToken);
  if (!user) {
    sendJson(res, 401, { error: 'Invalid Telegram init data' });
    return;
  }

  const selectedPackage = findElmStarsPackage(packageId);
  if (!selectedPackage) {
    sendJson(res, 400, { error: 'Unknown ELM package' });
    return;
  }

  const telegramUserId = String(user.id);
  const accountId = `telegram:${telegramUserId}`;
  const purchaseId = createPurchaseId();
  const payload = createSignedInvoicePayload(
    {
      purchaseId,
      packageId: selectedPackage.id,
      telegramUserId,
      accountId,
    },
    config.payloadSecret,
  );

  const invoiceLink = await telegram.createInvoiceLink({
    title: selectedPackage.title,
    description: selectedPackage.description,
    payload,
    starsAmount: selectedPackage.starsAmount,
    elmAmount: selectedPackage.elmAmount,
  });

  console.log(
    `[payments] Created Stars invoice purchase=${purchaseId} account=${accountId} package=${selectedPackage.id}`,
  );
  sendJson(res, 200, {
    purchaseId,
    accountId,
    currency: 'XTR',
    invoiceLink,
    package: selectedPackage,
  });
}

function setCors(req: http.IncomingMessage, res: http.ServerResponse, config: PaymentsConfig): void {
  const origin = req.headers.origin;
  const allowAny = config.allowedOrigins.includes('*');
  if (allowAny) {
    res.setHeader('access-control-allow-origin', '*');
  } else if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

function parseAdminWindow(value: unknown): AdminTimeWindow {
  if (value === '7d' || value === '30d' || value === '24h' || value === undefined) return value ?? '24h';
  throw new AdminStoreError('invalid_input', 'Invalid time window');
}

function parseOptionalAdminWindow(value: unknown): AdminTimeWindow | undefined {
  if (value === undefined || value === '') return undefined;
  return parseAdminWindow(value);
}

function parseBalanceKind(value: unknown): BalanceKind {
  if (value === 'paid_elm' || value === 'demo_teml') return value;
  throw new AdminStoreError('invalid_input', 'Invalid balance kind');
}

function parseBalanceOperation(value: unknown): BalanceOperation {
  if (value === 'credit' || value === 'debit' || value === 'set') return value;
  throw new AdminStoreError('invalid_input', 'Invalid balance operation');
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > 32_768) throw new Error('Request body too large');
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {} as T;

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(rawBody) as T;
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendAdminError(res: http.ServerResponse, statusCode: number, code: string, message: string): void {
  sendJson(res, statusCode, { error: { code, message } });
}

function telegramUpdateType(update: unknown): string {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return 'invalid';
  const record = update as Record<string, unknown>;
  if (record['pre_checkout_query']) return 'pre_checkout_query';
  const message = record['message'];
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const messageRecord = message as Record<string, unknown>;
    if (messageRecord['successful_payment']) return 'successful_payment';
    return 'message';
  }
  return 'unknown';
}
