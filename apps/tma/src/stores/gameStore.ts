import { create } from 'zustand';
import { GameMode } from '@elmental/shared';

export type Screen =
  | 'home'
  | 'matchmaking'
  | 'match'
  | 'result'
  | 'profile'
  | 'settings';

export type MatchStatus = 'idle' | 'queuing' | 'playing' | 'result';
export type RoundPhase = 'select' | 'commit' | 'reveal' | 'result';
export type EnergyLevel = 'low' | 'medium' | 'high';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface MatchResult {
  winner: 'me' | 'opponent' | 'draw';
  myScore: number;
  opponentScore: number;
  elmEarned: number;
  ratingChange: number;
  rounds: RoundEntry[];
  // Economy breakdown
  stake: number;
  rake: number;
  boostStake: number;
  boostBurned: boolean;    // loser's boost burned
  boostReturned: boolean;  // winner's boost returned
  totalPool: number;
  winnerPayout: number;
}

export interface EconomyTransaction {
  id: string;
  type: 'stake' | 'win' | 'loss' | 'boost_burn' | 'boost_return' | 'rake';
  amount: number;
  matchId: string;
  timestamp: number;
  description: string;
}

export interface RoundEntry {
  round: number;
  myMove: number;
  opponentMove: number;
  result: 'win' | 'lose' | 'draw';
  myEnergyAfter: number;
}

export interface LastRoundResult {
  myMove: number;
  opponentMove: number;
  result: 'win' | 'lose' | 'draw';
  myEnergyAfter: number;
  opponentEnergyLevel: EnergyLevel;
  wasOverclocked: boolean;
}

interface GameStore {
  // Navigation
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;

  // Telegram user
  telegramUser: TelegramUser | null;
  setTelegramUser: (user: TelegramUser) => void;

  // Player stats
  elmBalance: number;
  rating: number;
  stats: { wins: number; losses: number };
  setPlayerStats: (stats: { elmBalance: number; rating: number; wins: number; losses: number }) => void;

  // Game settings
  gameMode: GameMode;
  boostEnabled: boolean;
  setGameMode: (mode: GameMode) => void;
  setBoostEnabled: (enabled: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;

  // Economy
  transactions: EconomyTransaction[];
  matchStake: number;
  matchBoostStake: number;
  addTransaction: (tx: EconomyTransaction) => void;

  // Match state
  matchId: string | null;
  matchStatus: MatchStatus;
  opponentName: string;
  opponentRating: number;
  myEnergy: number;
  opponentEnergyLevel: EnergyLevel;
  myScore: number;
  opponentScore: number;
  currentRound: number;
  totalRounds: number;
  roundPhase: RoundPhase;
  selectedMove: number | null;
  roundTimer: number;
  lastRoundResult: LastRoundResult | null;
  matchResult: MatchResult | null;
  roundHistory: RoundEntry[];

  // Match actions
  setMatchStatus: (status: MatchStatus) => void;
  startMatchmaking: () => void;
  cancelMatchmaking: () => void;
  setMatchFound: (matchId: string, opponentName: string, opponentRating: number) => void;
  selectMove: (moveId: number) => void;
  setRoundPhase: (phase: RoundPhase) => void;
  updateEnergy: (energy: number) => void;
  updateOpponentEnergyLevel: (level: EnergyLevel) => void;
  updateScores: (myScore: number, opponentScore: number) => void;
  advanceRound: () => void;
  setRoundTimer: (seconds: number) => void;
  setLastRoundResult: (result: LastRoundResult) => void;
  setMatchResult: (result: MatchResult) => void;
  resetMatch: () => void;
}

const DEFAULT_ENERGY = 100;

export const useGameStore = create<GameStore>((set, get) => ({
  // Navigation
  currentScreen: 'home',
  setScreen: (screen) => set({ currentScreen: screen }),

  // Telegram user
  telegramUser: null,
  setTelegramUser: (user) => set({ telegramUser: user }),

  // Player stats
  elmBalance: 0,
  rating: 1200,
  stats: { wins: 0, losses: 0 },
  setPlayerStats: ({ elmBalance, rating, wins, losses }) =>
    set({ elmBalance, rating, stats: { wins, losses } }),

  // Game settings
  gameMode: GameMode.Classic,
  boostEnabled: false,
  setGameMode: (mode) => set({ gameMode: mode }),
  setBoostEnabled: (enabled) => set({ boostEnabled: enabled }),
  soundEnabled: true,
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

  // Economy
  transactions: [],
  matchStake: 0,
  matchBoostStake: 0,
  addTransaction: (tx) => set((state) => ({ transactions: [tx, ...state.transactions].slice(0, 50) })),

  // Match state
  matchId: null,
  matchStatus: 'idle',
  opponentName: '',
  opponentRating: 1200,
  myEnergy: DEFAULT_ENERGY,
  opponentEnergyLevel: 'high',
  myScore: 0,
  opponentScore: 0,
  currentRound: 1,
  totalRounds: 5,
  roundPhase: 'select',
  selectedMove: null,
  roundTimer: 15,
  lastRoundResult: null,
  matchResult: null,
  roundHistory: [],

  // Match actions
  setMatchStatus: (status) => set({ matchStatus: status }),

  startMatchmaking: () =>
    set({ matchStatus: 'queuing', currentScreen: 'matchmaking' }),

  cancelMatchmaking: () =>
    set({ matchStatus: 'idle', currentScreen: 'home' }),

  setMatchFound: (matchId, opponentName, opponentRating) =>
    set({
      matchId,
      opponentName,
      opponentRating,
      matchStatus: 'playing',
      currentScreen: 'match',
      myEnergy: get().boostEnabled ? 120 : DEFAULT_ENERGY,
      opponentEnergyLevel: 'high',
      myScore: 0,
      opponentScore: 0,
      currentRound: 1,
      roundPhase: 'select',
      selectedMove: null,
      roundTimer: 15,
      lastRoundResult: null,
      roundHistory: [],
    }),

  selectMove: (moveId) => set({ selectedMove: moveId, roundPhase: 'commit' }),

  setRoundPhase: (phase) => set({ roundPhase: phase }),

  updateEnergy: (energy) => set({ myEnergy: energy }),

  updateOpponentEnergyLevel: (level) => set({ opponentEnergyLevel: level }),

  updateScores: (myScore, opponentScore) => set({ myScore, opponentScore }),

  advanceRound: () =>
    set((state) => ({
      currentRound: state.currentRound + 1,
      roundPhase: 'select',
      selectedMove: null,
      roundTimer: 15,
    })),

  setRoundTimer: (seconds) => set({ roundTimer: seconds }),

  setLastRoundResult: (result) => {
    const state = get();
    set({
      lastRoundResult: result,
      roundHistory: [
        ...state.roundHistory,
        {
          round: state.currentRound,
          myMove: result.myMove,
          opponentMove: result.opponentMove,
          result: result.result,
          myEnergyAfter: result.myEnergyAfter,
        },
      ],
    });
  },

  setMatchResult: (result) =>
    set({
      matchResult: result,
      matchStatus: 'result',
      currentScreen: 'result',
    }),

  resetMatch: () =>
    set({
      matchId: null,
      matchStatus: 'idle',
      opponentName: '',
      opponentRating: 1200,
      myEnergy: DEFAULT_ENERGY,
      opponentEnergyLevel: 'high',
      myScore: 0,
      opponentScore: 0,
      currentRound: 1,
      roundPhase: 'select',
      selectedMove: null,
      roundTimer: 15,
      lastRoundResult: null,
      matchResult: null,
      roundHistory: [],
    }),
}));
