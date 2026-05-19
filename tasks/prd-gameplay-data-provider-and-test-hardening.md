# PRD: Gameplay Data Provider Boundary And Test Hardening

## Introduction

Elmental V2 currently has a working public mechanics instance on GitHub Pages with SpacetimeDB Cloud matchmaking. The next non-blockchain step is to make the gameplay data layer replaceable and better tested. Today the TMA `gameService` owns too many responsibilities at once: transport selection, SpacetimeDB connection lifecycle, generated binding access, row-to-UI mapping, timers, economy UI transactions, tracing, and direct Zustand store writes.

This PRD defines a non-blockchain refactor that introduces a clear gameplay data provider boundary. SpacetimeDB remains the production provider for the mechanics test instance. Mock/local gameplay becomes another provider behind the same interface. Future blockchain settlement or data providers should be able to plug into the same boundary without forcing UI screens to import chain, database, or generated transport bindings directly.

## Goals

- Isolate database and transport code behind a typed gameplay provider contract.
- Keep current public SpacetimeDB behavior unchanged.
- Add contract tests that verify each provider produces the same domain events for the same player actions.
- Add focused UI tests for browser web user profile editing and Telegram read-only profile behavior.
- Add CI coverage for the new tests without requiring cloud database writes on every PR.
- Document the provider boundary so future blockchain work can attach at the provider layer instead of leaking into UI screens.

## User Stories

### US-001: Define Gameplay Data Provider Contract

**Description:** As a developer, I need a single typed contract for gameplay data access so UI code does not depend on SpacetimeDB generated bindings or a future blockchain provider directly.

**Acceptance Criteria:**
- [x] Add a provider contract under `apps/tma/src/services/gameProvider/`.
- [x] Contract exposes actions for `initialize`, `updateProfile`, `startMatchmaking`, `cancelMatchmaking`, `submitMove`, `advanceRound`, `forfeitMatch`, `applyResults`, and `dispose`.
- [x] Contract emits domain events for player stats, queue state, match found, match update, round result, match settled, provider error, and trace event.
- [x] Contract types use domain names and shared package enums, not SpacetimeDB table row names.
- [x] No UI screen imports `../module_bindings`.
- [x] Typecheck passes.

### US-002: Move SpacetimeDB Code Into A Provider Adapter

**Description:** As a developer, I want all SpacetimeDB connection and row mapping code isolated in one adapter so the production provider can be replaced later without touching UI screens.

**Acceptance Criteria:**
- [x] Move direct imports of `spacetimedb`, `DbConnection`, and generated `module_bindings` out of `gameService.ts`.
- [x] Add `spacetimeProvider` that owns token storage, connection setup, subscriptions, reducer calls, reconnect handling, and SpacetimeDB row normalization.
- [x] Extract row-to-domain mapping functions for `MatchState` and `RoundResult`; player rows emit normalized `playerStats` directly.
- [x] Add unit tests for row-to-domain mapping from both p1 and p2 perspectives.
- [x] Existing public smoke behavior stays unchanged.
- [x] Typecheck passes.

### US-003: Convert Mock Gameplay Into A Provider Adapter

**Description:** As a developer, I want mock/local gameplay to implement the same provider contract so tests and development do not depend on SpacetimeDB.

**Acceptance Criteria:**
- [x] Move mock gameplay API behind `mockProvider`.
- [x] Provider supports deterministic test mode with injected delay and RNG controls.
- [x] Existing `VITE_GAME_TRANSPORT=mock` behavior remains available.
- [x] Mock provider emits the same event types as the SpacetimeDB provider.
- [x] Unit tests cover matchmaking, round result, match settlement, play again, profile update, and forfeit.
- [x] Typecheck passes.

### US-004: Add Provider Contract Tests

**Description:** As a developer, I want a reusable provider contract test suite so each provider proves it satisfies the same gameplay semantics.

**Acceptance Criteria:**
- [x] Add contract tests that can run against mock provider without network.
- [x] Tests verify profile update, queue join/cancel, match found, move submission, round result, match settlement, and play again.
- [x] Tests assert event order for the happy path.
- [ ] Tests assert provider errors are normalized into the same error shape.
- [x] CI runs these tests on every push and PR.

### US-005: Add TMA Profile Tests

**Description:** As a player, I want browser usernames to be editable while Telegram names stay tied to Telegram so identity display is predictable.

**Acceptance Criteria:**
- [x] Add tests for `sanitizeWebUserName`, `userNameFromDisplayName`, `saveWebUser`, and `getMockUser`.
- [x] Add browser test for non-Telegram profile editing: field visible, save button enabled on change, name and handle update after save.
- [x] Add browser test for Telegram profile: Telegram name and username render, web username field is absent.
- [x] Verify in browser using Playwright.
- [x] Typecheck passes.

### US-006: Add Local Playwright Smoke For PR-Safe UI Regression Checks

**Description:** As a developer, I want PR-safe smoke tests that do not create cloud SpacetimeDB matches so common UI regressions are caught before deployment.

**Acceptance Criteria:**
- [x] Add a local Playwright workflow using `VITE_GAME_TRANSPORT=mock`.
- [x] Test home, profile, matchmaking, first round selection, result state, and settings navigation.
- [x] Test fails on browser console errors and warnings.
- [x] CI runs local smoke on push and PR.
- [x] Public cloud smokes remain manual workflows.

### US-007: Document Provider Boundary And Migration Rules

**Description:** As a future blockchain implementer, I need clear rules for where blockchain or alternate persistence code belongs so it does not leak into UI screens.

**Acceptance Criteria:**
- [x] Update `AGENTS.md` with provider boundary rules.
- [x] Update `README.md` architecture section with provider diagram or concise flow.
- [x] Document which modules may import SpacetimeDB generated bindings.
- [x] Document how to add a future provider without editing UI screens.
- [x] Typecheck/build commands remain documented.

### US-008: Improve SpacetimeDB Reducer Scenario Coverage

**Description:** As a developer, I want reducer-level scenario coverage for SpacetimeDB behavior so timeout, matchmaking, and settlement changes are safer.

**Acceptance Criteria:**
- [x] Add an automated scenario harness or scripts that exercise a local ephemeral SpacetimeDB database.
- [x] Cover two-player queue match, room isolation, invalid move rejection, duplicate move rejection, forfeit, result timeout, one-player timeout, and both-player timeout.
- [x] Tests do not require SpacetimeDB Cloud credentials.
- [x] CI runs the reducer scenario suite or documents why it remains manual.
- [x] Existing `test:matrix-parity` remains in CI.

## Functional Requirements

- FR-1: The TMA must select a gameplay provider from config, defaulting to SpacetimeDB for production builds.
- FR-2: UI screens must call service/controller functions only; they must not import provider implementations, SpacetimeDB generated bindings, or future blockchain clients.
- FR-3: `gameService` or its replacement controller must translate provider domain events into Zustand store updates.
- FR-4: Provider implementations must not write directly to UI components.
- FR-5: The SpacetimeDB provider must be the only TMA module allowed to import `apps/tma/src/module_bindings`.
- FR-6: The mock provider must run without network and support deterministic tests.
- FR-7: Provider errors must be normalized into a shared error model with `code`, `message`, `source`, and optional metadata.
- FR-8: Trace events must preserve current useful client/server debugging output.
- FR-9: Tests must cover both p1 and p2 perspectives for match state mapping.
- FR-10: Public cloud smoke tests must remain available but should not become required on every PR unless explicitly enabled.

## Non-Goals

- No blockchain implementation.
- No token escrow, on-chain settlement, or contract deployment.
- No replacement of SpacetimeDB Cloud for the current mechanics test instance.
- No major redesign of the game UI.
- No migration of the legacy Node/Postgres server unless a later task chooses to retire or repurpose it.

## Design Considerations

- Keep the app screen-first and usable from the first view.
- Use current UI conventions and avoid adding explanatory in-app text about internals.
- Profile editing should stay compact in the existing Profile card.
- Any UI test should verify text does not overlap and core controls remain clickable on mobile width.

## Technical Considerations

- Current coupling hotspots:
  - `apps/tma/src/services/gameService.ts` imports `spacetimedb`, generated `DbConnection`, generated table types, `useGameStore`, and mock functions in one module.
  - `apps/tma/src/services/mockGame.ts` writes directly to Zustand and uses random timers, making deterministic tests difficult.
  - `apps/spacetime/spacetimedb/src/index.ts` owns reducer logic and table schema but has limited scenario tests outside build and matrix parity.
- Recommended shape:
  - `gameProvider/types.ts`: provider interface and domain event types.
  - `gameProvider/spacetimeProvider.ts`: generated bindings, reducer calls, subscriptions, table-row mappers.
  - `gameProvider/mockProvider.ts`: deterministic local provider.
  - `gameController.ts`: provider event to Zustand store mapping, timers, sounds, navigation side effects.
  - `gameProvider/__tests__/contract.test.ts`: provider behavior tests.
- Keep `packages/shared` as the source of truth for move matrix, energy, ELO/rating, production economy constants, and shared enums.

## Success Metrics

- A future provider can be added without editing screen components.
- No `module_bindings` imports exist outside the SpacetimeDB provider and generated binding folder.
- New provider contract tests pass locally and in CI.
- Local Playwright smoke catches profile and basic match UI regressions without cloud access.
- Public SpacetimeDB smoke keeps passing after the refactor.

## Open Questions

- Should future blockchain work replace all gameplay data or only settlement/economy data while SpacetimeDB remains real-time matchmaking?
- Should the legacy Node server be formally deprecated for the mechanics phase?
- Should cloud smokes run nightly on a schedule, or remain manual only?
- Should provider events be persisted for replay/debugging beyond console logs?
