import { Identity } from 'spacetimedb';
import { BOOST_EXTRA_ENERGY, MoveId, STARTING_ENERGY } from '@elmental/shared';
import { DbConnection } from '../../module_bindings';
import { playerAccountId, playerDisplayName } from '../playerProfile';
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

interface PendingReveal {
  matchId: string;
  round: number;
  move: MoveId;
  salt: string;
  hash: string;
  attempts: number;
}

const MIN_REVEAL_DELAY_MS = 1_550;
const REVEAL_RETRY_MS = 500;
const MAX_REVEAL_ATTEMPTS = 20;

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
  const revealTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingReveals = new Map<string, PendingReveal>();

  const provider: GameplayProvider = {
    async initialize(user) {
      currentUser = user;
      trace('spacetime.initialize', {
        user: displayName(user),
        accountId: playerAccountId(user),
        source: user.source ?? 'web',
        hasInitData: !!user.initData,
        db: options.database,
        uri: options.uri,
      });
      await ensureConnection(user);
    },

    async updateProfile(user) {
      currentUser = user;
      const connection = await ensureConnection(user);
      await callReducer('setProfile', () => connection.reducers.setProfile({
        name: displayName(user),
        accountId: playerAccountId(user),
      }));
    },

    async startMatchmaking(request) {
      const connection = await ensureConnection(currentUser ?? undefined);
      trace('spacetime.queue.join.call', {
        name: request.name,
        accountId: request.accountId,
        stake: request.stake,
        mode: request.mode,
        room: request.room,
        boostEnabled: request.boostEnabled,
      });
      await callReducer('joinQueue', () => connection.reducers.joinQueue({
        ...request,
        botFallbackSeconds: undefined,
      }));
    },

    cancelMatchmaking() {
      trace('spacetime.queue.leave.call', {});
      conn?.reducers.leaveQueue({}).catch((err) => reportReducerError('leaveQueue', err));
    },

    async submitMove(moveId) {
      if (!activeMatch || !conn) return;
      const match = activeMatch;
      const matchId = match.id.toString();
      const round = match.currentRound;
      const salt = createRevealSalt(matchId, round, moveId);
      const hash = commitHash(moveId, salt);
      const pending: PendingReveal = { matchId, round, move: moveId, salt, hash, attempts: 0 };
      pendingReveals.set(pendingKey(matchId, round), pending);
      savePendingReveal(pending);

      trace('spacetime.move.commit.call', {
        matchId,
        round,
        move: moveId,
        hash,
      });
      await callReducer('commitMove', () => conn?.reducers.commitMove({
        matchId: match.id,
        hash,
      }) ?? Promise.resolve());
      attemptRevealForMatch(match);
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
      clearRevealTimers();
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
    const tokenKey = profile ? `elmental.stdb.token.${playerAccountId(profile)}` : 'elmental.stdb.token';
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
                connected.reducers.setProfile({
                  name: displayName(profile),
                  accountId: playerAccountId(profile),
                }).catch((err) => reportReducerError('setProfile', err));
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
    trace('spacetime.player.update', {
      name: row.name,
      balance: row.balance,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
    });
    context.emit({
      type: 'playerStats',
      name: row.name,
      elmBalance: row.balance,
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
    const mySide = matchSideForCurrentAccount(row);
    if (!currentIdentity || !mySide) return;
    const perspective = mapMatchPerspective(row, currentIdentity, identityEquals, mySide === 'p1');
    const persistedMatchId = getPersistedActiveMatchId();
    const pendingMove = pendingMoveFor(row);
    const selectedMove = perspective.mySubmittedMove ?? pendingMove;

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
      p1Commit: row.p1CommitHash !== undefined,
      p2Commit: row.p2CommitHash !== undefined,
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
          phase: mapRoundPhase(row.phase, selectedMove),
          status: 'active',
          currentRound: row.currentRound,
          selectedMove,
          myEnergy: perspective.myEnergy,
          opponentEnergy: perspective.opponentEnergy,
          myScore: perspective.myScore,
          opponentScore: perspective.opponentScore,
        });
      } else if (row.phase === 'result') {
        syncRoundResultForMatch(row.id);
      }

      attemptRevealForMatch(row);
    }

    if (row.status === 'settled') {
      scheduleMatchSettled(row, perspective);
    }
  }

  function handleRoundResult(row: StdbRoundResult): void {
    if (!activeMatch || row.matchId !== activeMatch.id || !currentIdentity) return;
    const mySide = matchSideForCurrentAccount(activeMatch);
    if (!mySide) return;
    const rowKey = row.id.toString();
    if (processedRoundIds.has(rowKey)) return;
    processedRoundIds.add(rowKey);
    clearPendingReveal(row.matchId.toString(), row.round);
    const isPlayer1 = mySide === 'p1';
    const result = mapRoundResultPerspective(
      row,
      activeMatch,
      currentIdentity,
      identityEquals,
      roundEnergyBefore(row, activeMatch, isPlayer1),
      isPlayer1,
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
      clearRevealTimersForMatch(perspective.matchId);
      context.emit({
        type: 'matchSettled',
        matchId: perspective.matchId,
        winner: row.winner === undefined
          ? 'draw'
          : isWinnerForPerspective(row, perspective)
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

  function attemptRevealForMatch(row: MatchState): void {
    if (!conn || !currentIdentity || row.status !== 'active') return;
    const pending = getPendingReveal(row.id.toString(), row.currentRound);
    if (!pending) return;

    const mySide = matchSideForCurrentAccount(row);
    if (!mySide) return;
    const isPlayer1 = mySide === 'p1';
    const myCommit = isPlayer1 ? row.p1CommitHash : row.p2CommitHash;
    const opponentCommit = isPlayer1 ? row.p2CommitHash : row.p1CommitHash;
    const myReveal = isPlayer1 ? row.p1RevealMove : row.p2RevealMove;
    if (myReveal !== undefined) {
      clearPendingReveal(pending.matchId, pending.round);
      return;
    }
    if (!myCommit || !opponentCommit) return;
    if (myCommit !== pending.hash) {
      trace('spacetime.move.reveal.skipped_hash_mismatch', {
        matchId: pending.matchId,
        round: pending.round,
      });
      clearPendingReveal(pending.matchId, pending.round);
      return;
    }

    scheduleReveal(pending, revealDelayMs(row));
  }

  function scheduleReveal(pending: PendingReveal, delayMs: number): void {
    const key = pendingKey(pending.matchId, pending.round);
    if (revealTimers.has(key)) return;
    const timer = setTimeout(() => {
      revealTimers.delete(key);
      void revealPendingMove(pending);
    }, Math.max(0, delayMs));
    revealTimers.set(key, timer);
  }

  async function revealPendingMove(pending: PendingReveal): Promise<void> {
    if (!conn) return;
    if (!isPendingRevealStillCurrent(pending)) {
      clearPendingReveal(pending.matchId, pending.round);
      return;
    }

    trace('spacetime.move.reveal.call', {
      matchId: pending.matchId,
      round: pending.round,
      move: pending.move,
      attempt: pending.attempts + 1,
    });

    try {
      await conn.reducers.revealMove({
        matchId: BigInt(pending.matchId),
        move: pending.move,
        salt: pending.salt,
      });
    } catch (err) {
      const message = errorMessage(err);
      if (/Match is not active|Player already revealed/i.test(message)) {
        clearPendingReveal(pending.matchId, pending.round);
        return;
      }
      if (pending.attempts < MAX_REVEAL_ATTEMPTS && shouldRetryReveal(message)) {
        const retry = { ...pending, attempts: pending.attempts + 1 };
        pendingReveals.set(pendingKey(retry.matchId, retry.round), retry);
        savePendingReveal(retry);
        scheduleReveal(retry, REVEAL_RETRY_MS);
        return;
      }
      reportReducerError('revealMove', err);
    }
  }

  function isPendingRevealStillCurrent(pending: PendingReveal): boolean {
    if (!activeMatch || !currentIdentity) return false;
    if (activeMatch.id.toString() !== pending.matchId) return false;
    if (activeMatch.status !== 'active') return false;
    if (activeMatch.currentRound !== pending.round) return false;

    const isPlayer1 = identityEquals(activeMatch.p1, currentIdentity);
    const myCommit = isPlayer1 ? activeMatch.p1CommitHash : activeMatch.p2CommitHash;
    const opponentCommit = isPlayer1 ? activeMatch.p2CommitHash : activeMatch.p1CommitHash;
    const myReveal = isPlayer1 ? activeMatch.p1RevealMove : activeMatch.p2RevealMove;
    return myCommit === pending.hash && !!opponentCommit && myReveal === undefined;
  }

  function shouldRetryReveal(message: string): boolean {
    return /Reveal too early|Both players must commit|Commit before revealing/i.test(message);
  }

  function revealDelayMs(row: MatchState): number {
    const roundStartedAt = Number(row.roundStartedAtMicros / 1000n);
    if (!Number.isFinite(roundStartedAt) || roundStartedAt <= 0) return MIN_REVEAL_DELAY_MS;
    return roundStartedAt + MIN_REVEAL_DELAY_MS - Date.now();
  }

  function pendingMoveFor(row: MatchState): MoveId | null {
    const pending = getPendingReveal(row.id.toString(), row.currentRound);
    return pending?.move ?? null;
  }

  function getPendingReveal(matchId: string, round: number): PendingReveal | null {
    const key = pendingKey(matchId, round);
    const existing = pendingReveals.get(key);
    if (existing) return existing;

    try {
      const raw = options.matchStorage?.getItem(pendingStorageKey(matchId, round));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PendingReveal;
      if (parsed.matchId !== matchId || parsed.round !== round) return null;
      if (!/^[a-f0-9]{32}$/.test(parsed.hash)) return null;
      pendingReveals.set(key, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  function savePendingReveal(pending: PendingReveal): void {
    options.matchStorage?.setItem(pendingStorageKey(pending.matchId, pending.round), JSON.stringify(pending));
  }

  function clearPendingReveal(matchId: string, round: number): void {
    const key = pendingKey(matchId, round);
    const timer = revealTimers.get(key);
    if (timer) clearTimeout(timer);
    revealTimers.delete(key);
    pendingReveals.delete(key);
    options.matchStorage?.removeItem(pendingStorageKey(matchId, round));
  }

  function clearRevealTimers(): void {
    for (const timer of revealTimers.values()) clearTimeout(timer);
    revealTimers.clear();
  }

  function clearRevealTimersForMatch(matchId: string): void {
    for (const [key, timer] of revealTimers) {
      if (!key.startsWith(`${matchId}:`)) continue;
      clearTimeout(timer);
      revealTimers.delete(key);
    }
    for (const key of pendingReveals.keys()) {
      if (!key.startsWith(`${matchId}:`)) continue;
      pendingReveals.delete(key);
    }
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
    return matchSideForCurrentAccount(row) !== null;
  }

  function matchSideForCurrentAccount(row: MatchState): 'p1' | 'p2' | null {
    if (!currentIdentity) return null;
    if (identityEquals(row.p1, currentIdentity)) return 'p1';
    if (identityEquals(row.p2, currentIdentity)) return 'p2';
    if (!conn || !currentUser) return null;

    const accountId = playerAccountId(currentUser);
    const p1Player = conn.db.player.identity.find(row.p1);
    if (p1Player && accountIdForPlayerRow(p1Player) === accountId) return 'p1';
    const p2Player = conn.db.player.identity.find(row.p2);
    if (p2Player && accountIdForPlayerRow(p2Player) === accountId) return 'p2';
    return null;
  }

  function accountIdForPlayerRow(row: Player): string {
    return row.accountId || `identity:${row.identity.toHexString()}`;
  }

  function trace(event: string, data: Record<string, unknown>): void {
    context.emit({ type: 'trace', event, data });
  }

  function emitError(code: string, message: string, metadata: Record<string, unknown>): void {
    context.emit({ type: 'error', code, message, source: 'spacetime', metadata });
  }

  function getMatchSessionKey(): string {
    const suffix = playerAccountId(currentUser);
    return `elmental.stdb.activeMatch.${options.database}.${suffix}`;
  }

  function pendingStorageKey(matchId: string, round: number): string {
    const suffix = playerAccountId(currentUser);
    return `elmental.stdb.pendingReveal.${options.database}.${suffix}.${matchId}.${round}`;
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
  isPlayer1Override?: boolean,
): MatchPerspective {
  const isPlayer1 = isPlayer1Override ?? identityEqualsFn(row.p1, currentIdentity);
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
  isPlayer1Override?: boolean,
) {
  const isPlayer1 = isPlayer1Override ?? identityEqualsFn(match.p1, currentIdentity);
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
  if (serverPhase === 'reveal') return submittedMove === null ? 'commit' : 'reveal';
  if (serverPhase === 'commit') return submittedMove === null ? 'select' : 'commit';
  return 'select';
}

function isWinnerForPerspective(row: MatchState, perspective: MatchPerspective): boolean {
  if (row.winner === undefined) return false;
  const myIdentity = perspective.isPlayer1 ? row.p1 : row.p2;
  return identityEquals(row.winner, myIdentity);
}

function identityEquals(a: Identity, b: Identity): boolean {
  return a.isEqual(b);
}

function displayName(user: PlayerProfileInput): string {
  return playerDisplayName(user);
}

function pendingKey(matchId: string, round: number): string {
  return `${matchId}:${round}`;
}

function createRevealSalt(matchId: string, round: number, move: MoveId): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const randomHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `client:${matchId}:${round}:${move}:${randomHex}`.slice(0, 128);
}

function commitHash(move: MoveId, salt: string): string {
  const value = `${move}:${salt}`;
  return `${hashHex(`${value}:0`)}${hashHex(`${value}:1`)}${hashHex(`${value}:2`)}${hashHex(`${value}:3`)}`;
}

function hashHex(value: string): string {
  return hash32(value).toString(16).padStart(8, '0');
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
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

export function createDefaultSpacetimeProvider(context: GameplayProviderContext): GameplayProvider {
  return createSpacetimeProvider(context, {
    uri: getSpacetimeUri(),
    database: getDatabaseName(),
    room: getMatchRoom(),
    tokenStorage: createPersistentTokenStorage(),
    matchStorage: sessionStorage,
  });
}

function createPersistentTokenStorage(): Storage {
  return {
    get length() {
      try {
        return localStorage.length;
      } catch {
        return 0;
      }
    },

    clear() {
      try {
        localStorage.clear();
      } catch {
        // Ignore unavailable browser storage.
      }
      try {
        sessionStorage.clear();
      } catch {
        // Ignore unavailable browser storage.
      }
    },

    getItem(key: string) {
      try {
        const persisted = localStorage.getItem(key);
        if (persisted) return persisted;
      } catch {
        // Fall back to the legacy session token below.
      }

      try {
        const legacySessionToken = sessionStorage.getItem(key);
        if (legacySessionToken) {
          try {
            localStorage.setItem(key, legacySessionToken);
          } catch {
            // Keep using the legacy token for this tab.
          }
          return legacySessionToken;
        }
      } catch {
        // Browser storage can be blocked in embedded contexts.
      }

      return null;
    },

    key(index: number) {
      try {
        return localStorage.key(index);
      } catch {
        return null;
      }
    },

    removeItem(key: string) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore unavailable browser storage.
      }
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Ignore unavailable browser storage.
      }
    },

    setItem(key: string, value: string) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Ignore unavailable browser storage.
      }
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // Ignore unavailable browser storage.
      }
    },
  };
}
