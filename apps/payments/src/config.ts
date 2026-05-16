export interface PaymentsConfig {
  port: number;
  botToken: string;
  payloadSecret: string;
  botApiBaseUrl: string;
  allowedOrigins: string[];
  nodeEnv: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PaymentsConfig {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  const isDevLike = nodeEnv === 'development' || nodeEnv === 'test';
  const botToken = env['TELEGRAM_BOT_TOKEN'] ?? env['BOT_TOKEN'];
  const payloadSecret = env['PAYMENT_PAYLOAD_SECRET'] ??
    (isDevLike ? 'dev_payment_payload_secret_change_in_production' : undefined);

  if (!botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  if (!payloadSecret) throw new Error('Missing PAYMENT_PAYLOAD_SECRET');

  return {
    port: parsePort(env['PAYMENTS_PORT'] ?? env['PORT'] ?? '3002'),
    botToken,
    payloadSecret,
    botApiBaseUrl: env['TELEGRAM_BOT_API_BASE_URL'] ?? 'https://api.telegram.org',
    allowedOrigins: parseAllowedOrigins(env['PAYMENTS_ALLOWED_ORIGINS'] ?? '*'),
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
