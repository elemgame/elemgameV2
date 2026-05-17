# Issues: Self-Hosted SpacetimeDB And Payments Backend

Source PRD: `tasks/prd-self-hosted-spacetime-payments.md`

## 1. Add self-host Docker Compose runtime

GitHub: https://github.com/elemgame/elemgameV2/issues/51

**Labels:** `infra`, `self-host`

Create a single-host Docker Compose stack for SpacetimeDB, payments, TMA frontend, and reverse proxy.

**Acceptance Criteria:**
- [ ] Compose starts `spacetimedb`, `payments`, `tma`, and `edge` services.
- [ ] SpacetimeDB stores data in a named Docker volume.
- [ ] Payments and TMA images build from source Dockerfiles.
- [ ] Reverse proxy routes frontend, `/payments/*`, `/telegram/webhook`, and required SpacetimeDB client endpoints.
- [ ] `.env.selfhost.example` documents all required variables without real secrets.

## 2. Add self-host SpacetimeDB publish/bootstrap workflow

GitHub: https://github.com/elemgame/elemgameV2/issues/52

**Labels:** `infra`, `spacetimedb`

Document and automate publishing the current TypeScript SpacetimeDB module to the self-host server.

**Acceptance Criteria:**
- [ ] Safe publish command targets `${SPACETIME_DB}` on `http://spacetimedb:3000` or `http://localhost:3000`.
- [ ] Default path never clears data.
- [ ] Destructive reset command is documented separately.
- [ ] Verification command confirms tables/reducers are available after publish.

## 3. Implement payments service JWT bootstrap for self-host

GitHub: https://github.com/elemgame/elemgameV2/issues/53

**Labels:** `payments`, `security`, `spacetimedb`

Define and implement the operator flow that creates `PAYMENTS_SPACETIME_TOKEN` for the self-hosted SpacetimeDB instance.

**Acceptance Criteria:**
- [ ] Token has issuer `elmental-payments`, subject `payments-service`, and audience `elmental-v2-payments`.
- [ ] Token is signed by a key trusted by the self-hosted SpacetimeDB runtime.
- [ ] Token generation does not require committing private keys.
- [ ] Invalid/missing token leaves crediting and refunds disabled.
- [ ] Test proves payment reducers reject a normal player token.

## 4. Wire Telegram bot webhook and WebApp configuration to self-host

GitHub: https://github.com/elemgame/elemgameV2/issues/54

**Labels:** `telegram`, `payments`, `infra`

Add operator instructions/scripts for pointing Telegram at the self-hosted frontend and payment webhook.

**Acceptance Criteria:**
- [ ] WebApp URL points to `https://${PUBLIC_HOST}/`.
- [ ] Webhook URL points to `https://${PUBLIC_HOST}/telegram/webhook`.
- [ ] Webhook secret is configured and validated.
- [ ] Existing `telegram:configure` flow is either extended or documented alongside webhook setup.
- [ ] No token values are printed into committed docs or client logs.

## 5. Add self-host deployment and cutover runbook

GitHub: https://github.com/elemgame/elemgameV2/issues/55

**Labels:** `docs`, `infra`

Write a runbook for first deploy, smoke checks, cutover, rollback, and common failure modes.

**Acceptance Criteria:**
- [ ] Runbook covers `.env.selfhost`, build, start, publish, webhook setup, and smoke checks.
- [ ] Runbook separates browser demo `tEML` from Telegram paid EML.
- [ ] Rollback checklist covers DNS, Telegram WebApp URL, and webhook target.
- [ ] Troubleshooting section covers SpacetimeDB down/suspended equivalent, payment token failure, and webhook auth failure.

## 6. Add backup and restore procedure for self-host state

GitHub: https://github.com/elemgame/elemgameV2/issues/56

**Labels:** `ops`, `spacetimedb`

Provide a concrete backup/restore path for the SpacetimeDB data volume.

**Acceptance Criteria:**
- [ ] Backup command exports the SpacetimeDB Docker volume to an operator-controlled artifact.
- [ ] Restore command can populate a fresh host.
- [ ] Post-restore checks include account balance and payment ledger SQL queries.
- [ ] Procedure states how to avoid taking inconsistent backups during writes.

## 7. Add observability and health checks

GitHub: https://github.com/elemgame/elemgameV2/issues/57

**Labels:** `ops`, `infra`

Add basic runtime health visibility for the self-hosted stack.

**Acceptance Criteria:**
- [ ] Payments container healthcheck calls `/health`.
- [ ] Runbook includes `docker compose logs` commands for each service.
- [ ] Runbook includes SQL checks for `game_event`, `match_state`, and `payment_ledger`.
- [ ] Future alerting hooks are identified without blocking the first deployment.

## 8. Add self-host smoke tests

GitHub: https://github.com/elemgame/elemgameV2/issues/58

**Labels:** `testing`, `infra`

Add smoke tests that can target the self-hosted origin and verify frontend, gameplay connection, and payment webhook behavior.

**Acceptance Criteria:**
- [ ] Smoke tests accept `SELFHOST_BASE_URL`, `SELFHOST_SPACETIME_URI`, and `SPACETIME_DB`.
- [ ] Browser smoke verifies the app connects to SpacetimeDB without Maincloud.
- [ ] Payment webhook smoke validates idempotent payment handling with a signed payload.
- [ ] GitHub Actions workflow is manual by default.

## 9. Improve frontend unavailable-backend state

GitHub: https://github.com/elemgame/elemgameV2/issues/59

**Labels:** `frontend`, `spacetimedb`

When SpacetimeDB is unavailable, show a clear retry/backend unavailable state instead of making the user infer failure from zero balance.

**Acceptance Criteria:**
- [ ] Connection failure renders a visible backend-unavailable state on home/match entry screens.
- [ ] User balance is not reset or replaced locally after provider connect failure.
- [ ] Retry action attempts provider initialization again.
- [ ] Verify in browser using Playwright.

## 10. Decide Maincloud state migration policy

GitHub: https://github.com/elemgame/elemgameV2/issues/60

**Labels:** `ops`, `product`

Decide whether self-host starts fresh or imports state from Maincloud, and document the operational consequence.

**Acceptance Criteria:**
- [ ] Decision records whether player balances/payment ledger/matches are migrated.
- [ ] If migration is required, create a follow-up implementation issue with export/import details.
- [ ] If fresh start is accepted, public test messaging and rollback plan reflect that.
