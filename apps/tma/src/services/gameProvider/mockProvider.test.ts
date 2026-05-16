import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameMode, MoveId } from '@elmental/shared';
import { createMockProvider } from './mockProvider';
import type { GameplayProviderEvent } from './types';

describe('mock gameplay provider contract', () => {
  let events: GameplayProviderEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T00:00:00Z'));
    events = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits the happy-path event sequence for a full match', async () => {
    const provider = createMockProvider(
      { emit: (event) => events.push(event) },
      {
        deterministic: true,
        matchmakingDelayMs: 0,
        actionDelayMs: 0,
        finishDelayMs: 0,
        opponentMoves: [MoveId.Earth, MoveId.Earth, MoveId.Earth],
      },
    );

    await provider.initialize({ id: 1, first_name: 'Alice' });
    await provider.startMatchmaking({
      name: 'Alice',
      stake: 100,
      mode: GameMode.Classic,
      room: 'contract',
      boostEnabled: false,
      botFallbackSeconds: 0,
    });
    await runTimers();

    for (let round = 1; round <= 3; round += 1) {
      await provider.submitMove(MoveId.Fire);
      await runTimers();
      if (round < 3) await provider.advanceRound();
    }
    await runTimers();

    expect(eventTypes()).toContain('playerStats');
    expect(eventTypes()).toContain('queueActive');
    expect(eventTypes()).toContain('matchFound');
    expect(events.filter((event) => event.type === 'roundResult')).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({
      type: 'matchSettled',
      winner: 'me',
      myScore: 3,
      opponentScore: 0,
    });
  });

  it('supports queue cancellation before a match is created', async () => {
    const provider = createMockProvider(
      { emit: (event) => events.push(event) },
      { deterministic: true, matchmakingDelayMs: 10_000 },
    );

    await provider.initialize({ id: 1, first_name: 'Alice' });
    await provider.startMatchmaking({
      name: 'Alice',
      stake: 100,
      mode: GameMode.Classic,
      room: 'cancel',
      boostEnabled: false,
      botFallbackSeconds: 0,
    });
    await provider.cancelMatchmaking();
    await runTimers();

    expect(eventTypes()).toContain('queueActive');
    expect(eventTypes()).not.toContain('matchFound');
  });

  it('settles forfeits as an opponent win', async () => {
    const provider = createMockProvider(
      { emit: (event) => events.push(event) },
      { deterministic: true, matchmakingDelayMs: 0 },
    );

    await provider.initialize({ id: 1, first_name: 'Alice' });
    await provider.startMatchmaking({
      name: 'Alice',
      stake: 100,
      mode: GameMode.Classic,
      room: 'forfeit',
      boostEnabled: false,
      botFallbackSeconds: 0,
    });
    await runTimers();
    await provider.forfeitMatch();

    expect(events.at(-1)).toMatchObject({
      type: 'matchSettled',
      winner: 'opponent',
      opponentScore: 3,
    });
  });

  it('emits profile updates through the shared playerStats event', async () => {
    const provider = createMockProvider(
      { emit: (event) => events.push(event) },
      { deterministic: true },
    );

    await provider.initialize({ id: 1, first_name: 'Alice' });
    await provider.updateProfile({ id: 1, first_name: 'Alice Web' });

    expect(events.filter((event) => event.type === 'playerStats').at(-1)).toMatchObject({
      type: 'playerStats',
      name: 'Alice Web',
    });
  });

  it('uses Telegram username for player profile events', async () => {
    const provider = createMockProvider(
      { emit: (event) => events.push(event) },
      { deterministic: true },
    );

    await provider.initialize({
      id: 1,
      first_name: 'Telegram',
      last_name: 'User',
      username: 'tg_nick',
      source: 'telegram',
    });

    expect(events.find((event) => event.type === 'playerStats')).toMatchObject({
      type: 'playerStats',
      name: 'tg_nick',
    });
  });

  it('can start a fresh match after results are applied', async () => {
    const provider = createMockProvider(
      { emit: (event) => events.push(event) },
      {
        deterministic: true,
        matchmakingDelayMs: 0,
        actionDelayMs: 0,
        finishDelayMs: 0,
        opponentMoves: [MoveId.Earth, MoveId.Earth, MoveId.Earth, MoveId.Earth, MoveId.Earth, MoveId.Earth],
      },
    );

    await provider.initialize({ id: 1, first_name: 'Alice' });
    await playWinningMatch(provider, 'again');
    await provider.applyResults('playAgain');
    await playWinningMatch(provider, 'again');

    expect(events.filter((event) => event.type === 'matchFound')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'matchSettled')).toHaveLength(2);
  });

  function eventTypes() {
    return events.map((event) => event.type);
  }

  async function playWinningMatch(provider: ReturnType<typeof createMockProvider>, room: string) {
    await provider.startMatchmaking({
      name: 'Alice',
      stake: 100,
      mode: GameMode.Classic,
      room,
      boostEnabled: false,
      botFallbackSeconds: 0,
    });
    await runTimers();

    for (let round = 1; round <= 3; round += 1) {
      await provider.submitMove(MoveId.Fire);
      await runTimers();
      if (round < 3) await provider.advanceRound();
    }
    await runTimers();
  }
});

async function runTimers() {
  vi.runOnlyPendingTimers();
  await Promise.resolve();
}
