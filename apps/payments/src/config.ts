export interface PaymentsConfig {
  port: number;
  botToken: string;
  payloadSecret: string;
  webhookSecret?: string;
  botApiBaseUrl: string;
  allowedOrigins: string[];
  spacetime?: SpacetimeCreditConfig;
  nodeEnv: string;
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
    payloadSecret,
    ...(env['PAYMENTS_WEBHOOK_SECRET'] ? { webhookSecret: env['PAYMENTS_WEBHOOK_SECRET'] } : {}),
    botApiBaseUrl: env['TELEGRAM_BOT_API_BASE_URL'] ?? 'https://api.telegram.org',
    allowedOrigins: parseAllowedOrigins(env['PAYMENTS_ALLOWED_ORIGINS'] ?? '*'),
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

function spacetimeConfig(env: NodeJS.ProcessEnv): SpacetimeCreditConfig | undefined {
  const token = env['PAYMENTS_SPACETIME_TOKEN'];
  if (!token) return undefined;
  return {
    uri: env['PAYMENTS_SPACETIME_URI'] ?? 'https://maincloud.spacetimedb.com',
    database: env['PAYMENTS_SPACETIME_DB'] ?? 'elmental-v2',
    token,
  };
}
