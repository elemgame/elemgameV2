import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export interface Config {
  port: number;
  botToken: string;
  webappUrl: string;
  jwtSecret: string;
  ackiNackiEndpoint: string;
  serverKeys: string[];
  contractAddrs: {
    factory?: string;
    matchRegistry?: string;
  };
  databaseUrl: string;
  redisUrl: string;
  nodeEnv: string;
}

function loadConfig(): Config {
  const nodeEnv = optionalEnv('NODE_ENV', 'development');

  // In development, use fallback values so the server starts without a full .env
  const isDev = nodeEnv === 'development';

  const botToken = isDev
    ? optionalEnv('BOT_TOKEN', 'placeholder_bot_token')
    : requireEnv('BOT_TOKEN');

  const jwtSecret = isDev
    ? optionalEnv('JWT_SECRET', 'dev_jwt_secret_change_in_production')
    : requireEnv('JWT_SECRET');

  const serverKeysRaw = optionalEnv('SERVER_KEYS', '[]');
  let serverKeys: string[] = [];
  try {
    const parsed: unknown = JSON.parse(serverKeysRaw);
    if (Array.isArray(parsed)) {
      serverKeys = parsed as string[];
    }
  } catch {
    console.warn('SERVER_KEYS is not valid JSON, ignoring');
  }

  const contractAddrsRaw = optionalEnv('CONTRACT_ADDRS', '{}');
  let contractAddrs: Config['contractAddrs'] = {};
  try {
    const parsed: unknown = JSON.parse(contractAddrsRaw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      contractAddrs = parsed as Config['contractAddrs'];
    }
  } catch {
    console.warn('CONTRACT_ADDRS is not valid JSON, ignoring');
  }

  return {
    port: parseInt(optionalEnv('PORT', '3001'), 10),
    botToken,
    jwtSecret,
    webappUrl: optionalEnv('WEBAPP_URL', 'https://t.me/your_bot/app'),
    ackiNackiEndpoint: optionalEnv(
      'ACKI_NACKI_ENDPOINT',
      'https://network.ackinacki.com/graphql',
    ),
    serverKeys,
    contractAddrs,
    databaseUrl: optionalEnv('DATABASE_URL', 'postgres://localhost:5432/elmental'),
    redisUrl: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
    nodeEnv,
  };
}

export const config = loadConfig();
