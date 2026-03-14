/**
 * Mock Game Engine — simulates full PvP match flow with AI opponent.
 * Uses real game logic from @elmental/shared for authentic gameplay.
 * Full economy: stakes, payouts, boost burn, rake, ELO, transactions.
 */

import {
  MoveId,
  GameMode,
  RoundResult as SharedRoundResult,
  resolveRound,
  calculateEnergy,
  resolveOverclock,
  getMoveInfo,
  getEnergyLevel,
  calculateElo,
  calculatePayout,
  STARTING_ENERGY,
  BOOST_EXTRA_ENERGY,
  ROUNDS_TO_WIN,
  MAX_ROUNDS,
  RAKE_PERCENT,
  BOOST_PERCENT,
} from '@elmental/shared';
import { useGameStore, type EnergyLevel, type EconomyTransaction } from '../stores/gameStore';

// ─── Constants ─────────────────────────────────────────────────────

const MATCH_STAKE = 100; // ELM per player

const OPPONENT_NAMES = [
  'CryptoSamurai', 'ElementalKing', 'BlockchainBoss', 'NackiMaster',
  'FireStorm_22', 'WaterBender', 'EarthShaker', 'ChaosPilot',
  'TokenHunter', 'ShellBreaker', 'OverclockGod', 'EnergyThief',
  'RPS_Legend', 'AckiWarrior', 'MindReader99', 'BluffKing',
];

const OPPONENT_RATINGS = [980, 1050, 1120, 1180, 1220, 1280, 1350, 1420];

// ─── AI ────────────────────────────────────────────────────────────

type AIPersonality = 'aggressive' | 'conservative' | 'adaptive';

function pickAIPersonality(): AIPersonality {
  const r = Math.random();
  if (r < 0.35) return 'aggressive';
  if (r < 0.7) return 'conservative';
  return 'adaptive';
}

function pickAIMove(
  personality: AIPersonality,
  aiEnergy: number,
  playerLastMove: number | null,
): MoveId {
  const canEnhanced = aiEnergy >= 25;
  const basicMoves = [MoveId.Earth, MoveId.Fire, MoveId.Water];
  const enhancedMoves = [MoveId.EarthPlus, MoveId.FirePlus, MoveId.WaterPlus];
  const allMoves = canEnhanced ? [...basicMoves, ...enhancedMoves] : basicMoves;

  if (personality === 'aggressive' && canEnhanced) {
    if (Math.random() < 0.6) return enhancedMoves[Math.floor(Math.random() * 3)];
    return basicMoves[Math.floor(Math.random() * 3)];
  }

  if (personality === 'conservative') {
    if (canEnhanced && Math.random() < 0.2) return enhancedMoves[Math.floor(Math.random() * 3)];
    return basicMoves[Math.floor(Math.random() * 3)];
  }

  // Adaptive: counter player's last move
  if (personality === 'adaptive' && playerLastMove !== null) {
    const counterMap: Record<number, MoveId[]> = {
      [MoveId.Earth]: [MoveId.Water, MoveId.WaterPlus],
      [MoveId.Fire]: [MoveId.Earth, MoveId.EarthPlus],
      [MoveId.Water]: [MoveId.Fire, MoveId.FirePlus],
      [MoveId.EarthPlus]: [MoveId.WaterPlus, MoveId.Fire],
      [MoveId.FirePlus]: [MoveId.EarthPlus, MoveId.Water],
      [MoveId.WaterPlus]: [MoveId.FirePlus, MoveId.Earth],
    };
    const counters = (counterMap[playerLastMove] ?? []).filter(
      (m) => getMoveInfo(m).cost <= aiEnergy,
    );
    if (counters.length > 0 && Math.random() < 0.55) {
      return counters[Math.floor(Math.random() * counters.length)];
    }
  }

  return allMoves[Math.floor(Math.random() * allMoves.length)];
}

// ─── State ─────────────────────────────────────────────────────────

interface MockMatchState {
  aiEnergy: number;
  aiPersonality: AIPersonality;
  playerLastMove: number | null;
  stake: number;
  boostStake: number;
  opponentBoostStake: number;
}

let mockState: MockMatchState | null = null;
let matchmakingTimer: ReturnType<typeof setTimeout> | null = null;
let roundTimerInterval: ReturnType<typeof setInterval> | null = null;

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

// ─── Public API ────────────────────────────────────────────────────

export function startMockMatchmaking() {
  if (matchmakingTimer) {
    clearTimeout(matchmakingTimer);
    matchmakingTimer = null;
  }

  const store = useGameStore.getState();

  // Check if player has enough ELM for stake
  const boostCost = store.boostEnabled ? Math.ceil(MATCH_STAKE * BOOST_PERCENT / 100) : 0;
  const totalCost = MATCH_STAKE + boostCost;

  if (store.elmBalance < totalCost) {
    console.warn(`[mock] Not enough ELM! Need ${totalCost}, have ${store.elmBalance}`);
    // Still allow playing but log warning — for demo purposes
  }

  store.startMatchmaking();
  console.log(`[mock] Matchmaking started. Stake: ${MATCH_STAKE} ELM${boostCost > 0 ? ` + ${boostCost} boost` : ''}`);

  // Simulate 5-15 second search
  const delay = 5000 + Math.random() * 10000;
  console.log(`[mock] Will find match in ${Math.round(delay / 1000)}s`);

  matchmakingTimer = setTimeout(() => {
    const fresh = useGameStore.getState();

    if (fresh.matchStatus !== 'queuing') {
      console.log('[mock] User cancelled, aborting');
      return;
    }

    const opponent = OPPONENT_NAMES[Math.floor(Math.random() * OPPONENT_NAMES.length)];
    const rating = OPPONENT_RATINGS[Math.floor(Math.random() * OPPONENT_RATINGS.length)];
    const matchId = `match_${Date.now()}`;
    const playerBoostCost = fresh.boostEnabled ? Math.ceil(MATCH_STAKE * BOOST_PERCENT / 100) : 0;
    const opponentBoost = Math.random() < 0.3; // 30% chance AI uses boost
    const opponentBoostCost = opponentBoost ? Math.ceil(MATCH_STAKE * BOOST_PERCENT / 100) : 0;

    mockState = {
      aiEnergy: opponentBoost ? STARTING_ENERGY + BOOST_EXTRA_ENERGY : STARTING_ENERGY,
      aiPersonality: pickAIPersonality(),
      playerLastMove: null,
      stake: MATCH_STAKE,
      boostStake: playerBoostCost,
      opponentBoostStake: opponentBoostCost,
    };

    // === ECONOMY: Deduct stake from balance ===
    const newBalance = fresh.elmBalance - MATCH_STAKE - playerBoostCost;
    fresh.setPlayerStats({
      elmBalance: newBalance,
      rating: fresh.rating,
      wins: fresh.stats.wins,
      losses: fresh.stats.losses,
    });

    // Log transactions
    addTx('stake', -MATCH_STAKE, matchId, `Staked ${MATCH_STAKE} ELM for match vs ${opponent}`);
    if (playerBoostCost > 0) {
      addTx('stake', -playerBoostCost, matchId, `Energy Boost investment: ${playerBoostCost} ELM (risk: burn on loss)`);
    }

    // Store match economy info
    useGameStore.setState({ matchStake: MATCH_STAKE, matchBoostStake: playerBoostCost });

    console.log(`[mock] Match found! vs ${opponent} (${rating}). Balance: ${fresh.elmBalance} → ${newBalance} ELM`);
    console.log(`[mock] Pool: ${MATCH_STAKE * 2} ELM. Your boost: ${playerBoostCost}, Opponent boost: ${opponentBoostCost}`);

    fresh.setMatchFound(matchId, opponent, rating);
    startRoundTimer();
  }, delay);
}

export function cancelMockMatchmaking() {
  if (matchmakingTimer) {
    clearTimeout(matchmakingTimer);
    matchmakingTimer = null;
  }
  useGameStore.getState().cancelMatchmaking();
}

export function submitMockMove(moveId: MoveId) {
  const store = useGameStore.getState();
  if (store.roundPhase !== 'select' || !mockState) return;

  store.selectMove(moveId);

  // AI "thinks" 0.8-2.3s
  const thinkTime = 800 + Math.random() * 1500;
  setTimeout(() => {
    store.setRoundPhase('reveal');
    setTimeout(() => resolveRoundResult(moveId), 600);
  }, thinkTime);
}

export function advanceMockRound() {
  const store = useGameStore.getState();
  if (store.myScore >= ROUNDS_TO_WIN || store.opponentScore >= ROUNDS_TO_WIN) return;
  store.advanceRound();
  startRoundTimer();
}

export function applyMockResults(action: 'home' | 'playAgain') {
  const store = useGameStore.getState();
  const result = store.matchResult;
  if (!result) return;

  // Stats already updated by finishMatch — just navigate
  store.resetMatch();

  if (action === 'playAgain') {
    startMockMatchmaking();
  } else {
    store.setScreen('home');
  }
}

export function forfeitMockMatch() {
  stopRoundTimer();
  const store = useGameStore.getState();
  const matchId = store.matchId ?? 'unknown';

  // Forfeit = lose stake (no refund)
  addTx('loss', 0, matchId, 'Forfeited match — stake lost');
  if (store.matchBoostStake > 0) {
    addTx('boost_burn', -store.matchBoostStake, matchId, `Boost burned on forfeit: ${store.matchBoostStake} ELM`);
  }
  console.log(`[mock] Forfeited. Lost ${store.matchStake} ELM stake.`);

  mockState = null;
  store.resetMatch();
  store.setScreen('home');
}

// ─── Internal ──────────────────────────────────────────────────────

function startRoundTimer() {
  stopRoundTimer();
  useGameStore.getState().setRoundTimer(15);

  roundTimerInterval = setInterval(() => {
    const s = useGameStore.getState();
    if (s.roundPhase !== 'select') { stopRoundTimer(); return; }
    const next = s.roundTimer - 1;
    if (next <= 0) {
      stopRoundTimer();
      const randomBasic = [MoveId.Earth, MoveId.Fire, MoveId.Water][Math.floor(Math.random() * 3)];
      submitMockMove(randomBasic);
      return;
    }
    s.setRoundTimer(next);
  }, 1000);
}

function stopRoundTimer() {
  if (roundTimerInterval) { clearInterval(roundTimerInterval); roundTimerInterval = null; }
}

function resolveRoundResult(playerMove: MoveId) {
  const store = useGameStore.getState();
  if (!mockState) return;
  stopRoundTimer();

  const gameMode = store.gameMode;

  // AI picks its move
  const aiMove = pickAIMove(mockState.aiPersonality, mockState.aiEnergy, mockState.playerLastMove);
  mockState.playerLastMove = playerMove;

  // Check overclock for player
  const playerMoveInfo = getMoveInfo(playerMove);
  let finalPlayerMove = playerMove;
  let wasOverclocked = false;

  if (store.myEnergy < playerMoveInfo.cost) {
    const seed = new Uint8Array(2);
    crypto.getRandomValues(seed);
    const result = resolveOverclock(playerMove, seed);
    finalPlayerMove = result.finalMoveId;
    wasOverclocked = result.wasRandomized;
    if (wasOverclocked) {
      console.log(`[mock] OVERCLOCK! ${getMoveInfo(playerMove).name} → ${getMoveInfo(finalPlayerMove).name} (randomized)`);
    }
  }

  // Resolve with real game logic
  const roundOutcome = resolveRound(finalPlayerMove, aiMove);

  // Generate chaos roll if needed (random 0-20)
  const chaosRoll = gameMode === GameMode.Chaos ? Math.floor(Math.random() * 21) : undefined;

  // Player energy
  const playerEnergyState = calculateEnergy(
    { energy: store.myEnergy, isOverclocked: wasOverclocked, boostActive: store.boostEnabled },
    getMoveInfo(finalPlayerMove),
    roundOutcome.p1Result as SharedRoundResult,
    gameMode,
    chaosRoll,
  );

  // AI energy (different chaos roll for AI)
  const aiChaosRoll = gameMode === GameMode.Chaos ? Math.floor(Math.random() * 21) : undefined;
  const aiMoveInfo = getMoveInfo(aiMove);
  const aiEnergyState = calculateEnergy(
    { energy: mockState.aiEnergy, isOverclocked: false, boostActive: false },
    aiMoveInfo,
    roundOutcome.p2Result as SharedRoundResult,
    gameMode,
    aiChaosRoll,
  );
  mockState.aiEnergy = aiEnergyState.energy;

  const resultMap: Record<string, 'win' | 'lose' | 'draw'> = {
    [SharedRoundResult.Win]: 'win',
    [SharedRoundResult.Lose]: 'lose',
    [SharedRoundResult.Draw]: 'draw',
  };
  const myResult = resultMap[roundOutcome.p1Result];

  let newMyScore = store.myScore;
  let newOpponentScore = store.opponentScore;
  if (myResult === 'win') newMyScore++;
  if (myResult === 'lose') newOpponentScore++;

  const opponentLevel = getEnergyLevel(mockState.aiEnergy);
  const levelMap: Record<string, EnergyLevel> = { low: 'low', medium: 'medium', high: 'high' };

  console.log(
    `[mock] Round ${store.currentRound}: ${getMoveInfo(finalPlayerMove).name} vs ${getMoveInfo(aiMove).name} → ${myResult.toUpperCase()}` +
    ` | Energy: ${store.myEnergy}→${playerEnergyState.energy} | AI: ${mockState.aiEnergy} (${opponentLevel})` +
    ` | Score: ${newMyScore}-${newOpponentScore}` +
    (wasOverclocked ? ' ⚡OVERCLOCK' : ''),
  );

  store.updateEnergy(playerEnergyState.energy);
  store.updateScores(newMyScore, newOpponentScore);
  store.updateOpponentEnergyLevel(levelMap[opponentLevel] ?? 'medium');
  store.setLastRoundResult({
    myMove: finalPlayerMove,
    opponentMove: aiMove,
    result: myResult,
    myEnergyAfter: playerEnergyState.energy,
    opponentEnergyLevel: levelMap[opponentLevel] ?? 'medium',
    wasOverclocked,
  });
  store.setRoundPhase('result');

  // Check if match is over: score reached OR max rounds exceeded
  const isMatchOver = newMyScore >= ROUNDS_TO_WIN || newOpponentScore >= ROUNDS_TO_WIN;
  const isMaxRounds = store.currentRound >= MAX_ROUNDS;

  if (isMatchOver || isMaxRounds) {
    // On max rounds without winner: whoever has more wins, or draw
    if (isMaxRounds && !isMatchOver) {
      console.log(`[mock] Max rounds (${MAX_ROUNDS}) reached. Deciding by score: ${newMyScore}-${newOpponentScore}`);
    }
    // Delay 1.5s so player can see the final round result overlay
    setTimeout(() => finishMatch(newMyScore, newOpponentScore), 1500);
  }
}

function finishMatch(myScore: number, opponentScore: number) {
  const store = useGameStore.getState();
  if (!mockState) return;

  const won = myScore > opponentScore; // Works for both first-to-3 and max-rounds
  const isDraw = myScore === opponentScore;
  const matchId = store.matchId ?? 'unknown';
  const stake = mockState.stake;
  const pool = stake * 2;
  const { winnerPayout, rake } = calculatePayout(stake, RAKE_PERCENT);

  // ELO calculation (skip on draw)
  let ratingDelta = 0;
  if (!isDraw) {
    const eloResult = calculateElo(
      won ? store.rating : store.opponentRating,
      won ? store.opponentRating : store.rating,
    );
    ratingDelta = won
      ? eloResult.newWinner - store.rating
      : eloResult.newLoser - store.rating;
  }

  // === ECONOMY: Apply results ===
  let balanceDelta = 0;

  if (isDraw) {
    // Draw at max rounds — both get stake back
    balanceDelta = stake; // Refund stake
    if (mockState.boostStake > 0) balanceDelta += mockState.boostStake; // Refund boost
    addTx('win', stake, matchId, `Draw! Stake refunded: ${stake} ELM`);
    if (mockState.boostStake > 0) {
      addTx('boost_return', mockState.boostStake, matchId, `Boost refunded on draw: ${mockState.boostStake} ELM`);
    }
  } else if (won) {
    balanceDelta = winnerPayout;
    addTx('win', winnerPayout, matchId, `Won! Payout: ${winnerPayout} ELM (pool ${pool} - ${rake} rake)`);

    if (mockState.boostStake > 0) {
      balanceDelta += mockState.boostStake;
      addTx('boost_return', mockState.boostStake, matchId, `Energy boost returned: ${mockState.boostStake} ELM`);
    }

    if (mockState.opponentBoostStake > 0) {
      console.log(`[mock] Opponent's boost BURNED: ${mockState.opponentBoostStake} ELM`);
    }
  } else {
    // Lost — stake already deducted, nothing returned
    balanceDelta = 0;
    addTx('loss', -stake, matchId, `Lost match. Stake ${stake} ELM forfeited.`);

    if (mockState.boostStake > 0) {
      addTx('boost_burn', -mockState.boostStake, matchId, `Energy boost BURNED: ${mockState.boostStake} ELM`);
      console.log(`[mock] Your boost BURNED: ${mockState.boostStake} ELM`);
    }
  }

  // Update balance
  const newBalance = store.elmBalance + balanceDelta;
  const newRating = store.rating + ratingDelta;

  console.log(
    `[mock] Match ${won ? 'WON' : 'LOST'}! Score: ${myScore}-${opponentScore}` +
    ` | ELM: ${store.elmBalance} → ${newBalance} (${balanceDelta >= 0 ? '+' : ''}${balanceDelta})` +
    ` | Rating: ${store.rating} → ${newRating} (${ratingDelta >= 0 ? '+' : ''}${ratingDelta})` +
    ` | Rake: ${rake} ELM to treasury`,
  );

  // Net ELM change for display (from original balance before stake)
  const netElmChange = isDraw ? 0 : won ? (winnerPayout - stake + mockState.boostStake) : (-stake - mockState.boostStake);

  store.setPlayerStats({
    elmBalance: newBalance,
    rating: newRating,
    wins: store.stats.wins + (won ? 1 : 0),
    losses: store.stats.losses + (!won && !isDraw ? 1 : 0),
  });

  store.setMatchResult({
    winner: isDraw ? 'draw' : won ? 'me' : 'opponent',
    myScore,
    opponentScore,
    elmEarned: netElmChange,
    ratingChange: ratingDelta,
    rounds: store.roundHistory,
    stake,
    rake,
    boostStake: mockState.boostStake,
    boostBurned: !won && mockState.boostStake > 0,
    boostReturned: won && mockState.boostStake > 0,
    totalPool: pool,
    winnerPayout,
  });

  mockState = null;
  stopRoundTimer();
}
