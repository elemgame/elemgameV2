import {
  MATCH_STAKE,
  MoveId,
  calculateElo,
  getEnergyLevel,
} from '@elmental/shared';
import { useGameStore, type EconomyTransaction, type EnergyLevel } from '../stores/gameStore';
import { showAlert } from './telegram';
import { playSound } from './audio';
import { playerAccountId, playerDisplayName } from './playerProfile';
import { currencyForBalanceKind, formatCurrencyAmount } from './economy';
import { createMockProvider } from './gameProvider/mockProvider';
import { requestWalletBalance } from './payments';
import { recordGameLog } from './bugReport';
import {
  createDefaultSpacetimeProvider,
  getDatabaseName,
  getMatchRoom,
  getSpacetimeUri,
} from './gameProvider/spacetimeProvider';
import type {
  GameplayProvider,
  GameplayProviderEvent,
  PlayerProfileInput,
} from './gameProvider/types';

const ROUND_SECONDS = 15;

const TRANSPORT = (import.meta.env.VITE_GAME_TRANSPORT ?? 'spacetime').toLowerCase();
const FORCE_MOCK = TRANSPORT === 'mock';
const TRACE_ENABLED = import.meta.env.VITE_GAME_TRACE !== 'false';
const PLAYER_STATS_CACHE_PREFIX = 'elmental.playerStats.';

let provider: GameplayProvider | null = null;
let currentUser: PlayerProfileInput | null = null;
let roundTimerInterval: ReturnType<typeof setInterval> | null = null;
let queueRemovalTimer: ReturnType<typeof setTimeout> | null = null;
const deductedMatchIds = new Set<string>();
const finalizedMatchIds = new Set<string>();

export async function initializeGameSession(user: PlayerProfileInput): Promise<void> {
  currentUser = user;
  trace('session.initialize', {
    user: displayName(user),
    accountId: playerAccountId(user),
    source: user.source ?? 'web',
    hasInitData: !!user.initData,
    transport: TRANSPORT,
    db: getDatabaseName(),
    uri: getSpacetimeUri(),
  });

  try {
    await getProvider().initialize(user);
    void refreshTelegramBalance(user);
  } catch (err) {
    console.warn('[game] Provider initialization failed:', err);
    trace('session.initialize.failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function updatePlayerProfile(user: PlayerProfileInput): Promise<void> {
  currentUser = user;
  trace('session.profile.update', { user: displayName(user), transport: TRANSPORT });
  await getProvider().updateProfile(user);
  void refreshTelegramBalance(user);
}

export async function refreshTelegramBalance(user = useGameStore.getState().telegramUser ?? currentUser): Promise<void> {
  if (!user || user.source !== 'telegram' || !user.initData) return;

  try {
    const balance = await requestWalletBalance({ initData: user.initData });
    const accountId = playerAccountId(user);
    if (balance.accountId !== accountId) {
      trace('payments.balance.ignored_account_mismatch', {
        expectedAccountId: accountId,
        responseAccountId: balance.accountId,
      });
      return;
    }

    trace('payments.balance.sync', {
      accountId: balance.accountId,
      balance: balance.balance,
      balanceKind: balance.balanceKind,
    });
    applyPlayerStats({
      elmBalance: balance.balance,
      rating: balance.rating,
      wins: balance.wins,
      losses: balance.losses,
      seasonPoints: balance.seasonPoints,
    }, accountId);
  } catch (err) {
    trace('payments.balance.sync_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

export interface CachedPlayerStats {
  elmBalance: number;
  rating: number;
  wins: number;
  losses: number;
  seasonPoints?: number;
}

export function loadCachedPlayerStats(accountId: string): CachedPlayerStats | null {
  const raw = readCachedStats(accountId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedPlayerStats>;
    if (!isFiniteNumber(parsed.elmBalance) || !isFiniteNumber(parsed.rating)) return null;
    if (!isFiniteNumber(parsed.wins) || !isFiniteNumber(parsed.losses)) return null;
    return {
      elmBalance: Math.max(0, Math.trunc(parsed.elmBalance)),
      rating: Math.max(0, Math.trunc(parsed.rating)),
      wins: Math.max(0, Math.trunc(parsed.wins)),
      losses: Math.max(0, Math.trunc(parsed.losses)),
      seasonPoints: isFiniteNumber(parsed.seasonPoints) ? Math.max(0, Math.trunc(parsed.seasonPoints)) : undefined,
    };
  } catch {
    return null;
  }
}

export async function startMatchmaking(): Promise<void> {
  const store = useGameStore.getState();
  try {
    clearQueueRemovalTimer();
    store.startMatchmaking();
    const profile = store.telegramUser ?? currentUser;
    const name = displayName(profile);
    const accountId = playerAccountId(profile);
    await getProvider().startMatchmaking({
      name,
      accountId,
      stake: MATCH_STAKE,
      mode: store.gameMode,
      room: getMatchRoom(),
      boostEnabled: store.boostEnabled,
    });
  } catch (err) {
    console.error('[game] Failed to join queue:', err);
    store.cancelMatchmaking();
    const message = err instanceof Error ? err.message : String(err);
    trace('matchmaking.join.failed', { error: message });
    await showAlert(matchmakingErrorMessage(message));
  }
}

export function cancelMatchmaking(): void {
  stopRoundTimer();
  clearQueueRemovalTimer();
  void getProvider().cancelMatchmaking();
  useGameStore.getState().cancelMatchmaking();
}

export async function submitMove(moveId: MoveId): Promise<void> {
  const store = useGameStore.getState();
  if (store.roundPhase !== 'select') return;

  stopRoundTimer();
  store.selectMove(moveId);
  playSound('commit');
  trace('move.submit.call', { matchId: store.matchId, round: store.currentRound, move: moveId });
  await getProvider().submitMove(moveId);
}

export function advanceRound(): void {
  void getProvider().advanceRound();
}

export function forfeitMatch(): void {
  stopRoundTimer();
  void getProvider().forfeitMatch();
}

export function applyResults(action: 'home' | 'playAgain'): void {
  stopRoundTimer();
  clearQueueRemovalTimer();
  void getProvider().applyResults(action);

  const store = useGameStore.getState();
  store.resetMatch();
  if (action === 'playAgain') {
    void startMatchmaking();
  } else {
    store.setScreen('home');
  }
}

export function resetGameProviderForTests(): void {
  stopRoundTimer();
  clearQueueRemovalTimer();
  provider?.dispose();
  provider = null;
  currentUser = null;
  deductedMatchIds.clear();
  finalizedMatchIds.clear();
}

function getProvider(): GameplayProvider {
  if (provider) return provider;
  const context = { emit: handleProviderEvent };
  provider = FORCE_MOCK
    ? createMockProvider(context)
    : createDefaultSpacetimeProvider(context);
  return provider;
}

function handleProviderEvent(event: GameplayProviderEvent): void {
  switch (event.type) {
    case 'trace':
      trace(event.event, event.data);
      return;

    case 'error':
      trace('provider.error', {
        code: event.code,
        source: event.source,
        message: event.message,
        metadata: event.metadata,
      });
      console.warn('[game] Provider error:', event);
      return;

    case 'playerStats':
      trace('player.stats', {
        balance: event.elmBalance,
        balanceKind: event.balanceKind,
      });
      applyPlayerStats({
        elmBalance: event.elmBalance,
        rating: event.rating,
        wins: event.wins,
        losses: event.losses,
      }, currentUser ? playerAccountId(currentUser) : undefined);
      return;

    case 'queueActive':
      clearQueueRemovalTimer();
      return;

    case 'queueRemoved':
      handleQueueRemoved();
      return;

    case 'matchFound':
      applyMatchFound(event);
      return;

    case 'matchUpdate':
      applyMatchUpdate(event);
      return;

    case 'roundResult':
      applyRoundResult(event);
      return;

    case 'matchSettled':
      applyMatchSettled(event);
      return;
  }
}

function handleQueueRemoved(): void {
  clearQueueRemovalTimer();
  queueRemovalTimer = setTimeout(() => {
    const store = useGameStore.getState();
    if (store.matchStatus !== 'queuing') return;

    trace('matchmaking.expired.local', { room: getMatchRoom() });
    store.cancelMatchmaking();
    void showAlert('Matchmaking expired. Tap PLAY NOW to search again.');
  }, 1000);
}

function applyMatchFound(event: Extract<GameplayProviderEvent, { type: 'matchFound' }>): void {
  clearQueueRemovalTimer();
  const store = useGameStore.getState();
  if (store.matchId === event.matchId && store.matchStatus === 'playing') return;

  if (!deductedMatchIds.has(event.matchId)) {
    deductedMatchIds.add(event.matchId);
    const currency = currencyForBalanceKind(event.balanceKind);
    if (FORCE_MOCK) {
      store.setPlayerStats({
        elmBalance: store.elmBalance - event.stake - event.boostStake,
        rating: store.rating,
        wins: store.stats.wins,
        losses: store.stats.losses,
        seasonPoints: store.seasonPoints,
      });
    }
    addTx('entry_fee', -event.stake, event.matchId, `Entry fee ${formatCurrencyAmount(event.stake, currency)} for match vs ${event.opponentName}`);
    if (event.boostStake > 0) {
      addTx('boost_cost', -event.boostStake, event.matchId, `Energy Boost cost: ${formatCurrencyAmount(event.boostStake, currency)}`);
    }
  }

  trace('match.found', {
    matchId: event.matchId,
    opponentName: event.opponentName,
    opponentRating: event.opponentRating,
    isPlayer1: event.isPlayer1,
    balanceKind: event.balanceKind,
  });
  useGameStore.setState({ matchStake: event.stake, matchBoostStake: event.boostStake });
  store.setMatchFound(event.matchId, event.balanceKind, event.opponentName, event.opponentRating, event.isPlayer1);
  useGameStore.setState({
    currentRound: event.currentRound,
    myEnergy: event.myEnergy,
    opponentEnergyLevel: toStoreEnergyLevel(getEnergyLevel(event.opponentEnergy)),
    myScore: event.myScore,
    opponentScore: event.opponentScore,
  });
  startRoundTimer();
}

function applyMatchUpdate(event: Extract<GameplayProviderEvent, { type: 'matchUpdate' }>): void {
  const store = useGameStore.getState();
  if (store.matchId !== event.matchId) return;

  store.updateEnergy(event.myEnergy);
  store.updateScores(event.myScore, event.opponentScore);
  store.updateOpponentEnergyLevel(toStoreEnergyLevel(getEnergyLevel(event.opponentEnergy)));
  useGameStore.setState({
    currentRound: event.currentRound,
    roundPhase: event.phase,
    selectedMove: event.selectedMove,
  });

  if (event.phase === 'select') {
    startRoundTimer();
  } else {
    stopRoundTimer();
  }
}

function applyRoundResult(event: Extract<GameplayProviderEvent, { type: 'roundResult' }>): void {
  const store = useGameStore.getState();
  if (store.matchId !== event.matchId) return;

  stopRoundTimer();
  trace('round.result', {
    matchId: event.matchId,
    round: event.round,
    myMove: event.myMove,
    opponentMove: event.opponentMove,
    result: event.result,
    score: `${event.myScore}:${event.opponentScore}`,
    energy: `${event.myEnergyBefore}->${event.myEnergyAfter}`,
  });
  useGameStore.setState({ currentRound: event.round });
  store.updateEnergy(event.myEnergyAfter);
  store.updateScores(event.myScore, event.opponentScore);
  store.updateOpponentEnergyLevel(toStoreEnergyLevel(getEnergyLevel(event.opponentEnergy)));
  store.setLastRoundResult({
    myMove: event.myMove,
    opponentMove: event.opponentMove,
    result: event.result,
    myEnergyBefore: event.myEnergyBefore,
    myEnergyAfter: event.myEnergyAfter,
    opponentEnergyLevel: toStoreEnergyLevel(getEnergyLevel(event.opponentEnergy)),
    wasOverclocked: event.wasOverclocked,
  });
  store.setRoundPhase('result');
}

function applyMatchSettled(event: Extract<GameplayProviderEvent, { type: 'matchSettled' }>): void {
  if (finalizedMatchIds.has(event.matchId)) return;
  finalizedMatchIds.add(event.matchId);

  stopRoundTimer();
  const store = useGameStore.getState();
  const won = event.winner === 'me';
  const isDraw = event.winner === 'draw';
  const boostStake = store.matchBoostStake;
  const elmDelta = -(event.stake + boostStake);

  let ratingDelta = 0;
  if (!isDraw) {
    const elo = calculateElo(won ? event.myRating : event.opponentRating, won ? event.opponentRating : event.myRating);
    ratingDelta = won ? elo.newWinner - event.myRating : elo.newLoser - event.myRating;
  }

  if (FORCE_MOCK) {
    store.setPlayerStats({
      elmBalance: store.elmBalance,
      rating: store.rating + ratingDelta,
      wins: store.stats.wins + (won ? 1 : 0),
      losses: store.stats.losses + (!won && !isDraw ? 1 : 0),
      seasonPoints: store.seasonPoints + event.seasonPointsEarned,
    });
  }
  store.recordOpponentResult({
    opponentName: store.opponentName,
    winner: event.winner,
    myScore: event.myScore,
    opponentScore: event.opponentScore,
  });

  store.setMatchResult({
    winner: event.winner,
    balanceKind: event.balanceKind,
    myScore: event.myScore,
    opponentScore: event.opponentScore,
    elmEarned: elmDelta,
    seasonPointsEarned: event.seasonPointsEarned,
    ratingChange: ratingDelta,
    rounds: store.roundHistory,
    stake: event.stake,
    rake: 0,
    boostStake,
    boostBurned: boostStake > 0,
    boostReturned: false,
    totalPool: 0,
    winnerPayout: 0,
  });
  trace('match.finish.applied', { matchId: event.matchId, winner: event.winner, score: `${event.myScore}:${event.opponentScore}` });
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
        matchId: store.matchId,
        round: store.currentRound,
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

function matchmakingErrorMessage(message: string): string {
  if (FORCE_MOCK) return 'Mock matchmaking is unavailable.';
  if (message.includes('Insufficient ') && message.includes(' balance')) return message;
  return 'SpacetimeDB matchmaking is unavailable. Check the backend logs and try again.';
}

function displayName(user?: PlayerProfileInput | null): string {
  return playerDisplayName(user);
}

function applyPlayerStats(stats: CachedPlayerStats, accountId?: string): void {
  useGameStore.getState().setPlayerStats(stats);
  if (accountId) writeCachedStats(accountId, stats);
}

function readCachedStats(accountId: string): string | null {
  const key = cachedStatsKey(accountId);
  try {
    const localValue = window.localStorage.getItem(key);
    if (localValue) return localValue;
  } catch {
    // Ignore storage restrictions.
  }
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeCachedStats(accountId: string, stats: CachedPlayerStats): void {
  const key = cachedStatsKey(accountId);
  const payload = JSON.stringify({ ...stats, cachedAt: Date.now() });
  try {
    window.localStorage.setItem(key, payload);
  } catch {
    // Ignore storage restrictions.
  }
  try {
    window.sessionStorage.setItem(key, payload);
  } catch {
    // Ignore storage restrictions.
  }
}

function cachedStatsKey(accountId: string): string {
  return `${PLAYER_STATS_CACHE_PREFIX}${accountId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toStoreEnergyLevel(level: string): EnergyLevel {
  if (level === 'low' || level === 'medium' || level === 'high') return level;
  return 'medium';
}

function trace(event: string, data: Record<string, unknown>): void {
  recordGameLog('info', event, data);
  if (!TRACE_ENABLED) return;
  console.info(`[elmental:client] ${event}`, data);
}
