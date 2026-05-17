# Issues: Admin Dashboard And Balance Operations

Source PRD: `tasks/prd-admin-dashboard-balance-operations.md`

Parent GitHub issue: https://github.com/elemgame/elemgameV2/issues/61

## 1. Add Telegram ID config and auth gate

GitHub: https://github.com/elemgame/elemgameV2/issues/62

**Labels:** `enhancement`, `backend`, `priority: critical`

Implement the backend authorization foundation for the admin interface.

**Acceptance Criteria:**
- [ ] Backend parses `ADMIN_TELEGRAM_IDS` as comma-separated numeric Telegram IDs.
- [ ] Empty `ADMIN_TELEGRAM_IDS` disables admin access by default.
- [ ] Invalid config fails loudly at startup or returns a clear operator error.
- [ ] Admin auth validator reuses or shares Telegram init data validation with payments code.
- [ ] Authorized admin requests produce a stable admin identity object for downstream handlers.
- [ ] Unauthorized requests return structured `401`/`403` errors with no sensitive details.
- [ ] Tests cover allowed admin, non-admin Telegram user, missing payload, bad signature, and stale payload.

## 2. Add audit table and trusted balance mutation path

GitHub: https://github.com/elemgame/elemgameV2/issues/63

**Labels:** `enhancement`, `backend`, `spacetimedb`, `priority: critical`

Add the server-authoritative mutation path for admin balance changes and the immutable audit record for each change.

**Dependencies:** Related to https://github.com/elemgame/elemgameV2/issues/53 because admin mutations need the same trusted service-token story as payment reducers.

**Acceptance Criteria:**
- [ ] Admin audit rows include admin Telegram ID, target account ID, balance kind, operation type, previous balance, new balance, delta, timestamp, request ID, and optional reason/comment.
- [ ] `credit` requires a positive integer delta.
- [ ] `debit` requires a positive integer delta and cannot make balance negative.
- [ ] `set` requires a non-negative integer final balance.
- [ ] Mutation validates target account existence and requested balance kind.
- [ ] Mutation updates `account.balance` atomically with audit write.
- [ ] Linked `player.balance` is synchronized in the same operation or via a deterministic documented sync helper.
- [ ] Private audit data is not publicly subscribable by normal clients.
- [ ] Tests cover authorized mutation, unauthorized mutation, invalid amount, insufficient debit balance, missing account, and player/account sync.

## 3. Expose dashboard stats, user lookup, and audit APIs

GitHub: https://github.com/elemgame/elemgameV2/issues/64

**Labels:** `enhancement`, `backend`, `priority: high`

Expose backend endpoints for the admin frontend to read activity stats, search users, inspect user state, and view audit history.

**Dependencies:** Blocked by https://github.com/elemgame/elemgameV2/issues/62 and related to https://github.com/elemgame/elemgameV2/issues/63.

**Acceptance Criteria:**
- [ ] Stats endpoint supports `24h`, `7d`, and `30d` windows.
- [ ] Stats include DAU, WAU, new users, match count, completed/active matches, queue size, bot fallback match count, payment count, Stars total, credited EML, refunds, failed payment/refund count where data exists, and total `paid_elm`/`demo_teml` balances.
- [ ] User search supports exact Telegram ID, exact account ID, exact SpacetimeDB identity, and partial display name.
- [ ] User detail returns account ID, linked player identity, display name, balance kind, current balance, rating, wins, losses, online state, active match/queue state, and last relevant activity timestamp when available.
- [ ] Audit endpoint returns recent immutable audit rows with filters.
- [ ] Endpoints return structured errors for unauthorized, forbidden, invalid input, not found, conflict, and backend unavailable.
- [ ] Tests cover admin access, non-admin denial, stats shape, user lookup modes, and audit filters.

## 4. Add separate `/admin` shell and access states

GitHub: https://github.com/elemgame/elemgameV2/issues/65

**Labels:** `enhancement`, `frontend`, `priority: high`

Create the separate admin page shell and access-state UX.

**Dependencies:** Blocked by https://github.com/elemgame/elemgameV2/issues/62.

**Acceptance Criteria:**
- [ ] `/admin` is not linked from normal player navigation.
- [ ] Page sends Telegram auth payload to admin backend and does not rely on frontend-only checks.
- [ ] Non-admin users see access denied and no admin data.
- [ ] Missing/invalid auth shows a clear login/open-in-Telegram state.
- [ ] Backend unavailable is visually distinct from zero activity.
- [ ] UI does not display raw Telegram init data, tokens, stack traces, or secret-bearing errors.
- [ ] Verify in browser using Playwright for allowed, denied, and backend unavailable states.

## 5. Build admin activity overview dashboard

GitHub: https://github.com/elemgame/elemgameV2/issues/66

**Labels:** `enhancement`, `frontend`, `priority: high`

Build the admin overview dashboard using the admin stats API.

**Dependencies:** Blocked by https://github.com/elemgame/elemgameV2/issues/64 and https://github.com/elemgame/elemgameV2/issues/65.

**Acceptance Criteria:**
- [ ] Dashboard renders DAU, WAU, new users, matches, active matches, queue size, bot fallback matches, payment totals, balance totals, and recent errors/events.
- [ ] Admin can switch between `24h`, `7d`, and `30d` windows.
- [ ] Empty data is displayed differently from failed data load.
- [ ] Currency labels distinguish `ELM` from `tELM`.
- [ ] Layout fits mobile Telegram WebView and desktop browser widths without overlap.
- [ ] Verify in browser using Playwright.

## 6. Build admin user search and detail view

GitHub: https://github.com/elemgame/elemgameV2/issues/67

**Labels:** `enhancement`, `frontend`, `priority: high`

Build the admin user search and detail inspection flow.

**Dependencies:** Blocked by https://github.com/elemgame/elemgameV2/issues/64 and https://github.com/elemgame/elemgameV2/issues/65.

**Acceptance Criteria:**
- [ ] Search supports exact Telegram ID, account ID, identity, and partial display name.
- [ ] Results show account ID, player identity, display name, balance kind, balance, rating, wins, losses, online state, active match/queue state, and last relevant activity when available.
- [ ] Multiple results are easy to compare without ambiguous target selection.
- [ ] User detail provides a stable target account handoff for balance operations.
- [ ] Loading, empty, and failed states are explicit.
- [ ] Verify in browser using Playwright.

## 7. Implement balance operation preview and confirmation UI

GitHub: https://github.com/elemgame/elemgameV2/issues/68

**Labels:** `enhancement`, `frontend`, `backend`, `priority: high`

Implement the admin workflow for crediting, debiting, or setting a user's balance.

**Dependencies:** Blocked by https://github.com/elemgame/elemgameV2/issues/63, https://github.com/elemgame/elemgameV2/issues/64, https://github.com/elemgame/elemgameV2/issues/65, and https://github.com/elemgame/elemgameV2/issues/67.

**Acceptance Criteria:**
- [ ] Admin can choose `credit`, `debit`, or `set`.
- [ ] Admin can choose `paid_elm` or `demo_teml`.
- [ ] Operation requires exactly one target account from the user detail flow.
- [ ] Preview shows current balance, resulting balance, operation, target account, balance kind, and admin identity.
- [ ] Debit and lower set-value operations are visually distinct from credit.
- [ ] Submit is disabled for stale lookup, invalid amount, missing target, or invalid auth.
- [ ] Successful mutation refreshes the user detail and shows the audit event reference/request ID.
- [ ] Failed mutation shows a structured, non-secret error.
- [ ] Verify in browser using Playwright.

## 8. Build audit log UI and filters

GitHub: https://github.com/elemgame/elemgameV2/issues/69

**Labels:** `enhancement`, `frontend`, `backend`, `priority: medium`

Expose the admin audit trail in the admin UI.

**Dependencies:** Blocked by https://github.com/elemgame/elemgameV2/issues/63, https://github.com/elemgame/elemgameV2/issues/64, and https://github.com/elemgame/elemgameV2/issues/65.

**Acceptance Criteria:**
- [ ] Audit log shows admin Telegram ID, target account ID, balance kind, operation type, previous balance, new balance, delta, timestamp, request ID, and reason/comment when present.
- [ ] Audit rows are not editable or deletable from the admin UI.
- [ ] Filters work for admin ID, target account ID, operation type, and time window.
- [ ] Empty and failed states are explicit.
- [ ] Audit log is inaccessible to non-admin users.
- [ ] Verify in browser using Playwright.

## 9. Document admin env and add admin smoke coverage

GitHub: https://github.com/elemgame/elemgameV2/issues/70

**Labels:** `enhancement`, `testing`, `documentation`, `priority: medium`

Document how to configure and verify the admin dashboard, and add smoke coverage for the critical admin flows.

**Dependencies:** Blocked by https://github.com/elemgame/elemgameV2/issues/62, https://github.com/elemgame/elemgameV2/issues/63, https://github.com/elemgame/elemgameV2/issues/64, https://github.com/elemgame/elemgameV2/issues/65, and https://github.com/elemgame/elemgameV2/issues/68.

**Acceptance Criteria:**
- [ ] `.env.selfhost.example` documents `ADMIN_TELEGRAM_IDS` without real IDs.
- [ ] Self-host docs explain how admin access is granted and how to revoke it.
- [ ] Docs state that empty `ADMIN_TELEGRAM_IDS` disables admin access.
- [ ] Smoke verifies authorized admin can load dashboard.
- [ ] Smoke verifies non-admin cannot load admin data.
- [ ] Smoke verifies a test balance operation updates balance and creates an audit row.
- [ ] Docs warn that quick Cloudflare tunnel URLs are not production-stable for admin access.

## Dependency Order

1. https://github.com/elemgame/elemgameV2/issues/62
2. https://github.com/elemgame/elemgameV2/issues/63
3. https://github.com/elemgame/elemgameV2/issues/64
4. https://github.com/elemgame/elemgameV2/issues/65
5. https://github.com/elemgame/elemgameV2/issues/66, https://github.com/elemgame/elemgameV2/issues/67, https://github.com/elemgame/elemgameV2/issues/69
6. https://github.com/elemgame/elemgameV2/issues/68
7. https://github.com/elemgame/elemgameV2/issues/70
