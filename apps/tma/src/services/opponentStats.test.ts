import { describe, expect, it } from 'vitest';
import {
  opponentWinRate,
  recordOpponentMatch,
  type OpponentStats,
} from './opponentStats';

describe('opponent head-to-head stats', () => {
  it('counts repeated wins against the same opponent', () => {
    const first = recordOpponentMatch([], {
      opponentName: 'Mike',
      winner: 'me',
      myScore: 3,
      opponentScore: 1,
      playedAt: 10,
    });

    const second = recordOpponentMatch(first, {
      opponentName: ' mike ',
      winner: 'me',
      myScore: 3,
      opponentScore: 0,
      playedAt: 20,
    });

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      opponentName: 'mike',
      matches: 2,
      wins: 2,
      losses: 0,
      draws: 0,
      myRoundsWon: 6,
      opponentRoundsWon: 1,
      lastPlayedAt: 20,
    });
  });

  it('tracks losses and draws separately', () => {
    let stats: OpponentStats[] = [];
    stats = recordOpponentMatch(stats, {
      opponentName: 'Mike',
      winner: 'opponent',
      myScore: 1,
      opponentScore: 3,
      playedAt: 10,
    });
    stats = recordOpponentMatch(stats, {
      opponentName: 'Mike',
      winner: 'draw',
      myScore: 2,
      opponentScore: 2,
      playedAt: 20,
    });

    expect(stats[0]).toMatchObject({
      matches: 2,
      wins: 0,
      losses: 1,
      draws: 1,
      myRoundsWon: 3,
      opponentRoundsWon: 5,
    });
    expect(opponentWinRate(stats[0])).toBe(0);
  });

  it('sorts recently played opponents first', () => {
    let stats: OpponentStats[] = [];
    stats = recordOpponentMatch(stats, {
      opponentName: 'Mike',
      winner: 'me',
      myScore: 3,
      opponentScore: 0,
      playedAt: 10,
    });
    stats = recordOpponentMatch(stats, {
      opponentName: 'Alice',
      winner: 'me',
      myScore: 3,
      opponentScore: 2,
      playedAt: 30,
    });

    expect(stats.map((stat) => stat.opponentName)).toEqual(['Alice', 'Mike']);
  });
});
