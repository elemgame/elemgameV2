# Elmental Payments Service

Small Telegram Stars payment service for the Telegram Mini App. It is separate from the legacy Socket.io gameplay server.

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

Without `PAYMENTS_SPACETIME_TOKEN`, successful payments are validated and logged but not credited.
