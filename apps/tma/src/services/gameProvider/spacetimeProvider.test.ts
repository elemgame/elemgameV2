import { describe, expect, it } from 'vitest';
import { MoveId } from '@elmental/shared';
import { mapMatchPerspective, mapRoundResultPerspective } from './spacetimeProvider';
import type { MatchState, RoundResult } from '../../module_bindings/types';

describe('SpacetimeDB provider mappers', () => {
  const p1 = { id: 'p1' };
  const p2 = { id: 'p2' };
  const identityEquals = (a: unknown, b: unknown) => a === b;

  it('maps match rows from p1 perspective', () => {
    const mapped = mapMatchPerspective(matchRow(), p1 as never, identityEquals as never);

    expect(mapped).toMatchObject({
      matchId: '42',
      isPlayer1: true,
      myScore: 2,
      opponentScore: 1,
      myEnergy: 80,
      opponentEnergy: 60,
      opponentName: 'Bob',
      opponentRating: 1180,
      mySubmittedMove: MoveId.Fire,
      boostEnabled: true,
    });
  });

  it('maps match rows from p2 perspective', () => {
    const mapped = mapMatchPerspective(matchRow(), p2 as never, identityEquals as never);

    expect(mapped).toMatchObject({
      matchId: '42',
      isPlayer1: false,
      myScore: 1,
      opponentScore: 2,
      myEnergy: 60,
      opponentEnergy: 80,
      opponentName: 'Alice',
      opponentRating: 1210,
      mySubmittedMove: MoveId.Earth,
      boostEnabled: false,
    });
  });

  it('can map a match from an account-linked identity perspective', () => {
    const linkedIdentity = { id: 'p1-linked-device' };
    const mapped = mapMatchPerspective(matchRow(), linkedIdentity as never, identityEquals as never, true);

    expect(mapped).toMatchObject({
      matchId: '42',
      isPlayer1: true,
      opponentName: 'Bob',
      myScore: 2,
      opponentScore: 1,
      mySubmittedMove: MoveId.Fire,
    });
  });

  it('maps round results from both perspectives', () => {
    const p1Result = mapRoundResultPerspective(roundRow(), matchRow(), p1 as never, identityEquals as never, 95);
    const p2Result = mapRoundResultPerspective(roundRow(), matchRow(), p2 as never, identityEquals as never, 85);
    const linkedP1Result = mapRoundResultPerspective(
      roundRow(),
      matchRow(),
      { id: 'p1-linked-device' } as never,
      identityEquals as never,
      95,
      true,
    );

    expect(p1Result).toMatchObject({
      type: 'roundResult',
      myMove: MoveId.Fire,
      opponentMove: MoveId.Earth,
      result: 'win',
      myEnergyBefore: 95,
      myEnergyAfter: 80,
      myScore: 2,
      opponentScore: 1,
    });
    expect(p2Result).toMatchObject({
      type: 'roundResult',
      myMove: MoveId.Earth,
      opponentMove: MoveId.Fire,
      result: 'lose',
      myEnergyBefore: 85,
      myEnergyAfter: 60,
      myScore: 1,
      opponentScore: 2,
    });
    expect(linkedP1Result).toMatchObject({
      type: 'roundResult',
      myMove: MoveId.Fire,
      opponentMove: MoveId.Earth,
      result: 'win',
    });
  });

  function matchRow(): MatchState {
    return {
      id: 42n,
      p1: p1 as never,
      p2: p2 as never,
      p1Name: 'Alice',
      p2Name: 'Bob',
      p1Rating: 1210,
      p2Rating: 1180,
      stake: 100,
      mode: 'classic',
      room: 'test',
      phase: 'commit',
      status: 'active',
      currentRound: 3,
      p1Score: 2,
      p2Score: 1,
      p1Energy: 80,
      p2Energy: 60,
      p1BoostEnabled: true,
      p2BoostEnabled: false,
      p1CommitHash: 'hash1',
      p2CommitHash: 'hash2',
      p1RevealMove: MoveId.Fire,
      p2RevealMove: MoveId.Earth,
      p1RevealSalt: 'salt1',
      p2RevealSalt: 'salt2',
      winner: undefined,
      replayHash: undefined,
      roundStartedAtMicros: 1n,
      nextRoundReadyAtMicros: undefined,
      createdAtMicros: 1n,
      updatedAtMicros: 2n,
    };
  }

  function roundRow(): RoundResult {
    return {
      id: 7n,
      matchId: 42n,
      round: 2,
      p1Move: MoveId.Fire,
      p2Move: MoveId.Earth,
      p1Energy: 80,
      p2Energy: 60,
      p1Score: 2,
      p2Score: 1,
      p1Result: 'win',
      p2Result: 'lose',
      overclockSeed: undefined,
      createdAtMicros: 3n,
    };
  }
});
