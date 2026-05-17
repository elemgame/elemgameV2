# Self-Hosting Elmental V2

This runbook brings up a single-host stack for the public test instance without SpacetimeDB Maincloud.

## Scope

The stack contains:

- SpacetimeDB standalone for authoritative gameplay and payment ledger state.
- `apps/payments` for Telegram Stars invoice, webhook, wallet history, and refund endpoints.
- `apps/tma` static frontend.
- Caddy reverse proxy for HTTPS and routing.

This does not migrate Maincloud state by itself. When `PAYMENTS_SPACETIME_TOKEN` is present, Stars payment crediting, wallet history, and refunds use trusted SpacetimeDB reducers and the private payment ledger. Without that token, the payments service falls back to backend SQL crediting plus Telegram `getStarTransactions` for whole-lot refunds; set `PAYMENTS_SQL_TOKEN` so the service can write balance and audit rows. Wallet history still requires the trusted payment-ledger path.

## First Deploy

1. Create env file:

```bash
cp .env.selfhost.example .env.selfhost
```

2. Fill at minimum:

- `PUBLIC_HOST`
- `PUBLIC_ORIGIN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBAPP_URL`
- `PAYMENT_PAYLOAD_SECRET`
- `PAYMENTS_WEBHOOK_SECRET`
- `PAYMENTS_SPACETIME_TOKEN`, or `PAYMENTS_SQL_TOKEN` for the temporary SQL fallback mode
- `ADMIN_TELEGRAM_IDS` for operators that may open `/admin`

3. Build runtime images:

```bash
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml build
```

4. Start runtime services:

```bash
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml up -d spacetimedb payments tma edge
```

5. Publish the SpacetimeDB module without clearing data:

```bash
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml run --rm spacetime-publish
```

For a local host CLI publish instead:

```bash
spacetime publish --server http://localhost:3000 --module-path apps/spacetime/spacetimedb -y "${SPACETIME_DB:-elmental-v2}"
```

## Verification

Payments health:

```bash
curl -s "${PUBLIC_ORIGIN}/health"
```

SpacetimeDB local SQL:

```bash
spacetime sql --server http://localhost:3000 "${SPACETIME_DB:-elmental-v2}" "SELECT COUNT(*) FROM player"
```

Recent game events:

```bash
spacetime sql --server http://localhost:3000 "${SPACETIME_DB:-elmental-v2}" "SELECT id, kind, message FROM game_event ORDER BY id DESC LIMIT 20"
```

Payment ledger check:

```bash
spacetime sql --server http://localhost:3000 "${SPACETIME_DB:-elmental-v2}" "SELECT payment_id, account_id, stars_amount, elm_amount, status FROM payment_ledger ORDER BY updated_at_micros DESC LIMIT 20"
```

Fallback payment receipt check, used only when `PAYMENTS_SPACETIME_TOKEN` is empty:

```bash
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml exec payments sh -c 'tail -20 /data/payment-fallback-ledger.jsonl'
```

Fallback refund eligibility uses Telegram's bot Star transaction history. It only offers whole purchase lots whose Star amount matches the configured ELM packages and whose ELM is still present on the paid balance. Example: a 1 Star purchase can only be refunded while the account still has at least 100 paid ELM.

Admin audit log check:

```bash
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml exec payments sh -c 'tail -20 /data/admin-audit-events.jsonl'
```

Logs:

```bash
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml logs -f spacetimedb
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml logs -f payments
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml logs -f edge
```

## Telegram Setup

Set the Mini App URL to:

```text
https://${PUBLIC_HOST}/
```

Set the payment webhook to:

```text
https://${PUBLIC_HOST}/telegram/webhook
```

Use the same secret value in Telegram webhook configuration and `PAYMENTS_WEBHOOK_SECRET`.

Existing `pnpm telegram:configure` covers the WebApp URL. Webhook setup still needs a dedicated script or an operator `setWebhook` command.

## Admin Console

The admin console is served from:

```text
https://${PUBLIC_HOST}/admin
```

Access is allowed only when the page is opened inside Telegram by a user whose numeric Telegram ID is listed in `ADMIN_TELEGRAM_IDS`. The payments service validates Telegram init data with `TELEGRAM_BOT_TOKEN`, so a plain browser load intentionally shows an access error.

Admins can view activity stats, search accounts, apply credit/debit/set balance operations, and review audit rows. Balance edits are intended for operations and support/debug cases; every successful edit records the admin Telegram ID, target account, previous balance, new balance, and optional reason in the payments service audit log.

## Data Safety

SpacetimeDB state is stored in Docker volume `spacetimedb-data`. The normal publish path does not clear data. Do not use destructive publish/reset commands on production unless the intent is to wipe public test state.

Minimal cold backup:

```bash
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml stop spacetimedb
docker run --rm -v elemgamev2_spacetimedb-data:/data -v "$PWD/backups:/backup" alpine tar czf /backup/spacetimedb-data.tgz -C /data .
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml up -d spacetimedb
```

Restore to a fresh host:

```bash
docker volume create elemgamev2_spacetimedb-data
docker run --rm -v elemgamev2_spacetimedb-data:/data -v "$PWD/backups:/backup" alpine sh -c "cd /data && tar xzf /backup/spacetimedb-data.tgz"
```

## Cutover Checklist

- DNS for `PUBLIC_HOST` points to the deployment host.
- Caddy can serve HTTPS for `PUBLIC_HOST`.
- TMA image was built with `VITE_SPACETIME_URI=${PUBLIC_ORIGIN}` and `VITE_PAYMENTS_URL=${PUBLIC_ORIGIN}`.
- SpacetimeDB module is published to `${SPACETIME_DB}`.
- Telegram WebApp URL points to `https://${PUBLIC_HOST}/`.
- Telegram webhook points to `https://${PUBLIC_HOST}/telegram/webhook`.
- Payment service logs show a successful SpacetimeDB connection.
- Browser smoke confirms the app subscribes to self-hosted SpacetimeDB.
- Telegram smoke confirms invoice open and paid EML crediting.

## Rollback

Rollback means pointing Telegram and frontend config back to the previous known-good origin. It does not automatically migrate balances back. Decide state migration policy before accepting real paid users on self-host.
