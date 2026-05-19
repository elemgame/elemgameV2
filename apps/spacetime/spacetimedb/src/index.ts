import { ScheduleAt } from 'spacetimedb';
import { SenderError, schema, table, t } from 'spacetimedb/server';

const STARTING_ENERGY = 100;
const BOOST_EXTRA_ENERGY = 20;
const ROUNDS_TO_WIN = 3;
const MAX_ROUNDS = 5;
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
const QUEUE_TIMEOUT_MICROS = 180_000_000n;
const GAME_TICK_MICROS = 2_000_000n;
const MIN_REVEAL_DELAY_MICROS = 1_500_000n;
const JOIN_RATE_LIMIT_WINDOW_MICROS = 30_000_000n;
const JOIN_RATE_LIMIT_MAX = 3;
const FORFEIT_PENALTY_WINDOW_MICROS = 3_600_000_000n;
const REPEAT_FORFEIT_RATING_MULTIPLIER = 2;
const NEXT_ROUND_JITTER_MAX_MICROS = 500_000;
const INITIAL_BALANCE = 1000;
const BOOST_STAKE_PERCENT = 10;
const ECONOMY_MODEL_ENTRY_FEE = 'entry_fee_season_points';
const SEASON_POINTS_WIN = 30;
const SEASON_POINTS_DRAW = 15;
const SEASON_POINTS_LOSS = 10;
const SEASON_POINTS_CLEAN_WIN_BONUS = 5;
const PAYMENT_JWT_ISSUER = 'elmental-payments';
const PAYMENT_JWT_AUDIENCE = 'elmental-v2-payments';
const PAYMENT_JWT_SUBJECT = 'payments-service';
const PAID_ELM_BALANCE_KIND = 'paid_elm';
const DEMO_TELM_BALANCE_KIND = 'demo_teml';
const PAYMENT_STATUS_CREDITED = 'credited';
const PAYMENT_STATUS_REFUND_PENDING = 'refund_pending';
const PAYMENT_STATUS_REFUNDED = 'refunded';
const ELM_STARS_PACKAGES = [
  { starsAmount: 1, elmAmount: 100 },
  { starsAmount: 5, elmAmount: 500 },
  { starsAmount: 10, elmAmount: 1000 },
] as const;

const account = table(
  { name: 'account', public: true },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    rating: t.i32(),
    wins: t.u32(),
    losses: t.u32(),
    balance: t.i32().default(INITIAL_BALANCE),
    balanceKind: t.string().default('demo_teml'),
    seasonPoints: t.u32().default(0),
  }
);

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    online: t.bool(),
    rating: t.i32(),
    wins: t.u32(),
    losses: t.u32(),
    balance: t.i32().default(INITIAL_BALANCE),
    balanceKind: t.string().default('demo_teml'),
    accountId: t.string().default(''),
    seasonPoints: t.u32().default(0),
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
    botFallbackAtMicros: t.u64().optional().default(undefined),
    accountId: t.string().default(''),
    balanceKind: t.string().default('demo_teml'),
  }
);

const automationGuard = table(
  { name: 'automation_guard' },
  {
    identity: t.identity().primaryKey(),
    joinWindowStartMicros: t.u64(),
    joinCount: t.u32(),
    forfeitWindowStartMicros: t.u64(),
    forfeitCount: t.u32(),
  }
);

const botMoveCommit = table(
  { name: 'bot_move_commit' },
  {
    id: t.string().primaryKey(),
    matchId: t.u64(),
    round: t.u32(),
    move: t.u32(),
    salt: t.string(),
  }
);

// Private: contains Telegram payment identifiers and must not be exposed to client subscriptions.
const paymentLedger = table(
  {
    name: 'payment_ledger',
    indexes: [
      { accessor: 'payment_ledger_account_id', algorithm: 'btree', columns: ['accountId'] },
      { accessor: 'payment_ledger_telegram_user_id', algorithm: 'btree', columns: ['telegramUserId'] },
      { accessor: 'payment_ledger_charge_id', algorithm: 'btree', columns: ['telegramPaymentChargeId'] },
      { accessor: 'payment_ledger_status', algorithm: 'btree', columns: ['status'] },
    ],
  },
  {
    paymentId: t.string().primaryKey(),
    accountId: t.string(),
    telegramUserId: t.string(),
    starsAmount: t.u32(),
    elmAmount: t.u32(),
    refundableElmAmount: t.u32().default(0),
    refundedStarsAmount: t.u32().default(0),
    refundedElmAmount: t.u32().default(0),
    telegramPaymentChargeId: t.string().default(''),
    invoicePayload: t.string(),
    balanceKind: t.string().default('paid_elm'),
    status: t.string(),
    createdAtMicros: t.u64(),
    paidAtMicros: t.u64().optional().default(undefined),
    creditedAtMicros: t.u64().optional().default(undefined),
    refundRequestedAtMicros: t.u64().optional().default(undefined),
    refundedAtMicros: t.u64().optional().default(undefined),
    updatedAtMicros: t.u64(),
  }
);

// Private: immutable operator audit trail for admin balance adjustments.
const adminAuditEvent = table(
  { name: 'admin_audit_event' },
  {
    requestId: t.string().primaryKey(),
    adminTelegramId: t.string(),
    targetAccountId: t.string(),
    balanceKind: t.string(),
    operation: t.string(),
    previousBalance: t.i32(),
    newBalance: t.i32(),
    delta: t.i32(),
    reason: t.string(),
    createdAtMicros: t.u64(),
  }
);

// Private: append-only source of truth for account balance mutations.
const balanceEvent = table(
  {
    name: 'balance_event',
    indexes: [
      { accessor: 'balance_event_account_id', algorithm: 'btree', columns: ['accountId'] },
      { accessor: 'balance_event_match_id', algorithm: 'btree', columns: ['matchId'] },
      { accessor: 'balance_event_payment_id', algorithm: 'btree', columns: ['paymentId'] },
    ],
  },
  {
    idempotencyKey: t.string().primaryKey(),
    accountId: t.string(),
    balanceKind: t.string().default('demo_teml'),
    delta: t.i32(),
    balanceAfter: t.i32(),
    reasonKind: t.string(),
    paymentId: t.string().optional().default(undefined),
    matchId: t.u64().optional().default(undefined),
    actor: t.string().default('system'),
    createdAtMicros: t.u64(),
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
    balanceKind: t.string().default('demo_teml'),
    economyModel: t.string().default(ECONOMY_MODEL_ENTRY_FEE),
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
    p1SeasonPointsAwarded: t.u32().default(0),
    p2SeasonPointsAwarded: t.u32().default(0),
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
    roundStartedAtMicros: t.u64().default(0n),
    nextRoundReadyAtMicros: t.u64().optional().default(undefined),
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

const spacetimedb = schema({
  account,
  player,
  queueEntry,
  automationGuard,
  botMoveCommit,
  paymentLedger,
  adminAuditEvent,
  balanceEvent,
  matchState,
  roundResult,
  gameEvent,
  gameTick,
});
export default spacetimedb;

type IdentityLike = { isEqual(other: IdentityLike): boolean };
type ReducerContext = any;
type MatchRow = any;
type QueueEntryRow = any;
type AccountRow = any;
type BalanceMutation = {
  delta: number;
  reasonKind: string;
  idempotencyKey: string;
  paymentId?: string;
  matchId?: bigint;
  actor?: string;
};

export const init = spacetimedb.init(ctx => {
  logEvent(ctx, 'system.init', undefined, 'SpacetimeDB module initialized');
  scheduleNextTick(ctx);
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  if (isPaymentService(ctx)) {
    logEvent(ctx, 'payment_service.connected', undefined, 'Payment service connected', identityHex(ctx.sender));
    return;
  }

  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    const accountRow = ensureAccount(ctx, playerAccountId(existing), existing.name, existing);
    ctx.db.player.identity.update(playerFromAccount(existing, accountRow, existing.name, true));
    logEvent(ctx, 'player.connected', undefined, `Player reconnected ${existing.name}`, identityHex(ctx.sender));
    return;
  }

  const accountId = defaultAccountId(ctx.sender);
  const accountRow = ensureAccount(ctx, accountId, shortIdentity(ctx.sender));
  ctx.db.player.insert({
    identity: ctx.sender,
    accountId: accountRow.id,
    name: accountRow.name,
    online: true,
    rating: accountRow.rating,
    wins: accountRow.wins,
    losses: accountRow.losses,
    balance: accountRow.balance,
    balanceKind: accountBalanceKind(accountRow),
    seasonPoints: accountSeasonPoints(accountRow),
  });
  logEvent(ctx, 'player.connected', undefined, `Player connected ${shortIdentity(ctx.sender)}`, identityHex(ctx.sender));
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  if (isPaymentService(ctx)) {
    logEvent(ctx, 'payment_service.disconnected', undefined, 'Payment service disconnected', identityHex(ctx.sender));
    return;
  }

  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({ ...existing, online: false });
    logEvent(ctx, 'player.disconnected', undefined, `Player disconnected ${existing.name}`, identityHex(ctx.sender));
  }
  const queueRow = ctx.db.queueEntry.identity.find(ctx.sender);
  if (queueRow) {
    ctx.db.queueEntry.identity.delete(ctx.sender);
    logEvent(ctx, 'queue.disconnected', undefined, `${queueRow.name} removed from queue after disconnect`, `room=${queueRow.room}`);
  }
});

export const set_profile = spacetimedb.reducer(
  { name: t.string(), accountId: t.string().optional() },
  (ctx, { name, accountId }) => {
    const validated = validateName(name);
    const existing = requirePlayer(ctx);
    const accountRow = linkPlayerAccount(ctx, existing, accountId, validated);
    syncAccountToPlayers(ctx, accountRow);
  }
);

export const join_queue = spacetimedb.reducer(
  {
    name: t.string(),
    stake: t.u32(),
    mode: t.string(),
    room: t.string(),
    boostEnabled: t.bool(),
    accountId: t.string().optional(),
    botFallbackSeconds: t.u32().optional(),
  },
  (ctx, { name, stake, mode, room, boostEnabled, accountId }) => {
    const validatedName = validateName(name);
    const validatedMode = validateMode(mode);
    const validatedRoom = validateRoom(room);
    if (stake <= 0) {
      throw new SenderError('Stake must be positive');
    }

    const now = nowMicros(ctx);
    cleanupQueue(ctx, now);
    enforceJoinQueueRateLimit(ctx, now);

    const playerRow = requirePlayer(ctx);
    const accountRow = linkPlayerAccount(ctx, playerRow, accountId, validatedName);
    assertCanStakeAccount(accountRow, totalStake(stake, boostEnabled));
    ctx.db.queueEntry.identity.delete(ctx.sender);

    const existingMatch = findLatestActiveMatchForAccount(ctx, accountRow.id);
    if (existingMatch) {
      logEvent(
        ctx,
        'queue.active_match',
        existingMatch,
        `${validatedName} already has an active match for account ${accountRow.id}`,
        `room=${existingMatch.room} status=${existingMatch.status} phase=${existingMatch.phase} account=${accountRow.id}`
      );
      return;
    }

    const currentEntry = {
      identity: ctx.sender,
      accountId: accountRow.id,
      name: validatedName,
      rating: accountRow.rating,
      stake,
      mode: validatedMode,
      room: validatedRoom,
      boostEnabled,
      joinedAtMicros: now,
      botFallbackAtMicros: undefined,
      balanceKind: accountBalanceKind(accountRow),
    };

    const opponent = findOpponentForEntry(ctx, currentEntry, now);
    if (!opponent) {
      ctx.db.queueEntry.insert(currentEntry);
      logEvent(
        ctx,
        'queue.joined',
        undefined,
        `${validatedName} joined ${validatedMode} queue`,
        `room=${validatedRoom} stake=${stake} matchmaking=players_only`
      );
      return;
    }

    ctx.db.queueEntry.identity.delete(opponent.identity);
    createPlayerMatch(ctx, opponent, currentEntry, now);
  }
);

export const leave_queue = spacetimedb.reducer(ctx => {
  const existing = ctx.db.queueEntry.identity.find(ctx.sender);
  ctx.db.queueEntry.identity.delete(ctx.sender);
  if (existing) {
    logEvent(ctx, 'queue.left', undefined, `${existing.name} left queue`, `room=${existing.room}`);
  }
});

export const commit_move = spacetimedb.reducer(
  { matchId: t.u64(), hash: t.string() },
  (ctx, { matchId, hash }) => {
    const validatedHash = validateCommitHash(hash);
    const match = requireActiveMatch(ctx, matchId);
    if (match.phase !== 'select' && match.phase !== 'commit' && match.phase !== 'reveal') {
      throw new SenderError(`Cannot commit move while match is in ${match.phase} phase`);
    }

    const side = playerSide(ctx, match);
    const now = nowMicros(ctx);

    if (side === 'p1') {
      if (match.p1CommitHash) throw new SenderError('Player already committed this round');
      const updated = {
        ...match,
        phase: match.p2CommitHash ? 'reveal' : 'commit',
        p1CommitHash: validatedHash,
        updatedAtMicros: now,
      };
      ctx.db.matchState.id.update(updated);
      logEvent(ctx, 'round.commit', updated, 'p1 commit accepted', `hash=${validatedHash}`);
    } else {
      if (match.p2CommitHash) throw new SenderError('Player already committed this round');
      const updated = {
        ...match,
        phase: match.p1CommitHash ? 'reveal' : 'commit',
        p2CommitHash: validatedHash,
        updatedAtMicros: now,
      };
      ctx.db.matchState.id.update(updated);
      logEvent(ctx, 'round.commit', updated, 'p2 commit accepted', `hash=${validatedHash}`);
    }
  }
);

export const submit_move = spacetimedb.reducer(
  { matchId: t.u64(), move: t.u32() },
  (_ctx, { matchId: _matchId, move: _move }) => {
    throw new SenderError('submit_move is disabled; use commit_move and reveal_move');
  }
);

export const reveal_move = spacetimedb.reducer(
  { matchId: t.u64(), move: t.u32(), salt: t.string() },
  (ctx, { matchId, move, salt }) => {
    validateMove(move);
    const validatedSalt = validateRevealSalt(salt);

    const match = requireActiveMatch(ctx, matchId);
    const side = playerSide(ctx, match);
    const now = nowMicros(ctx);
    const expectedHash = commitHash(move, validatedSalt);

    if (side === 'p1') {
      if (!match.p1CommitHash) throw new SenderError('Commit before revealing');
      if (!match.p2CommitHash) throw new SenderError('Both players must commit before revealing');
      assertRevealDelayElapsed(match, now);
      if (match.p1CommitHash !== expectedHash) throw new SenderError('Invalid reveal');
      if (match.p1RevealMove !== undefined) throw new SenderError('Player already revealed this round');
      const updated = {
        ...match,
        phase: match.p2RevealMove !== undefined ? 'result' : 'reveal',
        p1RevealMove: move,
        p1RevealSalt: validatedSalt,
        updatedAtMicros: now,
      };
      if (updated.p2RevealMove !== undefined && updated.p2RevealSalt !== undefined) {
        logEvent(ctx, 'round.reveal', updated, 'p1 reveal accepted; resolving round', `move=${move}`);
        resolveRound(ctx, updated);
      } else {
        ctx.db.matchState.id.update(updated);
        logEvent(ctx, 'round.reveal', updated, 'p1 reveal accepted', `move=${move}`);
      }
    } else {
      if (!match.p2CommitHash) throw new SenderError('Commit before revealing');
      if (!match.p1CommitHash) throw new SenderError('Both players must commit before revealing');
      assertRevealDelayElapsed(match, now);
      if (match.p2CommitHash !== expectedHash) throw new SenderError('Invalid reveal');
      if (match.p2RevealMove !== undefined) throw new SenderError('Player already revealed this round');
      const updated = {
        ...match,
        phase: match.p1RevealMove !== undefined ? 'result' : 'reveal',
        p2RevealMove: move,
        p2RevealSalt: validatedSalt,
        updatedAtMicros: now,
      };
      if (updated.p1RevealMove !== undefined && updated.p1RevealSalt !== undefined) {
        logEvent(ctx, 'round.reveal', updated, 'p2 reveal accepted; resolving round', `move=${move}`);
        resolveRound(ctx, updated);
      } else {
        ctx.db.matchState.id.update(updated);
        logEvent(ctx, 'round.reveal', updated, 'p2 reveal accepted', `move=${move}`);
      }
    }
  }
);

export const next_round = spacetimedb.reducer(
  { matchId: t.u64() },
  (ctx, { matchId }) => {
    const match = requireActiveMatch(ctx, matchId);
    playerSide(ctx, match);
    if (match.phase !== 'result') return;
    const now = nowMicros(ctx);
    const jitterMicros = nextRoundJitterMicros(match);
    const readyAt = now + BigInt(jitterMicros);
    if (jitterMicros <= 0) {
      startNextRound(ctx, match, now);
      return;
    }

    const updated = {
      ...match,
      phase: 'next',
      nextRoundReadyAtMicros: readyAt,
      updatedAtMicros: now,
    };
    ctx.db.matchState.id.update(updated);
    scheduleTickAt(ctx, readyAt);
    logEvent(ctx, 'round.next_scheduled', updated, `Round ${updated.currentRound} starts after jitter`, `jitterMicros=${jitterMicros}`);
  }
);

export const forfeit_match = spacetimedb.reducer(
  { matchId: t.u64() },
  (ctx, { matchId }) => {
    const match = requireActiveMatch(ctx, matchId);
    const side = playerSide(ctx, match);
    const penaltyMultiplier = recordForfeit(ctx, match, nowMicros(ctx));
    const winner = side === 'p1' ? match.p2 : match.p1;
    const p1Score = side === 'p1' ? match.p1Score : Math.max(match.p1Score, ROUNDS_TO_WIN);
    const p2Score = side === 'p2' ? match.p2Score : Math.max(match.p2Score, ROUNDS_TO_WIN);

    finishMatch(ctx, { ...match, p1Score, p2Score }, winner, { loserRatingPenaltyMultiplier: penaltyMultiplier });
  }
);

export const record_stars_payment = spacetimedb.reducer(
  {
    paymentId: t.string(),
    accountId: t.string(),
    telegramUserId: t.string(),
    starsAmount: t.u32(),
    elmAmount: t.u32(),
    telegramPaymentChargeId: t.string(),
    invoicePayload: t.string(),
  },
  (ctx, {
    paymentId,
    accountId,
    telegramUserId,
    starsAmount,
    elmAmount,
    telegramPaymentChargeId,
    invoicePayload,
  }) => {
    requirePaymentService(ctx);
    const validatedPaymentId = validatePaymentId(paymentId);
    const validatedTelegramUserId = validateTelegramUserId(telegramUserId);
    const validatedAccountId = validateTelegramAccountId(accountId, validatedTelegramUserId);
    const validatedChargeId = validateTelegramChargeId(telegramPaymentChargeId);
    const validatedInvoicePayload = validateInvoicePayload(invoicePayload);
    validateStarsPackage(starsAmount, elmAmount);

    const existingByPaymentId = ctx.db.paymentLedger.paymentId.find(validatedPaymentId);
    const existingByChargeId = findPaymentLedgerByChargeId(ctx, validatedChargeId);
    const existing = existingByPaymentId ?? existingByChargeId;
    if (existingByPaymentId && existingByChargeId && existingByPaymentId.paymentId !== existingByChargeId.paymentId) {
      throw new SenderError('Telegram charge ID is already linked to another payment');
    }
    if (existing) {
      assertSamePaymentLedger(existing, {
        paymentId: validatedPaymentId,
        accountId: validatedAccountId,
        telegramUserId: validatedTelegramUserId,
        starsAmount,
        elmAmount,
        telegramPaymentChargeId: validatedChargeId,
      });
      if (existing.status === PAYMENT_STATUS_CREDITED && existing.creditedAtMicros !== undefined) {
        logEvent(
          ctx,
          'payment.duplicate_ignored',
          undefined,
          `Duplicate Stars payment ignored for ${validatedAccountId}`,
          `paymentId=${validatedPaymentId} charge=${validatedChargeId}`
        );
        return;
      }
    }

    const now = nowMicros(ctx);
    const accountRow = ensureAccount(ctx, validatedAccountId, validatedAccountId);
    updateAccount(ctx, {
      ...accountRow,
      balance: accountBalance(accountRow) + elmAmount,
    }, {
      delta: elmAmount,
      reasonKind: 'stars_purchase_credit',
      paymentId: validatedPaymentId,
      actor: PAYMENT_JWT_SUBJECT,
      idempotencyKey: `payment:${validatedPaymentId}:credit`,
    });

    const ledgerRow = {
      paymentId: validatedPaymentId,
      accountId: validatedAccountId,
      telegramUserId: validatedTelegramUserId,
      starsAmount,
      elmAmount,
      refundableElmAmount: existing?.refundableElmAmount ?? elmAmount,
      refundedStarsAmount: existing?.refundedStarsAmount ?? 0,
      refundedElmAmount: existing?.refundedElmAmount ?? 0,
      telegramPaymentChargeId: validatedChargeId,
      invoicePayload: validatedInvoicePayload,
      balanceKind: PAID_ELM_BALANCE_KIND,
      status: PAYMENT_STATUS_CREDITED,
      createdAtMicros: existing?.createdAtMicros ?? now,
      paidAtMicros: existing?.paidAtMicros ?? now,
      creditedAtMicros: now,
      refundRequestedAtMicros: existing?.refundRequestedAtMicros,
      refundedAtMicros: existing?.refundedAtMicros,
      updatedAtMicros: now,
    };
    if (existing) {
      ctx.db.paymentLedger.paymentId.update({ ...existing, ...ledgerRow });
    } else {
      ctx.db.paymentLedger.insert(ledgerRow);
    }
    logEvent(
      ctx,
      'payment.credited',
      undefined,
      `Credited ${elmAmount} paid ELM for ${validatedAccountId}`,
      `paymentId=${validatedPaymentId} stars=${starsAmount} charge=${validatedChargeId}`
    );
  }
);

export const reserve_stars_refund = spacetimedb.reducer(
  {
    paymentId: t.string(),
    accountId: t.string(),
    telegramUserId: t.string(),
  },
  (ctx, { paymentId, accountId, telegramUserId }) => {
    requirePaymentService(ctx);
    const ledger = requireRefundableLedger(ctx, paymentId, accountId, telegramUserId);
    if (ledger.status === PAYMENT_STATUS_REFUND_PENDING) return;

    const accountRow = ensureAccount(ctx, ledger.accountId, ledger.accountId);
    if (accountBalance(accountRow) < ledger.elmAmount) {
      throw new SenderError(`Insufficient refundable ELM balance: need ${ledger.elmAmount}, have ${accountBalance(accountRow)}`);
    }

    const now = nowMicros(ctx);
    updateAccount(ctx, {
      ...accountRow,
      balance: accountBalance(accountRow) - ledger.elmAmount,
    }, {
      delta: -ledger.elmAmount,
      reasonKind: 'stars_refund_reserve',
      paymentId: ledger.paymentId,
      actor: PAYMENT_JWT_SUBJECT,
      idempotencyKey: `payment:${ledger.paymentId}:refund_reserve`,
    });
    ctx.db.paymentLedger.paymentId.update({
      ...ledger,
      status: PAYMENT_STATUS_REFUND_PENDING,
      refundRequestedAtMicros: ledger.refundRequestedAtMicros ?? now,
      updatedAtMicros: now,
    });
    logEvent(
      ctx,
      'payment.refund_reserved',
      undefined,
      `Reserved ${ledger.elmAmount} ELM for Stars refund ${ledger.accountId}`,
      `paymentId=${ledger.paymentId} stars=${ledger.starsAmount}`
    );
  }
);

export const record_stars_refund = spacetimedb.reducer(
  {
    paymentId: t.string(),
    accountId: t.string(),
    telegramUserId: t.string(),
    telegramPaymentChargeId: t.string(),
  },
  (ctx, { paymentId, accountId, telegramUserId, telegramPaymentChargeId }) => {
    requirePaymentService(ctx);
    const ledger = requirePaymentLedger(ctx, paymentId, accountId, telegramUserId);
    const validatedChargeId = validateTelegramChargeId(telegramPaymentChargeId);
    if (ledger.telegramPaymentChargeId !== validatedChargeId) {
      throw new SenderError('Refund charge ID does not match payment ledger');
    }
    if (ledger.status === PAYMENT_STATUS_REFUNDED && ledger.refundedAtMicros !== undefined) return;
    if (ledger.status !== PAYMENT_STATUS_REFUND_PENDING) {
      throw new SenderError('Stars refund must be reserved before recording success');
    }

    const now = nowMicros(ctx);
    ctx.db.paymentLedger.paymentId.update({
      ...ledger,
      refundableElmAmount: 0,
      refundedStarsAmount: ledger.starsAmount,
      refundedElmAmount: ledger.elmAmount,
      status: PAYMENT_STATUS_REFUNDED,
      refundedAtMicros: now,
      updatedAtMicros: now,
    });
    logEvent(
      ctx,
      'payment.refunded',
      undefined,
      `Recorded Stars refund for ${ledger.accountId}`,
      `paymentId=${ledger.paymentId} stars=${ledger.starsAmount} charge=${validatedChargeId}`
    );
  }
);

export const cancel_stars_refund = spacetimedb.reducer(
  {
    paymentId: t.string(),
    accountId: t.string(),
    telegramUserId: t.string(),
  },
  (ctx, { paymentId, accountId, telegramUserId }) => {
    requirePaymentService(ctx);
    const ledger = requirePaymentLedger(ctx, paymentId, accountId, telegramUserId);
    if (ledger.status !== PAYMENT_STATUS_REFUND_PENDING) return;

    const accountRow = ensureAccount(ctx, ledger.accountId, ledger.accountId);
    const now = nowMicros(ctx);
    updateAccount(ctx, {
      ...accountRow,
      balance: accountBalance(accountRow) + ledger.elmAmount,
    }, {
      delta: ledger.elmAmount,
      reasonKind: 'stars_refund_cancel',
      paymentId: ledger.paymentId,
      actor: PAYMENT_JWT_SUBJECT,
      idempotencyKey: `payment:${ledger.paymentId}:refund_cancel`,
    });
    ctx.db.paymentLedger.paymentId.update({
      ...ledger,
      status: PAYMENT_STATUS_CREDITED,
      updatedAtMicros: now,
    });
    logEvent(
      ctx,
      'payment.refund_cancelled',
      undefined,
      `Released reserved refund ELM for ${ledger.accountId}`,
      `paymentId=${ledger.paymentId} stars=${ledger.starsAmount}`
    );
  }
);

export const run_game_tick = spacetimedb.reducer({ arg: gameTick.rowType }, (ctx, { arg: _arg }) => {
  const now = nowMicros(ctx);
  cleanupQueue(ctx, now);
  for (const match of ctx.db.matchState.iter()) {
    if (match.status !== 'active') continue;
    if (match.phase === 'next') {
      const readyAt = match.nextRoundReadyAtMicros ?? match.updatedAtMicros;
      if (now >= readyAt) {
        startNextRound(ctx, match, now);
      } else {
        scheduleTickAt(ctx, readyAt);
      }
      continue;
    }
    if (match.phase === 'result') {
      if (now - match.updatedAtMicros >= RESULT_TIMEOUT_MICROS) {
        expireResultPhase(ctx, match);
      }
      continue;
    }
    if (match.phase !== 'select' && match.phase !== 'commit' && match.phase !== 'reveal') continue;
    if (now - roundStartedAtMicros(match) >= ROUND_TIMEOUT_MICROS) {
      logTimedOutRound(ctx, match);
    }
  }
  scheduleNextTick(ctx);
});

function cleanupQueue(ctx: ReducerContext, now: bigint) {
  for (const entry of ctx.db.queueEntry.iter()) {
    const liveEntry = ctx.db.queueEntry.identity.find(entry.identity);
    if (!liveEntry) continue;

    const activeMatch = findLatestActiveMatchForAccount(ctx, entryAccountId(entry));
    if (activeMatch) {
      ctx.db.queueEntry.identity.delete(entry.identity);
      logEvent(
        ctx,
        'queue.removed_active_match',
        activeMatch,
        `${entry.name} removed from queue because an active match exists for the account`,
        `room=${entry.room} identity=${identityHex(entry.identity)} account=${entryAccountId(entry)}`
      );
      continue;
    }

    const opponent = findOpponentForEntry(ctx, entry, now);
    if (opponent) {
      const first = entry.joinedAtMicros <= opponent.joinedAtMicros ? entry : opponent;
      const second = identityEquals(first.identity, entry.identity) ? opponent : entry;
      ctx.db.queueEntry.identity.delete(first.identity);
      ctx.db.queueEntry.identity.delete(second.identity);
      createPlayerMatch(ctx, first, second, now);
      continue;
    }

    if (now - entry.joinedAtMicros >= QUEUE_TIMEOUT_MICROS) {
      ctx.db.queueEntry.identity.delete(entry.identity);
      logEvent(
        ctx,
        'queue.expired',
        undefined,
        `${entry.name} removed from queue after timeout`,
        `room=${entry.room} waitedMicros=${now - entry.joinedAtMicros}`
      );
    }
  }
}

function logTimedOutRound(ctx: ReducerContext, match: MatchRow) {
  const missingSides: string[] = [];
  if (!match.p1CommitHash) missingSides.push('p1_commit');
  if (!match.p2CommitHash) missingSides.push('p2_commit');
  if (match.p1CommitHash && match.p1RevealMove === undefined) missingSides.push('p1_reveal');
  if (match.p2CommitHash && match.p2RevealMove === undefined) missingSides.push('p2_reveal');

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

  if (match.p1CommitHash && !match.p2CommitHash) {
    logEvent(
      ctx,
      'round.timeout_forfeit',
      match,
      `p2 timed out before commit in match ${match.id}; p1 wins by timeout`,
      `missing=${missingSides.join(',')}`
    );
    finishMatch(ctx, { ...match, p1Score: Math.max(match.p1Score, ROUNDS_TO_WIN) }, match.p1);
    return;
  }

  if (match.p2CommitHash && !match.p1CommitHash) {
    logEvent(
      ctx,
      'round.timeout_forfeit',
      match,
      `p1 timed out before commit in match ${match.id}; p2 wins by timeout`,
      `missing=${missingSides.join(',')}`
    );
    finishMatch(ctx, { ...match, p2Score: Math.max(match.p2Score, ROUNDS_TO_WIN) }, match.p2);
    return;
  }

  if (match.p1RevealMove === undefined && match.p2RevealMove === undefined) {
    finishByCurrentScoreOrDraw(ctx, match, 'Both players timed out before submitting a move');
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
    nextRoundReadyAtMicros: undefined,
    updatedAtMicros: nowMicros(ctx),
  };

  if (p1Score >= ROUNDS_TO_WIN) {
    finishMatch(ctx, resolved, match.p1);
  } else if (p2Score >= ROUNDS_TO_WIN) {
    finishMatch(ctx, resolved, match.p2);
  } else if (match.currentRound >= MAX_ROUNDS) {
    finishByCurrentScoreOrDraw(ctx, resolved, `Maximum rounds reached (${MAX_ROUNDS})`);
  } else {
    ctx.db.matchState.id.update(resolved);
  }
}

function startNextRound(ctx: ReducerContext, match: MatchRow, now: bigint) {
  const updated = {
    ...match,
    phase: 'select',
    p1CommitHash: undefined,
    p2CommitHash: undefined,
    p1RevealMove: undefined,
    p2RevealMove: undefined,
    p1RevealSalt: undefined,
    p2RevealSalt: undefined,
    roundStartedAtMicros: now,
    nextRoundReadyAtMicros: undefined,
    updatedAtMicros: now,
  };
  ctx.db.matchState.id.update(updated);
  logEvent(ctx, 'round.next', updated, `Round ${updated.currentRound} started`);
  return updated;
}

function nextRoundJitterMicros(match: MatchRow) {
  return hash32(`${match.id}:${match.currentRound}:${match.updatedAtMicros}:next_round`) % (NEXT_ROUND_JITTER_MAX_MICROS + 1);
}

function expireMatchAsDraw(ctx: ReducerContext, match: MatchRow, reason: string) {
  if (match.status === 'settled') return;
  const replayHash = hashHex(`${match.id}:draw:${match.currentRound}:${nowMicros(ctx)}`);
  const p1SeasonPointsAwarded = SEASON_POINTS_DRAW;
  const p2SeasonPointsAwarded = SEASON_POINTS_DRAW;
  logEvent(ctx, 'match.expired_draw', match, reason, `score=${match.p1Score}:${match.p2Score}`);
  awardDrawSeasonPoints(ctx, match, p1SeasonPointsAwarded, p2SeasonPointsAwarded);
  ctx.db.matchState.id.update({
    ...match,
    phase: 'complete',
    status: 'settled',
    winner: undefined,
    replayHash,
    p1SeasonPointsAwarded,
    p2SeasonPointsAwarded,
    updatedAtMicros: nowMicros(ctx),
  });
  logEvent(
    ctx,
    'match.entry_fee_spent_draw',
    match,
    `Draw settled without ELM payout for match ${match.id}`,
    `entryFee=${match.stake} p1SeasonPoints=${p1SeasonPointsAwarded} p2SeasonPoints=${p2SeasonPointsAwarded}`
  );
}

function expireResultPhase(ctx: ReducerContext, match: MatchRow) {
  finishByCurrentScoreOrDraw(ctx, match, 'Result phase timed out');
}

function finishByCurrentScoreOrDraw(ctx: ReducerContext, match: MatchRow, reason: string) {
  if (match.p1Score > match.p2Score) {
    logEvent(ctx, 'match.expired_score', match, `${reason}; p1 wins by current score`, `score=${match.p1Score}:${match.p2Score}`);
    finishMatch(ctx, match, match.p1);
    return;
  }
  if (match.p2Score > match.p1Score) {
    logEvent(ctx, 'match.expired_score', match, `${reason}; p2 wins by current score`, `score=${match.p1Score}:${match.p2Score}`);
    finishMatch(ctx, match, match.p2);
    return;
  }
  expireMatchAsDraw(ctx, match, `${reason}; tied score`);
}

function finishMatch(
  ctx: ReducerContext,
  match: MatchRow,
  winner: MatchRow['p1'],
  options: { loserRatingPenaltyMultiplier?: number } = {}
) {
  if (match.status === 'settled') return;
  const replayHash = hashHex(`${match.id}:${match.p1Score}:${match.p2Score}:${match.currentRound}`);
  const winnerSide = identityEquals(winner, match.p1) ? 'p1' : 'p2';
  const winnerSeasonPoints = seasonPointsForWinner(match, winnerSide);
  const loserSeasonPoints = SEASON_POINTS_LOSS;
  const p1SeasonPointsAwarded = winnerSide === 'p1' ? winnerSeasonPoints : loserSeasonPoints;
  const p2SeasonPointsAwarded = winnerSide === 'p2' ? winnerSeasonPoints : loserSeasonPoints;
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
    p1SeasonPointsAwarded,
    p2SeasonPointsAwarded,
    updatedAtMicros: nowMicros(ctx),
  });

  const loser = identityEquals(winner, match.p1) ? match.p2 : match.p1;
  const winnerPlayer = ctx.db.player.identity.find(winner);
  const loserPlayer = ctx.db.player.identity.find(loser);
  if (winnerPlayer && loserPlayer) {
    const winnerAccount = accountForPlayer(ctx, winnerPlayer);
    const loserAccount = accountForPlayer(ctx, loserPlayer);
    const [newWinner, baseNewLoser] = calculateElo(winnerAccount.rating, loserAccount.rating);
    const loserPenaltyMultiplier = options.loserRatingPenaltyMultiplier ?? 1;
    const loserRatingLoss = Math.max(0, loserAccount.rating - baseNewLoser);
    const newLoser = loserAccount.rating - Math.round(loserRatingLoss * loserPenaltyMultiplier);
    updateAccount(ctx, {
      ...winnerAccount,
      rating: newWinner,
      wins: winnerAccount.wins + 1,
      seasonPoints: accountSeasonPoints(winnerAccount) + winnerSeasonPoints,
    });
    updateAccount(ctx, {
      ...loserAccount,
      rating: newLoser,
      losses: loserAccount.losses + 1,
      seasonPoints: accountSeasonPoints(loserAccount) + loserSeasonPoints,
    });
    logEvent(
      ctx,
      'match.season_points_awarded',
      match,
      `Season Points awarded for match ${match.id}`,
      `winner=${winnerSeasonPoints} loser=${loserSeasonPoints} economy=${ECONOMY_MODEL_ENTRY_FEE}`
    );
  }
}

function createPlayerMatch(ctx: ReducerContext, p1Entry: QueueEntryRow, p2Entry: QueueEntryRow, now: bigint) {
  const p1Player = ctx.db.player.identity.find(p1Entry.identity);
  const p2Player = ctx.db.player.identity.find(p2Entry.identity);
  if (!p1Player || !p2Player) throw new SenderError('Player not found');
  const balanceKind = assertSameEntryBalanceKind(p1Entry, p2Entry);
  const p1Account = accountForPlayer(ctx, p1Player);
  const p2Account = accountForPlayer(ctx, p2Player);
  assertCanStakeAccount(p1Account, totalStake(p1Entry.stake, p1Entry.boostEnabled));
  assertCanStakeAccount(p2Account, totalStake(p2Entry.stake, p2Entry.boostEnabled));
  const inserted = ctx.db.matchState.insert({
    id: 0n,
    p1: p1Entry.identity,
    p2: p2Entry.identity,
    p1Name: p1Entry.name,
    p2Name: p2Entry.name,
    p1Rating: p1Account.rating,
    p2Rating: p2Account.rating,
    stake: p1Entry.stake,
    balanceKind,
    economyModel: ECONOMY_MODEL_ENTRY_FEE,
    mode: p1Entry.mode,
    room: p1Entry.room,
    phase: 'select',
    status: 'active',
    currentRound: 1,
    p1Score: 0,
    p2Score: 0,
    p1Energy: p1Entry.boostEnabled ? STARTING_ENERGY + BOOST_EXTRA_ENERGY : STARTING_ENERGY,
    p2Energy: p2Entry.boostEnabled ? STARTING_ENERGY + BOOST_EXTRA_ENERGY : STARTING_ENERGY,
    p1BoostEnabled: p1Entry.boostEnabled,
    p2BoostEnabled: p2Entry.boostEnabled,
    p1SeasonPointsAwarded: 0,
    p2SeasonPointsAwarded: 0,
    p1CommitHash: undefined,
    p2CommitHash: undefined,
    p1RevealMove: undefined,
    p2RevealMove: undefined,
    p1RevealSalt: undefined,
    p2RevealSalt: undefined,
    winner: undefined,
    replayHash: undefined,
    roundStartedAtMicros: now,
    nextRoundReadyAtMicros: undefined,
    createdAtMicros: now,
    updatedAtMicros: now,
  });
  chargeMatchEntryFee(ctx, p1Account, inserted, 'p1', p1Entry.boostEnabled);
  chargeMatchEntryFee(ctx, p2Account, inserted, 'p2', p2Entry.boostEnabled);
  logEvent(
    ctx,
    'match.created',
    inserted,
    `Match ${inserted.id} created: ${p1Entry.name} vs ${p2Entry.name}`,
    `room=${p1Entry.room} mode=${p1Entry.mode} entryFee=${p1Entry.stake} balanceKind=${balanceKind} economy=${ECONOMY_MODEL_ENTRY_FEE}`
  );
  return inserted;
}

function findOpponent(
  ctx: ReducerContext,
  stake: number,
  mode: string,
  room: string,
  now: bigint,
  balanceKind = DEMO_TELM_BALANCE_KIND
) {
  let candidate: MatchRow | undefined = undefined;
  for (const entry of ctx.db.queueEntry.iter()) {
    if (identityEquals(entry.identity, ctx.sender)) continue;
    const activeMatch = findLatestActiveMatchForAccount(ctx, entryAccountId(entry));
    if (activeMatch) {
      ctx.db.queueEntry.identity.delete(entry.identity);
      logEvent(
        ctx,
        'queue.removed_active_match',
        activeMatch,
        `${entry.name} removed from queue because an active match exists for the account`,
        `room=${entry.room} identity=${identityHex(entry.identity)} account=${entryAccountId(entry)}`
      );
      continue;
    }
    if (now - entry.joinedAtMicros >= QUEUE_TIMEOUT_MICROS) {
      ctx.db.queueEntry.identity.delete(entry.identity);
      logEvent(
        ctx,
        'queue.expired',
        undefined,
        `${entry.name} removed from queue after timeout`,
        `room=${entry.room} waitedMicros=${now - entry.joinedAtMicros}`
      );
      continue;
    }
    if (entry.room !== room) continue;
    if (entry.stake !== stake || entry.mode !== mode) continue;
    if (entryBalanceKind(entry) !== balanceKind) continue;
    if (!candidate || entry.joinedAtMicros < candidate.joinedAtMicros) candidate = entry;
  }
  return candidate;
}

function findOpponentForEntry(ctx: ReducerContext, target: QueueEntryRow, now: bigint) {
  let candidate: QueueEntryRow | undefined = undefined;
  for (const entry of ctx.db.queueEntry.iter()) {
    if (identityEquals(entry.identity, target.identity)) continue;
    if (entryAccountId(entry) === entryAccountId(target)) continue;
    const activeMatch = findLatestActiveMatchForAccount(ctx, entryAccountId(entry));
    if (activeMatch) {
      ctx.db.queueEntry.identity.delete(entry.identity);
      logEvent(
        ctx,
        'queue.removed_active_match',
        activeMatch,
        `${entry.name} removed from queue because an active match exists for the account`,
        `room=${entry.room} identity=${identityHex(entry.identity)} account=${entryAccountId(entry)}`
      );
      continue;
    }
    if (now - entry.joinedAtMicros >= QUEUE_TIMEOUT_MICROS) {
      ctx.db.queueEntry.identity.delete(entry.identity);
      logEvent(
        ctx,
        'queue.expired',
        undefined,
        `${entry.name} removed from queue after timeout`,
        `room=${entry.room} waitedMicros=${now - entry.joinedAtMicros}`
      );
      continue;
    }
    if (entry.room !== target.room) continue;
    if (entry.stake !== target.stake || entry.mode !== target.mode) continue;
    if (entryBalanceKind(entry) !== entryBalanceKind(target)) continue;
    if (!candidate || entry.joinedAtMicros < candidate.joinedAtMicros) candidate = entry;
  }
  return candidate;
}

function entryAccountId(entry: QueueEntryRow) {
  return normalizeAccountId(entry.accountId, defaultAccountId(entry.identity));
}

function entryBalanceKind(entry: QueueEntryRow) {
  return normalizeBalanceKind(entry.balanceKind, balanceKindForAccountId(entryAccountId(entry)));
}

function findLatestActiveMatchForAccount(ctx: ReducerContext, accountId: string) {
  let latest: MatchRow | undefined = undefined;
  for (const match of ctx.db.matchState.iter()) {
    if (match.status !== 'active') continue;
    if (!isMatchAccount(ctx, match, accountId)) continue;
    if (!latest || match.id > latest.id) latest = match;
  }
  return latest;
}

function isMatchAccount(ctx: ReducerContext, match: MatchRow, accountId: string) {
  const normalized = normalizeAccountId(accountId, undefined);
  const p1Player = ctx.db.player.identity.find(match.p1);
  if (p1Player && playerAccountId(p1Player) === normalized) return true;
  const p2Player = ctx.db.player.identity.find(match.p2);
  if (p2Player && playerAccountId(p2Player) === normalized) return true;
  return false;
}

function requirePlayer(ctx: ReducerContext) {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (!existing) {
    throw new SenderError('Player is not connected');
  }
  return existing;
}

function linkPlayerAccount(ctx: ReducerContext, playerRow: MatchRow, requestedAccountId: string | undefined, name: string) {
  const previousAccountId = playerAccountId(playerRow);
  const accountId = normalizeAccountId(requestedAccountId, previousAccountId);
  const accountRow = ensureAccount(ctx, accountId, name, playerRow);
  const previousBalanceKind = balanceKindForAccountId(previousAccountId);
  const namedAccount = previousAccountId !== accountId && previousBalanceKind === accountBalanceKind(accountRow) && hasLegacyProgress(playerRow)
    ? mergeLegacyPlayerIntoAccount(ctx, accountRow, playerRow, name)
    : accountRow.name === name ? accountRow : updateAccount(ctx, { ...accountRow, name });
  ctx.db.player.identity.update(playerFromAccount(playerRow, namedAccount, name, true));
  return namedAccount;
}

function ensureAccount(ctx: ReducerContext, accountId: string, name: string, seed?: Partial<AccountRow>) {
  const normalizedId = normalizeAccountId(accountId, undefined);
  const balanceKind = balanceKindForAccountId(normalizedId);
  const existing = ctx.db.account.id.find(normalizedId);
  if (existing) {
    return accountBalanceKind(existing) === balanceKind
      ? existing
      : updateAccount(ctx, {
          ...existing,
          balance: migratedBalanceForBalanceKind(ctx, normalizedId, balanceKind),
          balanceKind,
        });
  }

  return ctx.db.account.insert({
    id: normalizedId,
    name,
    rating: seed?.rating ?? INITIAL_RATING,
    wins: seed?.wins ?? 0,
    losses: seed?.losses ?? 0,
    balance: seed?.balance ?? initialBalanceForBalanceKind(balanceKind),
    balanceKind,
    seasonPoints: seed?.seasonPoints ?? 0,
  });
}

function updateAccount(ctx: ReducerContext, accountRow: AccountRow, mutation?: BalanceMutation) {
  const normalizedId = normalizeAccountId(accountRow.id, undefined);
  if (mutation && ctx.db.balanceEvent.idempotencyKey.find(mutation.idempotencyKey)) {
    const existing = ctx.db.account.id.find(normalizedId);
    if (existing) return existing;
  }

  const normalized = {
    ...accountRow,
    id: normalizedId,
    balanceKind: balanceKindForAccountId(normalizedId),
    seasonPoints: accountSeasonPoints(accountRow),
  };
  if (mutation) {
    const existing = ctx.db.account.id.find(normalizedId);
    const previousBalance = existing ? accountBalance(existing) : accountBalance(normalized) - mutation.delta;
    if (previousBalance + mutation.delta !== accountBalance(normalized)) {
      throw new SenderError('Balance event delta does not match account balance update');
    }
  }
  ctx.db.account.id.update(normalized);
  if (mutation) {
    recordBalanceEvent(ctx, normalized, mutation);
  }
  syncAccountToPlayers(ctx, normalized);
  return normalized;
}

function mergeLegacyPlayerIntoAccount(ctx: ReducerContext, accountRow: AccountRow, playerRow: MatchRow, name: string) {
  return updateAccount(ctx, {
    ...accountRow,
    name,
    rating: Math.max(accountRow.rating, playerRow.rating ?? INITIAL_RATING),
    wins: accountRow.wins + (playerRow.wins ?? 0),
    losses: accountRow.losses + (playerRow.losses ?? 0),
    balance: Math.max(accountBalance(accountRow), playerRow.balance ?? INITIAL_BALANCE),
    balanceKind: accountBalanceKind(accountRow),
    seasonPoints: Math.max(accountSeasonPoints(accountRow), playerRow.seasonPoints ?? 0),
  });
}

function hasLegacyProgress(playerRow: MatchRow) {
  return (
    (playerRow.wins ?? 0) > 0 ||
    (playerRow.losses ?? 0) > 0 ||
    (playerRow.rating ?? INITIAL_RATING) !== INITIAL_RATING ||
    (playerRow.balance ?? INITIAL_BALANCE) !== INITIAL_BALANCE
  );
}

function syncAccountToPlayers(ctx: ReducerContext, accountRow: AccountRow) {
  for (const playerRow of ctx.db.player.iter()) {
    if (playerAccountId(playerRow) !== accountRow.id) continue;
    ctx.db.player.identity.update(playerFromAccount(playerRow, accountRow, accountRow.name, playerRow.online));
  }
}

function playerFromAccount(playerRow: MatchRow, accountRow: AccountRow, name = accountRow.name, online = playerRow.online) {
  return {
    ...playerRow,
    accountId: accountRow.id,
    name,
    online,
    rating: accountRow.rating,
    wins: accountRow.wins,
    losses: accountRow.losses,
    balance: accountBalance(accountRow),
    balanceKind: accountBalanceKind(accountRow),
    seasonPoints: accountSeasonPoints(accountRow),
  };
}

function accountForPlayer(ctx: ReducerContext, playerRow: MatchRow) {
  return ensureAccount(ctx, playerAccountId(playerRow), playerRow.name, playerRow);
}

function playerAccountId(playerRow: MatchRow) {
  return normalizeAccountId(playerRow.accountId, defaultAccountId(playerRow.identity));
}

function defaultAccountId(identity: { toHexString(): string }) {
  return `identity:${identityHex(identity)}`;
}

function normalizeAccountId(accountId: string | undefined, fallback: string | undefined) {
  const raw = accountId?.trim() || fallback?.trim() || '';
  const normalized = raw.toLowerCase().replace(/[^a-z0-9:_-]+/g, '_').slice(0, 128);
  return normalized || 'anonymous';
}

function assertCanStakeAccount(accountRow: AccountRow, amount: number) {
  if (accountBalance(accountRow) < amount) {
    throw new SenderError(`Insufficient ${currencyLabelForBalanceKind(accountBalanceKind(accountRow))} balance: need ${amount}, have ${accountBalance(accountRow)}`);
  }
}

function applyBalanceDelta(ctx: ReducerContext, accountRow: AccountRow, delta: number, mutation: Omit<BalanceMutation, 'delta'>) {
  if (delta === 0) return accountRow;
  const nextBalance = accountBalance(accountRow) + delta;
  if (nextBalance < 0) {
    throw new SenderError(`Insufficient ${currencyLabelForBalanceKind(accountBalanceKind(accountRow))} balance: need ${Math.abs(delta)}, have ${accountBalance(accountRow)}`);
  }
  return updateAccount(ctx, {
    ...accountRow,
    balance: nextBalance,
  }, {
    ...mutation,
    delta,
  });
}

function recordBalanceEvent(ctx: ReducerContext, accountRow: AccountRow, mutation: BalanceMutation) {
  if (ctx.db.balanceEvent.idempotencyKey.find(mutation.idempotencyKey)) return;
  ctx.db.balanceEvent.insert({
    idempotencyKey: mutation.idempotencyKey,
    accountId: accountRow.id,
    balanceKind: accountBalanceKind(accountRow),
    delta: mutation.delta,
    balanceAfter: accountBalance(accountRow),
    reasonKind: mutation.reasonKind,
    paymentId: mutation.paymentId,
    matchId: mutation.matchId,
    actor: mutation.actor ?? 'system',
    createdAtMicros: nowMicros(ctx),
  });
}

function requirePaymentService(ctx: ReducerContext) {
  if (!isPaymentService(ctx)) {
    throw new SenderError('Payment service is not authorized');
  }
}

function isPaymentService(ctx: ReducerContext) {
  const jwt = ctx.senderAuth?.jwt;
  if (!ctx.senderAuth?.hasJWT || !jwt) {
    return false;
  }
  const audience = Array.isArray(jwt.audience) ? jwt.audience : [];
  return (
    jwt.issuer === PAYMENT_JWT_ISSUER &&
    jwt.subject === PAYMENT_JWT_SUBJECT &&
    audience.includes(PAYMENT_JWT_AUDIENCE)
  );
}

function findPaymentLedgerByChargeId(ctx: ReducerContext, chargeId: string) {
  for (const row of ctx.db.paymentLedger.iter()) {
    if (row.telegramPaymentChargeId === chargeId) return row;
  }
  return undefined;
}

function requirePaymentLedger(ctx: ReducerContext, paymentId: string, accountId: string, telegramUserId: string) {
  const validatedPaymentId = validatePaymentId(paymentId);
  const validatedTelegramUserId = validateTelegramUserId(telegramUserId);
  const validatedAccountId = validateTelegramAccountId(accountId, validatedTelegramUserId);
  const ledger = ctx.db.paymentLedger.paymentId.find(validatedPaymentId);
  if (!ledger) throw new SenderError('Payment ledger row not found');
  if (ledger.accountId !== validatedAccountId || ledger.telegramUserId !== validatedTelegramUserId) {
    throw new SenderError('Payment ledger account mismatch');
  }
  return ledger;
}

function requireRefundableLedger(ctx: ReducerContext, paymentId: string, accountId: string, telegramUserId: string) {
  const ledger = requirePaymentLedger(ctx, paymentId, accountId, telegramUserId);
  if (ledger.status !== PAYMENT_STATUS_CREDITED && ledger.status !== PAYMENT_STATUS_REFUND_PENDING) {
    throw new SenderError('Payment is not refundable');
  }
  if (ledger.refundedStarsAmount !== 0 || ledger.refundedElmAmount !== 0 || ledger.refundedAtMicros !== undefined) {
    throw new SenderError('Payment is already refunded');
  }
  if (ledger.refundableElmAmount < ledger.elmAmount) {
    throw new SenderError('Payment ELM has already been used in gameplay');
  }
  return ledger;
}

function assertSamePaymentLedger(
  row: MatchRow,
  expected: {
    paymentId: string;
    accountId: string;
    telegramUserId: string;
    starsAmount: number;
    elmAmount: number;
    telegramPaymentChargeId: string;
  }
) {
  if (
    row.paymentId !== expected.paymentId ||
    row.accountId !== expected.accountId ||
    row.telegramUserId !== expected.telegramUserId ||
    row.starsAmount !== expected.starsAmount ||
    row.elmAmount !== expected.elmAmount ||
    (row.telegramPaymentChargeId !== '' && row.telegramPaymentChargeId !== expected.telegramPaymentChargeId)
  ) {
    throw new SenderError('Payment ledger conflict');
  }
}

function validatePaymentId(value: string) {
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(trimmed)) throw new SenderError('Invalid payment id');
  return trimmed;
}

function validateTelegramUserId(value: string) {
  const trimmed = value.trim();
  if (!/^[0-9]{1,20}$/.test(trimmed)) throw new SenderError('Invalid Telegram user id');
  return trimmed;
}

function validateTelegramAccountId(value: string, telegramUserId: string) {
  const normalized = normalizeAccountId(value, undefined);
  const expected = `telegram:${telegramUserId}`;
  if (normalized !== expected) throw new SenderError('Payment account must match Telegram user');
  return normalized;
}

function validateTelegramChargeId(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 4 || trimmed.length > 256 || !/^[\x20-\x7e]+$/.test(trimmed)) {
    throw new SenderError('Invalid Telegram payment charge id');
  }
  return trimmed;
}

function validateInvoicePayload(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 128 || !/^[\x20-\x7e]+$/.test(trimmed)) {
    throw new SenderError('Invalid invoice payload');
  }
  return trimmed;
}

function validateStarsPackage(starsAmount: number, elmAmount: number) {
  const supported = ELM_STARS_PACKAGES.some(pkg => (
    pkg.starsAmount === starsAmount &&
    pkg.elmAmount === elmAmount
  ));
  if (!supported) throw new SenderError('Unsupported Stars to ELM package');
}

function consumeRefundableElm(ctx: ReducerContext, accountRow: AccountRow, amount: number) {
  if (accountBalanceKind(accountRow) !== PAID_ELM_BALANCE_KIND || amount <= 0) return;
  let remaining = amount;
  const rows = [...ctx.db.paymentLedger.iter()]
    .filter(row => (
      row.accountId === accountRow.id &&
      row.status === PAYMENT_STATUS_CREDITED &&
      row.balanceKind === PAID_ELM_BALANCE_KIND &&
      row.refundableElmAmount > 0
    ))
    .sort((a, b) => {
      const aTime = a.paidAtMicros ?? a.createdAtMicros;
      const bTime = b.paidAtMicros ?? b.createdAtMicros;
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    });

  for (const row of rows) {
    if (remaining <= 0) break;
    const consumed = Math.min(row.refundableElmAmount, remaining);
    ctx.db.paymentLedger.paymentId.update({
      ...row,
      refundableElmAmount: row.refundableElmAmount - consumed,
      updatedAtMicros: nowMicros(ctx),
    });
    remaining -= consumed;
  }
}

function chargeMatchEntryFee(ctx: ReducerContext, accountRow: AccountRow, match: MatchRow, side: 'p1' | 'p2', boostEnabled: boolean) {
  let updatedAccount = accountRow;
  const entryFee = Math.trunc(match.stake);
  consumeRefundableElm(ctx, updatedAccount, entryFee);
  updatedAccount = applyBalanceDelta(ctx, updatedAccount, -entryFee, {
    reasonKind: 'match_entry_fee',
    idempotencyKey: `match:${match.id}:${accountRow.id}:entry_fee`,
    matchId: match.id,
    actor: side,
  });

  const boostCost = boostEnabled ? boostStake(match.stake) : 0;
  if (boostCost > 0) {
    consumeRefundableElm(ctx, updatedAccount, boostCost);
    updatedAccount = applyBalanceDelta(ctx, updatedAccount, -boostCost, {
      reasonKind: 'match_boost_cost',
      idempotencyKey: `match:${match.id}:${accountRow.id}:boost_cost`,
      matchId: match.id,
      actor: side,
    });
  }

  return updatedAccount;
}

function awardDrawSeasonPoints(ctx: ReducerContext, match: MatchRow, p1Award: number, p2Award: number) {
  const p1Player = ctx.db.player.identity.find(match.p1);
  const p2Player = ctx.db.player.identity.find(match.p2);
  if (p1Player) {
    const p1Account = accountForPlayer(ctx, p1Player);
    updateAccount(ctx, {
      ...p1Account,
      seasonPoints: accountSeasonPoints(p1Account) + p1Award,
    });
  }
  if (p2Player) {
    const p2Account = accountForPlayer(ctx, p2Player);
    updateAccount(ctx, {
      ...p2Account,
      seasonPoints: accountSeasonPoints(p2Account) + p2Award,
    });
  }
  logEvent(
    ctx,
    'match.season_points_awarded',
    match,
    `Season Points awarded for draw match ${match.id}`,
    `p1=${p1Award} p2=${p2Award} economy=${ECONOMY_MODEL_ENTRY_FEE}`
  );
}

function totalStake(stake: number, boostEnabled: boolean) {
  return stake + (boostEnabled ? boostStake(stake) : 0);
}

function boostStake(stake: number) {
  return Math.ceil((stake * BOOST_STAKE_PERCENT) / 100);
}

function seasonPointsForWinner(match: MatchRow, winnerSide: 'p1' | 'p2') {
  const winnerScore = winnerSide === 'p1' ? match.p1Score : match.p2Score;
  const loserScore = winnerSide === 'p1' ? match.p2Score : match.p1Score;
  return SEASON_POINTS_WIN + (winnerScore >= ROUNDS_TO_WIN && loserScore === 0 ? SEASON_POINTS_CLEAN_WIN_BONUS : 0);
}

function accountBalance(accountRow: AccountRow) {
  return accountRow.balance ?? INITIAL_BALANCE;
}

function accountSeasonPoints(accountRow: AccountRow) {
  return accountRow.seasonPoints ?? 0;
}

function accountBalanceKind(accountRow: AccountRow) {
  return normalizeBalanceKind(accountRow.balanceKind, balanceKindForAccountId(accountRow.id));
}

function balanceKindForAccountId(accountId: string) {
  const normalized = normalizeAccountId(accountId, undefined);
  if (normalized.startsWith('telegram:')) return PAID_ELM_BALANCE_KIND;
  return DEMO_TELM_BALANCE_KIND;
}

function normalizeBalanceKind(value: unknown, fallback = DEMO_TELM_BALANCE_KIND) {
  return value === PAID_ELM_BALANCE_KIND || value === DEMO_TELM_BALANCE_KIND ? value : fallback;
}

function initialBalanceForBalanceKind(balanceKind: string) {
  return normalizeBalanceKind(balanceKind) === PAID_ELM_BALANCE_KIND ? 0 : INITIAL_BALANCE;
}

function migratedBalanceForBalanceKind(ctx: ReducerContext, accountId: string, balanceKind: string) {
  if (normalizeBalanceKind(balanceKind) !== PAID_ELM_BALANCE_KIND) {
    return initialBalanceForBalanceKind(balanceKind);
  }

  let credited = 0;
  for (const row of ctx.db.paymentLedger.iter()) {
    if (row.accountId !== accountId || row.status !== PAYMENT_STATUS_CREDITED) continue;
    credited += Math.max(0, (row.elmAmount ?? 0) - (row.refundedElmAmount ?? 0));
  }
  return credited;
}

function assertSameEntryBalanceKind(p1Entry: QueueEntryRow, p2Entry: QueueEntryRow) {
  const p1Kind = entryBalanceKind(p1Entry);
  const p2Kind = entryBalanceKind(p2Entry);
  if (p1Kind !== p2Kind) {
    throw new SenderError('Cannot match paid ELM and demo tELM accounts');
  }
  return p1Kind;
}

function currencyLabelForBalanceKind(balanceKind: string) {
  return normalizeBalanceKind(balanceKind) === PAID_ELM_BALANCE_KIND ? 'ELM' : 'tELM';
}

function enforceJoinQueueRateLimit(ctx: ReducerContext, now: bigint) {
  const existing = ctx.db.automationGuard.identity.find(ctx.sender);
  if (!existing) {
    ctx.db.automationGuard.insert({
      identity: ctx.sender,
      joinWindowStartMicros: now,
      joinCount: 1,
      forfeitWindowStartMicros: 0n,
      forfeitCount: 0,
    });
    return;
  }

  if (now - existing.joinWindowStartMicros >= JOIN_RATE_LIMIT_WINDOW_MICROS) {
    ctx.db.automationGuard.identity.update({
      ...existing,
      joinWindowStartMicros: now,
      joinCount: 1,
    });
    return;
  }

  const joinCount = existing.joinCount + 1;
  if (joinCount > JOIN_RATE_LIMIT_MAX) {
    throw new SenderError('Queue rate limit exceeded; wait before joining again');
  }
  ctx.db.automationGuard.identity.update({ ...existing, joinCount });
}

function recordForfeit(ctx: ReducerContext, match: MatchRow, now: bigint) {
  const existing = ctx.db.automationGuard.identity.find(ctx.sender);
  const isRepeat = !!existing && now - existing.forfeitWindowStartMicros < FORFEIT_PENALTY_WINDOW_MICROS && existing.forfeitCount > 0;
  const nextForfeitCount = isRepeat ? existing.forfeitCount + 1 : 1;
  const updated = {
    identity: ctx.sender,
    joinWindowStartMicros: existing?.joinWindowStartMicros ?? 0n,
    joinCount: existing?.joinCount ?? 0,
    forfeitWindowStartMicros: isRepeat ? existing.forfeitWindowStartMicros : now,
    forfeitCount: nextForfeitCount,
  };

  if (existing) {
    ctx.db.automationGuard.identity.update(updated);
  } else {
    ctx.db.automationGuard.insert(updated);
  }

  const multiplier = isRepeat ? REPEAT_FORFEIT_RATING_MULTIPLIER : 1;
  logEvent(ctx, 'match.forfeit', match, `${playerSide(ctx, match)} forfeited`, `repeat=${isRepeat} ratingPenaltyMultiplier=${multiplier}`);
  return multiplier;
}

function requireActiveMatch(ctx: ReducerContext, matchId: bigint) {
  const match = ctx.db.matchState.id.find(matchId);
  if (!match) throw new SenderError('Match not found');
  if (match.status !== 'active') throw new SenderError('Match is not active');
  return match;
}

function playerSide(ctx: ReducerContext, match: MatchRow) {
  if (identityEquals(match.p1, ctx.sender)) return 'p1';
  if (identityEquals(match.p2, ctx.sender)) return 'p2';

  const senderPlayer = ctx.db.player.identity.find(ctx.sender);
  if (!senderPlayer) throw new SenderError('Player is not connected');
  const accountId = playerAccountId(senderPlayer);
  const p1Player = ctx.db.player.identity.find(match.p1);
  if (p1Player && playerAccountId(p1Player) === accountId) return 'p1';
  const p2Player = ctx.db.player.identity.find(match.p2);
  if (p2Player && playerAccountId(p2Player) === accountId) return 'p2';

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

function validateCommitHash(hash: string) {
  const normalized = hash.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(normalized)) {
    throw new SenderError('Commit hash must be 32 lowercase hex characters');
  }
  return normalized;
}

function validateRevealSalt(salt: string) {
  const trimmed = salt.trim();
  if (trimmed.length < 8 || trimmed.length > 128 || !/^[\x20-\x7e]+$/.test(trimmed)) {
    throw new SenderError('Reveal salt must be 8-128 printable ASCII characters');
  }
  return trimmed;
}

function assertRevealDelayElapsed(match: MatchRow, now: bigint) {
  const readyAt = roundStartedAtMicros(match) + MIN_REVEAL_DELAY_MICROS;
  if (now < readyAt) {
    const remainingMs = Number((readyAt - now + 999n) / 1000n);
    throw new SenderError(`Reveal too early; wait ${remainingMs}ms`);
  }
}

function roundStartedAtMicros(match: MatchRow) {
  return match.roundStartedAtMicros && match.roundStartedAtMicros > 0n
    ? match.roundStartedAtMicros
    : match.createdAtMicros;
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
  const value = `${move}:${salt}`;
  return `${hashHex(`${value}:0`)}${hashHex(`${value}:1`)}${hashHex(`${value}:2`)}${hashHex(`${value}:3`)}`;
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
  scheduleTickAt(ctx, nowMicros(ctx) + GAME_TICK_MICROS);
}

function scheduleTickAt(ctx: ReducerContext, scheduledAtMicros: bigint) {
  ctx.db.gameTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(scheduledAtMicros),
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
