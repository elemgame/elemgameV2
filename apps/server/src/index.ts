import 'dotenv/config';
import http from 'http';
import express from 'express';
import { config } from './config.js';
import { initDb, initMemoryDb } from './db/index.js';
import { createRedisClient, MatchmakingService } from './matchmaking/index.js';
import { createSocketServer } from './socket/index.js';
import { createBot } from './bot/index.js';
import { validateInitData, createSessionToken } from './auth/index.js';
import { upsertUser } from './db/index.js';

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', dataStore: config.dataStore, ts: Date.now() });
});

// Auth endpoint — exchange initData for session token
app.post('/auth', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const initData = typeof body['initData'] === 'string' ? body['initData'] : null;

    if (!initData) {
      res.status(400).json({ error: 'initData required' });
      return;
    }

    const user = validateInitData(initData, config.botToken);
    if (!user) {
      res.status(401).json({ error: 'Invalid initData' });
      return;
    }

    // Upsert user in DB
    const dbUser = await upsertUser(user.id, user.username ?? null, user.first_name);

    const token = createSessionToken(dbUser.id, dbUser.telegram_id, config.jwtSecret);

    res.json({
      token,
      user: {
        id: dbUser.id,
        telegramId: dbUser.telegram_id,
        username: dbUser.username,
        firstName: dbUser.first_name,
        rating: dbUser.rating,
        wins: dbUser.wins,
        losses: dbUser.losses,
        walletAddress: dbUser.wallet_address,
      },
    });
  } catch (err) {
    console.error('[auth] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Development/test auth for running the game outside Telegram.
// Disabled unless ALLOW_DEV_AUTH=true (enabled by default in NODE_ENV=development).
app.post('/auth/dev', async (req, res) => {
  if (!config.allowDevAuth) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  try {
    const body = req.body as Record<string, unknown>;
    const id = typeof body['id'] === 'number'
      ? body['id']
      : Math.floor(10_000_000 + Math.random() * 89_999_999);
    const username = typeof body['username'] === 'string' ? body['username'] : null;
    const firstName = typeof body['firstName'] === 'string'
      ? body['firstName']
      : typeof body['first_name'] === 'string'
        ? body['first_name']
        : `Player${id}`;

    const dbUser = await upsertUser(id, username, firstName);
    const token = createSessionToken(dbUser.id, dbUser.telegram_id, config.jwtSecret);

    res.json({
      token,
      user: {
        id: dbUser.id,
        telegramId: dbUser.telegram_id,
        username: dbUser.username,
        firstName: dbUser.first_name,
        rating: dbUser.rating,
        wins: dbUser.wins,
        losses: dbUser.losses,
        walletAddress: dbUser.wallet_address,
      },
    });
  } catch (err) {
    console.error('[auth/dev] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const httpServer = http.createServer(app);

// ---------------------------------------------------------------------------
// Redis + Matchmaking
// ---------------------------------------------------------------------------

const redis = createRedisClient(config.redisUrl);

// Placeholder onMatchFound — will be replaced by socket server
const matchmaking = new MatchmakingService(redis, () => {
  console.warn('[matchmaking] onMatchFound not yet wired to socket server');
});

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------

const io = createSocketServer(httpServer, config.jwtSecret, matchmaking);

// ---------------------------------------------------------------------------
// Telegram Bot
// ---------------------------------------------------------------------------

let bot: ReturnType<typeof createBot> | null = null;

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  // 1. Database
  if (config.dataStore === 'memory') {
    initMemoryDb();
  } else {
    try {
      await initDb(config.databaseUrl);
    } catch (err) {
      console.error('[startup] PostgreSQL connection failed:', (err as Error).message);
      console.warn('[startup] Falling back to in-memory database for this process');
      initMemoryDb();
    }
  }

  // 2. Redis
  if (config.dataStore === 'memory') {
    matchmaking.useMemoryQueue();
  } else {
    try {
      await redis.connect();
    } catch (err) {
      console.error('[startup] Redis connection failed:', (err as Error).message);
      console.warn('[startup] Falling back to in-memory matchmaking for this process');
      matchmaking.useMemoryQueue();
    }
  }

  // 3. Telegram Bot (skip in test/CI environments)
  if (
    config.nodeEnv !== 'test' &&
    config.botToken !== 'placeholder_bot_token' &&
    config.botToken !== 'your_bot_token_here'
  ) {
    try {
      bot = createBot(config.botToken, config.webappUrl);
      console.log('[startup] Telegram bot started');
    } catch (err) {
      console.error('[startup] Bot failed to start:', (err as Error).message);
    }
  } else {
    console.log('[startup] Skipping Telegram bot (placeholder token or test env)');
  }

  // 4. HTTP server
  httpServer.listen(config.port, () => {
    console.log(`[startup] Elmental server running on port ${config.port}`);
    console.log(`[startup] Environment: ${config.nodeEnv}`);
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(): Promise<void> {
  console.log('[shutdown] Shutting down...');

  if (bot) {
    await bot.stopPolling();
  }

  io.disconnectSockets(true);
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 1_000);
    timeout.unref();
    io.close(() => {
      clearTimeout(timeout);
      resolve();
    });
  });

  if (redis.status === 'ready' || redis.status === 'connect' || redis.status === 'connecting') {
    await redis.quit().catch((err: unknown) => {
      console.error('[shutdown] Redis quit failed:', err);
    });
  } else {
    redis.disconnect();
  }

  httpServer.closeAllConnections();
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 1_000);
    timeout.unref();
    httpServer.close(() => {
      clearTimeout(timeout);
      resolve();
    });
  });

  console.log('[shutdown] HTTP server closed');
  process.exit(0);
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });

void start();
