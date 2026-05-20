# Elmental V2: Project Overview

Elmental V2 is a PvP dApp game intended to work across a future multi-blockchain infrastructure. Telegram Mini App, web, Devvit by Reddit, and similar surfaces are entry points into the same game, not the product definition. The current production-like test path is a Telegram Mini App-based real multiplayer mechanics instance backed by SpacetimeDB, without blockchain settlement.

The active flow is:

```text
React Telegram Mini App
  -> gameService
  -> GameplayProvider
  -> SpacetimeDB reducers and tables
  -> table subscriptions back to the frontend
```

The frontend sends player actions to the backend and renders state from replicated SpacetimeDB tables. For real matches, the frontend must not decide round winners or locally mutate authoritative balances.

## Main Packages

### `packages/shared`

Shared game rules, constants, and types. This package is the common rules layer used by tests and frontend logic.

- `src/game-logic.ts`: move matrix, round resolution, energy calculation, regen, overclock, ELO, and legacy/test-only stake-pool helpers.
- `src/constants.ts`: starting energy, move costs, thresholds, active economy mode, entry fee, boost percent, and rating constants.
- `src/types.ts`: shared enums and interfaces such as `MoveId`, `GameMode`, `RoundResult`, and `MatchState`.
- `src/__tests__/game-logic.test.ts`: tests for the game rules.

The move outcome matrix in this package must stay in sync with the SpacetimeDB backend and documentation.

### `apps/tma`

React + Vite Telegram Mini App frontend.

- `src/App.tsx`: app entrypoint, Telegram SDK initialization, profile loading, bug report capture, and screen routing.
- `src/stores/gameStore.ts`: Zustand store for current screen, player stats, match state, round phase, scores, energy, results, and local UI economy history.
- `src/services/gameService.ts`: central frontend coordinator. It owns UI store mutations, timers, haptics, audio, local presentation of economy events, and provider event handling.
- `src/services/gameProvider/types.ts`: provider contract between the UI layer and gameplay backend.
- `src/services/gameProvider/spacetimeProvider.ts`: real multiplayer provider. Connects to SpacetimeDB, calls reducers, listens to table updates, and emits contract events.
- `src/services/gameProvider/mockProvider.ts`: deterministic/local provider for mock demos and browser smoke tests.
- `src/module_bindings`: generated SpacetimeDB TypeScript bindings. These should be regenerated, not edited manually.
- `src/services/payments.ts`: frontend client for the Telegram Stars/payment service.
- `src/services/telegram.ts`: Telegram WebApp integration and fallback web user handling.
- `src/services/bugReport.ts`: captures sanitized game state and recent trace logs for GitHub issue drafts.

Main screens:

- `HomeScreen.tsx`: profile summary, balance, mode selection, boost toggle, Telegram Stars top-up/refund, start matchmaking.
- `MatchmakingScreen.tsx`: queue/waiting state.
- `MatchScreen.tsx`: active match UI, energy, opponent info, score, timer, move selection, forfeit.
- `ResultScreen.tsx`: settled match summary and play-again/home actions.
- `ProfileScreen.tsx`: user profile.
- `SettingsScreen.tsx`: local settings.
- `AdminScreen.tsx`: admin UI backed by the payments/admin service.

### `apps/spacetime/spacetimedb`

Authoritative multiplayer backend. This is the primary gameplay backend for the public mechanics test.

The main file is `src/index.ts`. It contains the SpacetimeDB schema, reducers, scheduled tick logic, and duplicated backend-side game rules.

Important tables:

- `account`: account-level stats, authoritative balance, balance kind, and server-authoritative Season Points.
- `player`: connected identity state and profile mirror, including current balance and Season Points.
- `queue_entry`: matchmaking queue rows. The schema still stores the public match entry fee in the legacy `stake` field name.
- `match_state`: authoritative active/settled match state, economy model, entry fee, and awarded Season Points.
- `round_result`: resolved round history.
- `game_event`: trace/debug events replicated to clients.
- `payment_ledger`: private Telegram Stars payment/refund ledger.
- `admin_audit_event`: private admin balance adjustment audit trail.
- `balance_event`: private append-only ledger for balance mutations, used by entry fees, refunds, admin/support visibility, and wallet history.
- `game_tick`: scheduled reducer trigger for cleanup and timeout handling.

Important reducers:

- `set_profile`: validates and links a player profile/account.
- `join_queue`: joins matchmaking for a room, mode, entry fee, and balance kind. The reducer parameter is still named `stake` for legacy wire compatibility, but production behavior treats it as an entry fee.
- `leave_queue`: removes the player from queue.
- `commit_move`: records a move commitment hash for the current round.
- `reveal_move`: validates and reveals a committed move; resolves the round when both players reveal.
- `submit_move`: disabled in the current backend; clients use commit/reveal.
- `next_round`: advances from result phase to the next select phase.
- `forfeit_match`: settles the match as a forfeit.
- `record_stars_payment`: credits paid ELM after Telegram Stars payment.
- `reserve_stars_refund`: reserves ELM before issuing a Stars refund.
- `record_stars_refund`: records successful refund completion.
- `cancel_stars_refund`: releases a reserved refund back to the account.
- `run_game_tick`: scheduled cleanup for queue expiration, match timeouts, result timeout, and delayed next-round transitions.

### `apps/payments`

HTTP service for Telegram Stars payments, wallet queries, refunds, and admin operations.

- `src/server.ts`: HTTP routes and request handling.
- `src/telegramUpdates.ts`: Telegram webhook/payment update handling.
- `src/spacetimeRecorder.ts`: records payments/refunds into SpacetimeDB reducers.
- `src/walletHistory.ts`: wallet history projection.
- `src/adminStore.ts`: admin user search, stats, balance adjustment, and audit operations.

Important endpoints:

- `GET /health`
- `GET /payments/stars/packages`
- `POST /payments/stars/invoice`
- `POST /payments/stars/refund/quote`
- `POST /payments/stars/refund`
- `POST /payments/wallet/history`
- `POST /payments/wallet/balance`
- `POST /telegram/webhook`
- `POST /admin/session`
- `POST /admin/stats`
- `POST /admin/users/search`
- `POST /admin/users/detail`
- `POST /admin/balance/adjust`
- `POST /admin/audit`

### `apps/server`

Legacy Express/Socket.io backend experiment.

It contains older auth, matchmaking, socket, database, bot, and blockchain-client code. It is not a supported fallback for the current public multiplayer flow. Do not route active gameplay through it without an explicit architecture decision.

### `contracts`

Solidity contracts for future blockchain settlement. They are not part of the current public mechanics test path.

### `scripts`

Project automation and verification scripts.

- `check-matrix-parity.mjs`: checks that move matrices remain aligned.
- `local-mock-smoke.mjs`: browser smoke test for mock mode.
- `spacetime-local-scenarios.mjs`: local SpacetimeDB scenario checks. The default mode skips real-time timeout waits; run `pnpm test:stdb-local-scenarios:full` when changing timeout handling.
- `public-match-smoke.mjs`: public two-player multiplayer smoke.
- `public-timeout-smoke.mjs`: public timeout/reconnect smoke.
- `configure-telegram-bot.mjs`: Telegram bot webapp configuration.

## Match Flow

1. `App.tsx` initializes Telegram or fallback web user data.
2. `initializeGameSession()` creates the gameplay provider.
3. By default, `gameService` uses the SpacetimeDB provider. With `VITE_GAME_TRANSPORT=mock`, it uses the mock provider.
4. The player starts matchmaking from `HomeScreen`.
5. `gameService.startMatchmaking()` calls `provider.startMatchmaking()`.
6. `spacetimeProvider` calls the SpacetimeDB `join_queue` reducer with the match entry fee. The reducer still receives this value through the legacy `stake` field.
7. The backend matches players inside the same room, records entry-fee balance events, and creates a `match_state` row.
8. The frontend receives table updates and emits `matchFound` / `matchUpdate` events through the provider contract.
9. `gameService` applies those events to `gameStore`, which moves the UI to `MatchScreen`.
10. The player chooses a move.
11. The SpacetimeDB provider commits the move, waits for both commits, then reveals it.
12. The backend resolves the round, writes a `round_result`, and updates `match_state`.
13. The frontend receives the result and shows the round result UI.
14. When a player reaches the winning score, forfeits, or a timeout/draw condition happens, SpacetimeDB settles the match and awards Season Points.
15. The frontend receives `matchSettled` and shows `ResultScreen`.

## Economy Model

The active production economy mode is `entry_fee_season_points`.

- Players pay an entry fee to join a paid match. In some tables, bindings, and provider event types this value is still named `stake` for legacy API compatibility.
- Paid PvP is not modeled as a winner-takes-pool stake/rake settlement path.
- SpacetimeDB is authoritative for account balance and Season Points.
- `balance_event` is the append-only source of balance mutation history used for match entry fees, Telegram Stars refunds, wallet history, and admin/support visibility.
- Winners, losers, and draws receive server-authoritative Season Points according to backend settlement rules.
- `calculateLegacyStakePoolPayout`, `calculateLegacyDrawRefund`, and their compatibility aliases are legacy/test-only helpers. They should not be presented as the default production economy.

## Gameplay Rules

Moves:

- Basic moves cost `10` energy: `Earth`, `Fire`, `Water`.
- Enhanced moves cost `25` energy: `Earth+`, `Fire+`, `Water+`.
- First player to `3` round wins takes the match.
- Classic regen: win `+5`, lose `+15`, draw `+10`.
- Hardcore regen: `0`.
- Chaos regen: deterministic server roll `0..20`.
- Overclock can randomize a move with `30%` chance when energy goes negative.

Outcome matrix:

```text
         Earth   Fire   Water   Earth+  Fire+   Water+
Earth     Draw   Lose   Win     Lose    Lose    Draw
Fire      Win    Draw   Lose    Draw    Lose    Lose
Water     Lose   Win    Draw    Lose    Draw    Lose
Earth+    Win    Draw   Win     Draw    Lose    Win
Fire+     Win    Win    Draw    Win     Draw    Lose
Water+    Draw   Win    Win     Lose    Win     Draw
```

## Important Boundaries

- SpacetimeDB is the source of truth for real multiplayer.
- `player.balance` / `account.balance` are server-authoritative.
- Frontend balance changes are only local presentation in mock mode or transaction history display.
- Screens should not import generated SpacetimeDB bindings directly.
- `spacetimeProvider.ts` is the only non-generated frontend file that should import `src/module_bindings`.
- Reducers mutate tables and do not return gameplay state to clients.
- Clients subscribe to tables and derive UI state from rows.
- `apps/server` is legacy and should not be used for current multiplayer fixes.
- `contracts` are future settlement work and should not be touched for current mechanics fixes unless requested.

## Common Commands

Install dependencies:

```bash
pnpm install
```

Run local SpacetimeDB:

```bash
pnpm stdb:start
pnpm stdb:publish:clear
```

Generate frontend bindings after schema/reducer changes:

```bash
pnpm stdb:generate
```

Run frontend locally against cloud:

```bash
VITE_GAME_TRANSPORT=spacetime \
VITE_GAME_TRACE=true \
VITE_SPACETIME_URI=https://maincloud.spacetimedb.com \
VITE_SPACETIME_DB=elmental-v2 \
VITE_BOT_FALLBACK_SECONDS=30 \
pnpm --filter @elmental/tma dev
```

Core verification:

```bash
spacetime build --module-path apps/spacetime/spacetimedb
pnpm --filter @elmental/shared build
pnpm --filter @elmental/shared test -- run
pnpm test:matrix-parity
pnpm smoke:local-mock
pnpm test:stdb-local-scenarios
pnpm --filter @elmental/tma build
```

Full local timeout verification, intentionally slower because it waits production scheduler windows:

```bash
pnpm test:stdb-local-scenarios:full
```

## Current Public Test Instance

- Frontend: `https://elemgame.github.io/elemgameV2/`
- SpacetimeDB server: `https://maincloud.spacetimedb.com`
- SpacetimeDB database: `elmental-v2`
- Dashboard: `https://spacetimedb.com/elmental-v2`

## Notes And Risks

- The active backend currently uses commit/reveal via `commit_move` and `reveal_move`; `submit_move` is disabled.
- The frontend provider contract still includes `submitMove()` as the UI-facing action, but the SpacetimeDB provider implements it by committing and revealing under the hood.
- `packages/shared/src/constants.ts` defines `MAX_ROUNDS = 9`, while `apps/spacetime/spacetimedb/src/index.ts` defines `MAX_ROUNDS = 5`. This may be intentional or may cause behavior differences between mock/shared logic and real backend.
- The backend duplicates parts of game logic instead of importing `packages/shared`, so matrix and energy changes must be kept synchronized.
