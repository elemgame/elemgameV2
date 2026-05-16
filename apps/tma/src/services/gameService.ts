import { Identity } from 'spacetimedb';
import {
  BOOST_PERCENT,
  GameMode,
  MoveId,
  RAKE_PERCENT,
  calculateElo,
  calculatePayout,
  getEnergyLevel,
} from '@elmental/shared';
import { DbConnection } from '../module_bindings';
import type {
  GameEvent,
  MatchState,
  Player,
  QueueEntry,
  RoundResult as StdbRoundResult,
} from '../module_bindings/types';
import { useGameStore, type EconomyTransaction, type EnergyLevel } from '../stores/gameStore';
import { showAlert } from './telegram';
import { playSound } from './audio';
import {
  startMockMatchmaking,
  cancelMockMatchmaking,
  submitMockMove,
  advanceMockRound,
  forfeitMockMatch,
  applyMockResults,
} from './mockGame';

const MATCH_STAKE = 100;
const ROUND_SECONDS = 15;

const TRANSPORT = (import.meta.env.VITE_GAME_TRANSPORT ?? 'spacetime').toLowerCase();
const FORCE_MOCK = TRANSPORT === 'mock';
const TRACE_ENABLED = import.meta.env.VITE_GAME_TRACE !== 'false';

interface AuthUserInput {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

let conn: DbConnection | null = null;
let connectPromise: Promise<DbConnection> | null = null;
let currentIdentity: Identity | null = null;
let currentUser: AuthUserInput | null = null;
let wiredConnection: DbConnection | null = null;
let activeMatch: MatchState | null = null;
let pendingReveal: { matchId: bigint; round: number; move: MoveId; salt: string; revealed: boolean } | null = null;
let roundTimerInterval: ReturnType<typeof setInterval> | null = null;
let queueRemovalTimer: ReturnType<typeof setTimeout> | null = null;
const deductedMatchIds = new Set<string>();
const processedRoundIds = new Set<string>();
const finalizedMatchIds = new Set<string>();
const finalizingMatchIds = new Set<string>();

function getSpacetimeUri(): string {
  return (import.meta.env.VITE_SPACETIME_URI ?? 'http://localhost:3000').replace(/\/$/, '');
}

function getDatabaseName(): string {
  return import.meta.env.VITE_SPACETIME_DB ?? 'elmental';
}

function getMatchRoom(): string {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room') ?? params.get('lobby') ?? 'public';
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'public';
}

export async function initializeGameSession(user: AuthUserInput): Promise<void> {
  currentUser = user;
  trace('session.initialize', { user: user.first_name, transport: TRANSPORT, db: getDatabaseName(), uri: getSpacetimeUri() });
  if (FORCE_MOCK) {
    useGameStore.getState().setPlayerStats({
      elmBalance: 1000,
      rating: 1200,
      wins: 12,
      losses: 8,
    });
    return;
  }

  try {
    await ensureConnection(user);
  } catch (err) {
    console.warn('[game] SpacetimeDB connection failed:', err);
    useGameStore.getState().setPlayerStats({
      elmBalance: 1000,
      rating: 1200,
      wins: 0,
      losses: 0,
    });
  }
}

async function ensureConnection(user?: AuthUserInput): Promise<DbConnection> {
  if (conn?.isActive) return conn;
  if (connectPromise) return connectPromise;

  const profile = user ?? currentUser;
  const tokenKey = profile ? `elmental.stdb.token.${profile.id}` : 'elmental.stdb.token';
  const token = sessionStorage.getItem(tokenKey) ?? undefined;

  connectPromise = new Promise((resolve, reject) => {
    trace('stdb.connect.start', { tokenKey, hasToken: !!token });
    const connection = DbConnection.builder()
      .withUri(getSpacetimeUri())
      .withDatabaseName(getDatabaseName())
      .withToken(token)
      .withCompression('none')
      .onConnect((connected, identity, authToken) => {
        conn = connected;
        currentIdentity = identity;
        trace('stdb.connect.ok', { identity: identity.toHexString() });
        sessionStorage.setItem(tokenKey, authToken);
        wireCallbacks(connected);
        connected
          .subscriptionBuilder()
          .onApplied(() => {
            trace('stdb.subscription.applied', {});
            if (profile) {
              trace('reducer.setProfile.call', { name: displayName(profile) });
              connected.reducers.setProfile({ name: displayName(profile) }).catch(reportReducerError);
            }
            syncPlayerStats();
            syncActiveMatchFromCache();
            syncRoundResultsFromCache();
            resolve(connected);
          })
          .onError((ctx) => {
            console.warn('[game] SpacetimeDB subscription failed:', ctx);
            reject(new Error('SpacetimeDB subscription failed'));
          })
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => {
        trace('stdb.connect.error', { error: errorMessage(error) });
        connectPromise = null;
        reject(error);
      })
      .onDisconnect((_ctx, error) => {
        if (error) console.warn('[game] SpacetimeDB disconnected:', error);
        trace('stdb.disconnect', { error: error ? errorMessage(error) : undefined });
        conn = null;
        connectPromise = null;
        currentIdentity = null;
        wiredConnection = null;
        activeMatch = null;
        pendingReveal = null;
        stopRoundTimer();
        clearQueueRemovalTimer();
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

export async function startMatchmaking(): Promise<void> {
  if (FORCE_MOCK) {
    startMockMatchmaking();
    return;
  }

  const store = useGameStore.getState();
  try {
    const connection = await ensureConnection(store.telegramUser ?? undefined);
    clearQueueRemovalTimer();
    trace('matchmaking.join.call', {
      name: displayName(store.telegramUser ?? currentUser),
      stake: MATCH_STAKE,
      mode: store.gameMode,
      room: getMatchRoom(),
      boostEnabled: store.boostEnabled,
    });
    store.startMatchmaking();
    await connection.reducers.joinQueue({
      name: displayName(store.telegramUser ?? currentUser),
      stake: MATCH_STAKE,
      mode: store.gameMode,
      room: getMatchRoom(),
      boostEnabled: store.boostEnabled,
    });
  } catch (err) {
    console.error('[game] Failed to join SpacetimeDB queue:', err);
    store.cancelMatchmaking();
    await showAlert('SpacetimeDB is unavailable. Run spacetime start and publish the module, or set VITE_GAME_TRANSPORT=mock.');
  }
}

export function cancelMatchmaking(): void {
  if (FORCE_MOCK) {
    cancelMockMatchmaking();
    return;
  }

  stopRoundTimer();
  clearQueueRemovalTimer();
  trace('matchmaking.leave.call', {});
  conn?.reducers.leaveQueue({}).catch(reportReducerError);
  useGameStore.getState().cancelMatchmaking();
}

export async function submitMove(moveId: MoveId): Promise<void> {
  if (FORCE_MOCK || !activeMatch) {
    submitMockMove(moveId);
    return;
  }

  const store = useGameStore.getState();
  if (store.roundPhase !== 'select') return;

  stopRoundTimer();
  store.selectMove(moveId);
  playSound('commit');
  pendingReveal = null;

  trace('move.submit.call', {
    matchId: activeMatch.id.toString(),
    round: activeMatch.currentRound,
    move: moveId,
  });
  await conn?.reducers.submitMove({
    matchId: activeMatch.id,
    move: moveId,
  }).catch(reportReducerError);
}

export function advanceRound(): void {
  if (FORCE_MOCK || !activeMatch) {
    advanceMockRound();
    return;
  }

  if (activeMatch.phase === 'result') {
    trace('round.next.call', { matchId: activeMatch.id.toString(), round: activeMatch.currentRound });
    conn?.reducers.nextRound({ matchId: activeMatch.id }).catch(reportReducerError);
  }
}

export function forfeitMatch(): void {
  if (FORCE_MOCK || !activeMatch) {
    forfeitMockMatch();
    return;
  }

  stopRoundTimer();
  trace('match.forfeit.call', { matchId: activeMatch.id.toString() });
  conn?.reducers.forfeitMatch({ matchId: activeMatch.id }).catch(reportReducerError);
}

export function applyResults(action: 'home' | 'playAgain'): void {
  if (FORCE_MOCK) {
    applyMockResults(action);
    return;
  }

  clearPersistedActiveMatchId();
  activeMatch = null;
  pendingReveal = null;
  stopRoundTimer();
  clearQueueRemovalTimer();

  const store = useGameStore.getState();
  store.resetMatch();
  if (action === 'playAgain') {
    void startMatchmaking();
  } else {
    store.setScreen('home');
  }
}

function handlePlayer(row: Player): void {
  if (!currentIdentity || !identityEquals(row.identity, currentIdentity)) return;
  trace('player.update', { name: row.name, rating: row.rating, wins: row.wins, losses: row.losses });
  useGameStore.getState().setPlayerStats({
    elmBalance: useGameStore.getState().elmBalance || 1000,
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
  });
}

function handleQueueEntry(row: QueueEntry): void {
  if (!currentIdentity || !identityEquals(row.identity, currentIdentity)) return;
  clearQueueRemovalTimer();
  trace('queue.entry.active', {
    name: row.name,
    room: row.room,
    mode: row.mode,
    stake: row.stake,
  });
}

function handleQueueRemoved(row: QueueEntry): void {
  if (!currentIdentity || !identityEquals(row.identity, currentIdentity)) return;
  clearQueueRemovalTimer();
  trace('queue.entry.removed', {
    name: row.name,
    room: row.room,
    mode: row.mode,
    stake: row.stake,
  });

  queueRemovalTimer = setTimeout(() => {
    const store = useGameStore.getState();
    if (store.matchStatus !== 'queuing') return;
    if (activeMatch?.status === 'active') return;

    trace('matchmaking.expired.local', { room: getMatchRoom() });
    store.cancelMatchmaking();
    void showAlert('Matchmaking expired. Tap PLAY NOW to search again.');
  }, 1000);
}

function handleMatch(row: MatchState): void {
  if (!currentIdentity || !isMyMatch(row)) return;

  const currentStoreMatchId = useGameStore.getState().matchId;
  const persistedMatchId = getPersistedActiveMatchId();
  const rowMatchId = row.id.toString();
  if (
    row.status === 'active' &&
    activeMatch?.status === 'active' &&
    activeMatch.id !== row.id &&
    row.id < activeMatch.id
  ) {
    trace('match.update.ignored_old_active', {
      matchId: row.id.toString(),
      activeMatchId: activeMatch.id.toString(),
      phase: row.phase,
    });
    return;
  }

  const matchesCurrentContext =
    currentStoreMatchId === rowMatchId ||
    activeMatch?.id === row.id ||
    persistedMatchId === rowMatchId;

  if (row.status === 'settled' && !matchesCurrentContext) {
    trace('match.update.ignored_old_settled', {
      matchId: rowMatchId,
      currentMatchId: currentStoreMatchId,
      persistedMatchId,
    });
    return;
  }

  activeMatch = row;
  if (row.status === 'active') {
    clearQueueRemovalTimer();
    persistActiveMatchId(rowMatchId);
  }
  trace('match.update', {
    matchId: rowMatchId,
    phase: row.phase,
    status: row.status,
    round: row.currentRound,
    p1: row.p1Name,
    p2: row.p2Name,
    p1Committed: row.p1CommitHash !== undefined,
    p2Committed: row.p2CommitHash !== undefined,
    p1Move: row.p1RevealMove,
    p2Move: row.p2RevealMove,
  });
  const isP1 = identityEquals(row.p1, currentIdentity);
  const myScore = isP1 ? row.p1Score : row.p2Score;
  const opponentScore = isP1 ? row.p2Score : row.p1Score;
  const myEnergy = isP1 ? row.p1Energy : row.p2Energy;
  const opponentEnergy = isP1 ? row.p2Energy : row.p1Energy;
  const opponentName = isP1 ? row.p2Name : row.p1Name;
  const opponentRating = isP1 ? row.p2Rating : row.p1Rating;
  const mySubmittedMove = isP1 ? row.p1RevealMove : row.p2RevealMove;

  if (row.status === 'active' && useGameStore.getState().matchId !== rowMatchId) {
    applyMatchFound(row, opponentName, opponentRating, isP1, myEnergy, opponentEnergy);
  }

  const store = useGameStore.getState();
  if (row.status === 'active') {
    store.updateEnergy(myEnergy);
    store.updateScores(myScore, opponentScore);
    store.updateOpponentEnergyLevel(toStoreEnergyLevel(getEnergyLevel(opponentEnergy)));

    if (row.phase === 'select' || row.phase === 'commit' || row.phase === 'reveal') {
      const localPhase = mySubmittedMove === undefined ? 'select' : 'commit';
      useGameStore.setState({
        currentRound: row.currentRound,
        roundPhase: localPhase,
        selectedMove: mySubmittedMove ?? null,
      });
      if (localPhase === 'select') {
        startRoundTimer();
      } else {
        stopRoundTimer();
      }
    } else if (row.phase === 'result') {
      syncRoundResultForMatch(row.id);
    }
  }

  if (row.status === 'settled' && useGameStore.getState().matchId !== rowMatchId) {
    applyMatchFound(row, opponentName, opponentRating, isP1, myEnergy, opponentEnergy);
  }

  const matchKey = rowMatchId;
  if (row.status === 'settled' && !finalizedMatchIds.has(matchKey) && !finalizingMatchIds.has(matchKey)) {
    finalizingMatchIds.add(matchKey);
    stopRoundTimer();
    pendingReveal = null;
    setTimeout(() => {
      if (finishFromMatch(row)) {
        finalizedMatchIds.add(matchKey);
      } else {
        finalizingMatchIds.delete(matchKey);
      }
    }, 50);
  }
}

function applyMatchFound(
  row: MatchState,
  opponentName: string,
  opponentRating: number,
  isP1: boolean,
  myEnergy: number,
  opponentEnergy: number,
): void {
  const store = useGameStore.getState();
  const matchKey = row.id.toString();
  persistActiveMatchId(matchKey);
  const boostEnabledForMatch = isP1 ? row.p1BoostEnabled : row.p2BoostEnabled;
  const boostStake = boostEnabledForMatch ? Math.ceil((MATCH_STAKE * BOOST_PERCENT) / 100) : 0;

  if (!deductedMatchIds.has(matchKey)) {
    deductedMatchIds.add(matchKey);
    store.setPlayerStats({
      elmBalance: store.elmBalance - MATCH_STAKE - boostStake,
      rating: store.rating,
      wins: store.stats.wins,
      losses: store.stats.losses,
    });
    addTx('stake', -MATCH_STAKE, matchKey, `Staked ${MATCH_STAKE} ELM for match vs ${opponentName}`);
    if (boostStake > 0) {
      addTx('stake', -boostStake, matchKey, `Energy Boost investment: ${boostStake} ELM`);
    }
  }

  trace('match.found', { matchId: matchKey, opponentName, opponentRating, isP1 });
  useGameStore.setState({ matchStake: MATCH_STAKE, matchBoostStake: boostStake });
  store.setMatchFound(matchKey, opponentName, opponentRating, isP1);
  useGameStore.setState({
    currentRound: row.currentRound,
    myEnergy,
    opponentEnergyLevel: toStoreEnergyLevel(getEnergyLevel(opponentEnergy)),
    myScore: isP1 ? row.p1Score : row.p2Score,
    opponentScore: isP1 ? row.p2Score : row.p1Score,
  });
  startRoundTimer();
}

function maybeReveal(row: MatchState): void {
  if (!pendingReveal || pendingReveal.matchId !== row.id || pendingReveal.round !== row.currentRound) return;
  if (row.phase !== 'reveal') return;

  const isP1 = currentIdentity ? identityEquals(row.p1, currentIdentity) : false;
  const hasOwnCommit = isP1 ? row.p1CommitHash !== undefined : row.p2CommitHash !== undefined;
  if (!hasOwnCommit || pendingReveal.revealed) return;

  pendingReveal.revealed = true;
  trace('move.reveal.call', { matchId: row.id.toString(), round: row.currentRound, move: pendingReveal.move });
  conn?.reducers.revealMove({
    matchId: row.id,
    move: pendingReveal.move,
    salt: pendingReveal.salt,
  }).catch((err) => {
    if (pendingReveal?.matchId === row.id && pendingReveal.round === row.currentRound) {
      pendingReveal.revealed = false;
    }
    reportReducerError(err);
  });
}

function handleRoundResult(row: StdbRoundResult): void {
  if (!activeMatch || row.matchId !== activeMatch.id) return;
  const rowKey = row.id.toString();
  if (processedRoundIds.has(rowKey)) return;
  processedRoundIds.add(rowKey);
  stopRoundTimer();
  pendingReveal = null;
  trace('round.result', {
    matchId: row.matchId.toString(),
    round: row.round,
    p1Move: row.p1Move,
    p2Move: row.p2Move,
    p1Result: row.p1Result,
    p2Result: row.p2Result,
    score: `${row.p1Score}:${row.p2Score}`,
  });

  if (!currentIdentity) return;
  const isP1 = identityEquals(activeMatch.p1, currentIdentity);
  const myMove = isP1 ? row.p1Move : row.p2Move;
  const opponentMove = isP1 ? row.p2Move : row.p1Move;
  const myEnergy = isP1 ? row.p1Energy : row.p2Energy;
  const opponentEnergy = isP1 ? row.p2Energy : row.p1Energy;
  const myScore = isP1 ? row.p1Score : row.p2Score;
  const opponentScore = isP1 ? row.p2Score : row.p1Score;
  const result = (isP1 ? row.p1Result : row.p2Result) as 'win' | 'lose' | 'draw';
  const opponentEnergyLevel = toStoreEnergyLevel(getEnergyLevel(opponentEnergy));
  const store = useGameStore.getState();

  useGameStore.setState({ currentRound: row.round });
  store.updateEnergy(myEnergy);
  store.updateScores(myScore, opponentScore);
  store.updateOpponentEnergyLevel(opponentEnergyLevel);
  store.setLastRoundResult({
    myMove,
    opponentMove,
    result,
    myEnergyAfter: myEnergy,
    opponentEnergyLevel,
    wasOverclocked: row.overclockSeed !== undefined,
  });
  store.setRoundPhase('result');
}

function handleGameEvent(row: GameEvent): void {
  const matchId = row.matchId?.toString();
  trace('server.event', {
    event: row.event,
    matchId,
    round: row.round,
    message: row.message,
    data: row.data,
  });
}

function finishFromMatch(row: MatchState): boolean {
  if (!currentIdentity || !isMyMatch(row)) {
    trace('match.finish.skipped', {
      matchId: row.id.toString(),
      hasIdentity: !!currentIdentity,
      isMine: currentIdentity ? isMyMatch(row) : false,
    });
    return false;
  }

  stopRoundTimer();
  pendingReveal = null;
  activeMatch = row;
  const store = useGameStore.getState();
  const isP1 = identityEquals(row.p1, currentIdentity);
  const myScore = isP1 ? row.p1Score : row.p2Score;
  const opponentScore = isP1 ? row.p2Score : row.p1Score;
  const winner = row.winner === undefined
    ? 'draw'
    : identityEquals(row.winner, currentIdentity)
      ? 'me'
      : 'opponent';
  const won = winner === 'me';
  const isDraw = winner === 'draw';
  const { winnerPayout, rake } = calculatePayout(row.stake, RAKE_PERCENT);
  const boostStake = store.matchBoostStake;

  let ratingDelta = 0;
  if (!isDraw) {
    const myRating = isP1 ? row.p1Rating : row.p2Rating;
    const opponentRating = isP1 ? row.p2Rating : row.p1Rating;
    const elo = calculateElo(won ? myRating : opponentRating, won ? opponentRating : myRating);
    ratingDelta = won ? elo.newWinner - myRating : elo.newLoser - myRating;
  }

  let balanceDelta = 0;
  if (isDraw) {
    balanceDelta = row.stake + boostStake;
    addTx('win', row.stake, row.id.toString(), `Draw. Stake refunded: ${row.stake} ELM`);
    if (boostStake > 0) addTx('boost_return', boostStake, row.id.toString(), `Boost refunded: ${boostStake} ELM`);
  } else if (won) {
    balanceDelta = winnerPayout + boostStake;
    addTx('win', winnerPayout, row.id.toString(), `Won. Payout: ${winnerPayout} ELM`);
    if (boostStake > 0) addTx('boost_return', boostStake, row.id.toString(), `Boost returned: ${boostStake} ELM`);
  } else {
    addTx('loss', -row.stake, row.id.toString(), `Lost match. Stake ${row.stake} ELM forfeited.`);
    if (boostStake > 0) addTx('boost_burn', -boostStake, row.id.toString(), `Boost burned: ${boostStake} ELM`);
  }

  store.setPlayerStats({
    elmBalance: store.elmBalance + balanceDelta,
    rating: store.rating + ratingDelta,
    wins: store.stats.wins + (won ? 1 : 0),
    losses: store.stats.losses + (!won && !isDraw ? 1 : 0),
  });

  store.setMatchResult({
    winner,
    myScore,
    opponentScore,
    elmEarned: isDraw ? 0 : won ? winnerPayout - row.stake + boostStake : -row.stake - boostStake,
    ratingChange: ratingDelta,
    rounds: store.roundHistory,
    stake: row.stake,
    rake,
    boostStake,
    boostBurned: !won && !isDraw && boostStake > 0,
    boostReturned: (won || isDraw) && boostStake > 0,
    totalPool: row.stake * 2,
    winnerPayout,
  });
  trace('match.finish.applied', { matchId: row.id.toString(), winner, score: `${myScore}:${opponentScore}` });
  return true;
}

function syncPlayerStats(): void {
  if (!conn || !currentIdentity) return;
  for (const player of conn.db.player.iter()) {
    handlePlayer(player);
  }
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
  for (const row of conn.db.roundResult.iter()) {
    handleRoundResult(row);
  }
}

function syncRoundResultForMatch(matchId: bigint): void {
  if (!conn) return;
  for (const row of conn.db.roundResult.iter()) {
    if (row.matchId === matchId) handleRoundResult(row);
  }
}

function startRoundTimer(): void {
  stopRoundTimer();
  useGameStore.getState().setRoundTimer(ROUND_SECONDS);

  roundTimerInterval = setInterval(() => {
    const store = useGameStore.getState();
    if (store.roundPhase !== 'select') {
      stopRoundTimer();
      return;
    }

    const next = store.roundTimer - 1;
    if (next <= 0) {
      stopRoundTimer();
      store.setRoundTimer(0);
      trace('round.timer.expired', {
        matchId: activeMatch?.id.toString(),
        round: activeMatch?.currentRound,
      });
      return;
    }

    if (next <= 5) playSound('timerTick');
    store.setRoundTimer(next);
  }, 1000);
}

function stopRoundTimer(): void {
  if (roundTimerInterval) {
    clearInterval(roundTimerInterval);
    roundTimerInterval = null;
  }
}

function clearQueueRemovalTimer(): void {
  if (queueRemovalTimer) {
    clearTimeout(queueRemovalTimer);
    queueRemovalTimer = null;
  }
}

function isMyMatch(row: MatchState): boolean {
  return !!currentIdentity && (identityEquals(row.p1, currentIdentity) || identityEquals(row.p2, currentIdentity));
}

function identityEquals(a: Identity, b: Identity): boolean {
  return a.isEqual(b);
}

function displayName(user?: AuthUserInput | null): string {
  if (!user) return 'Player';
  return `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`;
}

function addTx(type: EconomyTransaction['type'], amount: number, matchId: string, description: string) {
  useGameStore.getState().addTransaction({
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    amount,
    matchId,
    timestamp: Date.now(),
    description,
  });
}

function toStoreEnergyLevel(level: string): EnergyLevel {
  if (level === 'low' || level === 'medium' || level === 'high') return level;
  return 'medium';
}

function createSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function commitHash(move: number, salt: string): string {
  return hashHex(`${move}:${salt}`);
}

function hashHex(value: string): string {
  return hash32(value).toString(16).padStart(8, '0');
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function reportReducerError(err: unknown): void {
  trace('reducer.error', { error: errorMessage(err) });
  console.warn('[game] SpacetimeDB reducer failed:', err);
}

function trace(event: string, data: Record<string, unknown>): void {
  if (!TRACE_ENABLED) return;
  console.info(`[elmental:client] ${event}`, data);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function getMatchSessionKey(): string {
  const suffix = currentUser ? currentUser.id.toString() : 'anonymous';
  return `elmental.stdb.activeMatch.${getDatabaseName()}.${suffix}`;
}

function persistActiveMatchId(matchId: string): void {
  sessionStorage.setItem(getMatchSessionKey(), matchId);
}

function getPersistedActiveMatchId(): string | null {
  return sessionStorage.getItem(getMatchSessionKey());
}

function clearPersistedActiveMatchId(): void {
  sessionStorage.removeItem(getMatchSessionKey());
}
