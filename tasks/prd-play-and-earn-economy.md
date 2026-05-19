# PRD: Play-and-Earn Economy

Status as of 2026-05-19: implemented on `main` through issues #72-#80. The
remaining production-readiness work is operational: self-hosting, monitoring,
support/admin workflows, manual public smokes, and a controlled human playtest.

## Introduction

Transform Elmental's paid PvP economy from a stake-pool model into a production-ready Play-and-Earn model. The current paid flow can be interpreted as gambling-like because Telegram users can buy `ELM`, enter a paid PvP match, lose their stake, and let the winner receive the pooled paid balance minus rake.

The new model keeps the skill-based PvP game intact, but changes economic settlement:

- Telegram users buy paid `ELM` through Telegram Stars.
- Paid `ELM` is spent as a match entry fee, not wagered into a player-funded prize pool.
- Winners earn rating, Season Points, and status progression, not the opponent's paid `ELM`.
- Refunds apply only to unused purchased `ELM` lots that can be mapped back to original Telegram Stars payments.
- Web users continue to play with demo-only `tELM`.

This PRD is based on `docs/play-and-earn-triz-analysis.md`.

## Goals

- Remove user-to-user paid balance transfer from production PvP settlement.
- Replace `Stake / Winner Payout / Rake` UX with `Entry Fee / Season Points / Rating`.
- Keep current server-authoritative SpacetimeDB gameplay: matchmaking, commit/reveal, round resolution, timeouts, and balance updates remain backend-owned.
- Preserve Telegram Stars purchase flow at `1 XTR = 100 ELM`.
- Keep reverse conversion limited to unused purchased paid `ELM`, not earned progression or spent entry fees.
- Add enough ledger structure to support production debugging, refunds, admin operations, and future seasons.
- Leave room for phase 2 mechanics such as seasons, cosmetics, sponsored rewards, and tournaments without reintroducing player-funded wagers.

## User Stories

### US-001: Add Economy Mode Guard
**Description:** As an operator, I want production to run only the Play-and-Earn economy so that a deploy cannot accidentally re-enable stake-pool paid settlement.

**Acceptance Criteria:**
- [ ] Define an explicit economy mode in shared/backend configuration, with supported values `entry_fee_season_points` and optional legacy `stake_pool`.
- [ ] Production/self-host defaults to `entry_fee_season_points`.
- [ ] `stake_pool` mode is unavailable for public paid Telegram matches unless explicitly enabled in a non-production test config.
- [ ] Startup, build, or publish documentation states which economy mode is active.
- [ ] Tests cover the production default.
- [ ] Typecheck/build passes.

### US-002: Add Season Points State
**Description:** As a player, I want to earn visible progression from matches so that winning matters without receiving another player's paid ELM.

**Acceptance Criteria:**
- [ ] Add server-authoritative `season_points` to durable account/player state, or add an equivalent season progression table keyed by account ID.
- [ ] Existing accounts default to `0` Season Points.
- [ ] Telegram `paid_elm` users and web `demo_teml` users can both earn Season Points.
- [ ] Frontend receives Season Points from subscribed/server data, not from local-only calculation.
- [ ] Generated SpacetimeDB bindings are regenerated if schema changes.
- [ ] Typecheck/build passes.

### US-003: Add Deterministic Season Point Rewards
**Description:** As a player, I want match results to award predictable Season Points so that progress feels fair and understandable.

**Acceptance Criteria:**
- [ ] Win awards `30` Season Points.
- [ ] Draw awards `15` Season Points.
- [ ] Loss awards `10` Season Points.
- [ ] Clean win `3:0` awards an additional `5` Season Points.
- [ ] First win of day awards an additional `20` Season Points if daily tracking is implemented in this phase; otherwise this bonus is explicitly deferred.
- [ ] Rewards are calculated server-side after match settlement.
- [ ] Duplicate settlement or reconnect events cannot award points twice for the same match/account.
- [ ] Unit/scenario tests cover win, draw, loss, clean win, and duplicate settlement idempotency.

### US-004: Convert Paid Stake To Entry Fee
**Description:** As a Telegram player, I want paid ELM to buy access to a ranked match rather than be wagered against another player.

**Acceptance Criteria:**
- [ ] Match creation still verifies that each player can afford the configured entry fee.
- [ ] Each player pays exactly the entry fee once when a real match is created.
- [ ] Winner does not receive paid ELM from the losing player.
- [ ] Loser does not lose more than their entry fee and optional configured match modifiers.
- [ ] Draw does not create a winner payout pool.
- [ ] The backend emits clear events for `entry_fee.charged` and match settlement.
- [ ] Local SpacetimeDB scenarios cover full match, max-round settlement, forfeit, one-player timeout, and both-player timeout under the new economy.

### US-005: Remove Rake From Production Paid Settlement
**Description:** As a product owner, I want production paid matches to avoid rake language and rake math so that the economy no longer resembles a wager pool.

**Acceptance Criteria:**
- [ ] Production paid settlement does not calculate `winnerPayout = stake * 2 - rake`.
- [ ] Production paid settlement does not emit `match.draw_rake` for paid ELM matches.
- [ ] Result UI no longer shows `Rake`, `Winner Payout`, or `Total Pool` for production paid matches.
- [ ] Wallet history no longer represents production paid matches as `pvp_win` payout from a pool.
- [ ] Legacy rake helpers may remain only for demo/legacy tests if clearly separated from production paid flow.
- [ ] Tests prove paid win and paid draw do not increase paid ELM from opponent funds.

### US-006: Define Refundable Paid ELM Policy
**Description:** As a Telegram user, I want to refund unused purchased ELM when eligible so that reverse conversion is clear and bounded.

**Acceptance Criteria:**
- [ ] Refund quote uses only unused purchased paid `ELM` lots backed by successful Telegram Stars payments.
- [ ] Entry fees reduce refundable paid ELM availability.
- [ ] Season Points are never refundable.
- [ ] Bonus/promotional credits, if introduced, are never refundable.
- [ ] UI labels the action as `Refund unused ELM` or equivalent, not generic cash-out.
- [ ] Backend rejects refund requests when current balance exists but no eligible unused purchased lot remains.
- [ ] Tests cover fully refundable, partially spent, fully spent, and non-refundable reward cases.
- [ ] Verify in browser using dev-browser skill.

### US-007: Add Append-Only Balance Events
**Description:** As an operator, I need every paid balance mutation to be reconstructable so that support and recovery do not depend on current balance snapshots.

**Acceptance Criteria:**
- [ ] Add an append-only balance event table/log for paid and bonus balance changes.
- [ ] Each event includes account ID, balance kind, delta, reason kind, idempotency key, related payment ID or match ID, timestamp, and actor/source.
- [ ] Stars purchase credits write balance events.
- [ ] Entry fee debits write balance events.
- [ ] Refund reservations/completions write balance events.
- [ ] Admin balance operations write balance events or are linked to existing admin audit rows.
- [ ] Duplicate idempotency keys cannot apply the same balance mutation twice.
- [ ] Tests verify ledger reconstruction for purchase -> entry fee -> refund quote.

### US-008: Update Wallet History For Entry Fees
**Description:** As a user, I want wallet history to explain spent ELM without implying gambling winnings.

**Acceptance Criteria:**
- [ ] Wallet history supports `match_entry_fee`.
- [ ] Wallet history removes or hides production paid `pvp_stake`, `pvp_win`, and `pvp_draw_refund` pool wording.
- [ ] Wallet history shows Stars purchases, paid ELM credits, entry fees, refunds, and admin adjustments where applicable.
- [ ] Season Points are shown in a separate progression/history surface, not mixed into paid wallet balance.
- [ ] Existing wallet history tests are updated for the new kinds.
- [ ] Verify in browser using dev-browser skill.

### US-009: Update Home Screen Economy Copy
**Description:** As a player, I want the Home screen to show match cost and progression clearly so that I understand what I am spending and earning.

**Acceptance Criteria:**
- [ ] Home screen uses `Entry Fee` or `Match Cost`, not `Stake`, for production paid matches.
- [ ] Balance card distinguishes paid `ELM`, demo `tELM`, and Season Points.
- [ ] Telegram users still see Stars top-up packages at `1 XTR = 100 ELM`.
- [ ] Web users continue to see demo `tELM` and no Stars controls.
- [ ] Energy Boost copy no longer says `+10% stake`; it says `extra match cost` or is disabled for paid production if deferred.
- [ ] Insufficient balance copy uses entry fee terminology.
- [ ] Verify in browser using dev-browser skill.

### US-010: Update Result Screen Economy Summary
**Description:** As a player, I want the result screen to highlight outcome, rating, and Season Points without showing a prize pool.

**Acceptance Criteria:**
- [ ] Result screen shows match outcome, score, rating change, and Season Points earned.
- [ ] Result screen shows paid ELM spent as an entry fee for paid Telegram matches.
- [ ] Result screen does not show `Rake`, `Winner Payout`, `Total Pool`, or `ELM Change` as a win payout for production paid matches.
- [ ] Demo `tELM` result behavior is either updated to match entry-fee semantics or clearly stays demo-only.
- [ ] Round history remains visible.
- [ ] Verify in browser using dev-browser skill.

### US-011: Preserve Gameplay Rules
**Description:** As a player, I want the actual PvP mechanics to remain stable so that the economy change does not invalidate current skill testing.

**Acceptance Criteria:**
- [ ] Move matrix remains unchanged.
- [ ] Commit/reveal flow remains mandatory.
- [ ] Energy costs, regen modes, overclock, timeouts, and score-to-win rules remain unchanged unless explicitly changed by a separate PRD.
- [ ] Matrix parity test still passes.
- [ ] Shared game-logic tests still pass.
- [ ] Public/local smoke tests still cover at least one full match.

### US-012: Add Production Copy Review
**Description:** As a product owner, I want public copy to avoid wager/cash-out language so that the product matches the new economy.

**Acceptance Criteria:**
- [ ] README and public docs no longer describe production paid gameplay as `winner takes pool`, `real stakes`, `rake`, `bet`, `cash out`, or `poker with money`.
- [ ] UI copy avoids `Bet ELM`, `Win opponent's ELM`, `Earn Stars`, `Jackpot`, and `Deflationary burn` in paid UX.
- [ ] Terms/support copy explains that paid ELM is a match credit and refunds apply only to unused eligible purchased lots.
- [ ] Bug report templates include economy mode and balance kind.
- [ ] Copy changes are reviewed alongside the backend economy changes before production deploy.

### US-013: Admin And Support Visibility
**Description:** As an operator, I want admin tools to show the new economy state so that support can explain balances and refunds.

**Acceptance Criteria:**
- [ ] Admin dashboard shows paid ELM balance, demo tELM balance, Season Points, total entry fees, and refund eligibility where available.
- [ ] Admin user detail can show recent balance events for an account.
- [ ] Admin search still supports Telegram ID, account ID, and player name.
- [ ] Manual balance adjustments remain audited.
- [ ] Admin UI does not allow direct Season Points to Stars conversion.
- [ ] Verify in browser using dev-browser skill.

### US-014: Update End-To-End Scenarios
**Description:** As a developer, I want smoke tests to assert the new economy so that stake-pool behavior cannot regress silently.

**Acceptance Criteria:**
- [ ] `pnpm test:stdb-local-scenarios` asserts paid/demo entry fee behavior where feasible.
- [ ] Tests assert winner paid balance does not increase from opponent funds.
- [ ] Tests assert loser balance decreases only by entry fee and configured modifiers.
- [ ] Tests assert Season Points increase according to result.
- [ ] Payment UI smoke asserts refund copy says unused ELM, not cash-out.
- [ ] CI passes.

## Functional Requirements

- FR-1: The system must support a production Play-and-Earn economy mode named `entry_fee_season_points`.
- FR-2: Production paid Telegram matches must use an entry fee instead of a stake-pool wager.
- FR-3: The default entry fee for the current phase must remain `50 ELM` unless changed by a separate product decision.
- FR-4: The system must debit each matched player exactly one entry fee when a real match is created.
- FR-5: A queued player must not be charged if no match is created.
- FR-6: A canceled queue entry must not charge the player.
- FR-7: The system must not transfer paid ELM from the loser to the winner in production mode.
- FR-8: The system must not calculate or display rake for production paid settlement.
- FR-9: The system must award Season Points after settled matches.
- FR-10: Season Points must be non-purchasable, non-refundable, and non-convertible to Stars.
- FR-11: The Season Points MVP formula must be deterministic: win `30`, draw `15`, loss `10`, clean win bonus `5`.
- FR-12: First-win-of-day bonus is optional for phase 1 and must be implemented only if daily tracking exists.
- FR-13: Telegram Stars purchases must keep the stable package rate `1 XTR = 100 ELM`.
- FR-14: Paid `ELM` and demo `tELM` must remain separate accounting domains.
- FR-15: Web users must stay on demo `tELM` and must not see Stars payment or refund controls.
- FR-16: Refunds must apply only to eligible unused purchased paid `ELM` lots.
- FR-17: Spent entry fees must reduce refundable paid ELM availability.
- FR-18: Bonus/promotional credits, if added, must be non-refundable.
- FR-19: Every paid balance mutation must be represented by an idempotent ledger/balance event.
- FR-20: Wallet history must separate paid balance changes from Season Points progression.
- FR-21: UI must use `Entry Fee` or `Match Cost` instead of `Stake` for production paid matches.
- FR-22: UI must not show `Winner Payout`, `Total Pool`, or `Rake` for production paid matches.
- FR-23: Admin/support views must expose enough ledger context to explain purchases, entry fees, refunds, and manual adjustments.
- FR-24: The frontend must not locally debit, credit, or settle paid ELM outside explicit mock/demo transport.
- FR-25: SpacetimeDB bindings must be regenerated after schema or reducer signature changes.

## Non-Goals

- No direct Play-to-Earn cash-out in phase 1.
- No conversion of earned Season Points to Stars.
- No conversion of opponent-funded winnings to Stars.
- No player-funded prize pools.
- No rake on production paid PvP.
- No blockchain settlement or token withdrawal in this PRD.
- No paid randomized loot boxes.
- No betting on matches or spectators.
- No marketplace or user-to-user transfers.
- No sponsored tournament rewards in phase 1.
- No legal determination that the product is or is not gambling; this PRD only reduces obvious gambling-like mechanics.

## Design Considerations

- The app should feel like a competitive game, not a casino. Use language around matches, progress, rating, season rank, and mastery.
- Home screen should show three separate concepts:
  - paid `ELM` or demo `tELM` balance;
  - Season Points;
  - match entry fee.
- Result screen should lead with the game result, score, rating delta, and Season Points earned.
- Wallet history should explain money-like state only: purchases, entry fees, refunds, and admin corrections.
- Progression history should explain game state: Season Points, streaks, wins, league tier, and achievements.
- Copy to use:
  - `Play ranked matches`
  - `Spend ELM match credits`
  - `Earn Season Points`
  - `Climb the leaderboard`
  - `Refund unused ELM`
- Copy to avoid:
  - `Bet ELM`
  - `Win opponent's ELM`
  - `Earn Stars`
  - `Cash out`
  - `Rake`
  - `Jackpot`
  - `Deflationary burn`

## Technical Considerations

- Active gameplay fixes should target `apps/spacetime/spacetimedb` first.
- `apps/tma/src/services/gameProvider/types.ts` remains the frontend boundary for gameplay state.
- `gameProvider/spacetimeProvider.ts` should remain the only non-generated frontend file importing SpacetimeDB module bindings.
- Schema changes in SpacetimeDB require `pnpm stdb:generate`.
- The current `match_state.stake` field may be retained temporarily as `entryFee` semantics, but UI and new code should not expose it as a wager.
- Consider adding explicit fields later, such as `entryFee`, `economyModel`, and `seasonPointsAwarded`, to reduce ambiguity.
- Add balance events before or alongside settlement changes; without event history, refund eligibility and support will remain fragile.
- Current `payment_ledger.refundableElmAmount` must be reconciled with entry fee spending so unused purchased ELM is calculated from ledger events, not only current balance.
- Payment service and admin service must keep Telegram bot token, payment secrets, and admin IDs server-side.
- If self-hosting remains the production path, backup/restore and payment runbooks are release blockers.
- Existing tests that assert payout/rake should either move under legacy stake-pool tests or be rewritten for entry-fee mode.

## Release Plan

### Phase 1A: Product And Copy Hardening

- Update README and UI copy to stop advertising winner-takes-pool paid stakes.
- Add economy mode naming and production default.
- Add issue decomposition from this PRD.

### Phase 1B: Ledger Foundation

- Add balance event ledger.
- Link Stars purchase credits, admin adjustments, entry fee debits, and refunds to ledger events.
- Add reconstruction and idempotency tests.

### Phase 1C: Entry Fee Settlement

- Change production paid settlement to entry fee semantics.
- Remove paid winner payout and paid draw rake.
- Preserve gameplay rules and timeouts.
- Update local SpacetimeDB scenarios.

### Phase 1D: Season Points UX

- Add Season Points state and deterministic reward rules.
- Show Season Points on Home, Profile, Result, and Admin where useful.
- Separate wallet history from progression history.

### Phase 1E: Refund And Operations Polish

- Limit refund quotes to unused purchased ELM lots.
- Update refund copy and tests.
- Add admin/support visibility.
- Run full local and CI verification.

## Success Metrics

- Zero production paid match paths transfer paid ELM from loser to winner.
- 100% of paid balance mutations have idempotent ledger events.
- Refund quote for unused purchased ELM can be explained from ledger events for any Telegram account.
- Local SpacetimeDB scenarios pass under entry-fee economy.
- TMA build and unit tests pass after schema/binding updates.
- Payment UI smoke confirms Stars purchase flow remains visible only for Telegram users.
- User-facing paid UX contains no `rake`, `winner payout`, `cash out`, or `bet` wording.
- Admin can explain a payment/balance support case from dashboard or SQL without manual balance guessing.

## Open Questions

- Should demo `tELM` keep stake-pool behavior for internal demos, or should demo also move to entry-fee semantics for parity?
- Should Energy Boost remain in paid production as an extra non-refundable match cost, or be disabled until the economy is stable?
- Should first-win-of-day Season Points ship in phase 1, or wait until daily activity tracking exists?
- Should Season Points reset by season, or accumulate lifetime plus current season?
- Should `bonus_elm` be included in phase 1, or deferred until after the basic entry-fee model is stable?
- What exact support/terms copy is required before public paid rollout?

## References

- Source analysis: `docs/play-and-earn-triz-analysis.md`
- Telegram Stars digital goods payments: https://core.telegram.org/bots/payments-stars
- Telegram Stars Terms: https://telegram.org/tos/stars
- Telegram Mini Apps Terms: https://telegram.org/tos/mini-apps
