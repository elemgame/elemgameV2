import {
  MoveId,
  RAKE_PERCENT,
  calculateElo,
  calculatePayout,
  getEnergyLevel,
} from '@elmental/shared';
import { useGameStore, type EconomyTransaction, type EnergyLevel } from '../stores/gameStore';
import { showAlert } from './telegram';
import { playSound } from './audio';
import { createMockProvider } from './gameProvider/mockProvider';
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

const MATCH_STAKE = 100;
const ROUND_SECONDS = 15;

const TRANSPORT = (import.meta.env.VITE_GAME_TRANSPORT ?? 'spacetime').toLowerCase();
const FORCE_MOCK = TRANSPORT === 'mock';
const TRACE_ENABLED = import.meta.env.VITE_GAME_TRACE !== 'false';

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
    transport: TRANSPORT,
    db: getDatabaseName(),
    uri: getSpacetimeUri(),
  });

  try {
    await getProvider().initialize(user);
  } catch (err) {
    console.warn('[game] Provider initialization failed:', err);
    useGameStore.getState().setPlayerStats({
      elmBalance: 1000,
      rating: 1200,
      wins: 0,
      losses: 0,
    });
  }
}

export async function updatePlayerProfile(user: PlayerProfileInput): Promise<void> {
  currentUser = user;
  trace('session.profile.update', { user: displayName(user), transport: TRANSPORT });
  await getProvider().updateProfile(user);
}

export async function startMatchmaking(): Promise<void> {
  const store = useGameStore.getState();
  try {
    clearQueueRemovalTimer();
    store.startMatchmaking();
    const name = displayName(store.telegramUser ?? currentUser);
    await getProvider().startMatchmaking({
      name,
      stake: MATCH_STAKE,
      mode: store.gameMode,
      room: getMatchRoom(),
      boostEnabled: store.boostEnabled,
    });
  } catch (err) {
    console.error('[game] Failed to join queue:', err);
    store.cancelMatchmaking();
    await showAlert(FORCE_MOCK
      ? 'Mock matchmaking is unavailable.'
      : 'SpacetimeDB is unavailable. Run spacetime start and publish the module, or set VITE_GAME_TRANSPORT=mock.');
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
      useGameStore.getState().setPlayerStats({
        elmBalance: useGameStore.getState().elmBalance || 1000,
        rating: event.rating,
        wins: event.wins,
        losses: event.losses,
      });
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
    store.setPlayerStats({
      elmBalance: store.elmBalance - event.stake - event.boostStake,
      rating: store.rating,
      wins: store.stats.wins,
      losses: store.stats.losses,
    });
    addTx('stake', -event.stake, event.matchId, `Staked ${event.stake} ELM for match vs ${event.opponentName}`);
    if (event.boostStake > 0) {
      addTx('stake', -event.boostStake, event.matchId, `Energy Boost investment: ${event.boostStake} ELM`);
    }
  }

  trace('match.found', {
    matchId: event.matchId,
    opponentName: event.opponentName,
    opponentRating: event.opponentRating,
    isPlayer1: event.isPlayer1,
  });
  useGameStore.setState({ matchStake: event.stake, matchBoostStake: event.boostStake });
  store.setMatchFound(event.matchId, event.opponentName, event.opponentRating, event.isPlayer1);
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
  });
  useGameStore.setState({ currentRound: event.round });
  store.updateEnergy(event.myEnergyAfter);
  store.updateScores(event.myScore, event.opponentScore);
  store.updateOpponentEnergyLevel(toStoreEnergyLevel(getEnergyLevel(event.opponentEnergy)));
  store.setLastRoundResult({
    myMove: event.myMove,
    opponentMove: event.opponentMove,
    result: event.result,
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
  const { winnerPayout, rake } = calculatePayout(event.stake, RAKE_PERCENT);
  const boostStake = store.matchBoostStake;

  let ratingDelta = 0;
  if (!isDraw) {
    const elo = calculateElo(won ? event.myRating : event.opponentRating, won ? event.opponentRating : event.myRating);
    ratingDelta = won ? elo.newWinner - event.myRating : elo.newLoser - event.myRating;
  }

  let balanceDelta = 0;
  if (isDraw) {
    balanceDelta = event.stake + boostStake;
    addTx('win', event.stake, event.matchId, `Draw. Stake refunded: ${event.stake} ELM`);
    if (boostStake > 0) addTx('boost_return', boostStake, event.matchId, `Boost refunded: ${boostStake} ELM`);
  } else if (won) {
    balanceDelta = winnerPayout + boostStake;
    addTx('win', winnerPayout, event.matchId, `Won. Payout: ${winnerPayout} ELM`);
    if (boostStake > 0) addTx('boost_return', boostStake, event.matchId, `Boost returned: ${boostStake} ELM`);
  } else {
    addTx('loss', -event.stake, event.matchId, `Lost match. Stake ${event.stake} ELM forfeited.`);
    if (boostStake > 0) addTx('boost_burn', -boostStake, event.matchId, `Boost burned: ${boostStake} ELM`);
  }

  store.setPlayerStats({
    elmBalance: store.elmBalance + balanceDelta,
    rating: store.rating + ratingDelta,
    wins: store.stats.wins + (won ? 1 : 0),
    losses: store.stats.losses + (!won && !isDraw ? 1 : 0),
  });

  store.setMatchResult({
    winner: event.winner,
    myScore: event.myScore,
    opponentScore: event.opponentScore,
    elmEarned: isDraw ? 0 : won ? winnerPayout - event.stake + boostStake : -event.stake - boostStake,
    ratingChange: ratingDelta,
    rounds: store.roundHistory,
    stake: event.stake,
    rake,
    boostStake,
    boostBurned: !won && !isDraw && boostStake > 0,
    boostReturned: (won || isDraw) && boostStake > 0,
    totalPool: event.stake * 2,
    winnerPayout,
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

function displayName(user?: PlayerProfileInput | null): string {
  if (!user) return 'Player';
  return `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`;
}

function toStoreEnergyLevel(level: string): EnergyLevel {
  if (level === 'low' || level === 'medium' || level === 'high') return level;
  return 'medium';
}

function trace(event: string, data: Record<string, unknown>): void {
  if (!TRACE_ENABLED) return;
  console.info(`[elmental:client] ${event}`, data);
}
