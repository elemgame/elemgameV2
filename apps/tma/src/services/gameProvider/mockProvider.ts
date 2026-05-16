import {
  BOOST_EXTRA_ENERGY,
  GameMode,
  MAX_ROUNDS,
  MoveId,
  ROUNDS_TO_WIN,
  STARTING_ENERGY,
  calculateEnergy,
  getMoveInfo,
  resolveOverclock,
  resolveRound,
} from '@elmental/shared';
import { playerDisplayName } from '../playerProfile';
import { balanceKindForUser } from '../economy';
import type {
  GameplayProvider,
  GameplayProviderContext,
  MatchmakingRequest,
  PlayerProfileInput,
} from './types';

interface MockProviderOptions {
  matchmakingDelayMs?: number;
  actionDelayMs?: number;
  finishDelayMs?: number;
  deterministic?: boolean;
  opponentName?: string;
  opponentRating?: number;
  opponentMoves?: MoveId[];
  random?: () => number;
}

interface MockMatch {
  id: string;
  request: MatchmakingRequest;
  opponentName: string;
  opponentRating: number;
  opponentEnergy: number;
  myEnergy: number;
  myScore: number;
  opponentScore: number;
  currentRound: number;
  selectedMove: MoveId | null;
  phase: 'select' | 'commit' | 'result';
  opponentMoveIndex: number;
}

const DEFAULT_OPPONENTS = [
  'Practice Bot',
  'Elemental Bot',
  'Training Bot',
  'Arena Bot',
];

export function createMockProvider(
  context: GameplayProviderContext,
  options: MockProviderOptions = {},
): GameplayProvider {
  const random = options.random ?? Math.random;
  const deterministic = options.deterministic ?? import.meta.env.VITE_MOCK_DETERMINISTIC === 'true';
  const matchmakingDelayMs = options.matchmakingDelayMs ?? readNumberEnv('VITE_MOCK_MATCH_DELAY_MS', 5000);
  const actionDelayMs = options.actionDelayMs ?? readNumberEnv('VITE_MOCK_ACTION_DELAY_MS', deterministic ? 0 : 800);
  const finishDelayMs = options.finishDelayMs ?? readNumberEnv('VITE_MOCK_FINISH_DELAY_MS', deterministic ? 0 : 1500);
  const opponentRating = options.opponentRating ?? 1200;

  let currentUser: PlayerProfileInput | null = null;
  let match: MockMatch | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const provider: GameplayProvider = {
    async initialize(user) {
      currentUser = user;
      trace('mock.initialize', { user: displayName(user), deterministic });
      context.emit({
        type: 'playerStats',
        name: displayName(user),
        elmBalance: 1000,
        balanceKind: balanceKindForUser(user),
        rating: 1200,
        wins: 12,
        losses: 8,
      });
    },

    async updateProfile(user) {
      currentUser = user;
      trace('mock.profile.update', { user: displayName(user) });
      context.emit({
        type: 'playerStats',
        name: displayName(user),
        elmBalance: 1000,
        balanceKind: balanceKindForUser(user),
        rating: 1200,
        wins: 12,
        losses: 8,
      });
    },

    async startMatchmaking(request) {
      trace('mock.queue.join', { room: request.room, mode: request.mode, stake: request.stake });
      context.emit({
        type: 'queueActive',
        name: request.name,
        room: request.room,
        mode: request.mode,
        stake: request.stake,
        balanceKind: activeBalanceKind(),
      });

      schedule(() => {
        if (!currentUser) return;
        const opponentName = options.opponentName
          ?? (deterministic ? 'Practice Bot' : DEFAULT_OPPONENTS[Math.floor(random() * DEFAULT_OPPONENTS.length)]);
        const boostStake = request.boostEnabled ? Math.ceil(request.stake * 0.1) : 0;
        match = {
          id: `mock_${Date.now()}`,
          request,
          opponentName,
          opponentRating,
          opponentEnergy: STARTING_ENERGY,
          myEnergy: request.boostEnabled ? STARTING_ENERGY + BOOST_EXTRA_ENERGY : STARTING_ENERGY,
          myScore: 0,
          opponentScore: 0,
          currentRound: 1,
          selectedMove: null,
          phase: 'select',
          opponentMoveIndex: 0,
        };

        trace('mock.match.found', { matchId: match.id, opponentName });
        context.emit({
          type: 'matchFound',
          matchId: match.id,
          balanceKind: activeBalanceKind(),
          opponentName,
          opponentRating,
          isPlayer1: true,
          stake: request.stake,
          boostStake,
          currentRound: 1,
          myEnergy: match.myEnergy,
          opponentEnergy: match.opponentEnergy,
          myScore: 0,
          opponentScore: 0,
        });
        emitMatchUpdate();
      }, matchmakingDelayMs);
    },

    cancelMatchmaking() {
      clearTimers();
      if (!match) {
        trace('mock.queue.cancel', {});
      }
    },

    async submitMove(moveId) {
      if (!match || match.phase !== 'select') return;
      match.selectedMove = moveId;
      match.phase = 'commit';
      trace('mock.move.submit', { matchId: match.id, round: match.currentRound, move: moveId });
      emitMatchUpdate();
      schedule(() => resolveMockRound(moveId), actionDelayMs);
    },

    advanceRound() {
      if (!match || match.phase !== 'result') return;
      if (match.myScore >= ROUNDS_TO_WIN || match.opponentScore >= ROUNDS_TO_WIN) return;
      match.currentRound += 1;
      match.selectedMove = null;
      match.phase = 'select';
      trace('mock.round.next', { matchId: match.id, round: match.currentRound });
      emitMatchUpdate();
    },

    forfeitMatch() {
      if (!match) return;
      trace('mock.match.forfeit', { matchId: match.id });
      match.opponentScore = Math.max(match.opponentScore, ROUNDS_TO_WIN);
      emitSettled('opponent');
    },

    applyResults() {
      clearTimers();
      match = null;
    },

    dispose() {
      clearTimers();
      match = null;
    },
  };

  function resolveMockRound(playerMove: MoveId): void {
    if (!match || match.selectedMove !== playerMove) return;

    let finalPlayerMove = playerMove;
    let wasOverclocked = false;
    const moveInfo = getMoveInfo(playerMove);
    if (match.myEnergy < moveInfo.cost) {
      const seed = deterministic ? new Uint8Array([99, 0]) : randomSeed();
      const overclock = resolveOverclock(playerMove, seed);
      finalPlayerMove = overclock.finalMoveId;
      wasOverclocked = overclock.wasRandomized;
    }

    const opponentMove = pickOpponentMove();
    const outcome = resolveRound(finalPlayerMove, opponentMove);
    const chaosRoll = match.request.mode === GameMode.Chaos ? Math.floor(random() * 21) : undefined;
    const opponentChaosRoll = match.request.mode === GameMode.Chaos ? Math.floor(random() * 21) : undefined;
    const myEnergyBefore = match.myEnergy;
    const myEnergy = calculateEnergy(
      { energy: myEnergyBefore, isOverclocked: wasOverclocked, boostActive: match.request.boostEnabled },
      getMoveInfo(finalPlayerMove),
      outcome.p1Result,
      match.request.mode,
      chaosRoll,
    ).energy;
    const opponentEnergy = calculateEnergy(
      { energy: match.opponentEnergy, isOverclocked: false, boostActive: false },
      getMoveInfo(opponentMove),
      outcome.p2Result,
      match.request.mode,
      opponentChaosRoll,
    ).energy;

    if (outcome.p1Result === 'win') match.myScore += 1;
    if (outcome.p1Result === 'lose') match.opponentScore += 1;
    match.myEnergy = myEnergy;
    match.opponentEnergy = opponentEnergy;
    match.phase = 'result';

    trace('mock.round.result', {
      matchId: match.id,
      round: match.currentRound,
      playerMove: finalPlayerMove,
      opponentMove,
      result: outcome.p1Result,
      score: `${match.myScore}:${match.opponentScore}`,
    });
    context.emit({
      type: 'roundResult',
      matchId: match.id,
      balanceKind: activeBalanceKind(),
      round: match.currentRound,
      myMove: finalPlayerMove,
      opponentMove,
      result: outcome.p1Result,
      myEnergyBefore,
      myEnergyAfter: myEnergy,
      opponentEnergy,
      myScore: match.myScore,
      opponentScore: match.opponentScore,
      wasOverclocked,
    });

    if (match.myScore >= ROUNDS_TO_WIN || match.opponentScore >= ROUNDS_TO_WIN || match.currentRound >= MAX_ROUNDS) {
      schedule(() => {
        if (!match) return;
        const winner = match.myScore === match.opponentScore
          ? 'draw'
          : match.myScore > match.opponentScore
            ? 'me'
            : 'opponent';
        emitSettled(winner);
      }, finishDelayMs);
    }
  }

  function pickOpponentMove(): MoveId {
    if (!match) return MoveId.Earth;
    const scripted = options.opponentMoves?.[match.opponentMoveIndex];
    match.opponentMoveIndex += 1;
    if (scripted !== undefined) return scripted;
    if (deterministic) return MoveId.Earth;
    const moves = match.opponentEnergy >= 25
      ? [MoveId.Earth, MoveId.Fire, MoveId.Water, MoveId.EarthPlus, MoveId.FirePlus, MoveId.WaterPlus]
      : [MoveId.Earth, MoveId.Fire, MoveId.Water];
    return moves[Math.floor(random() * moves.length)];
  }

  function emitMatchUpdate(): void {
    if (!match) return;
    context.emit({
      type: 'matchUpdate',
      matchId: match.id,
      balanceKind: activeBalanceKind(),
      phase: match.phase === 'result' ? 'result' : match.phase,
      status: 'active',
      currentRound: match.currentRound,
      selectedMove: match.selectedMove,
      myEnergy: match.myEnergy,
      opponentEnergy: match.opponentEnergy,
      myScore: match.myScore,
      opponentScore: match.opponentScore,
    });
  }

  function emitSettled(winner: 'me' | 'opponent' | 'draw'): void {
    if (!match) return;
    trace('mock.match.settled', { matchId: match.id, winner, score: `${match.myScore}:${match.opponentScore}` });
    context.emit({
      type: 'matchSettled',
      matchId: match.id,
      balanceKind: activeBalanceKind(),
      winner,
      myScore: match.myScore,
      opponentScore: match.opponentScore,
      stake: match.request.stake,
      myRating: 1200,
      opponentRating: match.opponentRating,
    });
    match = null;
  }

  function schedule(fn: () => void, delay: number): void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, Math.max(0, delay));
    timers.add(timer);
  }

  function clearTimers(): void {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }

  function trace(event: string, data: Record<string, unknown>): void {
    context.emit({ type: 'trace', event, data });
  }

  function activeBalanceKind(): string {
    return balanceKindForUser(currentUser);
  }

  return provider;
}

function displayName(user: PlayerProfileInput): string {
  return playerDisplayName(user);
}

function randomSeed(): Uint8Array {
  const seed = new Uint8Array(2);
  crypto.getRandomValues(seed);
  return seed;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(import.meta.env[name]);
  return Number.isFinite(value) ? value : fallback;
}
