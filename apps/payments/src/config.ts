export interface PaymentsConfig {
  port: number;
  botToken: string;
  telegramWebAppUrl?: string;
  payloadSecret: string;
  webhookSecret?: string;
  botApiBaseUrl: string;
  allowedOrigins: string[];
  adminTelegramIds: Set<number>;
  adminSpacetime: SpacetimeAdminConfig;
  adminAuditLogPath?: string;
  paymentFallbackLedgerPath?: string;
  spacetime?: SpacetimeCreditConfig;
  nodeEnv: string;
}

export interface SpacetimeAdminConfig {
  uri: string;
  database: string;
}

export interface SpacetimeCreditConfig {
  uri: string;
  database: string;
  token: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PaymentsConfig {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  const isDevLike = nodeEnv === 'development' || nodeEnv === 'test';
  const botToken = env['TELEGRAM_BOT_TOKEN'] ?? env['BOT_TOKEN'];
  const payloadSecret = env['PAYMENT_PAYLOAD_SECRET'] ??
    (isDevLike ? 'dev_payment_payload_secret_change_in_production' : undefined);
  const spacetime = spacetimeConfig(env);

  if (!botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  if (!payloadSecret) throw new Error('Missing PAYMENT_PAYLOAD_SECRET');

  return {
    port: parsePort(env['PAYMENTS_PORT'] ?? env['PORT'] ?? '3002'),
    botToken,
    ...(env['TELEGRAM_WEBAPP_URL'] ? { telegramWebAppUrl: env['TELEGRAM_WEBAPP_URL'] } : {}),
    payloadSecret,
    ...(env['PAYMENTS_WEBHOOK_SECRET'] ? { webhookSecret: env['PAYMENTS_WEBHOOK_SECRET'] } : {}),
    botApiBaseUrl: env['TELEGRAM_BOT_API_BASE_URL'] ?? 'https://api.telegram.org',
    allowedOrigins: parseAllowedOrigins(env['PAYMENTS_ALLOWED_ORIGINS'] ?? '*'),
    adminTelegramIds: parseAdminTelegramIds(env['ADMIN_TELEGRAM_IDS'] ?? ''),
    adminSpacetime: {
      uri: env['PAYMENTS_SPACETIME_URI'] ?? 'https://maincloud.spacetimedb.com',
      database: env['PAYMENTS_SPACETIME_DB'] ?? 'elmental-v2',
    },
    ...(env['ADMIN_AUDIT_LOG_PATH'] ? { adminAuditLogPath: env['ADMIN_AUDIT_LOG_PATH'] } : {}),
    ...(env['PAYMENTS_FALLBACK_LEDGER_PATH'] ? { paymentFallbackLedgerPath: env['PAYMENTS_FALLBACK_LEDGER_PATH'] } : {}),
    ...(spacetime ? { spacetime } : {}),
    nodeEnv,
  };
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function parseAllowedOrigins(value: string): string[] {
  return value.split(',').map(origin => origin.trim()).filter(Boolean);
}

function parseAdminTelegramIds(value: string): Set<number> {
  const ids = new Set<number>();
  for (const raw of value.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Invalid ADMIN_TELEGRAM_IDS entry: ${trimmed}`);
    }
    const id = Number(trimmed);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`Invalid ADMIN_TELEGRAM_IDS entry: ${trimmed}`);
    }
    ids.add(id);
  }
  return ids;
}

function spacetimeConfig(env: NodeJS.ProcessEnv): SpacetimeCreditConfig | undefined {
  const token = env['PAYMENTS_SPACETIME_TOKEN'];
  if (!token) return undefined;
  return {
    uri: env['PAYMENTS_SPACETIME_URI'] ?? 'https://maincloud.spacetimedb.com',
    database: env['PAYMENTS_SPACETIME_DB'] ?? 'elmental-v2',
    token,
  };
}
