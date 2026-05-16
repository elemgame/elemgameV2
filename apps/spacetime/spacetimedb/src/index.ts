import { ScheduleAt } from 'spacetimedb';
import { SenderError, schema, table, t } from 'spacetimedb/server';

const STARTING_ENERGY = 100;
const BOOST_EXTRA_ENERGY = 20;
const ROUNDS_TO_WIN = 3;
const BASIC_MOVE_COST = 10;
const ENHANCED_MOVE_COST = 25;
const REGEN_ON_WIN = 5;
const REGEN_ON_LOSE = 15;
const REGEN_ON_DRAW = 10;
const OVERCLOCK_RANDOM_CHANCE = 30;
const INITIAL_RATING = 1200;
const ELO_K_FACTOR = 32;
const ROUND_TIMEOUT_MICROS = 60_000_000n;
const RESULT_TIMEOUT_MICROS = 60_000_000n;
const GAME_TICK_MICROS = 2_000_000n;

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    online: t.bool(),
    rating: t.i32(),
    wins: t.u32(),
    losses: t.u32(),
  }
);

const queueEntry = table(
  { name: 'queue_entry', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    rating: t.i32(),
    stake: t.u32(),
    mode: t.string(),
    room: t.string(),
    boostEnabled: t.bool(),
    joinedAtMicros: t.u64(),
  }
);

const matchState = table(
  { name: 'match_state', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    p1: t.identity(),
    p2: t.identity(),
    p1Name: t.string(),
    p2Name: t.string(),
    p1Rating: t.i32(),
    p2Rating: t.i32(),
    stake: t.u32(),
    mode: t.string(),
    room: t.string(),
    phase: t.string(),
    status: t.string(),
    currentRound: t.u32(),
    p1Score: t.u32(),
    p2Score: t.u32(),
    p1Energy: t.i32(),
    p2Energy: t.i32(),
    p1BoostEnabled: t.bool(),
    p2BoostEnabled: t.bool(),
    p1CommitHash: t.string().optional(),
    p2CommitHash: t.string().optional(),
    p1RevealMove: t.u32().optional(),
    p2RevealMove: t.u32().optional(),
    p1RevealSalt: t.string().optional(),
    p2RevealSalt: t.string().optional(),
    winner: t.identity().optional(),
    replayHash: t.string().optional(),
    createdAtMicros: t.u64(),
    updatedAtMicros: t.u64(),
  }
);

const roundResult = table(
  {
    name: 'round_result',
    public: true,
    indexes: [{ accessor: 'round_result_match_id', algorithm: 'btree', columns: ['matchId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    matchId: t.u64(),
    round: t.u32(),
    p1Move: t.u32(),
    p2Move: t.u32(),
    p1Energy: t.i32(),
    p2Energy: t.i32(),
    p1Score: t.u32(),
    p2Score: t.u32(),
    p1Result: t.string(),
    p2Result: t.string(),
    overclockSeed: t.string().optional(),
    createdAtMicros: t.u64(),
  }
);

const gameEvent = table(
  {
    name: 'game_event',
    public: true,
    indexes: [{ accessor: 'game_event_match_id', algorithm: 'btree', columns: ['matchId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    matchId: t.u64().optional(),
    round: t.u32(),
    level: t.string(),
    event: t.string(),
    message: t.string(),
    data: t.string(),
    createdAtMicros: t.u64(),
  }
);

const gameTickColumns = {
  scheduledId: t.u64().primaryKey().autoInc(),
  scheduledAt: t.scheduleAt(),
};
const gameTick: any = table(
  { name: 'game_tick', scheduled: (): any => run_game_tick },
  gameTickColumns
);

const spacetimedb = schema({ player, queueEntry, matchState, roundResult, gameEvent, gameTick });
export default spacetimedb;

type IdentityLike = { isEqual(other: IdentityLike): boolean };
type ReducerContext = any;
type MatchRow = any;

export const init = spacetimedb.init(ctx => {
  logEvent(ctx, 'system.init', undefined, 'SpacetimeDB module initialized');
  scheduleNextTick(ctx);
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({ ...existing, online: true });
    logEvent(ctx, 'player.connected', undefined, `Player reconnected ${existing.name}`, identityHex(ctx.sender));
    return;
  }

  ctx.db.player.insert({
    identity: ctx.sender,
    name: shortIdentity(ctx.sender),
    online: true,
    rating: INITIAL_RATING,
    wins: 0,
    losses: 0,
  });
  logEvent(ctx, 'player.connected', undefined, `Player connected ${shortIdentity(ctx.sender)}`, identityHex(ctx.sender));
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({ ...existing, online: false });
    logEvent(ctx, 'player.disconnected', undefined, `Player disconnected ${existing.name}`, identityHex(ctx.sender));
  }
  ctx.db.queueEntry.identity.delete(ctx.sender);
});

export const set_profile = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const validated = validateName(name);
    const existing = requirePlayer(ctx);
    ctx.db.player.identity.update({ ...existing, name: validated, online: true });
  }
);

export const join_queue = spacetimedb.reducer(
  { name: t.string(), stake: t.u32(), mode: t.string(), room: t.string(), boostEnabled: t.bool() },
  (ctx, { name, stake, mode, room, boostEnabled }) => {
    const validatedName = validateName(name);
    const validatedMode = validateMode(mode);
    const validatedRoom = validateRoom(room);
    if (stake <= 0) {
      throw new SenderError('Stake must be positive');
    }

    const playerRow = requirePlayer(ctx);
    ctx.db.player.identity.update({ ...playerRow, name: validatedName, online: true });
    ctx.db.queueEntry.identity.delete(ctx.sender);

    const existingMatch = findLatestActiveMatchForPlayer(ctx, ctx.sender);
    if (existingMatch) {
      logEvent(
        ctx,
        'queue.active_match',
        existingMatch,
        `${validatedName} already has an active match`,
        `room=${existingMatch.room} status=${existingMatch.status} phase=${existingMatch.phase}`
      );
      return;
    }

    const opponent = findOpponent(ctx, stake, validatedMode, validatedRoom);
    if (!opponent) {
      ctx.db.queueEntry.insert({
        identity: ctx.sender,
        name: validatedName,
        rating: playerRow.rating,
        stake,
        mode: validatedMode,
        room: validatedRoom,
        boostEnabled,
        joinedAtMicros: nowMicros(ctx),
      });
      logEvent(ctx, 'queue.joined', undefined, `${validatedName} joined ${validatedMode} queue`, `room=${validatedRoom} stake=${stake}`);
      return;
    }

    ctx.db.queueEntry.identity.delete(opponent.identity);
    const opponentPlayer = ctx.db.player.identity.find(opponent.identity);
    const opponentRating = opponentPlayer?.rating ?? opponent.rating;

    const inserted = ctx.db.matchState.insert({
      id: 0n,
      p1: opponent.identity,
      p2: ctx.sender,
      p1Name: opponent.name,
      p2Name: validatedName,
      p1Rating: opponentRating,
      p2Rating: playerRow.rating,
      stake,
      mode: validatedMode,
      room: validatedRoom,
      phase: 'select',
      status: 'active',
      currentRound: 1,
      p1Score: 0,
      p2Score: 0,
      p1Energy: opponent.boostEnabled ? STARTING_ENERGY + BOOST_EXTRA_ENERGY : STARTING_ENERGY,
      p2Energy: boostEnabled ? STARTING_ENERGY + BOOST_EXTRA_ENERGY : STARTING_ENERGY,
      p1BoostEnabled: opponent.boostEnabled,
      p2BoostEnabled: boostEnabled,
      p1CommitHash: undefined,
      p2CommitHash: undefined,
      p1RevealMove: undefined,
      p2RevealMove: undefined,
      p1RevealSalt: undefined,
      p2RevealSalt: undefined,
      winner: undefined,
      replayHash: undefined,
      createdAtMicros: nowMicros(ctx),
      updatedAtMicros: nowMicros(ctx),
    });
    logEvent(
      ctx,
      'match.created',
      inserted,
      `Match ${inserted.id} created: ${opponent.name} vs ${validatedName}`,
      `room=${validatedRoom} mode=${validatedMode} stake=${stake}`
    );
  }
);

export const leave_queue = spacetimedb.reducer(ctx => {
  ctx.db.queueEntry.identity.delete(ctx.sender);
});

export const commit_move = spacetimedb.reducer(
  { matchId: t.u64(), hash: t.string() },
  (ctx, { matchId, hash }) => {
    if (!hash) throw new SenderError('Commit hash is required');
    const match = requireActiveMatch(ctx, matchId);
    const side = playerSide(match, ctx.sender);

    if (side === 'p1') {
      if (match.p1CommitHash) throw new SenderError('Player already committed this round');
      const updated = {
        ...match,
        phase: match.p2CommitHash ? 'reveal' : 'commit',
        p1CommitHash: hash,
        updatedAtMicros: nowMicros(ctx),
      };
      ctx.db.matchState.id.update(updated);
      logEvent(ctx, 'round.commit', updated, 'p1 legacy commit accepted', `hash=${hash}`);
    } else {
      if (match.p2CommitHash) throw new SenderError('Player already committed this round');
      const updated = {
        ...match,
        phase: match.p1CommitHash ? 'reveal' : 'commit',
        p2CommitHash: hash,
        updatedAtMicros: nowMicros(ctx),
      };
      ctx.db.matchState.id.update(updated);
      logEvent(ctx, 'round.commit', updated, 'p2 legacy commit accepted', `hash=${hash}`);
    }
  }
);

export const submit_move = spacetimedb.reducer(
  { matchId: t.u64(), move: t.u32() },
  (ctx, { matchId, move }) => {
    validateMove(move);
    const match = requireActiveMatch(ctx, matchId);
    if (match.phase !== 'select' && match.phase !== 'commit') {
      throw new SenderError(`Cannot submit move while match is in ${match.phase} phase`);
    }

    const side = playerSide(match, ctx.sender);
    if (side === 'p1' && match.p1RevealMove !== undefined) {
      throw new SenderError('Player already submitted this round');
    }
    if (side === 'p2' && match.p2RevealMove !== undefined) {
      throw new SenderError('Player already submitted this round');
    }

    const updated = setServerMove(ctx, match, side, move, 'player');
    logEvent(ctx, 'round.move_submitted', updated, `${side} submitted move`, `move=${move}`);
    if (hasBothMoves(updated)) {
      resolveRound(ctx, updated);
    } else {
      ctx.db.matchState.id.update(updated);
    }
  }
);

export const reveal_move = spacetimedb.reducer(
  { matchId: t.u64(), move: t.u32(), salt: t.string() },
  (ctx, { matchId, move, salt }) => {
    validateMove(move);
    if (!salt) throw new SenderError('Reveal salt is required');

    const match = requireActiveMatch(ctx, matchId);
    const side = playerSide(match, ctx.sender);
    const expectedHash = commitHash(move, salt);

    if (side === 'p1') {
      if (!match.p1CommitHash) throw new SenderError('Commit before revealing');
      if (match.p1CommitHash !== expectedHash) throw new SenderError('Invalid reveal');
      if (match.p1RevealMove !== undefined) throw new SenderError('Player already revealed this round');
      const updated = {
        ...match,
        phase: match.p2RevealMove !== undefined ? 'result' : 'reveal',
        p1RevealMove: move,
        p1RevealSalt: salt,
        updatedAtMicros: nowMicros(ctx),
      };
      if (updated.p2RevealMove !== undefined && updated.p2RevealSalt !== undefined) {
        logEvent(ctx, 'round.reveal', updated, 'p1 legacy reveal accepted; resolving round', `move=${move}`);
        resolveRound(ctx, updated);
      } else {
        ctx.db.matchState.id.update(updated);
        logEvent(ctx, 'round.reveal', updated, 'p1 legacy reveal accepted', `move=${move}`);
      }
    } else {
      if (!match.p2CommitHash) throw new SenderError('Commit before revealing');
      if (match.p2CommitHash !== expectedHash) throw new SenderError('Invalid reveal');
      if (match.p2RevealMove !== undefined) throw new SenderError('Player already revealed this round');
      const updated = {
        ...match,
        phase: match.p1RevealMove !== undefined ? 'result' : 'reveal',
        p2RevealMove: move,
        p2RevealSalt: salt,
        updatedAtMicros: nowMicros(ctx),
      };
      if (updated.p1RevealMove !== undefined && updated.p1RevealSalt !== undefined) {
        logEvent(ctx, 'round.reveal', updated, 'p2 legacy reveal accepted; resolving round', `move=${move}`);
        resolveRound(ctx, updated);
      } else {
        ctx.db.matchState.id.update(updated);
        logEvent(ctx, 'round.reveal', updated, 'p2 legacy reveal accepted', `move=${move}`);
      }
    }
  }
);

export const next_round = spacetimedb.reducer(
  { matchId: t.u64() },
  (ctx, { matchId }) => {
    const match = requireActiveMatch(ctx, matchId);
    playerSide(match, ctx.sender);
    if (match.phase !== 'result') return;
    const updated = { ...match, phase: 'select', updatedAtMicros: nowMicros(ctx) };
    ctx.db.matchState.id.update(updated);
    logEvent(ctx, 'round.next', updated, `Round ${updated.currentRound} started`);
  }
);

export const forfeit_match = spacetimedb.reducer(
  { matchId: t.u64() },
  (ctx, { matchId }) => {
    const match = requireActiveMatch(ctx, matchId);
    const side = playerSide(match, ctx.sender);
    const winner = side === 'p1' ? match.p2 : match.p1;
    const p1Score = side === 'p1' ? match.p1Score : Math.max(match.p1Score, ROUNDS_TO_WIN);
    const p2Score = side === 'p2' ? match.p2Score : Math.max(match.p2Score, ROUNDS_TO_WIN);

    finishMatch(ctx, { ...match, p1Score, p2Score }, winner);
  }
);

export const run_game_tick = spacetimedb.reducer({ arg: gameTick.rowType }, (ctx, { arg: _arg }) => {
  const now = nowMicros(ctx);
  for (const match of ctx.db.matchState.iter()) {
    if (match.status !== 'active') continue;
    if (match.phase === 'result') {
      if (now - match.updatedAtMicros >= RESULT_TIMEOUT_MICROS) {
        expireResultPhase(ctx, match);
      }
      continue;
    }
    if (match.phase !== 'select' && match.phase !== 'commit' && match.phase !== 'reveal') continue;
    if (now - match.updatedAtMicros >= ROUND_TIMEOUT_MICROS) {
      logTimedOutRound(ctx, match);
    }
  }
  scheduleNextTick(ctx);
});

function logTimedOutRound(ctx: ReducerContext, match: MatchRow) {
  const missingSides: string[] = [];
  if (match.p1RevealMove === undefined) missingSides.push('p1');
  if (match.p2RevealMove === undefined) missingSides.push('p2');

  if (match.p1RevealMove !== undefined && match.p2RevealMove === undefined) {
    logEvent(
      ctx,
      'round.timeout_forfeit',
      match,
      `p2 timed out in match ${match.id}; p1 wins by timeout`,
      `missing=${missingSides.join(',')}`
    );
    finishMatch(ctx, { ...match, p1Score: Math.max(match.p1Score, ROUNDS_TO_WIN) }, match.p1);
    return;
  }

  if (match.p2RevealMove !== undefined && match.p1RevealMove === undefined) {
    logEvent(
      ctx,
      'round.timeout_forfeit',
      match,
      `p1 timed out in match ${match.id}; p2 wins by timeout`,
      `missing=${missingSides.join(',')}`
    );
    finishMatch(ctx, { ...match, p2Score: Math.max(match.p2Score, ROUNDS_TO_WIN) }, match.p2);
    return;
  }

  if (match.p1RevealMove === undefined && match.p2RevealMove === undefined) {
    expireMatchAsDraw(ctx, match, 'Both players timed out before submitting a move');
    return;
  }

  const updated = { ...match, updatedAtMicros: nowMicros(ctx) };
  ctx.db.matchState.id.update(updated);
  logEvent(
    ctx,
    'round.timeout',
    updated,
    `Round ${updated.currentRound} is waiting for player action`,
    `missing=${missingSides.join(',') || 'none'}`
  );
}

function resolveRound(ctx: ReducerContext, match: MatchRow) {
  if (
    match.p1RevealMove === undefined ||
    match.p2RevealMove === undefined ||
    match.p1RevealSalt === undefined ||
    match.p2RevealSalt === undefined
  ) {
    throw new SenderError('Both players must reveal before round resolution');
  }

  let p1Move = match.p1RevealMove;
  let p2Move = match.p2RevealMove;
  const seed = `${match.id}:${match.currentRound}:${match.p1RevealSalt}:${match.p2RevealSalt}`;
  let overclockSeed: string | undefined = undefined;

  if (match.p1Energy <= 0) {
    const resolved = resolveOverclock(p1Move, `${seed}:p1`);
    p1Move = resolved.move;
    if (resolved.randomized) overclockSeed = hashHex(`${seed}:p1`);
  }
  if (match.p2Energy <= 0) {
    const resolved = resolveOverclock(p2Move, `${seed}:p2`);
    p2Move = resolved.move;
    if (resolved.randomized) overclockSeed = `${overclockSeed ?? ''}${hashHex(`${seed}:p2`)}`;
  }

  const p1Result = roundOutcome(p1Move, p2Move);
  const p2Result = invertResult(p1Result);
  const p1Energy = calculateEnergy(match.p1Energy, p1Move, p1Result, match.mode);
  const p2Energy = calculateEnergy(match.p2Energy, p2Move, p2Result, match.mode);
  const p1Score = match.p1Score + (p1Result === 'win' ? 1 : 0);
  const p2Score = match.p2Score + (p2Result === 'win' ? 1 : 0);

  ctx.db.roundResult.insert({
    id: 0n,
    matchId: match.id,
    round: match.currentRound,
    p1Move,
    p2Move,
    p1Energy,
    p2Energy,
    p1Score,
    p2Score,
    p1Result,
    p2Result,
    overclockSeed,
    createdAtMicros: nowMicros(ctx),
  });
  logEvent(
    ctx,
    'round.resolved',
    match,
    `Round ${match.currentRound} resolved: ${p1Result}/${p2Result}`,
    `p1Move=${p1Move} p2Move=${p2Move} score=${p1Score}:${p2Score}`
  );

  const resolved = {
    ...match,
    phase: 'result',
    p1Score,
    p2Score,
    p1Energy,
    p2Energy,
    currentRound: match.currentRound + 1,
    p1CommitHash: undefined,
    p2CommitHash: undefined,
    p1RevealMove: undefined,
    p2RevealMove: undefined,
    p1RevealSalt: undefined,
    p2RevealSalt: undefined,
    updatedAtMicros: nowMicros(ctx),
  };

  if (p1Score >= ROUNDS_TO_WIN) {
    finishMatch(ctx, resolved, match.p1);
  } else if (p2Score >= ROUNDS_TO_WIN) {
    finishMatch(ctx, resolved, match.p2);
  } else {
    ctx.db.matchState.id.update(resolved);
  }
}

function expireMatchAsDraw(ctx: ReducerContext, match: MatchRow, reason: string) {
  const replayHash = hashHex(`${match.id}:draw:${match.currentRound}:${nowMicros(ctx)}`);
  logEvent(ctx, 'match.expired_draw', match, reason, `score=${match.p1Score}:${match.p2Score}`);
  ctx.db.matchState.id.update({
    ...match,
    phase: 'complete',
    status: 'settled',
    winner: undefined,
    replayHash,
    updatedAtMicros: nowMicros(ctx),
  });
}

function expireResultPhase(ctx: ReducerContext, match: MatchRow) {
  if (match.p1Score > match.p2Score) {
    logEvent(ctx, 'match.expired_score', match, 'Result phase timed out; p1 wins by current score');
    finishMatch(ctx, { ...match, p1Score: Math.max(match.p1Score, ROUNDS_TO_WIN) }, match.p1);
    return;
  }
  if (match.p2Score > match.p1Score) {
    logEvent(ctx, 'match.expired_score', match, 'Result phase timed out; p2 wins by current score');
    finishMatch(ctx, { ...match, p2Score: Math.max(match.p2Score, ROUNDS_TO_WIN) }, match.p2);
    return;
  }
  expireMatchAsDraw(ctx, match, 'Result phase timed out with tied score');
}

function finishMatch(ctx: ReducerContext, match: MatchRow, winner: MatchRow['p1']) {
  const replayHash = hashHex(`${match.id}:${match.p1Score}:${match.p2Score}:${match.currentRound}`);
  logEvent(
    ctx,
    'match.settled',
    match,
    `Match ${match.id} settled`,
    `winner=${identityHex(winner)} score=${match.p1Score}:${match.p2Score}`
  );
  ctx.db.matchState.id.update({
    ...match,
    phase: 'complete',
    status: 'settled',
    winner,
    replayHash,
    updatedAtMicros: nowMicros(ctx),
  });

  const loser = identityEquals(winner, match.p1) ? match.p2 : match.p1;
  const winnerPlayer = ctx.db.player.identity.find(winner);
  const loserPlayer = ctx.db.player.identity.find(loser);
  if (winnerPlayer && loserPlayer) {
    const [newWinner, newLoser] = calculateElo(winnerPlayer.rating, loserPlayer.rating);
    ctx.db.player.identity.update({
      ...winnerPlayer,
      rating: newWinner,
      wins: winnerPlayer.wins + 1,
    });
    ctx.db.player.identity.update({
      ...loserPlayer,
      rating: newLoser,
      losses: loserPlayer.losses + 1,
    });
  }
}

function setServerMove(ctx: ReducerContext, match: MatchRow, side: 'p1' | 'p2', move: number, source: string) {
  const salt = `${source}:${hashHex(`${match.id}:${match.currentRound}:${side}:${move}:${nowMicros(ctx)}`)}`;
  const update = {
    ...match,
    phase: 'commit',
    updatedAtMicros: nowMicros(ctx),
  };
  if (side === 'p1') {
    return {
      ...update,
      phase: match.p2RevealMove !== undefined ? 'result' : 'commit',
      p1CommitHash: commitHash(move, salt),
      p1RevealMove: move,
      p1RevealSalt: salt,
    };
  }
  return {
    ...update,
    phase: match.p1RevealMove !== undefined ? 'result' : 'commit',
    p2CommitHash: commitHash(move, salt),
    p2RevealMove: move,
    p2RevealSalt: salt,
  };
}

function hasBothMoves(match: MatchRow) {
  return (
    match.p1RevealMove !== undefined &&
    match.p2RevealMove !== undefined &&
    match.p1RevealSalt !== undefined &&
    match.p2RevealSalt !== undefined
  );
}

function findOpponent(ctx: ReducerContext, stake: number, mode: string, room?: string) {
  for (const entry of ctx.db.queueEntry.iter()) {
    if (identityEquals(entry.identity, ctx.sender)) continue;
    if (findLatestActiveMatchForPlayer(ctx, entry.identity)) {
      ctx.db.queueEntry.identity.delete(entry.identity);
      continue;
    }
    if (room !== undefined && entry.room !== room) continue;
    if (entry.stake === stake && entry.mode === mode) return entry;
  }
  return undefined;
}

function findLatestActiveMatchForPlayer(ctx: ReducerContext, identity: IdentityLike) {
  let latest: MatchRow | undefined = undefined;
  for (const match of ctx.db.matchState.iter()) {
    if (match.status !== 'active') continue;
    if (!identityEquals(match.p1, identity) && !identityEquals(match.p2, identity)) continue;
    if (!latest || match.id > latest.id) latest = match;
  }
  return latest;
}

function requirePlayer(ctx: ReducerContext) {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (!existing) {
    throw new SenderError('Player is not connected');
  }
  return existing;
}

function requireActiveMatch(ctx: ReducerContext, matchId: bigint) {
  const match = ctx.db.matchState.id.find(matchId);
  if (!match) throw new SenderError('Match not found');
  if (match.status !== 'active') throw new SenderError('Match is not active');
  return match;
}

function playerSide(match: MatchRow, identity: MatchRow['p1']) {
  if (identityEquals(match.p1, identity)) return 'p1';
  if (identityEquals(match.p2, identity)) return 'p2';
  throw new SenderError('You are not a player in this match');
}

function validateName(name: string) {
  const trimmed = name.trim().slice(0, 32);
  if (!trimmed) throw new SenderError('Name is required');
  return trimmed;
}

function validateMode(mode: string) {
  if (mode !== 'classic' && mode !== 'hardcore' && mode !== 'chaos') {
    throw new SenderError('Unknown game mode');
  }
  return mode;
}

function validateRoom(room: string) {
  const trimmed = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return trimmed || 'public';
}

function validateMove(move: number) {
  if (!Number.isInteger(move) || move < 0 || move > 5) {
    throw new SenderError('Unknown move');
  }
}

function moveCost(move: number) {
  return move >= 3 ? ENHANCED_MOVE_COST : BASIC_MOVE_COST;
}

function calculateEnergy(energy: number, move: number, result: string, mode: string) {
  const regen = mode === 'hardcore'
    ? 0
    : mode === 'chaos'
      ? hash32(`${energy}:${move}:${result}`) % 21
      : result === 'win'
        ? REGEN_ON_WIN
        : result === 'lose'
          ? REGEN_ON_LOSE
          : REGEN_ON_DRAW;
  return Math.min(100, energy - moveCost(move) + regen);
}

function roundOutcome(p1Move: number, p2Move: number) {
  const matrix = [
    ['draw', 'lose', 'win', 'lose', 'win', 'lose'],
    ['win', 'draw', 'lose', 'lose', 'lose', 'win'],
    ['lose', 'win', 'draw', 'win', 'lose', 'lose'],
    ['win', 'win', 'lose', 'draw', 'lose', 'win'],
    ['lose', 'win', 'win', 'win', 'draw', 'lose'],
    ['win', 'lose', 'win', 'lose', 'win', 'draw'],
  ] as const;
  return matrix[p1Move]?.[p2Move] ?? 'draw';
}

function invertResult(result: string) {
  if (result === 'win') return 'lose';
  if (result === 'lose') return 'win';
  return 'draw';
}

function resolveOverclock(move: number, seed: string) {
  const roll = hash32(seed);
  if (roll % 100 >= OVERCLOCK_RANDOM_CHANCE) {
    return { move, randomized: false };
  }
  return { move: hash32(`${seed}:move`) % 6, randomized: true };
}

function calculateElo(winnerRating: number, loserRating: number) {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;
  return [
    Math.round(winnerRating + ELO_K_FACTOR * (1 - expectedWinner)),
    Math.round(loserRating + ELO_K_FACTOR * (0 - expectedLoser)),
  ] as const;
}

function commitHash(move: number, salt: string) {
  return hashHex(`${move}:${salt}`);
}

function hashHex(value: string) {
  return hash32(value).toString(16).padStart(8, '0');
}

function hash32(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function nowMicros(ctx: ReducerContext) {
  return ctx.timestamp.microsSinceUnixEpoch;
}

function scheduleNextTick(ctx: ReducerContext) {
  ctx.db.gameTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nowMicros(ctx) + GAME_TICK_MICROS),
  });
}

function logEvent(ctx: ReducerContext, event: string, match?: MatchRow, message = '', data = '') {
  const matchId = match?.id;
  const round = match?.currentRound ?? 0;
  const trimmedData = data.slice(0, 512);
  ctx.db.gameEvent.insert({
    id: 0n,
    matchId,
    round,
    level: 'info',
    event,
    message,
    data: trimmedData,
    createdAtMicros: nowMicros(ctx),
  });
  console.log(`[elmental] ${event} match=${matchId ?? '-'} round=${round} ${message} ${trimmedData}`);
}

function identityEquals(a: IdentityLike, b: IdentityLike) {
  return a.isEqual(b);
}

function shortIdentity(identity: { toHexString(): string }) {
  return identity.toHexString().slice(0, 8);
}

function identityHex(identity: { toHexString(): string }) {
  return identity.toHexString();
}
