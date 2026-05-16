export type OpponentMatchOutcome = 'me' | 'opponent' | 'draw';

export interface OpponentStats {
  opponentName: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  myRoundsWon: number;
  opponentRoundsWon: number;
  lastPlayedAt: number;
}

interface OpponentMatchRecord {
  opponentName: string;
  winner: OpponentMatchOutcome;
  myScore: number;
  opponentScore: number;
  playedAt?: number;
}

const STORAGE_KEY = 'elmental.opponentStats.v1';
const MAX_OPPONENTS = 50;

export function loadOpponentStats(): OpponentStats[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortOpponentStats(parsed.filter(isOpponentStats).slice(0, MAX_OPPONENTS));
  } catch {
    return [];
  }
}

export function saveOpponentStats(stats: OpponentStats[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sortOpponentStats(stats).slice(0, MAX_OPPONENTS)));
  } catch {
    // Storage can be unavailable in embedded browsers; in-memory state still works.
  }
}

export function recordOpponentMatch(
  currentStats: OpponentStats[],
  record: OpponentMatchRecord,
): OpponentStats[] {
  const opponentName = normalizeOpponentName(record.opponentName);
  const key = opponentKey(opponentName);
  const playedAt = record.playedAt ?? Date.now();
  const existing = currentStats.find((stat) => opponentKey(stat.opponentName) === key);
  const nextStat: OpponentStats = existing
    ? { ...existing }
    : {
        opponentName,
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        myRoundsWon: 0,
        opponentRoundsWon: 0,
        lastPlayedAt: playedAt,
      };

  nextStat.opponentName = opponentName;
  nextStat.matches += 1;
  nextStat.myRoundsWon += record.myScore;
  nextStat.opponentRoundsWon += record.opponentScore;
  nextStat.lastPlayedAt = playedAt;

  if (record.winner === 'me') nextStat.wins += 1;
  else if (record.winner === 'opponent') nextStat.losses += 1;
  else nextStat.draws += 1;

  const others = currentStats.filter((stat) => opponentKey(stat.opponentName) !== key);
  return sortOpponentStats([nextStat, ...others]).slice(0, MAX_OPPONENTS);
}

export function opponentWinRate(stats: OpponentStats): number {
  return stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;
}

function sortOpponentStats(stats: OpponentStats[]): OpponentStats[] {
  return [...stats].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

function normalizeOpponentName(name: string): string {
  return name.trim().slice(0, 32) || 'Opponent';
}

function opponentKey(name: string): string {
  return normalizeOpponentName(name).toLowerCase();
}

function isOpponentStats(value: unknown): value is OpponentStats {
  if (!value || typeof value !== 'object') return false;
  const stat = value as Record<string, unknown>;
  return (
    typeof stat.opponentName === 'string' &&
    typeof stat.matches === 'number' &&
    typeof stat.wins === 'number' &&
    typeof stat.losses === 'number' &&
    typeof stat.draws === 'number' &&
    typeof stat.myRoundsWon === 'number' &&
    typeof stat.opponentRoundsWon === 'number' &&
    typeof stat.lastPlayedAt === 'number'
  );
}
