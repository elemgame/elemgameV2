# PRD: Admin Dashboard And Balance Operations

## Introduction

Add a separate operator-facing admin web page for Elmental V2 so the team can monitor live activity and safely adjust user balances during the public test. The admin page must be protected by Telegram user identity: administrator Telegram IDs are configured server-side, not hardcoded in the frontend.

The dashboard is for production operations, not a debugging toy. It must make activity visible, support controlled balance corrections, and leave an audit trail for every admin action that changes user state.

## Goals

- Provide a separate admin page next to the TMA for operational visibility.
- Restrict admin access to Telegram user IDs declared in server configuration.
- Show high-signal activity statistics: active users, new users, matches, payments, balances, and recent errors/events.
- Allow admins to credit, debit, or set a user's balance for `paid_elm` and `demo_teml` accounts.
- Record an immutable audit entry for every admin balance operation.
- Keep admin authorization and balance mutation on the backend; the frontend must never be the trust boundary.

## User Stories

### US-001: Configure Admin Telegram IDs
**Description:** As an operator, I want to define admin Telegram IDs in server configuration so that only trusted Telegram accounts can open the admin dashboard.

**Acceptance Criteria:**
- [ ] Backend reads `ADMIN_TELEGRAM_IDS` as a comma-separated list of numeric Telegram user IDs.
- [ ] Empty `ADMIN_TELEGRAM_IDS` disables all admin access by default.
- [ ] Admin IDs are not included in the frontend bundle, page source, client logs, or bug reports.
- [ ] Invalid config values fail loudly at backend startup or are rejected with a clear startup error.

### US-002: Authenticate Admin Page Requests
**Description:** As an admin, I want the admin page to verify my Telegram identity so that random users cannot access operator tools.

**Acceptance Criteria:**
- [ ] Admin page requires Telegram WebApp init data or an equivalent signed Telegram login payload.
- [ ] Backend validates the Telegram signature using `TELEGRAM_BOT_TOKEN`.
- [ ] Backend checks the validated Telegram user ID against `ADMIN_TELEGRAM_IDS`.
- [ ] Non-admin users see an access denied state and receive no admin data.
- [ ] Expired, missing, malformed, or forged auth payloads are rejected.
- [ ] Verify in browser using Playwright with authorized and unauthorized test identities.

### US-003: View Activity Overview
**Description:** As an admin, I want an activity dashboard so that I can understand whether the game is healthy without querying SpacetimeDB manually.

**Acceptance Criteria:**
- [ ] Dashboard shows DAU and WAU based on recent player connection or gameplay activity.
- [ ] Dashboard shows new users over the selected time window.
- [ ] Dashboard shows match count, completed match count, active match count, queue size, and bot fallback match count.
- [ ] Dashboard shows payment count, total Stars amount, credited paid EML, refund count, and failed payment/refund count where data exists.
- [ ] Dashboard shows total `paid_elm` and `demo_teml` balances across accounts.
- [ ] Dashboard shows recent backend errors or warning events from `game_event`.
- [ ] Admin can select at least `24h`, `7d`, and `30d` time windows.
- [ ] Verify in browser using Playwright.

### US-004: Search And Inspect Users
**Description:** As an admin, I want to find a user by Telegram ID, account ID, player name, or SpacetimeDB identity so that I can inspect their state before changing anything.

**Acceptance Criteria:**
- [ ] Search supports exact Telegram user ID such as `307857822`.
- [ ] Search supports account IDs such as `telegram:307857822` and `web:123`.
- [ ] Search supports partial display names.
- [ ] Search result shows account ID, player identity when linked, display name, balance kind, current balance, rating, wins, losses, online state, active match/queue state, and last relevant activity timestamp when available.
- [ ] Search result clearly distinguishes `paid_elm` from `demo_teml`.
- [ ] Verify in browser using Playwright.

### US-005: Adjust User Balance
**Description:** As an admin, I want to credit, debit, or set a user's balance so that I can correct payment, test, or support issues without direct database edits.

**Acceptance Criteria:**
- [ ] Admin can choose operation type: `credit`, `debit`, or `set`.
- [ ] Admin must choose balance kind: `paid_elm` or `demo_teml`.
- [ ] Admin must select exactly one target account.
- [ ] Amount must be a positive integer for `credit` and `debit`.
- [ ] Set operation must require a non-negative integer final balance.
- [ ] Debit operation cannot make balance negative unless a future explicit override is added; no override in MVP.
- [ ] UI shows before balance, operation, amount/final balance, and after balance before confirmation.
- [ ] Backend performs the mutation atomically and returns the updated account row.
- [ ] Verify in browser using Playwright.

### US-006: Require Admin Audit Trail
**Description:** As an operator, I want every admin balance operation recorded so that we can explain who changed what and why.

**Acceptance Criteria:**
- [ ] Each operation writes an audit row with admin Telegram ID, target account ID, balance kind, operation type, previous balance, new balance, delta, timestamp, and request ID.
- [ ] Audit row includes an optional reason/comment field; UI should encourage a reason, but MVP may allow an empty reason.
- [ ] Audit row is written in the same backend operation as the balance mutation.
- [ ] Audit rows are not editable or deletable from the admin UI.
- [ ] Admin page shows recent audit entries with filters by admin ID, target account ID, operation type, and time window.
- [ ] Audit data is not exposed to non-admin clients.

### US-007: Protect Admin Balance Reducers/API
**Description:** As a developer, I need backend authorization around admin mutations so that a forged frontend request cannot change balances.

**Acceptance Criteria:**
- [ ] Balance mutation is exposed only through an authenticated admin backend/API path or a SpacetimeDB reducer that verifies trusted admin auth.
- [ ] Frontend cannot call a public reducer directly to change balances without backend authorization.
- [ ] Backend validates target account existence and balance kind before mutation.
- [ ] Backend rejects unknown operation types and unsafe numeric values.
- [ ] Backend logs rejected admin mutation attempts without leaking secrets.
- [ ] Tests cover authorized, unauthorized, invalid amount, missing target, and insufficient balance debit cases.

### US-008: Handle Admin UI Empty And Error States
**Description:** As an admin, I want clear states when no data is available or a backend is unavailable so that I do not mistake an outage for zero activity.

**Acceptance Criteria:**
- [ ] Dashboard distinguishes "zero results" from "failed to load".
- [ ] Balance operations are disabled while user lookup or preview calculation is stale.
- [ ] Admin page shows a clear backend unavailable state if payments/admin API or SpacetimeDB is unreachable.
- [ ] Admin page never displays raw tokens, Telegram init data, or stack traces.
- [ ] Verify in browser using Playwright.

## Functional Requirements

- FR-1: The system must serve a separate admin page, for example `/admin`, outside the normal player navigation.
- FR-2: The admin page must not appear as a normal TMA screen or public marketing route.
- FR-3: Admin authorization must be enforced server-side using validated Telegram identity and `ADMIN_TELEGRAM_IDS`.
- FR-4: The backend must validate Telegram auth payloads with `TELEGRAM_BOT_TOKEN`.
- FR-5: The backend must expose read endpoints for dashboard statistics, user search, user detail, and audit history.
- FR-6: The backend must expose a write endpoint or trusted reducer path for balance operations.
- FR-7: Balance operations must support `credit`, `debit`, and `set`.
- FR-8: Balance operations must support both `paid_elm` and `demo_teml`.
- FR-9: Balance operations must update the authoritative `account.balance`.
- FR-10: If a linked `player` row exists for the same account, the visible `player.balance` must be synchronized in the same operation or by a clearly documented sync path.
- FR-11: Every balance operation must write an admin audit row.
- FR-12: Audit rows must include enough data to reconstruct the operation without reading current account state.
- FR-13: Admin dashboard statistics must include DAU, WAU, new users, match activity, payment totals, balance totals, and recent error/warning events.
- FR-14: Admin endpoints must return structured errors with stable codes for unauthorized, forbidden, invalid input, not found, conflict, and backend unavailable.
- FR-15: Admin endpoints must be excluded from client-side bug reports and must not expose secrets.

## Non-Goals

- No role management UI in the first version; admins come from `ADMIN_TELEGRAM_IDS`.
- No admin creation or removal from inside the admin page.
- No bulk balance imports or CSV uploads.
- No deletion of users, matches, payments, or audit rows.
- No direct SQL console in the admin UI.
- No blockchain settlement operations.
- No bypass of Telegram Stars refund rules.
- No production analytics warehouse; dashboard can compute from current SpacetimeDB/payment tables for MVP.

## Design Considerations

- Admin UI should be dense and operational, not decorative. Use tables, filters, compact cards, and clear confirmation dialogs.
- Separate top-level areas:
  - Overview
  - Users
  - Balance Operations
  - Audit Log
  - Events/Errors
- Use explicit labels for currency: `ELM` for `paid_elm`, `tELM` for `demo_teml`.
- Destructive or risky actions need a confirmation step. Debit and set-to-lower-value should be visually distinguished from credit.
- The balance operation preview should be hard to misread:
  - Current balance
  - Operation
  - Delta or target value
  - Resulting balance
  - Target account
  - Admin identity
- Reason/comment should be present in the UI. It can be optional for MVP, but the UI should not hide it.

## Technical Considerations

- Prefer adding admin backend endpoints to `apps/payments` or a new backend service behind the existing self-host edge. Do not put admin secrets in `apps/tma`.
- The admin backend can reuse existing Telegram init data validation code from `apps/payments`.
- `ADMIN_TELEGRAM_IDS` should be read only by the backend.
- Admin balance mutation should use a server-trusted SpacetimeDB connection. If `PAYMENTS_SPACETIME_TOKEN` remains unresolved, this feature should also resolve or share a trusted service-token approach.
- Consider adding private SpacetimeDB tables:
  - `admin_audit_event`
  - optional `admin_activity_snapshot` only if live aggregation becomes too expensive
- Keep admin audit private. Public subscriptions must not expose admin identities or operational notes.
- Existing `account` is the durable balance source. Existing `player.balance` is a denormalized visible value and must not drift after admin changes.
- Activity windows need a clear timestamp basis. Use `game_event.created_at_micros`, payment ledger timestamps, match timestamps, and player/account creation signals where available.
- If exact DAU/WAU cannot be derived from existing tables, add a small private activity table rather than guessing from current online state.
- Add rate limiting to admin write endpoints to reduce damage from accidental repeated clicks.

## Success Metrics

- Admin can identify current app health in under 30 seconds from `/admin`.
- Admin can find a Telegram user and complete a balance correction in under 60 seconds.
- 100% of admin balance mutations have audit rows.
- Unauthorized users cannot load dashboard data or perform balance mutations.
- No balance mutation can make a balance negative in MVP.
- Support/debug sessions no longer require direct `spacetime sql UPDATE` for normal balance corrections.

## Open Questions

- Should `reason` be required before production, or optional for MVP only?
- Should admin access work only inside Telegram WebView, or should Telegram Login Widget support desktop browser admin access?
- Should admin balance operations be allowed while a user is in an active match or queue?
- Should bot accounts be adjustable from the UI, hidden, or admin-only with an extra confirmation?
- Should admin changes affect refundable paid EML lots, or should manual paid EML credit be marked as non-refundable by default?
- Should dashboard statistics be computed live on request or periodically materialized for performance?
