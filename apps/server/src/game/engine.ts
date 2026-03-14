import {
  resolveRound,
  calculateEnergy,
  resolveOverclock,
  getMoveInfo,
} from '@elmental/shared';
import {
  GameMode,
  MoveId,
  MatchStatus,
  RoundResult,
} from '@elmental/shared';
import type { RoundEntry, EnergyState } from '@elmental/shared';
import { ROUNDS_TO_WIN, STARTING_ENERGY, COMMIT_TIMEOUT_MS, REVEAL_TIMEOUT_MS } from '@elmental/shared';
import { verifyCommit, buildReplayLog, generateReplayHash } from './replay.js';
import type { ActiveMatch } from '../types.js';

// ---------------------------------------------------------------------------
// MatchEngine
// ---------------------------------------------------------------------------

export type EngineEvent =
  | { type: 'round-result'; round: number; entry: RoundEntry; match: ActiveMatch }
  | { type: 'match-over'; match: ActiveMatch; winnerId: number | null; replayHash: string }
  | { type: 'timeout'; matchId: string; round: number; reason: string };

export type EngineEventHandler = (event: EngineEvent) => void | Promise<void>;

export class MatchEngine {
  private match: ActiveMatch;
  private onEvent: EngineEventHandler;

  constructor(match: ActiveMatch, onEvent: EngineEventHandler) {
    this.match = match;
    this.onEvent = onEvent;
  }

  get matchId(): string {
    return this.match.matchId;
  }

  getSnapshot(): Readonly<ActiveMatch> {
    return this.match;
  }

  // ---------------------------------------------------------------------------
  // Commit phase
  // ---------------------------------------------------------------------------

  /**
   * Record a commit hash for a player.
   * Returns true if both players have committed and we should start the reveal timer.
   */
  receiveCommit(playerId: number, hash: string): boolean {
    const { match } = this;

    if (playerId === match.player1Id) {
      match.p1Commit = { hash, receivedAt: Date.now() };
    } else if (playerId === match.player2Id) {
      match.p2Commit = { hash, receivedAt: Date.now() };
    } else {
      throw new Error(`Unknown player ${playerId} for match ${match.matchId}`);
    }

    return match.p1Commit !== null && match.p2Commit !== null;
  }

  startCommitTimer(): void {
    const { match } = this;
    if (match.commitTimer) clearTimeout(match.commitTimer);

    match.commitTimer = setTimeout(() => {
      this.handleCommitTimeout();
    }, COMMIT_TIMEOUT_MS);
  }

  private handleCommitTimeout(): void {
    const { match } = this;
    const reason =
      !match.p1Commit && !match.p2Commit
        ? 'both players timed out on commit'
        : !match.p1Commit
          ? 'player1 timed out on commit'
          : 'player2 timed out on commit';

    void this.onEvent({
      type: 'timeout',
      matchId: match.matchId,
      round: match.currentRound,
      reason,
    });
  }

  stopCommitTimer(): void {
    if (this.match.commitTimer) {
      clearTimeout(this.match.commitTimer);
      this.match.commitTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Reveal phase
  // ---------------------------------------------------------------------------

  /**
   * Record a reveal for a player.
   * Validates the hash before accepting.
   * Returns true if both players have revealed and we should resolve the round.
   */
  receiveReveal(
    playerId: number,
    move: MoveId,
    salt: string,
  ): { accepted: boolean; bothRevealed: boolean } {
    const { match } = this;

    const isP1 = playerId === match.player1Id;
    const isP2 = playerId === match.player2Id;

    if (!isP1 && !isP2) {
      throw new Error(`Unknown player ${playerId} for match ${match.matchId}`);
    }

    const commit = isP1 ? match.p1Commit : match.p2Commit;
    if (!commit) {
      return { accepted: false, bothRevealed: false };
    }

    // Verify the commit hash
    if (!verifyCommit(commit.hash, move, salt)) {
      console.warn(
        `[engine] Invalid reveal from player ${playerId} in match ${match.matchId}`,
      );
      return { accepted: false, bothRevealed: false };
    }

    const reveal = { move, salt, receivedAt: Date.now() };
    if (isP1) {
      match.p1Reveal = reveal;
    } else {
      match.p2Reveal = reveal;
    }

    return {
      accepted: true,
      bothRevealed: match.p1Reveal !== null && match.p2Reveal !== null,
    };
  }

  startRevealTimer(): void {
    const { match } = this;
    if (match.revealTimer) clearTimeout(match.revealTimer);

    match.revealTimer = setTimeout(() => {
      this.handleRevealTimeout();
    }, REVEAL_TIMEOUT_MS);
  }

  private handleRevealTimeout(): void {
    const { match } = this;
    const reason =
      !match.p1Reveal && !match.p2Reveal
        ? 'both players timed out on reveal'
        : !match.p1Reveal
          ? 'player1 timed out on reveal'
          : 'player2 timed out on reveal';

    void this.onEvent({
      type: 'timeout',
      matchId: match.matchId,
      round: match.currentRound,
      reason,
    });
  }

  stopRevealTimer(): void {
    if (this.match.revealTimer) {
      clearTimeout(this.match.revealTimer);
      this.match.revealTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Round resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve the current round once both reveals are in.
   * Fires 'round-result' or 'match-over' events.
   */
  async resolveCurrentRound(): Promise<void> {
    const { match } = this;

    if (!match.p1Reveal || !match.p2Reveal) {
      throw new Error('Cannot resolve round: missing reveals');
    }

    let p1Move = match.p1Reveal.move;
    let p2Move = match.p2Reveal.move;

    // Overclock: if either player is overclocked, randomise their move
    let overclockSeed: string | undefined;
    if (match.p1Energy <= 0 || match.p2Energy <= 0) {
      // Generate a deterministic seed from both salts
      const seedBuf = Buffer.from(
        match.p1Reveal.salt + match.p2Reveal.salt,
        'utf8',
      );
      overclockSeed = seedBuf.toString('hex');

      const seedBytes = new Uint8Array(seedBuf);

      if (match.p1Energy <= 0) {
        const { finalMoveId } = resolveOverclock(p1Move, seedBytes);
        p1Move = finalMoveId;
      }
      if (match.p2Energy <= 0) {
        // Use different bytes for p2 (offset by 2)
        const p2SeedBytes = new Uint8Array(
          Buffer.from(match.p2Reveal.salt + match.p1Reveal.salt, 'utf8'),
        );
        const { finalMoveId } = resolveOverclock(p2Move, p2SeedBytes);
        p2Move = finalMoveId;
      }
    }

    // Resolve outcome
    const { p1Result, p2Result } = resolveRound(p1Move, p2Move);

    // Calculate new energy states
    const p1EnergyState: EnergyState = {
      energy: match.p1Energy,
      isOverclocked: match.p1Energy <= 0,
      boostActive: false,
    };
    const p2EnergyState: EnergyState = {
      energy: match.p2Energy,
      isOverclocked: match.p2Energy <= 0,
      boostActive: false,
    };

    const p1MoveInfo = getMoveInfo(p1Move);
    const p2MoveInfo = getMoveInfo(p2Move);

    const newP1Energy = calculateEnergy(p1EnergyState, p1MoveInfo, p1Result, match.mode);
    const newP2Energy = calculateEnergy(p2EnergyState, p2MoveInfo, p2Result, match.mode);

    // Build round entry
    const entry: RoundEntry = {
      round: match.currentRound,
      p1Move,
      p2Move,
      p1Energy: newP1Energy.energy,
      p2Energy: newP2Energy.energy,
      p1Result,
      p2Result,
    };
    if (overclockSeed !== undefined) {
      entry.overclockSeed = overclockSeed;
    }

    // Update match state
    match.p1Energy = newP1Energy.energy;
    match.p2Energy = newP2Energy.energy;

    if (p1Result === RoundResult.Win) match.p1Score++;
    if (p2Result === RoundResult.Win) match.p2Score++;

    match.rounds.push(entry);
    match.currentRound++;

    // Clear commits/reveals for next round
    match.p1Commit = null;
    match.p2Commit = null;
    match.p1Reveal = null;
    match.p2Reveal = null;

    await this.onEvent({ type: 'round-result', round: entry.round, entry, match });

    // Check for match winner
    if (match.p1Score >= ROUNDS_TO_WIN || match.p2Score >= ROUNDS_TO_WIN) {
      await this.finishMatch();
    }
  }

  // ---------------------------------------------------------------------------
  // Match conclusion
  // ---------------------------------------------------------------------------

  private async finishMatch(): Promise<void> {
    const { match } = this;

    this.stopCommitTimer();
    this.stopRevealTimer();

    let winnerId: number | null = null;
    if (match.p1Score >= ROUNDS_TO_WIN) {
      winnerId = match.player1Id;
    } else if (match.p2Score >= ROUNDS_TO_WIN) {
      winnerId = match.player2Id;
    }

    // Generate replay hash
    const replayLog = buildReplayLog(
      match.matchId,
      match.player1Id,
      match.player2Id,
      match.rounds,
      winnerId,
    );
    const replayHash = generateReplayHash(replayLog);

    await this.onEvent({ type: 'match-over', match, winnerId, replayHash });
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  cleanup(): void {
    this.stopCommitTimer();
    this.stopRevealTimer();
  }
}

// ---------------------------------------------------------------------------
// Active match registry (in-memory)
// ---------------------------------------------------------------------------

const activeMatches = new Map<string, MatchEngine>();

export function createActiveMatch(params: {
  matchId: string;
  player1Id: number;
  player2Id: number;
  p1SocketId: string;
  p2SocketId: string;
  stake: number;
  mode: GameMode;
  onEvent: EngineEventHandler;
}): MatchEngine {
  const match: ActiveMatch = {
    matchId: params.matchId,
    player1Id: params.player1Id,
    player2Id: params.player2Id,
    p1SocketId: params.p1SocketId,
    p2SocketId: params.p2SocketId,
    stake: params.stake,
    mode: params.mode,
    p1Score: 0,
    p2Score: 0,
    p1Energy: STARTING_ENERGY,
    p2Energy: STARTING_ENERGY,
    currentRound: 1,
    p1Commit: null,
    p2Commit: null,
    p1Reveal: null,
    p2Reveal: null,
    rounds: [],
    commitTimer: null,
    revealTimer: null,
    createdAt: Date.now(),
  };

  const engine = new MatchEngine(match, params.onEvent);
  activeMatches.set(params.matchId, engine);
  return engine;
}

export function getActiveMatch(matchId: string): MatchEngine | undefined {
  return activeMatches.get(matchId);
}

export function removeActiveMatch(matchId: string): void {
  const engine = activeMatches.get(matchId);
  if (engine) {
    engine.cleanup();
    activeMatches.delete(matchId);
  }
}

export function getActiveMatchCount(): number {
  return activeMatches.size;
}

// Re-export MatchStatus for use in socket handler
export { MatchStatus };
