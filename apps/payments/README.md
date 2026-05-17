# Elmental Payments Service

Small Telegram Stars payment service for the Telegram Mini App. It is separate from the legacy Socket.io gameplay server.

## Endpoints

- `GET /health`
- `GET /payments/stars/packages`
- `POST /payments/stars/invoice`
- `POST /payments/stars/refund/quote`
- `POST /payments/stars/refund`
- `POST /payments/wallet/history`
- `POST /telegram/webhook`

## Required Environment

- `TELEGRAM_BOT_TOKEN`: Telegram bot token used for `createInvoiceLink` and `answerPreCheckoutQuery`.
- `PAYMENT_PAYLOAD_SECRET`: HMAC secret for compact invoice payloads.
- `PAYMENTS_WEBHOOK_SECRET`: optional Telegram webhook secret token checked against `x-telegram-bot-api-secret-token`.

## SpacetimeDB Crediting

Set these variables to enable server-authoritative ELM crediting after `successful_payment` updates:

- `PAYMENTS_SPACETIME_URI`: defaults to `https://maincloud.spacetimedb.com`.
- `PAYMENTS_SPACETIME_DB`: defaults to `elmental-v2`.
- `PAYMENTS_SPACETIME_TOKEN`: SpacetimeDB auth token/JWT for the payment service connection.

The SpacetimeDB module accepts `record_stars_payment` only when the caller has a JWT with:

- issuer: `elmental-payments`
- subject: `payments-service`
- audience containing: `elmental-v2-payments`

Without `PAYMENTS_SPACETIME_TOKEN`, the self-host stack can use the SQL fallback path. Set `PAYMENTS_SQL_TOKEN` to a local SpacetimeDB bearer token so the payments service can credit/debit `account` and `player` balances and write admin audit rows. In this mode, refund eligibility is reconstructed from Telegram `getStarTransactions`, so only whole paid ELM lots still covered by the current balance can be refunded.

Refunds are intentionally whole-lot only. Telegram's Bot API refunds by original
`telegram_payment_charge_id`, not by arbitrary partial Star amount, so a partially
spent purchase lot is not refundable.

## Operator Ledger Queries

`payment_ledger` is private to SpacetimeDB clients, but operators can query it through
SpacetimeDB SQL when debugging payments:

```bash
spacetime sql --server maincloud elmental-v2 "SELECT payment_id, account_id, telegram_user_id, stars_amount, elm_amount, status, created_at_micros, updated_at_micros FROM payment_ledger WHERE telegram_user_id = '123456789'"
spacetime sql --server maincloud elmental-v2 "SELECT payment_id, account_id, telegram_user_id, stars_amount, elm_amount, status, created_at_micros, updated_at_micros FROM payment_ledger WHERE account_id = 'telegram:123456789'"
spacetime sql --server maincloud elmental-v2 "SELECT payment_id, account_id, telegram_user_id, stars_amount, elm_amount, status, created_at_micros, updated_at_micros FROM payment_ledger WHERE payment_id = 'purchase_id'"
spacetime sql --server maincloud elmental-v2 "SELECT payment_id, account_id, telegram_user_id, stars_amount, elm_amount, status, created_at_micros, updated_at_micros FROM payment_ledger WHERE telegram_payment_charge_id = 'telegram_charge_id'"
```

Do not paste bot tokens, raw WebApp init data, invoice payloads, or charge IDs into
client-side bug reports.
