# Project North Star

Status: canonical alignment brief, 2026-05-19.

This document is the decision filter for the product direction. It is not a project
overview, PRD, runbook, or package map. Use it to check whether code,
requirements, research, issues, PRs, and reviews still serve the same goal.

Use `docs/about-project.md` for package layout, reducer lists, match flow, and
commands. Use this brief for purpose, priorities, non-goals, and deviation
checks.

If an older document conflicts with this brief, treat the older document as
legacy unless the user explicitly revives it.

## North Star

Elmental is a PvP dApp game intended to work across a multi-blockchain
infrastructure. Telegram Mini App, future Devvit by Reddit surfaces, web
clients, and other embedded apps are entry points into the same game, not the
product definition.

The current Telegram entry point must become production-ready for real user
mechanics testing before the project enables blockchain settlement or full P2E
rewards.

The current product must prove four things:

- real users can reliably find and play real opponents;
- the game is skill-expressive, understandable, and worth replaying;
- balances, payments, refunds, and admin corrections are controlled by backend
  state, not frontend guesses;
- the economy avoids player-funded wager mechanics while leaving a path to later
  full P2E rewards.

## Current Phase

The active phase is a public mechanics-testing instance.

Priority order:

1. Make the game playable and stable for real users in the current Telegram
   entry point.
2. Keep matchmaking, match state, balances, and settlement server-authoritative.
3. Keep Telegram Stars purchases and refunds reliable and auditable.
4. Add admin/support tools for users, balances, payments, events, and disputes.
5. Improve retention through Season Points, rating, leagues, quests, and clear
   progression.
6. Prepare the architecture for future reward pools and payouts without enabling
   them prematurely.

Non-priorities for the current phase:

- blockchain settlement;
- token launch;
- user-to-user balance transfers;
- player-funded prize pools;
- AI opponents in public matchmaking;
- marketing claims about cash earnings.

## Stable Game Intent

The game is strategic Rock-Paper-Scissors with energy, enhanced moves, hidden
information, and optional variance through game modes.

Preserve the existing move matrix, energy costs, first-to-3 match structure,
commit/reveal flow, and real-user move choice unless a new explicit product
decision changes them.

Any change to the outcome matrix, energy economy, score target, or move timing
must update shared logic, backend logic, tests, and docs together.

## Economy Direction

Current production economy is Play-and-Earn, not full Play-to-Earn.

Rules:

- The current Telegram production entry point lets users buy paid `ELM` through
  Telegram Stars at `1 XTR = 100 ELM`.
- Test and demo environments use demo-only `tELM` regardless of entry point.
- A match spends a fixed entry fee, currently `50 ELM` in paid environments or
  `50 tELM` in test/demo environments.
- Winners earn rating and Season Points, not the opponent's paid ELM.
- Season Points are progression, not money. They are not refundable and not
  convertible to Stars.
- Refunds apply only to unused purchased paid ELM lots backed by Stars payments.
- Bonus credits, if added, must be non-refundable unless a later legal/product
  decision says otherwise.

Forbidden in the current production economy:

- `winnerPayout = stake * 2 - rake`;
- rake on paid PvP matches;
- winner takes opponent balance;
- cash-out language for Season Points;
- frontend-created balance corrections;
- refunding earned rewards as Stars.

## Future P2E Direction

Full P2E is a later phase. It must not be implemented by restoring stake pools.

Valid future P2E shape:

- external-value rewards come from a separate pre-funded reward pool;
- reward pools have explicit sources of funds and finite budgets;
- campaigns, seasons, quests, or tournaments allocate reward points;
- claimable rewards pass eligibility, region, age, KYC, abuse, and payout checks;
- payout providers are backend-only adapters;
- entry fees do not automatically fund per-match prizes.

Use `tasks/prd-full-play-to-earn.md` as the planning document for that phase.
Until its gates are satisfied, the product may show Season Points and simulated
reward progress, but must not promise redeemable earnings.

## Boundary Rules

Active multiplayer gameplay uses SpacetimeDB as the authoritative backend.

Hard boundaries:

- SpacetimeDB owns real matchmaking, match state, settlement, balances, round
  results, and game events.
- Entry points such as Telegram Mini App, web, and future Devvit by Reddit
  surfaces must share the same backend-authoritative game and economy model
  instead of forking gameplay rules per platform.
- The frontend renders subscribed state and calls backend reducers through the
  gameplay provider; it does not settle matches or invent authoritative
  balances.
- Telegram payments, refunds, admin auth, and payout-like flows stay on backend
  services.
- Legacy Node server and blockchain contracts stay out of active gameplay unless
  the user explicitly changes the architecture direction.

Future rewards, payout providers, KYC, sanctions, and tax state should live
behind private backend APIs. Do not put sensitive payout or compliance state in
public replicated gameplay tables.

## Agent Alignment Checklist

Before generating code, requirements, research, issues, or reviews, check:

- Does this help the current phase, or is it clearly marked as future-phase work?
- Does it preserve server-authoritative gameplay and balances?
- Does it avoid reintroducing stake-pool, rake, or winner-takes-opponent-funds
  settlement?
- Does it keep paid ELM, test/demo tELM, Season Points, reward points, and
  claimable rewards separate?
- Does it avoid unsupported earning, cash-out, investment, or gambling language?
- Does it keep secrets, admin auth, payment webhooks, and payout providers on the
  backend?
- Does it use the gameplay provider boundary instead of letting screens read SDK
  state directly?
- Does it add or update tests for the behavior it changes?
- Does it update generated bindings after SpacetimeDB schema or reducer changes?
- Does it include a verification path that can be run locally or in CI?

If the answer is unclear, mark the work as a risk or open question. Do not hide
the uncertainty in confident implementation language.

## Deviation Triggers

Stop and re-evaluate if a proposal does any of the following:

- routes active multiplayer through the legacy Node server;
- uses SpacetimeDB connection identity as the durable user account;
- lets the frontend debit, credit, or reset real balances;
- adds an AI opponent to public matchmaking;
- auto-chooses real user moves;
- changes the move matrix in only one place;
- commits tokens, `.env` files, logs, or local tunnel artifacts;
- exposes admin tools without server-side Telegram authorization;
- changes balances without an audit trail;
- turns Season Points into refundable or redeemable value;
- adds full P2E payouts without reward pool, eligibility, anti-abuse, and legal
  gates;
- removes production-readiness docs and replaces them with TODO stubs.

## Canonical References

- Agent operating rules: `AGENTS.md`
- Project overview: `docs/about-project.md`
- SpacetimeDB module rules: `apps/spacetime/AGENTS.md`
- Current economy PRD: `tasks/prd-play-and-earn-economy.md`
- Future full P2E PRD: `tasks/prd-full-play-to-earn.md`
- Self-hosting plan: `docs/self-hosting.md`
- Telegram launch: `docs/telegram-launch.md`
- Label taxonomy: `docs/github-labeling.md`
