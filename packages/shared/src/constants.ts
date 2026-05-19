export const STARTING_ENERGY = 100;
export const BOOST_EXTRA_ENERGY = 20;
export const BASIC_MOVE_COST = 10;
export const ENHANCED_MOVE_COST = 25;
export const ROUNDS_TO_WIN = 3;
export const MAX_ROUNDS = 9; // theoretical max with draws

export const REGEN_ON_WIN = 5;
export const REGEN_ON_LOSE = 15;
export const REGEN_ON_DRAW = 10;

export const OVERCLOCK_RANDOM_CHANCE = 30; // percent
export const ENERGY_LOW_THRESHOLD = 33;
export const ENERGY_MED_THRESHOLD = 66;

export const COMMIT_TIMEOUT_MS = 15_000;
export const REVEAL_TIMEOUT_MS = 10_000;
export const MATCH_SETTLE_TIMEOUT_MS = 600_000; // 10 min

export const ECONOMY_MODE_ENTRY_FEE_SEASON_POINTS = 'entry_fee_season_points';
export const ECONOMY_MODE_STAKE_POOL = 'stake_pool';
export const SUPPORTED_ECONOMY_MODES = [
  ECONOMY_MODE_ENTRY_FEE_SEASON_POINTS,
  ECONOMY_MODE_STAKE_POOL,
] as const;
export type EconomyMode = (typeof SUPPORTED_ECONOMY_MODES)[number];

export const PRODUCTION_ECONOMY_MODE: EconomyMode = ECONOMY_MODE_ENTRY_FEE_SEASON_POINTS;

export const LEGACY_RAKE_PERCENT = 5;
export const RAKE_PERCENT = LEGACY_RAKE_PERCENT;
export const BOOST_PERCENT = 10;
export const MATCH_ENTRY_FEE = 50;
// Legacy API alias: active production economy treats this value as an entry fee.
export const MATCH_STAKE = MATCH_ENTRY_FEE;

export const SEASON_POINTS_WIN = 30;
export const SEASON_POINTS_DRAW = 15;
export const SEASON_POINTS_LOSS = 10;
export const SEASON_POINTS_CLEAN_WIN_BONUS = 5;
export const SEASON_POINTS_CLEAN_WIN = SEASON_POINTS_WIN + SEASON_POINTS_CLEAN_WIN_BONUS;

export const INITIAL_RATING = 1200;
export const ELO_K_FACTOR = 32;
