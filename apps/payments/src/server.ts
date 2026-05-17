import http from 'http';
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
}

interface InvoiceRequestBody {
  initData?: unknown;
  packageId?: unknown;
}

interface RefundRequestBody {
  initData?: unknown;
  starsAmount?: unknown;
}

export function createPaymentsServer({
  config,
  telegram,
  paymentRecorder = noopPaymentEventRecorder,
  refundService,
  walletHistoryService,
}: ServerDeps): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res, config, telegram, paymentRecorder, refundService, walletHistoryService).catch(err => {
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

  if (req.method === 'POST' && url.pathname === '/telegram/webhook') {
    await handleTelegramWebhook(req, res, config, telegram, paymentRecorder);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
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
    sendJson(res, 401, { error: 'Invalid webhook secret' });
    return;
  }

  const update = await readJsonBody<unknown>(req);
  const result = await handleTelegramUpdate(update, {
    payloadSecret: config.payloadSecret,
    telegram,
    recorder: paymentRecorder,
  });
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
