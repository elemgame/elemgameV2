import { Redis } from 'ioredis';
import type { GameMode } from '@elmental/shared';
import type { QueueEntry } from '../types.js';

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

const QUEUE_KEY = (mode: GameMode, stake: number) =>
  `mm:queue:${mode}:${stake}`;
const ENTRY_KEY = (userId: number) => `mm:entry:${userId}`;

const RATING_RANGE = 200;

// ---------------------------------------------------------------------------
// Matchmaking service
// ---------------------------------------------------------------------------

export class MatchmakingService {
  private redis: Redis;
  private memoryMode = false;
  private memoryQueues = new Map<string, Map<number, QueueEntry>>();
  private memoryEntries = new Map<number, QueueEntry>();
  private onMatchFound: (
    entry1: QueueEntry,
    entry2: QueueEntry,
  ) => void | Promise<void>;

  constructor(
    redisClient: Redis,
    onMatchFound: (entry1: QueueEntry, entry2: QueueEntry) => void | Promise<void>,
  ) {
    this.redis = redisClient;
    this.onMatchFound = onMatchFound;
  }

  setMatchFoundHandler(
    handler: (entry1: QueueEntry, entry2: QueueEntry) => void | Promise<void>,
  ): void {
    this.onMatchFound = handler;
  }

  useMemoryQueue(): void {
    this.memoryMode = true;
    console.log('[matchmaking] Using in-memory queue');
  }

  /**
   * Add a player to the matchmaking queue.
   * Uses a Redis sorted set keyed by mode+stake, scored by rating.
   * After adding, immediately tries to find a match.
   */
  async addToQueue(entry: QueueEntry): Promise<void> {
    if (this.memoryMode) {
      await this.addToMemoryQueue(entry);
      return;
    }

    const queueKey = QUEUE_KEY(entry.mode, entry.stake);
    const entryKey = ENTRY_KEY(entry.userId);

    // Store full entry details
    await this.redis.set(entryKey, JSON.stringify(entry), 'EX', 300); // 5 min TTL

    // Add to sorted set with rating as score
    await this.redis.zadd(queueKey, entry.rating, String(entry.userId));

    console.log(
      `[matchmaking] Player ${entry.userId} joined queue (mode=${entry.mode}, stake=${entry.stake}, rating=${entry.rating})`,
    );

    // Try to find a match immediately
    await this.findMatch(entry);
  }

  /**
   * Remove a player from the matchmaking queue.
   */
  async removeFromQueue(userId: number): Promise<void> {
    if (this.memoryMode) {
      this.removeFromMemoryQueue(userId);
      return;
    }

    const entryRaw = await this.redis.get(ENTRY_KEY(userId));
    if (!entryRaw) return;

    let entry: QueueEntry;
    try {
      entry = JSON.parse(entryRaw) as QueueEntry;
    } catch {
      await this.redis.del(ENTRY_KEY(userId));
      return;
    }

    const queueKey = QUEUE_KEY(entry.mode, entry.stake);
    await this.redis.zrem(queueKey, String(userId));
    await this.redis.del(ENTRY_KEY(userId));

    console.log(`[matchmaking] Player ${userId} left queue`);
  }

  /**
   * Attempt to find a match for the given player.
   * Looks for opponents within ±RATING_RANGE in the same mode+stake bucket.
   */
  async findMatch(seeker: QueueEntry): Promise<void> {
    if (this.memoryMode) {
      await this.findMemoryMatch(seeker);
      return;
    }

    const queueKey = QUEUE_KEY(seeker.mode, seeker.stake);
    const minScore = seeker.rating - RATING_RANGE;
    const maxScore = seeker.rating + RATING_RANGE;

    // Get all players in range by score
    const candidates = await this.redis.zrangebyscore(
      queueKey,
      minScore,
      maxScore,
    );

    for (const candidateIdStr of candidates) {
      const candidateId = parseInt(candidateIdStr, 10);
      if (candidateId === seeker.userId) continue;

      // Try to atomically claim this pairing
      const entryRaw = await this.redis.get(ENTRY_KEY(candidateId));
      if (!entryRaw) {
        // Stale entry, remove from sorted set
        await this.redis.zrem(queueKey, candidateIdStr);
        continue;
      }

      let opponent: QueueEntry;
      try {
        opponent = JSON.parse(entryRaw) as QueueEntry;
      } catch {
        continue;
      }

      // Remove both from queue atomically
      const removed = await this.redis
        .multi()
        .zrem(queueKey, String(seeker.userId))
        .zrem(queueKey, String(candidateId))
        .del(ENTRY_KEY(seeker.userId))
        .del(ENTRY_KEY(candidateId))
        .exec();

      if (!removed) continue;

      console.log(
        `[matchmaking] Match found: ${seeker.userId} vs ${opponent.userId}`,
      );

      await this.onMatchFound(seeker, opponent);
      return;
    }
  }

  /**
   * Get queue size for a given mode+stake bucket.
   */
  async getQueueSize(mode: GameMode, stake: number): Promise<number> {
    if (this.memoryMode) {
      return this.memoryQueues.get(QUEUE_KEY(mode, stake))?.size ?? 0;
    }

    return this.redis.zcard(QUEUE_KEY(mode, stake));
  }

  /**
   * Check whether a user is currently queued.
   */
  async isInQueue(userId: number): Promise<boolean> {
    if (this.memoryMode) {
      return this.memoryEntries.has(userId);
    }

    const exists = await this.redis.exists(ENTRY_KEY(userId));
    return exists > 0;
  }

  private async addToMemoryQueue(entry: QueueEntry): Promise<void> {
    this.removeFromMemoryQueue(entry.userId);

    const queueKey = QUEUE_KEY(entry.mode, entry.stake);
    const queue = this.memoryQueues.get(queueKey) ?? new Map<number, QueueEntry>();
    queue.set(entry.userId, entry);
    this.memoryQueues.set(queueKey, queue);
    this.memoryEntries.set(entry.userId, entry);

    console.log(
      `[matchmaking] Player ${entry.userId} joined memory queue (mode=${entry.mode}, stake=${entry.stake}, rating=${entry.rating})`,
    );

    await this.findMemoryMatch(entry);
  }

  private removeFromMemoryQueue(userId: number): void {
    const entry = this.memoryEntries.get(userId);
    if (!entry) return;

    const queue = this.memoryQueues.get(QUEUE_KEY(entry.mode, entry.stake));
    queue?.delete(userId);
    this.memoryEntries.delete(userId);

    console.log(`[matchmaking] Player ${userId} left memory queue`);
  }

  private async findMemoryMatch(seeker: QueueEntry): Promise<void> {
    const queueKey = QUEUE_KEY(seeker.mode, seeker.stake);
    const queue = this.memoryQueues.get(queueKey);
    if (!queue) return;

    const minScore = seeker.rating - RATING_RANGE;
    const maxScore = seeker.rating + RATING_RANGE;

    for (const opponent of queue.values()) {
      if (opponent.userId === seeker.userId) continue;
      if (opponent.rating < minScore || opponent.rating > maxScore) continue;

      queue.delete(seeker.userId);
      queue.delete(opponent.userId);
      this.memoryEntries.delete(seeker.userId);
      this.memoryEntries.delete(opponent.userId);

      console.log(
        `[matchmaking] Memory match found: ${seeker.userId} vs ${opponent.userId}`,
      );

      await this.onMatchFound(seeker, opponent);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Redis client factory
// ---------------------------------------------------------------------------

export function createRedisClient(redisUrl: string): Redis {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    reconnectOnError: () => true,
  });

  client.on('connect', () => console.log('[redis] Connected'));
  client.on('error', (err: Error) => console.error('[redis] Error:', err.message));

  return client;
}
