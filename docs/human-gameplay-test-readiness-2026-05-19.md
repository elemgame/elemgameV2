# Ревизия готовности нового gameplay к тестированию на людях

Дата: 2026-05-19  
Ветка: `main`  
Последний проверенный push перед этой ревизией: `6aaea56`

## Вердикт

Новый gameplay готов к контролируемому human playtest с небольшой группой
приглашенных игроков. Он не готов к широкому публичному paid launch и не готов к
production self-host cutover без закрытия операционных задач.

Допустимый формат теста сейчас:

- 5-10 приглашенных игроков;
- один оператор смотрит логи и платежи во время сессии;
- Telegram Stars можно тестировать малыми суммами;
- баги собираются через встроенный report flow и ручные SQL/log checks;
- без маркетингового трафика, турниров, cash-out обещаний и blockchain narrative.

## Проверенный продуктовый контур

Текущий активный контур:

- `apps/tma`: React/Vite Telegram Mini App.
- `apps/spacetime/spacetimedb`: server-authoritative gameplay backend.
- `apps/payments`: Telegram Stars invoices, webhook, refund/history/admin support.
- `packages/shared`: общие правила, economy constants и matrix parity.

Текущий economy mode:

- production default: `entry_fee_season_points`;
- paid match cost: fixed `50 ELM` entry fee;
- Stars rate: stable `1 XTR = 100 ELM`;
- winner does not receive opponent paid ELM;
- match settlement awards rating and Season Points;
- refund is limited to unused eligible purchased ELM lots;
- test/demo environments use demo `tELM` regardless of entry point;
- blockchain settlement is deferred.

## Что было противоречивым

До этой ревизии в репозитории одновременно жили три разных языка продукта:

- current Play-and-Earn: entry fee, Season Points, no player-funded prize pool;
- старый Stars PRD: paid ELM usable in PvP stakes, payout, draw refund, winnings;
- исторический blockchain spec: escrow, rake, winner payout, on-chain settlement.

Это создавало риск, что новый PR, README или support copy случайно вернет
gambling-like модель под другим названием. В этой ревизии активные PRD и docs
зафиксированы так:

- Stars PRD помечен как superseded by Play-and-Earn и переведен на entry-fee
  terminology.
- Исторический blockchain spec помечен как legacy context, не current production
  guidance.
- Self-host/PostgreSQL анализ больше не описывает payout/rake как целевой paid
  settlement.
- Admin PRD/issues больше не требуют bot fallback metric как нормальную механику.
- Docker default для TMA bot fallback выставлен в `0`.

Технический debt остается: в schema и generated bindings еще есть поле `stake`.
Сейчас оно используется как legacy technical name для `entryFee`. Переименование
поля потребует schema migration и regenerated bindings, поэтому это не нужно
делать прямо перед human playtest.

## Готовность к тесту

Можно тестировать:

- real matchmaking by room;
- commit/reveal move flow;
- round resolution and score-to-win;
- reconnect/refresh tolerance;
- paid Stars top-up in Telegram;
- balance rendering after refresh;
- fixed 50 ELM match entry fee;
- Season Points after win/loss/draw;
- no paid ELM transfer from loser to winner;
- refund quote/rejection for spent or non-refundable ELM;
- test/demo `tELM` flow without Stars controls;
- admin/support lookup and audited balance operations where available.

Нельзя считать готовым:

- broad public production launch;
- self-host migration as the only production backend;
- legal-safe paid tournaments or sponsored rewards;
- blockchain/token settlement;
- guaranteed instant support without operator presence;
- PR #81 as mergeable product documentation.

## Evidence

Latest pushed `main` evidence before this cleanup:

- CI green for `6aaea56`: https://github.com/elemgame/elemgameV2/actions/runs/26080859316
- GitHub Pages deploy green for `6aaea56`: https://github.com/elemgame/elemgameV2/actions/runs/26080859358
- Play-and-Earn implementation issues #72-#80 are closed.
- Current open self-host issues #51-#60 remain operational follow-up work.
- Current open admin/support issues #61-#70 remain follow-up work, even if parts
  already exist in code.
- PR #81 is still open with `CHANGES_REQUESTED` and `maintainerCanModify=false`,
  so it cannot be corrected directly by this agent.

This revision still needs CI after push because it touches admin stats typing and
TMA Docker defaults.

## Human Playtest Go Checklist

Run this before inviting testers:

```bash
spacetime build --module-path apps/spacetime/spacetimedb
pnpm --filter @elmental/shared build
pnpm --filter @elmental/shared test -- run
pnpm test:matrix-parity
pnpm --filter @elmental/payments test
pnpm --filter @elmental/payments build
pnpm --filter @elmental/tma test -- run
pnpm --filter @elmental/tma build
pnpm smoke:payments-ui
```

Run public smokes manually against the deployed URL before the scheduled session:

```bash
pnpm exec playwright install chromium
pnpm smoke:public-match
pnpm smoke:public-timeouts
```

Telegram/payment env must be configured outside git:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBAPP_URL`
- `VITE_PAYMENTS_URL`
- `PAYMENT_PAYLOAD_SECRET`
- `PAYMENTS_WEBHOOK_SECRET`
- `ADMIN_TELEGRAM_IDS`
- `PAYMENTS_SPACETIME_TOKEN` or the documented temporary SQL fallback token for
  self-host only

For the public cloud playtest, do not run `pnpm stdb:publish:clear`.

## Test Scenarios

Scenario 1: web demo match

- Two browser users select the same room.
- Both reach match screen.
- Both submit commit/reveal moves manually.
- Result screen appears without local winner calculation artifacts.
- Balances show `tELM`, not paid `ELM`.

Scenario 2: Telegram Stars top-up

- Telegram user buys `1 XTR`.
- Payment ledger records the charge.
- Player balance becomes `+100 ELM` exactly once.
- Refresh does not reset the displayed balance to `0`.

Scenario 3: paid entry-fee match

- Two Telegram users each have at least `50 ELM`.
- A real match starts in the same room.
- Each user pays exactly `50 ELM`.
- Winner receives Season Points and rating change, but no opponent-funded paid
  ELM.
- Loser loses no more than the entry fee plus any explicitly enabled boost cost.

Scenario 4: refresh/reconnect

- Refresh during queue, during match, and after settlement.
- User returns to the correct active/latest match or final result.
- No duplicate active match is created for the same account.

Scenario 5: refund boundary

- User with unused purchased `100 ELM` can request an eligible refund quote.
- User who spent part of the purchased lot on entry fees does not get a generic
  cash-out promise.
- Backend rejects or limits refund according to refundable lot state.

Scenario 6: support trace

- Operator can explain a user's balance from `balance_event`, `payment_ledger`,
  `match_state`, and `game_event`.
- A failed payment or refund has a visible operational event without exposing
  secrets.

## Live Monitoring

Useful commands during the playtest:

```bash
spacetime logs --server maincloud elmental-v2
spacetime sql --server maincloud elmental-v2 "SELECT id, kind, message, details FROM game_event ORDER BY id DESC LIMIT 30"
spacetime sql --server maincloud elmental-v2 "SELECT id, room, phase, status, current_round, p1_score, p2_score, economy_model FROM match_state ORDER BY id DESC LIMIT 20"
spacetime sql --server maincloud elmental-v2 "SELECT account_id, balance_kind, balance, season_points FROM account ORDER BY updated_at_micros DESC LIMIT 20"
spacetime sql --server maincloud elmental-v2 "SELECT account_id, delta, reason_kind, related_id FROM balance_event ORDER BY id DESC LIMIT 30"
```

Stop the session if any of these appear:

- paid winner payout or `match.draw_rake` in production match events;
- user balance resets to `0` after refresh while account table has a non-zero
  balance;
- payment ledger says successful/credited but account balance was not updated;
- more than one active match exists for one account;
- scheduler auto-picks a move for a real user;
- UI shows `Rake`, `Winner Payout`, `Total Pool`, `Bet`, or cash-out language;
- bug reports miss `matchId`, economy mode, score, phase, or recent server events.

## Open Risks

Self-host remains the largest production risk. Issues #51-#60 are still open, so
the current human test should treat cloud SpacetimeDB as the active backend
unless a separate self-host rehearsal passes backup/restore, payment credit,
refund, bot webhook, and public smoke checks.

Admin/support is partially present, but issues #61-#70 are still open. For this
test, keep a technical operator in the loop and do not rely on the admin UI as
the only source of truth.

PR #81 should not be merged as-is. It conflicts with the current product vector
by describing stake/payout era responsibilities and by omitting the active
balance event and Season Points model. Because maintainer edits are disabled,
the practical path is for the PR author to rebase and apply the corrected
terminology from `main`.

## Decision

Go for a small controlled human playtest after the verification commands and
manual public smokes pass on the post-cleanup commit.

No-go for broad public paid launch until self-host operations, support/admin
flows, and public smoke automation are stronger.
