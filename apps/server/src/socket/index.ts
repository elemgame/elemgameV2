import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { GameMode, MoveId } from '@elmental/shared';
import { verifySessionToken } from '../auth/index.js';
import {
  createActiveMatch,
  getActiveMatch,
  removeActiveMatch,
  MatchStatus,
} from '../game/engine.js';
import type { EngineEvent } from '../game/engine.js';
import { MatchmakingService } from '../matchmaking/index.js';
import {
  upsertUser,
  getUserById,
  createMatch,
  updateMatchStatus,
  insertRound,
} from '../db/index.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  AuthenticatedSocket,
  QueueEntry,
} from '../types.js';

// ---------------------------------------------------------------------------
// Socket.io server setup
// ---------------------------------------------------------------------------

export function createSocketServer(
  httpServer: HttpServer,
  jwtSecret: string,
  matchmakingService: MatchmakingService,
): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 30_000,
    pingInterval: 25_000,
  });

  // ---------------------------------------------------------------------------
  // Auth middleware
  // ---------------------------------------------------------------------------

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth as Record<string, unknown>)['token'] as string | undefined ??
      (socket.handshake.query['token'] as string | undefined);

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const payload = verifySessionToken(token, jwtSecret);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }

    socket.data.userId = payload.userId;
    socket.data.telegramId = payload.telegramId;

    next();
  });

  // ---------------------------------------------------------------------------
  // Connection handler
  // ---------------------------------------------------------------------------

  io.on('connection', (socket: AuthenticatedSocket) => {
    const { userId } = socket.data;
    console.log(`[socket] Player ${userId} connected (${socket.id})`);

    // Fetch user info for display name
    getUserById(userId).then((user) => {
      if (user) {
        socket.data.firstName = user.first_name;
        if (user.username !== null) socket.data.username = user.username;
      }
    }).catch((err: unknown) => {
      console.error('[socket] getUserById error:', err);
    });

    // ------------------------------------------------------------------
    // join-queue
    // ------------------------------------------------------------------
    socket.on('join-queue', (data) => {
      const { stake, mode } = data;

      const entry: QueueEntry = {
        userId,
        rating: 1200, // TODO: fetch from DB
        stake,
        mode,
        socketId: socket.id,
        joinedAt: Date.now(),
      };

      matchmakingService.addToQueue(entry).catch((err: unknown) => {
        console.error('[socket] addToQueue error:', err);
        socket.emit('error', { message: 'Failed to join queue' });
      });
    });

    // ------------------------------------------------------------------
    // leave-queue
    // ------------------------------------------------------------------
    socket.on('leave-queue', () => {
      matchmakingService.removeFromQueue(userId).catch((err: unknown) => {
        console.error('[socket] removeFromQueue error:', err);
      });
    });

    // ------------------------------------------------------------------
    // commit-move
    // ------------------------------------------------------------------
    socket.on('commit-move', (data) => {
      const { matchId, hash } = data;
      const engine = getActiveMatch(matchId);
      if (!engine) {
        socket.emit('error', { message: 'Match not found' });
        return;
      }

      try {
        const bothCommitted = engine.receiveCommit(userId, hash);
        socket.emit('round-commit-received', {
          matchId,
          round: engine.getSnapshot().currentRound,
        });

        if (bothCommitted) {
          engine.stopCommitTimer();
          // Notify both players to reveal
          const snap = engine.getSnapshot();
          io.to(snap.p1SocketId).to(snap.p2SocketId).emit('round-commit-received', {
            matchId,
            round: snap.currentRound,
          });
          engine.startRevealTimer();
        }
      } catch (err) {
        console.error('[socket] commit-move error:', err);
        socket.emit('error', { message: 'Failed to process commit' });
      }
    });

    // ------------------------------------------------------------------
    // reveal-move
    // ------------------------------------------------------------------
    socket.on('reveal-move', (data) => {
      const { matchId, move, salt } = data;
      const engine = getActiveMatch(matchId);
      if (!engine) {
        socket.emit('error', { message: 'Match not found' });
        return;
      }

      try {
        const { accepted, bothRevealed } = engine.receiveReveal(userId, move as MoveId, salt);

        if (!accepted) {
          socket.emit('error', { message: 'Invalid reveal: hash mismatch' });
          return;
        }

        if (bothRevealed) {
          engine.stopRevealTimer();
          engine.resolveCurrentRound().catch((err: unknown) => {
            console.error('[socket] resolveCurrentRound error:', err);
          });
        }
      } catch (err) {
        console.error('[socket] reveal-move error:', err);
        socket.emit('error', { message: 'Failed to process reveal' });
      }
    });

    // ------------------------------------------------------------------
    // disconnect
    // ------------------------------------------------------------------
    socket.on('disconnect', (reason) => {
      console.log(`[socket] Player ${userId} disconnected (${reason})`);
      matchmakingService.removeFromQueue(userId).catch(() => {
        // Ignore
      });
      // TODO: handle mid-match disconnect (forfeit after timeout)
    });
  });

  // ---------------------------------------------------------------------------
  // Match found handler (called by MatchmakingService)
  // ---------------------------------------------------------------------------

  matchmakingService['onMatchFound'] = async (
    entry1: QueueEntry,
    entry2: QueueEntry,
  ) => {
    try {
      // Persist to DB
      const [user1, user2] = await Promise.all([
        upsertUser(entry1.userId, null, `Player${entry1.userId}`),
        upsertUser(entry2.userId, null, `Player${entry2.userId}`),
      ]);

      const dbMatch = await createMatch(user1.id, user2.id, entry1.stake, entry1.mode);

      // Create engine
      const engine = createActiveMatch({
        matchId: dbMatch.id,
        player1Id: user1.id,
        player2Id: user2.id,
        p1SocketId: entry1.socketId,
        p2SocketId: entry2.socketId,
        stake: entry1.stake,
        mode: entry1.mode as GameMode,
        onEvent: makeEngineEventHandler(io, dbMatch.id),
      });

      // Notify both players
      io.to(entry1.socketId).emit('match-found', {
        matchId: dbMatch.id,
        opponentId: user2.telegram_id,
        opponentName: user2.first_name,
        stake: entry1.stake,
        mode: entry1.mode as GameMode,
        isPlayer1: true,
      });

      io.to(entry2.socketId).emit('match-found', {
        matchId: dbMatch.id,
        opponentId: user1.telegram_id,
        opponentName: user1.first_name,
        stake: entry2.stake,
        mode: entry2.mode as GameMode,
        isPlayer1: false,
      });

      // Start commit timer
      engine.startCommitTimer();

      console.log(
        `[socket] Match ${dbMatch.id} started: ${user1.id} vs ${user2.id}`,
      );
    } catch (err) {
      console.error('[socket] onMatchFound error:', err);
    }
  };

  return io;
}

// ---------------------------------------------------------------------------
// Engine event handler
// ---------------------------------------------------------------------------

function makeEngineEventHandler(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  matchId: string,
): (event: EngineEvent) => Promise<void> {
  return async (event: EngineEvent) => {
    const snap = event.type !== 'timeout' ? event.match : null;

    switch (event.type) {
      case 'round-result': {
        const { entry, match } = event;
        const p1Socket = io.sockets.sockets.get(match.p1SocketId) as AuthenticatedSocket | undefined;
        const p2Socket = io.sockets.sockets.get(match.p2SocketId) as AuthenticatedSocket | undefined;

        // Save round to DB
        insertRound(
          matchId,
          entry.round,
          entry.p1Move,
          entry.p2Move,
          entry.p1Energy,
          entry.p2Energy,
          entry.p1Result,
        ).catch((err: unknown) => console.error('[socket] insertRound error:', err));

        // Send to p1
        p1Socket?.emit('round-result', {
          matchId,
          round: entry.round,
          p1Move: entry.p1Move,
          p2Move: entry.p2Move,
          p1Energy: entry.p1Energy,
          p2Energy: entry.p2Energy,
          p1Score: match.p1Score,
          p2Score: match.p2Score,
          yourResult: entry.p1Result,
        });

        // Send to p2 (swap perspective)
        p2Socket?.emit('round-result', {
          matchId,
          round: entry.round,
          p1Move: entry.p1Move,
          p2Move: entry.p2Move,
          p1Energy: entry.p1Energy,
          p2Energy: entry.p2Energy,
          p1Score: match.p1Score,
          p2Score: match.p2Score,
          yourResult: entry.p2Result,
        });

        // Start next round commit timer if match still active
        const engine = getActiveMatch(matchId);
        if (engine) {
          engine.startCommitTimer();
        }
        break;
      }

      case 'match-over': {
        const { match, winnerId, replayHash } = event;

        // Update DB
        await updateMatchStatus(matchId, MatchStatus.Settled, winnerId, replayHash);

        const result = {
          matchId,
          winnerId,
          p1Score: match.p1Score,
          p2Score: match.p2Score,
          replayHash,
          rounds: match.rounds,
        };

        io.to(match.p1SocketId).to(match.p2SocketId).emit('match-result', result);

        // TODO: trigger blockchain settle
        // await settleMatchOnChain(matchId, winnerAddr, replayHash);

        removeActiveMatch(matchId);
        break;
      }

      case 'timeout': {
        const engine = getActiveMatch(event.matchId);
        if (engine) {
          const s = engine.getSnapshot();
          io.to(s.p1SocketId)
            .to(s.p2SocketId)
            .emit('round-timeout', {
              matchId: event.matchId,
              round: event.round,
              reason: event.reason,
            });
          // TODO: decide winner on timeout (award to non-timing-out player)
          removeActiveMatch(event.matchId);
        }
        break;
      }
    }

    void snap; // suppress unused warning
  };
}
