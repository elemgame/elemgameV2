# PRD: Telegram Stars ELM Payments

## Introduction

Add Telegram Stars payments to the Telegram Mini App so Telegram users can buy paid `ELM` for gameplay. Web/browser users remain on demo-only `tELM`, a separate test balance with no payment, refund, or cash-out meaning.

The feature must preserve the current SpacetimeDB-authoritative gameplay model: the frontend can request payment and display balances, but confirmed payment, balance crediting, staking, refunds, and conversion ledger updates must be server-authoritative.

Telegram platform constraint: digital goods inside Telegram bots and Mini Apps must be sold through Telegram Stars with currency `XTR`. Telegram supports refunding Stars payments through Bot API refund methods tied to successful payment charge IDs. It does not provide a generic "send arbitrary Stars to user" balance transfer flow for normal Mini App purchases. The reverse conversion requirement must therefore be implemented as refund-backed conversion from eligible paid `ELM` lots, or explicitly blocked when no refundable payment lots are available.

References:
- Telegram Stars payments for digital goods: https://core.telegram.org/bots/payments-stars
- Telegram Mini App `openInvoice`: https://core.telegram.org/bots/webapps
- Telegram Stars API/refunds: https://core.telegram.org/api/stars

## Goals

- Allow Telegram users to buy gameplay `ELM` using Telegram Stars.
- Provide starter conversion at `1 Star = 100 ELM`, with larger packages granting bonus ELM.
- Allow Telegram users to convert eligible paid `ELM` back to Stars through a ledger-backed refund flow.
- Keep web/browser users on clearly labeled `tELM` demo coins with no Telegram Stars payment controls.
- Keep paid `ELM` usable in PvP stakes for Telegram users.
- Preserve server-authoritative balances and prevent client-side crediting, double-crediting, or refund abuse.

## User Stories

### US-001: Add Payment Ledger Schema
**Description:** As a developer, I need a persistent ledger for Stars purchases and refund eligibility so paid balances can be audited and reversed safely.

**Acceptance Criteria:**
- [ ] Add a server-authoritative payment ledger table with payment ID, account ID, Telegram user ID, Stars amount, ELM amount, charge ID, status, created timestamp, and refunded timestamp.
- [ ] Distinguish `paid_elm` ledger entries from demo `tELM`.
- [ ] Store `telegram_payment_charge_id` for every successful payment.
- [ ] Payment ledger rows are append-only except status/refund metadata.
- [ ] Typecheck/build passes.

### US-002: Create Payment Service
**Description:** As a Telegram user, I want the app to create a Stars invoice so I can buy ELM from inside the Mini App.

**Acceptance Criteria:**
- [ ] Add a small payment service separate from the legacy multiplayer server path.
- [ ] Payment service exposes an authenticated endpoint to create a Stars invoice link for a selected ELM package.
- [ ] Invoice uses currency `XTR` and an empty/omitted provider token as required for Stars digital goods.
- [ ] Invoice payload includes a unique purchase ID and account ID, signed or otherwise tamper-resistant.
- [ ] Endpoint rejects web/demo users and missing/invalid Telegram init data.
- [ ] Typecheck/build passes.

### US-003: Open Stars Invoice In TMA
**Description:** As a Telegram user, I want to tap a package and complete payment inside Telegram so my ELM balance can increase.

**Acceptance Criteria:**
- [ ] Wallet/top-up UI shows package options: `1 Star -> 100 ELM`, `5 Stars -> 600 ELM`, `10 Stars -> 1300 ELM`.
- [ ] Tapping a package requests an invoice link from the payment service.
- [ ] TMA opens the invoice with Telegram WebApp `openInvoice`.
- [ ] UI shows pending, successful, canceled, and failed states.
- [ ] The frontend does not credit ELM locally after invoice close.
- [ ] Balance updates only after subscribed server state changes.
- [ ] Typecheck/build passes.
- [ ] Verify in browser using dev-browser skill.

### US-004: Confirm Payment And Credit ELM
**Description:** As a Telegram user, I want my ELM credited once payment succeeds so I can use it in PvP.

**Acceptance Criteria:**
- [ ] Payment service handles `pre_checkout_query` and answers within Telegram's required time window.
- [ ] Payment service handles successful payment updates and extracts Telegram charge ID.
- [ ] Successful payment credits the matching account with the package ELM amount exactly once.
- [ ] Replayed or duplicated successful payment updates do not double-credit.
- [ ] A `game_event` or equivalent audit row records successful paid balance credit.
- [ ] Typecheck/build passes.

### US-005: Separate Telegram ELM From Web tELM
**Description:** As a web demo user, I want to play with test coins while understanding they are not paid ELM.

**Acceptance Criteria:**
- [ ] Web/browser fallback users see `tELM` labels instead of `ELM` for balances, stakes, and economy history.
- [ ] Web users do not see Stars top-up or reverse conversion buttons.
- [ ] Telegram users see paid `ELM` labels and Stars payment controls.
- [ ] Public bug reports include whether the session uses `ELM` or `tELM`.
- [ ] Typecheck/build passes.
- [ ] Verify in browser using dev-browser skill.

### US-006: Use Paid ELM In PvP Stakes
**Description:** As a Telegram user, I want paid ELM to be usable for PvP stakes so Stars purchases affect actual gameplay balance.

**Acceptance Criteria:**
- [ ] Telegram accounts stake from server-authoritative paid `ELM`.
- [ ] Existing match creation, stake reservation, payout, draw refund, and boost stake logic use the correct paid balance.
- [ ] Web users continue staking demo `tELM`.
- [ ] Paid and demo balances cannot be matched or transferred into each other accidentally.
- [ ] Typecheck/build passes.

### US-007: Reverse Convert Eligible ELM To Stars
**Description:** As a Telegram user, I want to convert ELM back into Stars so I can undo unused paid balance when possible.

**Acceptance Criteria:**
- [ ] Wallet UI shows a reverse conversion action for Telegram users only.
- [ ] User can request conversion in Star increments based on eligible paid ELM balance.
- [ ] Backend calculates refundable Stars from unspent/refundable payment lots using FIFO or a documented deterministic policy.
- [ ] Backend rejects conversion when the account has ELM balance but no refundable Stars-backed lots.
- [ ] Backend calls Telegram refund API with the original charge ID for each refunded lot.
- [ ] Refunded ELM is deducted only after Telegram refund succeeds, or the operation is safely retried without double deduction.
- [ ] Refunded ledger rows are marked with refund status and timestamp.
- [ ] UI clearly explains when only part of the balance can be converted back because some ELM came from winnings or non-refundable lots.
- [ ] Typecheck/build passes.
- [ ] Verify in browser using dev-browser skill.

### US-008: Payment History
**Description:** As a user, I want to see payment and conversion history so I can understand my balance changes.

**Acceptance Criteria:**
- [ ] Wallet/history view includes Stars purchases, ELM credits, stakes, winnings, draw refunds, and reverse conversions.
- [ ] Each Stars purchase shows Stars amount, ELM amount, status, and time.
- [ ] Each reverse conversion shows ELM deducted, Stars refunded, status, and time.
- [ ] Failed or pending entries are visually distinct from settled entries.
- [ ] Typecheck/build passes.
- [ ] Verify in browser using dev-browser skill.

### US-009: Payment Support And Admin Traceability
**Description:** As an operator, I need enough traceability to resolve payment support requests.

**Acceptance Criteria:**
- [ ] Ledger can be queried by Telegram user ID, account ID, purchase ID, and Telegram charge ID.
- [ ] Bug report payload includes sanitized payment state summary without bot token or raw auth secrets.
- [ ] Payment service logs purchase creation, successful payment, credit, refund request, refund success, and refund failure.
- [ ] No client-side GitHub token, bot token, or payment secret is exposed.
- [ ] Typecheck/build passes.

## Functional Requirements

- FR-1: The system must offer Telegram users paid `ELM` packages priced in Telegram Stars.
- FR-2: The MVP packages must be:
  - `1 Star -> 100 ELM`
  - `5 Stars -> 600 ELM`
  - `10 Stars -> 1300 ELM`
- FR-3: The system must use Telegram Stars currency `XTR` for all Telegram Mini App digital goods purchases.
- FR-4: The TMA must request invoice links from a backend payment service and open them with Telegram WebApp invoice APIs.
- FR-5: The frontend must never credit paid ELM directly after payment UI closes.
- FR-6: The backend must credit paid ELM only after a verified successful payment update from Telegram.
- FR-7: The backend must store the Telegram payment charge ID for every successful purchase.
- FR-8: The backend must make successful payment processing idempotent.
- FR-9: The backend must reject purchases from non-Telegram web/demo sessions.
- FR-10: Web/demo sessions must use `tELM`, not paid `ELM`.
- FR-11: Web/demo sessions must not display Stars payment or reverse conversion controls.
- FR-12: Telegram users must be able to stake paid `ELM` in PvP matches.
- FR-13: Demo `tELM` and paid `ELM` must be separate accounting domains.
- FR-14: Reverse conversion must deduct eligible ELM and refund Stars through Telegram payment refund APIs tied to original charge IDs.
- FR-15: Reverse conversion must not refund Stars that were never purchased by the user.
- FR-16: Reverse conversion must not allow users to convert gameplay winnings into Stars unless a refundable paid ELM lot exists and product/legal policy explicitly allows it.
- FR-17: The system must clearly show when a requested reverse conversion cannot be completed because the ELM is not refundable.
- FR-18: The payment service must not be used for active multiplayer gameplay transport.
- FR-19: The system must keep bot tokens and payment secrets out of the frontend bundle and GitHub repository.
- FR-20: Payment events must be visible in operational logs and in sanitized support/debug data.

## Non-Goals

- No fiat, card, crypto, TON wallet, or third-party payment provider in the Mini App.
- No blockchain settlement or on-chain ELM in this feature.
- No subscriptions in the MVP.
- No marketplace, item shop, battle pass, or paid cosmetics in this PRD.
- No arbitrary transfer of Stars to users outside Telegram's supported refund/payment mechanisms.
- No client-side payment verification.
- No routing gameplay matchmaking or move submission through the payment service.

## Design Considerations

- Add a compact wallet/top-up surface rather than a marketing-style page.
- Telegram mode should label the balance as `ELM`.
- Web mode should label the balance as `tELM` everywhere a user sees balance, stake, payout, or history.
- Top-up controls should be package cards or segmented options with the Star amount and resulting ELM amount.
- Reverse conversion must use careful copy:
  - Example: `Convert refundable ELM back to Stars`
  - Avoid promising that every ELM can always become Stars if platform constraints prevent it.
- Payment states should be explicit: `Pending`, `Paid`, `Credited`, `Refund requested`, `Refunded`, `Failed`.
- Existing Profile or Home balance surfaces should avoid mixing paid and demo terminology.

## Technical Considerations

- Add a dedicated payment service owned by the Telegram bot integration, separate from legacy Socket.io gameplay code.
- The payment service should validate Telegram init data before creating invoices or exposing purchase history.
- The service should create invoice links using Telegram Bot API (`createInvoiceLink`) or send invoices where appropriate, with `currency=XTR`.
- The TMA should open invoices using `window.Telegram.WebApp.openInvoice(url, callback)`.
- Successful payment handling requires Bot API updates for `pre_checkout_query` and `successful_payment`.
- Store payment lots so reverse conversion can map ELM back to the original Stars charge IDs.
- SpacetimeDB should remain authoritative for gameplay balances, but payment crediting needs a trusted server-to-SpacetimeDB path.
- Consider adding a payment reducer such as `credit_paid_elm` callable only by a trusted payment service identity, or a server-side admin process that writes payment-derived balance changes.
- Public test deployment must avoid breaking web demo users who have no Telegram Stars context.
- Existing smoke tests should be extended for:
  - web mode uses `tELM`
  - Telegram mock mode shows payment controls
  - successful payment webhook credits exactly once
  - reverse conversion cannot exceed refundable lots

## Success Metrics

- At least 95% of successful Telegram Stars payments credit ELM within 5 seconds of Telegram successful payment update.
- Zero duplicate credits from replayed payment updates in automated tests.
- Zero client-side balance credits outside explicit mock/demo transport.
- Web users see no paid ELM or Stars controls in smoke tests.
- Support/debug logs can identify a payment by Telegram charge ID in under one minute.
- Public smoke tests pass after enabling payment UI in Telegram and preserving web demo flow.

## Open Questions

- Can Telegram's refund APIs satisfy the product desire for "any ELM balance back to Stars", or must reverse conversion be limited to unspent/refundable purchase lots?
- What is the business policy for ELM won from other players: can it become refundable Stars, or is only originally purchased ELM refundable?
- Should package rates be remotely configurable, or hardcoded for MVP?
- What anti-abuse limits are needed for repeated buy/refund cycles?
- What is the expected support flow for `/paysupport` and disputed Stars purchases?
- Should paid `ELM` and demo `tELM` have separate matchmaking pools, or is labeling/accounting separation enough for MVP?
