import { Identity } from 'spacetimedb';
import { BOOST_EXTRA_ENERGY, MoveId, STARTING_ENERGY } from '@elmental/shared';
import { DbConnection } from '../../module_bindings';
import { playerDisplayName } from '../playerProfile';
import type {
  GameEvent,
  MatchState,
  Player,
  QueueEntry,
  RoundResult as StdbRoundResult,
} from '../../module_bindings/types';
import type {
  GameplayProvider,
  GameplayProviderContext,
  MatchmakingRequest,
  PlayerProfileInput,
  ProviderRoundPhase,
} from './types';

interface SpacetimeProviderOptions {
  uri: string;
  database: string;
  room: string;
  tokenStorage?: Storage;
  matchStorage?: Storage;
}

interface MatchPerspective {
  matchId: string;
  isPlayer1: boolean;
  myScore: number;
  opponentScore: number;
  myEnergy: number;
  opponentEnergy: number;
  opponentName: string;
  opponentRating: number;
  mySubmittedMove: MoveId | null;
  myRating: number;
  opponentSideRating: number;
  boostEnabled: boolean;
}

export function createSpacetimeProvider(
  context: GameplayProviderContext,
  options: SpacetimeProviderOptions,
): GameplayProvider {
  let conn: DbConnection | null = null;
  let connectPromise: Promise<DbConnection> | null = null;
  let currentIdentity: Identity | null = null;
  let currentUser: PlayerProfileInput | null = null;
  let wiredConnection: DbConnection | null = null;
  let activeMatch: MatchState | null = null;
  let currentMatchId: string | null = null;
  const finalizedMatchIds = new Set<string>();
  const scheduledSettledMatchIds = new Set<string>();
  const processedRoundIds = new Set<string>();
  const settlementTimers = new Set<ReturnType<typeof setTimeout>>();

  const provider: GameplayProvider = {
    async initialize(user) {
      currentUser = user;
      trace('spacetime.initialize', { user: displayName(user), db: options.database, uri: options.uri });
      await ensureConnection(user);
    },

    async updateProfile(user) {
      currentUser = user;
      const connection = await ensureConnection(user);
      await callReducer('setProfile', () => connection.reducers.setProfile({ name: displayName(user) }));
    },

    async startMatchmaking(request) {
      const connection = await ensureConnection(currentUser ?? undefined);
      trace('spacetime.queue.join.call', {
        name: request.name,
        stake: request.stake,
        mode: request.mode,
        room: request.room,
        boostEnabled: request.boostEnabled,
        botFallbackSeconds: request.botFallbackSeconds,
      });
      await callReducer('joinQueue', () => connection.reducers.joinQueue(request));
    },

    cancelMatchmaking() {
      trace('spacetime.queue.leave.call', {});
      conn?.reducers.leaveQueue({}).catch((err) => reportReducerError('leaveQueue', err));
    },

    async submitMove(moveId) {
      if (!activeMatch) return;
      trace('spacetime.move.submit.call', {
        matchId: activeMatch.id.toString(),
        round: activeMatch.currentRound,
        move: moveId,
      });
      await callReducer('submitMove', () => conn?.reducers.submitMove({
        matchId: activeMatch!.id,
        move: moveId,
      }) ?? Promise.resolve());
    },

    advanceRound() {
      if (!activeMatch || activeMatch.phase !== 'result') return;
      trace('spacetime.round.next.call', { matchId: activeMatch.id.toString(), round: activeMatch.currentRound });
      conn?.reducers.nextRound({ matchId: activeMatch.id }).catch((err) => reportReducerError('nextRound', err));
    },

    forfeitMatch() {
      if (!activeMatch) return;
      trace('spacetime.match.forfeit.call', { matchId: activeMatch.id.toString() });
      conn?.reducers.forfeitMatch({ matchId: activeMatch.id }).catch((err) => reportReducerError('forfeitMatch', err));
    },

    applyResults() {
      clearPersistedActiveMatchId();
      activeMatch = null;
      currentMatchId = null;
    },

    dispose() {
      clearSettlementTimers();
      conn?.disconnect();
      conn = null;
      connectPromise = null;
      currentIdentity = null;
      wiredConnection = null;
      activeMatch = null;
      currentMatchId = null;
    },
  };

  async function ensureConnection(user?: PlayerProfileInput): Promise<DbConnection> {
    if (conn?.isActive) return conn;
    if (connectPromise) return connectPromise;

    const profile = user ?? currentUser;
    const tokenKey = profile ? `elmental.stdb.token.${profile.id}` : 'elmental.stdb.token';
    const token = options.tokenStorage?.getItem(tokenKey) ?? undefined;

    connectPromise = new Promise((resolve, reject) => {
      trace('spacetime.connect.start', { tokenKey, hasToken: !!token });
      const connection = DbConnection.builder()
        .withUri(options.uri)
        .withDatabaseName(options.database)
        .withToken(token)
        .withCompression('none')
        .onConnect((connected, identity, authToken) => {
          conn = connected;
          currentIdentity = identity;
          trace('spacetime.connect.ok', { identity: identity.toHexString() });
          options.tokenStorage?.setItem(tokenKey, authToken);
          wireCallbacks(connected);
          connected
            .subscriptionBuilder()
            .onApplied(() => {
              trace('spacetime.subscription.applied', {});
              if (profile) {
                connected.reducers.setProfile({ name: displayName(profile) }).catch((err) => reportReducerError('setProfile', err));
              }
              syncPlayerStats();
              syncActiveMatchFromCache();
              syncRoundResultsFromCache();
              resolve(connected);
            })
            .onError((ctx) => {
              emitError('subscription_failed', 'SpacetimeDB subscription failed', { ctx });
              reject(new Error('SpacetimeDB subscription failed'));
            })
            .subscribeToAllTables();
        })
        .onConnectError((_ctx, error) => {
          connectPromise = null;
          emitError('connect_failed', errorMessage(error), {});
          reject(error);
        })
        .onDisconnect((_ctx, error) => {
          trace('spacetime.disconnect', { error: error ? errorMessage(error) : undefined });
          conn = null;
          connectPromise = null;
          currentIdentity = null;
          wiredConnection = null;
          activeMatch = null;
        })
        .build();

      conn = connection;
    });

    return connectPromise;
  }

  function wireCallbacks(connection: DbConnection): void {
    if (wiredConnection === connection) return;
    wiredConnection = connection;

    connection.db.player.onInsert((_ctx, row) => handlePlayer(row));
    connection.db.player.onUpdate((_ctx, _oldRow, row) => handlePlayer(row));
    connection.db.queueEntry.onInsert((_ctx, row) => handleQueueEntry(row));
    connection.db.queueEntry.onDelete((_ctx, row) => handleQueueRemoved(row));
    connection.db.matchState.onInsert((_ctx, row) => handleMatch(row));
    connection.db.matchState.onUpdate((_ctx, _oldRow, row) => handleMatch(row));
    connection.db.roundResult.onInsert((_ctx, row) => handleRoundResult(row));
    connection.db.gameEvent.onInsert((_ctx, row) => handleGameEvent(row));
  }

  function handlePlayer(row: Player): void {
    if (!currentIdentity || !identityEquals(row.identity, currentIdentity)) return;
    trace('spacetime.player.update', { name: row.name, rating: row.rating, wins: row.wins, losses: row.losses });
    context.emit({
      type: 'playerStats',
      name: row.name,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
    });
  }

  function handleQueueEntry(row: QueueEntry): void {
    if (!currentIdentity || !identityEquals(row.identity, currentIdentity)) return;
    trace('spacetime.queue.active', {
      name: row.name,
      room: row.room,
      mode: row.mode,
      stake: row.stake,
    });
    context.emit({ type: 'queueActive', name: row.name, room: row.room, mode: row.mode, stake: row.stake });
  }

  function handleQueueRemoved(row: QueueEntry): void {
    if (!currentIdentity || !identityEquals(row.identity, currentIdentity)) return;
    trace('spacetime.queue.removed', {
      name: row.name,
      room: row.room,
      mode: row.mode,
      stake: row.stake,
    });
    context.emit({ type: 'queueRemoved', name: row.name, room: row.room, mode: row.mode, stake: row.stake });
  }

  function handleMatch(row: MatchState): void {
    if (!currentIdentity || !isMyMatch(row)) return;
    const perspective = mapMatchPerspective(row, currentIdentity, identityEquals);
    const persistedMatchId = getPersistedActiveMatchId();

    if (
      row.status === 'active' &&
      activeMatch?.status === 'active' &&
      activeMatch.id !== row.id &&
      row.id < activeMatch.id
    ) {
      trace('spacetime.match.ignored_old_active', { matchId: perspective.matchId, activeMatchId: activeMatch.id.toString() });
      return;
    }

    const isCurrentContext =
      currentMatchId === perspective.matchId ||
      activeMatch?.id === row.id ||
      persistedMatchId === perspective.matchId;

      if (row.status === 'settled' && !isCurrentContext) {
        trace('spacetime.match.ignored_old_settled', { matchId: perspective.matchId, currentMatchId, persistedMatchId });
        return;
    }

    activeMatch = row;
    currentMatchId = perspective.matchId;
    if (row.status === 'active') persistActiveMatchId(perspective.matchId);

    trace('spacetime.match.update', {
      matchId: perspective.matchId,
      phase: row.phase,
      status: row.status,
      round: row.currentRound,
      p1: row.p1Name,
      p2: row.p2Name,
      p1Move: row.p1RevealMove,
      p2Move: row.p2RevealMove,
    });

    if (row.status === 'active') {
      context.emit({
        type: 'matchFound',
        matchId: perspective.matchId,
        opponentName: perspective.opponentName,
        opponentRating: perspective.opponentRating,
        isPlayer1: perspective.isPlayer1,
        stake: row.stake,
        boostStake: perspective.boostEnabled ? Math.ceil(row.stake * 0.1) : 0,
        currentRound: row.currentRound,
        myEnergy: perspective.myEnergy,
        opponentEnergy: perspective.opponentEnergy,
        myScore: perspective.myScore,
        opponentScore: perspective.opponentScore,
      });

      if (row.phase === 'select' || row.phase === 'commit' || row.phase === 'reveal') {
        context.emit({
          type: 'matchUpdate',
          matchId: perspective.matchId,
          phase: mapRoundPhase(row.phase, perspective.mySubmittedMove),
          status: 'active',
          currentRound: row.currentRound,
          selectedMove: perspective.mySubmittedMove,
          myEnergy: perspective.myEnergy,
          opponentEnergy: perspective.opponentEnergy,
          myScore: perspective.myScore,
          opponentScore: perspective.opponentScore,
        });
      } else if (row.phase === 'result') {
        syncRoundResultForMatch(row.id);
      }
    }

    if (row.status === 'settled') {
      scheduleMatchSettled(row, perspective);
    }
  }

  function handleRoundResult(row: StdbRoundResult): void {
    if (!activeMatch || row.matchId !== activeMatch.id || !currentIdentity) return;
    const rowKey = row.id.toString();
    if (processedRoundIds.has(rowKey)) return;
    processedRoundIds.add(rowKey);
    const isPlayer1 = identityEquals(activeMatch.p1, currentIdentity);
    const result = mapRoundResultPerspective(
      row,
      activeMatch,
      currentIdentity,
      identityEquals,
      roundEnergyBefore(row, activeMatch, isPlayer1),
    );
    trace('spacetime.round.result', {
      matchId: row.matchId.toString(),
      round: row.round,
      p1Move: row.p1Move,
      p2Move: row.p2Move,
      result: result.result,
      score: `${row.p1Score}:${row.p2Score}`,
    });
    context.emit(result);
  }

  function handleGameEvent(row: GameEvent): void {
    trace('spacetime.server.event', {
      event: row.event,
      matchId: row.matchId?.toString(),
      round: row.round,
      message: row.message,
      data: row.data,
    });
  }

  function scheduleMatchSettled(row: MatchState, perspective: MatchPerspective): void {
    if (finalizedMatchIds.has(perspective.matchId) || scheduledSettledMatchIds.has(perspective.matchId)) return;
    scheduledSettledMatchIds.add(perspective.matchId);
    scheduleSettledEmit(row, perspective, 0);
  }

  function scheduleSettledEmit(row: MatchState, perspective: MatchPerspective, attempt: number): void {
    const timer = setTimeout(() => {
      settlementTimers.delete(timer);
      const finalRound = Math.max(1, row.currentRound - 1);
      const needsFinalRound =
        row.p1RevealMove !== undefined &&
        row.p2RevealMove !== undefined &&
        !hasRoundResult(row.id, finalRound);

      if (needsFinalRound && attempt < 10) {
        trace('spacetime.match.settle.wait_round_result', {
          matchId: perspective.matchId,
          round: finalRound,
          attempt,
        });
        scheduleSettledEmit(row, perspective, attempt + 1);
        return;
      }

      syncRoundResultForMatch(row.id);
      if (!currentIdentity || finalizedMatchIds.has(perspective.matchId)) return;

      finalizedMatchIds.add(perspective.matchId);
      context.emit({
        type: 'matchSettled',
        matchId: perspective.matchId,
        winner: row.winner === undefined
          ? 'draw'
          : identityEquals(row.winner, currentIdentity)
            ? 'me'
            : 'opponent',
        myScore: perspective.myScore,
        opponentScore: perspective.opponentScore,
        stake: row.stake,
        myRating: perspective.myRating,
        opponentRating: perspective.opponentSideRating,
      });
    }, attempt === 0 ? 0 : 50);
    settlementTimers.add(timer);
  }

  function hasRoundResult(matchId: bigint, round: number): boolean {
    if (!conn) return false;
    for (const row of conn.db.roundResult.iter()) {
      if (row.matchId === matchId && row.round === round) {
        handleRoundResult(row);
        return true;
      }
    }
    return false;
  }

  function clearSettlementTimers(): void {
    for (const timer of settlementTimers) clearTimeout(timer);
    settlementTimers.clear();
  }

  function syncPlayerStats(): void {
    if (!conn || !currentIdentity) return;
    for (const player of conn.db.player.iter()) handlePlayer(player);
  }

  function syncActiveMatchFromCache(): void {
    if (!conn || !currentIdentity) return;
    let latestActive: MatchState | null = null;
    for (const row of conn.db.matchState.iter()) {
      if (!isMyMatch(row) || row.status !== 'active') continue;
      if (!latestActive || row.id > latestActive.id) latestActive = row;
    }
    if (latestActive) handleMatch(latestActive);
  }

  function syncRoundResultsFromCache(): void {
    if (!conn) return;
    for (const row of conn.db.roundResult.iter()) handleRoundResult(row);
  }

  function syncRoundResultForMatch(matchId: bigint): void {
    if (!conn) return;
    for (const row of conn.db.roundResult.iter()) {
      if (row.matchId === matchId) handleRoundResult(row);
    }
  }

  function roundEnergyBefore(row: StdbRoundResult, match: MatchState, isPlayer1: boolean): number {
    if (row.round <= 1) {
      return STARTING_ENERGY + ((isPlayer1 ? match.p1BoostEnabled : match.p2BoostEnabled) ? BOOST_EXTRA_ENERGY : 0);
    }

    for (const previous of conn?.db.roundResult.iter() ?? []) {
      if (previous.matchId === row.matchId && previous.round === row.round - 1) {
        return isPlayer1 ? previous.p1Energy : previous.p2Energy;
      }
    }

    return isPlayer1 ? row.p1Energy : row.p2Energy;
  }

  async function callReducer(name: string, call: () => Promise<unknown>): Promise<void> {
    try {
      await call();
    } catch (err) {
      reportReducerError(name, err);
      throw err;
    }
  }

  function reportReducerError(name: string, err: unknown): void {
    emitError('reducer_failed', errorMessage(err), { reducer: name });
  }

  function isMyMatch(row: MatchState): boolean {
    return !!currentIdentity && (identityEquals(row.p1, currentIdentity) || identityEquals(row.p2, currentIdentity));
  }

  function trace(event: string, data: Record<string, unknown>): void {
    context.emit({ type: 'trace', event, data });
  }

  function emitError(code: string, message: string, metadata: Record<string, unknown>): void {
    context.emit({ type: 'error', code, message, source: 'spacetime', metadata });
  }

  function getMatchSessionKey(): string {
    const suffix = currentUser ? currentUser.id.toString() : 'anonymous';
    return `elmental.stdb.activeMatch.${options.database}.${suffix}`;
  }

  function persistActiveMatchId(matchId: string): void {
    options.matchStorage?.setItem(getMatchSessionKey(), matchId);
  }

  function getPersistedActiveMatchId(): string | null {
    return options.matchStorage?.getItem(getMatchSessionKey()) ?? null;
  }

  function clearPersistedActiveMatchId(): void {
    options.matchStorage?.removeItem(getMatchSessionKey());
  }

  return provider;
}

export function mapMatchPerspective(
  row: MatchState,
  currentIdentity: Identity,
  identityEqualsFn: (a: Identity, b: Identity) => boolean,
): MatchPerspective {
  const isPlayer1 = identityEqualsFn(row.p1, currentIdentity);
  return {
    matchId: row.id.toString(),
    isPlayer1,
    myScore: isPlayer1 ? row.p1Score : row.p2Score,
    opponentScore: isPlayer1 ? row.p2Score : row.p1Score,
    myEnergy: isPlayer1 ? row.p1Energy : row.p2Energy,
    opponentEnergy: isPlayer1 ? row.p2Energy : row.p1Energy,
    opponentName: isPlayer1 ? row.p2Name : row.p1Name,
    opponentRating: isPlayer1 ? row.p2Rating : row.p1Rating,
    mySubmittedMove: ((isPlayer1 ? row.p1RevealMove : row.p2RevealMove) ?? null) as MoveId | null,
    myRating: isPlayer1 ? row.p1Rating : row.p2Rating,
    opponentSideRating: isPlayer1 ? row.p2Rating : row.p1Rating,
    boostEnabled: isPlayer1 ? row.p1BoostEnabled : row.p2BoostEnabled,
  };
}

export function mapRoundResultPerspective(
  row: StdbRoundResult,
  match: MatchState,
  currentIdentity: Identity,
  identityEqualsFn: (a: Identity, b: Identity) => boolean,
  myEnergyBefore?: number,
) {
  const isPlayer1 = identityEqualsFn(match.p1, currentIdentity);
  return {
    type: 'roundResult' as const,
    matchId: row.matchId.toString(),
    round: row.round,
    myMove: (isPlayer1 ? row.p1Move : row.p2Move) as MoveId,
    opponentMove: (isPlayer1 ? row.p2Move : row.p1Move) as MoveId,
    result: (isPlayer1 ? row.p1Result : row.p2Result) as 'win' | 'lose' | 'draw',
    myEnergyBefore: myEnergyBefore ?? (isPlayer1 ? row.p1Energy : row.p2Energy),
    myEnergyAfter: isPlayer1 ? row.p1Energy : row.p2Energy,
    opponentEnergy: isPlayer1 ? row.p2Energy : row.p1Energy,
    myScore: isPlayer1 ? row.p1Score : row.p2Score,
    opponentScore: isPlayer1 ? row.p2Score : row.p1Score,
    wasOverclocked: row.overclockSeed !== undefined,
  };
}

function mapRoundPhase(serverPhase: string, submittedMove: MoveId | null): ProviderRoundPhase {
  if (serverPhase === 'result') return 'result';
  if (serverPhase === 'reveal') return submittedMove === null ? 'select' : 'commit';
  if (serverPhase === 'commit') return submittedMove === null ? 'select' : 'commit';
  return 'select';
}

function identityEquals(a: Identity, b: Identity): boolean {
  return a.isEqual(b);
}

function displayName(user: PlayerProfileInput): string {
  return playerDisplayName(user);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function getSpacetimeUri(): string {
  return (import.meta.env.VITE_SPACETIME_URI ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function getDatabaseName(): string {
  return import.meta.env.VITE_SPACETIME_DB ?? 'elmental';
}

export function getMatchRoom(): string {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room') ?? params.get('lobby') ?? 'public';
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'public';
}

export function getBotFallbackSeconds(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('botFallbackSeconds')
    ?? params.get('bot_fallback_seconds')
    ?? import.meta.env.VITE_BOT_FALLBACK_SECONDS
    ?? '30';
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return 30;
  return Math.max(0, Math.min(120, Math.floor(seconds)));
}

export function createDefaultSpacetimeProvider(context: GameplayProviderContext): GameplayProvider {
  return createSpacetimeProvider(context, {
    uri: getSpacetimeUri(),
    database: getDatabaseName(),
    room: getMatchRoom(),
    tokenStorage: sessionStorage,
    matchStorage: sessionStorage,
  });
}
