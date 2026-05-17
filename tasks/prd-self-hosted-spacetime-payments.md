# PRD: Self-Hosted SpacetimeDB And Payments Backend

## Introduction

Move the public Elmental V2 test instance from SpacetimeDB Maincloud to an operator-controlled self-hosted stack. Maincloud can suspend the database and block both Telegram and browser users; the game also needs a backend that can safely receive Telegram Stars payment callbacks and credit paid EML through server-authoritative SpacetimeDB reducers.

The target stack is a single-host deployment first: SpacetimeDB for authoritative gameplay state, a separate payments service for Telegram Stars invoice/webhook/refund flows, a static TMA frontend, and a reverse proxy with TLS.

## Goals

- Restore public gameplay without depending on SpacetimeDB Maincloud availability.
- Keep SpacetimeDB as the authoritative gameplay backend; do not revive the legacy Socket.io server for active multiplayer.
- Serve the TMA, SpacetimeDB public client endpoints, and payments API under one HTTPS origin.
- Receive Telegram Stars webhooks on a backend service, validate payloads, and credit EML via SpacetimeDB reducers.
- Keep secrets out of the frontend, repository, issue bodies, and client-side bug reports.
- Provide a repeatable Docker Compose path for local rehearsal and production single-node deployment.
- Define the remaining work as clear implementation issues with testable acceptance criteria.

## User Stories

### US-001: Run The Core Stack With Docker Compose
**Description:** As an operator, I want to start SpacetimeDB, payments, frontend, and proxy services with Docker Compose so that the app can run on infrastructure I control.

**Acceptance Criteria:**
- [ ] `docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml up -d` starts the declared runtime services.
- [ ] SpacetimeDB data is persisted in a named Docker volume.
- [ ] Frontend and payments images build from repo source, not from committed `dist/` artifacts.
- [ ] Reverse proxy routes frontend, payments API, Telegram webhook, and required SpacetimeDB client endpoints.

### US-002: Publish The SpacetimeDB Module To Self-Hosted Runtime
**Description:** As an operator, I want a documented bootstrap command so that the current TypeScript SpacetimeDB module is published to the self-hosted database.

**Acceptance Criteria:**
- [ ] A bootstrap command publishes `apps/spacetime/spacetimedb` to `${SPACETIME_DB}` on the self-hosted server.
- [ ] The command does not delete existing data by default.
- [ ] A separate destructive reset path is documented only for intentional test resets.
- [ ] Operator can verify the module with `spacetime sql` against the self-host endpoint.

### US-003: Serve The Public TMA From The Self-Hosted Origin
**Description:** As a player, I want the browser and Telegram Mini App versions to connect to the self-hosted SpacetimeDB endpoint so that gameplay works when Maincloud is down.

**Acceptance Criteria:**
- [ ] Frontend build accepts `VITE_SPACETIME_URI`, `VITE_SPACETIME_DB`, `VITE_PAYMENTS_URL`, and `VITE_BOT_FALLBACK_SECONDS` from Docker build args.
- [ ] Browser users use demo `tEML`; Telegram users use paid EML where applicable.
- [ ] TMA production build uses `/` base path for a custom domain.
- [ ] Verify in browser using Playwright against the self-hosted origin.

### US-004: Receive Telegram Stars Payments
**Description:** As a Telegram player, I want the app to open a Stars invoice and receive EML after payment so that paid balance is usable in PvP.

**Acceptance Criteria:**
- [ ] Payments service exposes invoice, webhook, refund quote, refund, and wallet history endpoints behind HTTPS.
- [ ] `TELEGRAM_BOT_TOKEN`, `PAYMENT_PAYLOAD_SECRET`, and webhook secret are read only from server env.
- [ ] Telegram webhook verifies `x-telegram-bot-api-secret-token` when configured.
- [ ] Successful payment updates call `record_stars_payment` exactly once per Telegram charge ID.

### US-005: Authorize The Payments Service Against Self-Hosted SpacetimeDB
**Description:** As an operator, I need a reproducible way to issue the payments service token so that only the backend can call payment reducers.

**Acceptance Criteria:**
- [ ] A documented token bootstrap flow creates `PAYMENTS_SPACETIME_TOKEN`.
- [ ] Token claims include issuer `elmental-payments`, subject `payments-service`, and audience `elmental-v2-payments`.
- [ ] Token is signed by a key trusted by the self-hosted SpacetimeDB instance.
- [ ] Payments service fails closed for crediting/refunds when the token is missing or invalid.

### US-006: Configure Telegram Bot Web App And Webhook
**Description:** As an operator, I want explicit Telegram setup steps so that the bot launches the self-hosted TMA and sends payment updates to the payments service.

**Acceptance Criteria:**
- [ ] `TELEGRAM_WEBAPP_URL` points to the self-hosted HTTPS frontend.
- [ ] Telegram payment webhook points to `/telegram/webhook`.
- [ ] Webhook secret in Telegram matches `PAYMENTS_WEBHOOK_SECRET`.
- [ ] No bot token is stored in git or shown in client logs.

### US-007: Back Up And Restore Persistent State
**Description:** As an operator, I need backup and restore instructions so that self-hosting does not make user balances and match state disposable.

**Acceptance Criteria:**
- [ ] SpacetimeDB data volume backup command is documented.
- [ ] Restore path is documented and tested on a fresh host.
- [ ] Backup procedure includes payment ledger state.
- [ ] Restore procedure includes a post-restore smoke checklist.

### US-008: Observe Runtime Health
**Description:** As an operator, I want basic health checks and logs so that failures are visible before users report a dead app.

**Acceptance Criteria:**
- [ ] Payments service has a Docker healthcheck using `/health`.
- [ ] Runbook includes commands for proxy, payments, and SpacetimeDB logs.
- [ ] Runbook includes SQL checks for recent payment ledger and match events.
- [ ] Future alerting hooks are identified without blocking the single-host MVP.

### US-009: Verify The Self-Hosted Stack
**Description:** As a developer, I want smoke tests for the self-hosted deployment so that infra changes do not silently break Telegram or web users.

**Acceptance Criteria:**
- [ ] Local smoke can target `SELFHOST_BASE_URL`, `SELFHOST_SPACETIME_URI`, and `${SPACETIME_DB}`.
- [ ] Mock payment webhook test validates idempotent ledger crediting.
- [ ] Browser smoke verifies frontend renders a non-zero playable state after SpacetimeDB subscription.
- [ ] CI job is manual by default to avoid mutating production self-host data on every push.

### US-010: Cut Over From Maincloud
**Description:** As an operator, I want a safe migration checklist so that users are not pointed at a half-configured backend.

**Acceptance Criteria:**
- [ ] Cutover checklist covers DNS, TLS, frontend build env, Telegram WebApp URL, Telegram webhook, and smoke tests.
- [ ] Rollback path points the Telegram bot and static frontend back to the previous known-good target.
- [ ] Maincloud suspension is treated as an external dependency failure, not as a frontend bug.

## Functional Requirements

- FR-1: The self-host stack must expose SpacetimeDB on the internal Docker network as `http://spacetimedb:3000`.
- FR-2: The public reverse proxy must expose only the SpacetimeDB endpoints required by browser/TMA clients, not broad operator SQL/admin access.
- FR-3: The TMA image must be built with `VITE_GAME_TRANSPORT=spacetime`.
- FR-4: The TMA image must use a configurable `VITE_SPACETIME_URI` and `VITE_SPACETIME_DB`.
- FR-5: The TMA image must use a configurable `VITE_PAYMENTS_URL`.
- FR-6: The payments service must use internal `PAYMENTS_SPACETIME_URI=http://spacetimedb:3000` by default in self-host compose.
- FR-7: The payments service must not credit EML without a valid `PAYMENTS_SPACETIME_TOKEN`.
- FR-8: The payment reducer authorization claims must stay explicit and auditable.
- FR-9: The compose stack must keep SpacetimeDB data in a named persistent volume.
- FR-10: Deployment docs must separate safe publish from destructive reset.
- FR-11: Deployment docs must include Telegram webhook and WebApp configuration.
- FR-12: Deployment docs must include smoke checks for frontend, SpacetimeDB, payments health, and payment ledger.

## Non-Goals

- No Kubernetes, multi-region, or managed database orchestration in the first version.
- No blockchain settlement work.
- No revival of `apps/server` as the active multiplayer path.
- No client-side GitHub tokens or client-side payment secrets.
- No automatic migration of existing Maincloud state until the backup/export path is explicitly designed.
- No attempt to bypass Telegram Stars refund constraints; refunds remain whole-lot based.

## Design Considerations

- Keep public frontend and API on one HTTPS origin when possible. This reduces CORS and Telegram WebView edge cases.
- The web version remains a demo using `tEML`; Telegram paid users use paid EML credited from Stars payments.
- Operational copy should be honest: if SpacetimeDB is unavailable, the app should show backend unavailable/retry state rather than implying the user has zero balance.

## Technical Considerations

- SpacetimeDB reducers remain deterministic. Payment network calls stay in `apps/payments`.
- Existing `record_stars_payment`, `reserve_stars_refund`, `record_stars_refund`, and `cancel_stars_refund` reducers are the authority for paid EML ledger state.
- The critical unresolved self-host detail is JWT issuance. The payments service currently needs a JWT whose claims match `elmental-payments` / `payments-service` / `elmental-v2-payments` and whose signature is trusted by the self-hosted SpacetimeDB instance.
- The initial compose file should be treated as a single-host MVP. Production hardening still needs backup automation, alerting, resource limits, and secret management.

## Success Metrics

- Browser and Telegram clients can connect to the self-hosted SpacetimeDB endpoint for 24 hours without Maincloud.
- A valid Telegram Stars payment credits paid EML exactly once in the SpacetimeDB ledger.
- Self-host deployment can be reproduced from a fresh checkout with documented commands.
- Recovery from a stopped SpacetimeDB container preserves balances and payment ledger rows.
- Operator can diagnose "frontend up, backend down" within five minutes using documented checks.

## Open Questions

- Which production domain will host the self-hosted stack?
- Will the first production host use direct public Caddy TLS or sit behind Cloudflare/nginx?
- What secret manager will hold `TELEGRAM_BOT_TOKEN`, `PAYMENT_PAYLOAD_SECRET`, `PAYMENTS_WEBHOOK_SECRET`, and `PAYMENTS_SPACETIME_TOKEN`?
- Should Maincloud state be exported/imported, or is the self-hosted instance allowed to start with fresh public-test state?
- What exact JWT bootstrap path should be used for self-host: SpacetimeDB key files, an internal issuer service, or a one-shot operator script?
