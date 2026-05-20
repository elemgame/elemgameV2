# PRD: Full Play-to-Earn Reward Economy

Status: Draft, 2026-05-19.

## Introduction

Elmental currently has a production-oriented Play-and-Earn model: players spend
ELM/tELM as a fixed match entry fee and earn Season Points, rating, and status.
That is playable and safer than a player-funded stake pool, but it is not full
Play-to-Earn because players cannot earn redeemable value.

This PRD defines a full P2E layer for a later phase. Full P2E means a user can
earn a reward with external value from gameplay, subject to eligibility,
compliance, fraud controls, reward pool funding, and payout rules.

The core product decision is:

- keep the current entry-fee PvP settlement;
- do not pay winners from losing players' entry fees;
- add a separate, pre-funded reward pool;
- award claimable rewards through seasons, tournaments, quests, or sponsored
  campaigns;
- require legal/compliance approval before any reward can be redeemed.

This is not a legal memo. It is an implementation PRD with explicit legal,
payments, anti-abuse, and operations gates.

## Goals

- Add a credible path from gameplay to redeemable rewards without reintroducing
  player-funded wagers.
- Preserve the current server-authoritative SpacetimeDB gameplay path.
- Keep paid ELM as match credit/entry fee, not as a prize pool contribution.
- Introduce a separate reward pool ledger with source-of-funds tracking.
- Let players see potential rewards, eligibility, progress, claim status, and
  payout history clearly.
- Prevent misleading earning claims and make reward availability bounded,
  auditable, and explainable.
- Support region, age, KYC, sanctions, abuse, and jurisdiction gates.
- Provide admin tools for reward pool funding, approvals, disputes, and payout
  recovery.

## Product Model

### Current Layer: Play-and-Earn

- The current Telegram production entry point lets users buy paid `ELM` through
  Stars.
- Test and demo environments use demo `tELM` regardless of entry point.
- Matches use a fixed entry fee.
- Match results award Season Points and rating.
- No paid ELM moves from loser to winner.

### New Layer: Full P2E

Full P2E adds a second economic layer:

- `season_points`: non-redeemable progression score, already implemented.
- `reward_points`: internal reward allocation score for a specific season or
  campaign.
- `claimable_reward`: a reward record with possible external value.
- `reward_pool`: pre-funded budget that caps all claimable rewards.
- `payout`: completed off-platform or approved-platform transfer to an eligible
  user.

Reward pool sources may include sponsor budgets, developer treasury, ads,
affiliate revenue, grants, or explicitly approved tournament funding. Entry fees
must not automatically fund a per-match prize pool.

## User Stories

### US-001: Add P2E Feature Flag And Legal Gate
**Description:** As an operator, I want full P2E disabled by default so that redeemable rewards cannot accidentally go live before legal and operational review.

**Acceptance Criteria:**
- [ ] Add server-side config `P2E_REWARDS_ENABLED=false` by default.
- [ ] Add server-side config `P2E_CLAIMS_ENABLED=false` by default.
- [ ] Add server-side config for allowed jurisdictions, minimum age policy, and blocked jurisdictions.
- [ ] Claim endpoints return `rewards_disabled` until both rewards and claims are explicitly enabled.
- [ ] The frontend can show non-redeemable Season Points without enabling P2E claims.
- [ ] Production startup logs whether P2E earning and claiming are enabled.
- [ ] Tests cover disabled, earning-only, and claiming-enabled modes.

### US-002: Create Reward Pool Ledger
**Description:** As an operator, I need a reward pool ledger so that every claimable reward is backed by a known budget.

**Acceptance Criteria:**
- [ ] Add reward pool records with pool ID, campaign/season ID, currency, total budget, reserved amount, paid amount, remaining amount, funding source, status, and timestamps.
- [ ] Reward pool sources are explicit: `sponsor`, `treasury`, `grant`, `ads`, `affiliate`, `manual_test`, or `other`.
- [ ] Reward allocation cannot exceed available pool balance.
- [ ] Reward pool adjustments require admin authorization and audit rows.
- [ ] Reward pool data exposed to users is sanitized and does not leak internal notes or secrets.
- [ ] Tests cover pool funding, reservation, release, payout, and insufficient-pool rejection.

### US-003: Add Seasons And Reward Campaigns
**Description:** As a player, I want rewards tied to seasons or campaigns so that P2E has a visible competitive structure.

**Acceptance Criteria:**
- [ ] Add season/campaign records with ID, title, start time, end time, status, eligible game modes, eligible balance kinds, reward pool ID, and reward rules version.
- [ ] Only active seasons/campaigns can accrue reward points.
- [ ] Ended seasons stop accruing points but remain visible in history.
- [ ] Admin can create a draft campaign and preview reward math before activation.
- [ ] Campaign activation requires a funded reward pool and legal gate approval flag.
- [ ] Tests cover active, upcoming, ended, and canceled campaign states.

### US-004: Calculate Reward Points From Skill-Based Activity
**Description:** As a player, I want reward progress to come from skill and sustained activity, not from one lucky paid match.

**Acceptance Criteria:**
- [ ] Reward points are derived from server-authoritative match settlement events.
- [ ] Base reward points use deterministic inputs such as win, draw, loss, score, rating delta, opponent rating band, and completed match count.
- [ ] Reward points are capped per day and per season to reduce grinding abuse.
- [ ] Forfeit, timeout, disconnect, and rematch farming rules are explicit.
- [ ] Matches against the same account pair have configurable daily reward caps.
- [ ] Reward points are idempotent per match/account/campaign.
- [ ] Tests cover win, draw, loss, clean win, forfeit, timeout, duplicate settlement, and repeated pair caps.

### US-005: Maintain A No-Purchase Eligibility Path
**Description:** As a compliance owner, I want users to have a no-purchase way to participate where required so that reward campaigns are not automatically tied to paid entry.

**Acceptance Criteria:**
- [ ] Campaign config supports `no_purchase_required=true`.
- [ ] Eligible free/demo route is documented per campaign.
- [ ] Free route can earn reward points under explicit caps and anti-abuse rules.
- [ ] Paid ELM purchase is never described as required to earn a prize unless legal review approves that specific campaign structure.
- [ ] UI shows eligibility requirements before a user starts earning.
- [ ] Tests cover paid user, free user, ineligible user, and blocked jurisdiction cases.

### US-006: Add Claimable Reward Ledger
**Description:** As a player, I want earned rewards to become claimable records so that payout status is transparent.

**Acceptance Criteria:**
- [ ] Add claimable reward records with reward ID, account ID, campaign ID, pool ID, reward type, gross amount, net amount, currency/unit, status, expiration, and idempotency key.
- [ ] Status values include `pending`, `eligibility_review`, `claimable`, `claim_started`, `paid`, `rejected`, `expired`, and `canceled`.
- [ ] Claimable rewards are generated only from finalized campaign results or approved instant-reward rules.
- [ ] Duplicate generation cannot create duplicate rewards for the same account/campaign/rule.
- [ ] Reward records are append-only or have an event trail for all status changes.
- [ ] Tests cover reward generation, idempotency, status transitions, expiration, and cancellation.

### US-007: Add Payout Provider Abstraction
**Description:** As a developer, I want payout rails behind an adapter so that rewards are not hardcoded to one provider or currency.

**Acceptance Criteria:**
- [ ] Define `RewardPayoutProvider` interface for quote, create payout, status sync, cancel where supported, and provider webhook handling.
- [ ] Supported provider types are config-driven: `manual`, `gift_card`, `ton_wallet`, `crypto_exchange`, `fiat_provider`, or `telegram_if_supported`.
- [ ] MVP can use `manual` provider for testnet or controlled private payouts.
- [ ] Production provider requires secrets only on backend, never in frontend.
- [ ] Payout provider errors are mapped to stable internal error codes.
- [ ] Tests use a fake provider and cover success, pending, failure, retry, duplicate webhook, and provider outage.

### US-008: Add KYC, Age, Region, And Sanctions Gate
**Description:** As an operator, I need eligibility checks before external-value rewards are claimable.

**Acceptance Criteria:**
- [ ] Claim flow blocks users without required eligibility checks.
- [ ] Eligibility policy supports region allow/deny lists, minimum age, KYC required flag, sanctions screening required flag, and payout-provider account requirements.
- [ ] KYC/PII data is not stored in public SpacetimeDB tables.
- [ ] Frontend shows clear pending/rejected states without exposing sensitive compliance reasons.
- [ ] Admin can see compliance status and provider references, not raw sensitive documents.
- [ ] Tests cover eligible, underage, blocked region, missing KYC, failed KYC, and expired KYC cases.

### US-009: Add Anti-Abuse And Sybil Controls
**Description:** As an operator, I need to prevent reward farming from fake accounts, collusion, and scripted matches.

**Acceptance Criteria:**
- [ ] Add abuse signals for repeated account pairs, abnormal win/loss patterns, match duration anomalies, device/account clustering where available, payment/refund anomalies, and high-volume automation.
- [ ] Reward claims can be held for review when risk score exceeds a threshold.
- [ ] Admin can mark a reward as `rejected` or `claimable` with an audit reason.
- [ ] The system never auto-pays rewards under active abuse review.
- [ ] Abuse logic is explainable enough for support, without exposing exact thresholds to users.
- [ ] Tests cover repeated pair farming, self-match attempts, rapid forfeits, and duplicate device/account signals where feasible.

### US-010: Add Reward UI
**Description:** As a player, I want to understand what I can earn, how close I am, and what is required to claim it.

**Acceptance Criteria:**
- [ ] Home/Profile shows active campaign, reward progress, current rank/tier, and claim eligibility status.
- [ ] Result screen shows reward point changes when a P2E campaign is active.
- [ ] Rewards page shows campaign rules, pool cap, personal progress, claimable rewards, payout status, and support link.
- [ ] UI distinguishes Season Points, reward points, claimable rewards, paid ELM, and demo tELM.
- [ ] UI does not promise guaranteed income, fast money, risk-free earning, or fixed earnings unless legally reviewed and factually supported.
- [ ] Verify in browser using Playwright.

### US-011: Add Admin Reward Console
**Description:** As an operator, I want to manage reward pools, campaigns, claims, and disputes without direct database edits.

**Acceptance Criteria:**
- [ ] Admin UI has tabs for Reward Pools, Campaigns, Claims, Payouts, Abuse Review, and Audit.
- [ ] Admin can create draft pools/campaigns and preview impact before activation.
- [ ] Admin can approve, hold, reject, or cancel claims with required reason.
- [ ] Admin can retry failed payouts through backend-only provider APIs.
- [ ] Admin actions write immutable audit events.
- [ ] Non-admin users cannot load reward admin data.
- [ ] Verify in browser using Playwright.

### US-012: Add Terms, Rules, And Support Flow
**Description:** As a player, I need official reward terms and support paths before participating.

**Acceptance Criteria:**
- [ ] Each reward campaign links to official rules.
- [ ] Rules state eligibility, reward pool, start/end time, reward formula, claim deadline, payout method, disqualification rules, support path, and sponsor/operator identity.
- [ ] UI requires acceptance of reward terms before claim.
- [ ] Bot supports `/terms`, `/support`, and `/paysupport` where relevant.
- [ ] Support can look up reward claims by account ID, campaign ID, payout ID, and provider reference.
- [ ] Terms copy is reviewed before public launch.

### US-013: Add Reward Observability
**Description:** As an operator, I need metrics and alerts so reward failures do not silently harm users.

**Acceptance Criteria:**
- [ ] Dashboard shows active campaigns, pool remaining, reserved rewards, paid rewards, failed payouts, held claims, abuse holds, and provider errors.
- [ ] Alerts fire on payout webhook failure, pool exhaustion, duplicate payout attempt, provider outage, abnormal claim volume, and high rejection rate.
- [ ] Reward events have correlation IDs across match settlement, reward allocation, claim, payout, and admin audit.
- [ ] Runbooks document reward pool recovery, provider retry, accidental over-allocation, and payout dispute handling.

### US-014: Add End-To-End P2E Tests
**Description:** As a developer, I want deterministic tests for reward earning and claiming so P2E cannot regress silently.

**Acceptance Criteria:**
- [ ] Local scenario covers match settlement -> reward points -> campaign finalization -> claimable reward.
- [ ] Fake payout provider scenario covers claim -> payout pending -> webhook paid.
- [ ] Tests verify entry fees do not fund or change reward pool balances.
- [ ] Tests verify ineligible users can play but cannot claim external-value rewards.
- [ ] Tests verify abuse-held rewards are not paid automatically.
- [ ] CI passes.

## Functional Requirements

- FR-1: Full P2E must be disabled by default in all environments.
- FR-2: Full P2E rewards and claims must be controlled by backend-only feature flags.
- FR-3: Paid ELM entry fees must not be transferred to winners or used as an automatic per-match prize pool.
- FR-4: Every reward pool must have an explicit source of funds and finite budget.
- FR-5: Reward allocation must never exceed the available reward pool budget.
- FR-6: Reward points must be generated only from server-authoritative gameplay events.
- FR-7: Reward point generation must be idempotent per account, match, campaign, and rule version.
- FR-8: Campaign rules must be versioned and immutable after activation, except for cancellation/pausing.
- FR-9: Users must see campaign eligibility requirements before attempting to earn or claim rewards.
- FR-10: Claims must require eligibility checks when configured.
- FR-11: Payout provider secrets must never be exposed to the TMA frontend.
- FR-12: Payouts must be idempotent and resilient to duplicate provider webhooks.
- FR-13: Reward claims must have an audit trail for every status change.
- FR-14: Admin reward actions must require server-side Telegram admin authorization.
- FR-15: KYC/PII must not be stored in public replicated gameplay tables.
- FR-16: Users in blocked jurisdictions must be able to play non-reward gameplay, but must not accrue or claim external-value rewards.
- FR-17: Rewards UI must avoid unsupported earnings claims.
- FR-18: Reward support workflows must let operators trace a claim from gameplay event to payout provider response.
- FR-19: The system must support pausing reward accrual and pausing claims independently.
- FR-20: The system must support campaign cancellation with clear user messaging and admin audit.
- FR-21: The system must expose current reward pool remaining amount and claim deadlines where user-facing.
- FR-22: The system must maintain separate accounting for paid ELM, demo tELM, Season Points, reward points, claimable rewards, and payouts.
- FR-23: Reward campaigns must define whether no-purchase participation is required and what the free route is.
- FR-24: Reward payout rails must be configurable by campaign and jurisdiction.
- FR-25: Any blockchain or token reward path must require separate legal approval, wallet-risk controls, and region gating.

## Non-Goals

- No return to player-funded stake pools.
- No per-match winner-takes-entry-fees payout.
- No rake-funded prize pool in the MVP.
- No guaranteed income promises.
- No unlimited earning.
- No automatic payout before eligibility, fraud, and pool checks.
- No user-to-user reward transfers.
- No marketplace for selling Season Points or reward points.
- No storing raw KYC documents in SpacetimeDB.
- No external payout provider hardcoded into gameplay reducers.
- No token launch or blockchain settlement in the first full P2E MVP unless a separate legal and technical PRD approves it.

## Design Considerations

- The app should feel like competitive PvP with seasonal rewards, not a casino.
- Use precise labels:
  - `Season Points`
  - `Reward Points`
  - `Claimable Reward`
  - `Reward Pool`
  - `Eligibility Review`
  - `Payout Pending`
- Avoid unsupported or high-risk copy:
  - `guaranteed income`
  - `risk-free earning`
  - `cash out your winnings`
  - `bet`
  - `jackpot`
  - `winner takes all`
  - `make money fast`
- Reward pages must show caps, deadlines, and eligibility restrictions clearly.
- If a campaign is not available in a user's region, show a plain unavailable state instead of hiding the whole app.
- Claim flows must be calm and operational: status, required action, support path, and expected processing window.

## Technical Considerations

- Keep active gameplay in `apps/spacetime/spacetimedb` server-authoritative.
- Prefer emitting reward-relevant events from match settlement, then processing reward allocation in a backend service.
- Keep payout, KYC, sanctions, tax, and provider state in a private backend datastore. PostgreSQL is a better fit than public SpacetimeDB tables for compliance and payout operations.
- `apps/tma/src/services/gameProvider/types.ts` should remain the gameplay boundary. Do not let screens read SpacetimeDB SDK state directly.
- Create a separate frontend service boundary for rewards, for example `apps/tma/src/services/rewards.ts`.
- `apps/payments` may host reward APIs only if it remains clearly separated from Stars purchase/refund logic; otherwise create `apps/rewards`.
- Reward mutations must use idempotency keys and audit events.
- Campaign finalization should be deterministic and replayable from source events.
- Payout provider webhooks must verify signatures/secrets and tolerate duplicate delivery.
- Public bug reports must not include payout provider references, KYC status details, or admin notes.
- If Telegram remains the primary shell, Stars can continue to sell digital goods/credits inside Telegram, but this PRD must not assume arbitrary outbound Star payouts to users through Bot API. Payout rails need separate validation.

## Release Plan

### Phase 2A: Reward Architecture Without Redemption

- Add reward pool, campaign, reward point, and claimable reward schemas.
- Add feature flags with claims disabled.
- Add fake/manual payout provider.
- Add admin-only campaign preview.
- Add tests for reward allocation and pool accounting.

### Phase 2B: Private Test Campaign

- Run a closed campaign with no external payouts.
- Show reward points and simulated claimable rewards.
- Validate abuse detection, leaderboard integrity, admin review, and support flows.
- Keep all claims in `claims_disabled` or `manual_test` state.

### Phase 2C: Legal-Approved Limited Reward Campaign

- Enable a small externally funded reward pool in approved jurisdictions only.
- Use a manually operated or provider-backed payout rail.
- Require terms acceptance and eligibility checks.
- Cap total pool, per-user reward, daily accrual, and campaign duration.

### Phase 2D: Production P2E

- Automate eligible payout provider flows.
- Add alerts and operational runbooks.
- Add public campaign history and reward transparency.
- Expand jurisdictions only after policy/legal review.

## Success Metrics

- 100% of claimable rewards are backed by reward pool ledger entries.
- 0 rewards are funded by direct loser-to-winner entry fee transfers.
- 100% of payout attempts have idempotency keys and provider references.
- 100% of reward claim status changes have audit events.
- Reward support can trace a claim from match events to payout status in under 2 minutes.
- Abuse-held rewards are never auto-paid.
- No public copy promises unsupported earnings.
- P2E campaign opt-in conversion, match retention, and claim completion are measurable without direct SQL.

## Open Questions

- Which payout rail is acceptable for the first real campaign: manual, gift card, TON wallet, fiat provider, or another provider?
- Which jurisdictions should be allowed for the first limited P2E campaign?
- What minimum age and KYC threshold should apply?
- Is a no-purchase route legally required for every campaign we want to run?
- Can sponsor-funded rewards be shown inside Telegram Mini App without app store or Telegram policy issues in target jurisdictions?
- Should reward points be based mostly on leaderboard rank, quest completion, or direct match outcomes?
- Should users in demo/test environments be eligible for real rewards, or only users in approved paid/production environments?
- What tax reporting obligations apply for each payout rail and jurisdiction?
- Should rewards expire, and after how long?
- What is the maximum acceptable per-user and total campaign reward in the first test?

## References

- Current phase PRD: `tasks/prd-play-and-earn-economy.md`
- Current analysis: `docs/play-and-earn-triz-analysis.md`
- Telegram Stars digital goods payments: https://core.telegram.org/bots/payments-stars
- Telegram Stars Terms: https://telegram.org/tos/stars
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
- FTC deceptive earnings claims notice: https://consumer.ftc.gov/consumer-alerts/2021/10/ftc-puts-over-1100-businesses-notice-about-deceptive-money-making-claims
- FTC in-game rewards enforcement example: https://www.ftc.gov/news-events/news/press-releases/2021/01/ftc-requires-mobile-advertising-company-stop-misleading-users-about-game-rewards
