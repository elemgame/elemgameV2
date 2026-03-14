import 'dotenv/config';
import http from 'http';
import express from 'express';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { createRedisClient, MatchmakingService } from './matchmaking/index.js';
import type { QueueEntry } from './types.js';
import { createSocketServer } from './socket/index.js';
import { createBot } from './bot/index.js';
import { validateInitData, createSessionToken } from './auth/index.js';
import { upsertUser } from './db/index.js';

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
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

    const token = createSessionToken(dbUser.id, config.jwtSecret);

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

const _io = createSocketServer(httpServer, config.jwtSecret, matchmaking);

// ---------------------------------------------------------------------------
// Telegram Bot
// ---------------------------------------------------------------------------

let bot: ReturnType<typeof createBot> | null = null;

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  // 1. Database
  try {
    await initDb(config.databaseUrl);
  } catch (err) {
    console.error('[startup] PostgreSQL connection failed:', (err as Error).message);
    console.warn('[startup] Continuing without database (some features disabled)');
  }

  // 2. Redis
  try {
    await redis.connect();
  } catch (err) {
    console.error('[startup] Redis connection failed:', (err as Error).message);
    console.warn('[startup] Continuing without Redis (matchmaking disabled)');
  }

  // 3. Telegram Bot (skip in test/CI environments)
  if (config.nodeEnv !== 'test' && config.botToken !== 'placeholder_bot_token') {
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

  await redis.quit();

  httpServer.close(() => {
    console.log('[shutdown] HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });

void start();
