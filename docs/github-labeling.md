# GitHub Labeling Guide

This guide defines the label system for Elmental V2 GitHub issues and pull requests. Agents must use it whenever they create, triage, or edit issues and PRs.

## Required Label Shape

Every active issue or pull request should have:

- one `type:*` label;
- one or more `area:*` labels for the technical slice touched;
- one or more `domain:*` labels for the product/application domain;
- one `priority:*` label for actionable work;
- a `status:*` label only when the work is blocked, deferred, or otherwise not normally actionable.

Use English label names only. Do not mix old unprefixed labels like `frontend`, `backend`, `documentation`, or `enhancement` into new work.

## How Agents Should Apply Labels

When creating an issue:

1. Read the issue title, body, PRD source, and acceptance criteria.
2. Label the work by the requested outcome, not only by the files likely to change.
3. Add all relevant technical areas and product domains.
4. Use the highest justified priority from dependencies, user impact, and release blocking status.
5. If the issue is a parent/tracking issue, use `type: epic`.

When labeling a pull request:

1. Inspect the actual changed files and the PR body.
2. Label the PR by what it really changes, even if the title claims something else.
3. If a PR only edits docs or task files, use `type: docs` even when it references a feature issue.
4. If a PR implements user-facing code and updates docs/tests, keep the implementation type, usually `type: feature` or `type: bug`, and add `area: testing` or `type: docs` only when those are the main purpose.
5. For PRs claiming an issue, include the claimed issue's core `domain:*` labels unless the diff shows a different scope.

Before creating a new label, run:

```bash
gh label list --repo elemgame/elemgameV2 --limit 300
```

Prefer the existing taxonomy. Create a new label only when the current labels cannot describe the work clearly.

## Type Labels

| Label | Color | Use |
|---|---:|---|
| `type: bug` | `#D73A4A` | Broken behavior or regression. |
| `type: feature` | `#A2EEEF` | New capability or product improvement. |
| `type: docs` | `#0075CA` | Documentation, runbooks, PRDs, task files, or written guidance. |
| `type: epic` | `#6A737D` | Parent issue that groups implementation tasks. |
| `type: decision` | `#D4C5F9` | Product, architecture, migration, or policy decision. |

Use at most one primary type in normal cases. If a PR is purely documentation for a feature, use `type: docs`, not `type: feature`.

## Technical Area Labels

| Label | Color | Use |
|---|---:|---|
| `area: frontend` | `#1D76DB` | Telegram Mini App UI, screens, client services, client UX. |
| `area: backend` | `#0E8A16` | Server-side services, APIs, reducers, and data mutations. |
| `area: spacetime` | `#5319E7` | SpacetimeDB schema, reducers, subscriptions, generated bindings, publish flow. |
| `area: infrastructure` | `#BFD4F2` | Deployment, CI/CD, runtime, hosting, Docker, operations tooling. |
| `area: testing` | `#2EA44F` | Automated tests, smoke tests, scenario tests, test harnesses. |
| `area: architecture` | `#6F42C1` | System boundaries, provider contracts, module ownership, ADR-like work. |
| `area: blockchain` | `#7B61FF` | Smart contracts, on-chain integrations, chain tooling, settlement chain work. |

Use multiple `area:*` labels when the work crosses boundaries. For example, an admin search UI backed by a payment-service API should use both `area: frontend` and `area: backend`.

## Product Domain Labels

| Label | Color | Use |
|---|---:|---|
| `domain: gameplay` | `#E4E669` | Matchmaking, match flow, moves, energy, rounds, timeouts, player gameplay. |
| `domain: admin` | `#D93F0B` | Admin dashboard, operator controls, admin auth, admin audit. |
| `domain: economy` | `#FBCA04` | ELM/tELM balances, entry fees, Season Points, ledger, rewards. |
| `domain: payments` | `#0E8A16` | Telegram Stars, payment webhooks, refunds, paid balance flow. |
| `domain: telegram` | `#1D76DB` | Telegram Mini App, bot commands, WebApp URL, Telegram identity. |
| `domain: self-hosting` | `#BFD4F2` | Self-hosted deployment, cutover, backup, restore, runtime setup. |
| `domain: operations` | `#6A737D` | Runbooks, observability, migration policy, incident handling, support flows. |
| `domain: security` | `#B60205` | Auth, secrets, trust boundaries, permissions, abuse resistance. |
| `domain: player-accounts` | `#C5DEF5` | Player identity, account lookup, profile state, account targeting. |
| `domain: settlement` | `#7B61FF` | On-chain settlement, escrow, replay hash, payouts, token flow. |
| `domain: ai-dev` | `#5319E7` | AI-assisted development workflow, context, guardrails, evals. |

Domains describe the application concern, not the code location. For example, a backend endpoint for admin user lookup is `domain: admin` and `domain: player-accounts`.

## Priority Labels

| Label | Color | Use |
|---|---:|---|
| `priority: critical` | `#B60205` | Must be done first, blocks other critical work, or prevents safe release. |
| `priority: high` | `#D93F0B` | Important for MVP/current milestone or high user/operator impact. |
| `priority: medium` | `#FBCA04` | Useful or expected, but not a direct blocker. |

Do not use priority as severity theater. If the work is deferred blockchain settlement, it can be important but still `priority: medium` with `status: deferred`.

## Status Labels

| Label | Color | Use |
|---|---:|---|
| `status: blocked` | `#B60205` | Blocked by an external dependency, secret, account setup, or previous task. |
| `status: deferred` | `#C5DEF5` | Deliberately postponed until the current active milestone is stable. |

Use `status: deferred` for future blockchain settlement issues unless the user explicitly reactivates blockchain work.

## Legacy GitHub Labels

These standard labels may remain available but should be used sparingly:

- `duplicate`
- `good first issue`
- `help wanted`
- `invalid`
- `question`
- `wontfix`

Do not use them as substitutes for `type:*`, `area:*`, `domain:*`, and `priority:*`.

## Common Examples

Admin user search UI:

```text
type: feature
area: frontend
domain: admin
domain: player-accounts
priority: high
```

Admin user search API:

```text
type: feature
area: backend
domain: admin
domain: player-accounts
priority: high
```

Self-host Docker Compose runtime:

```text
type: feature
area: infrastructure
area: backend
area: frontend
area: spacetime
domain: self-hosting
domain: operations
domain: payments
domain: telegram
priority: high
```

Telegram Stars refund bug:

```text
type: bug
area: backend
area: testing
domain: payments
domain: economy
domain: security
priority: high
```

Future on-chain settlement task:

```text
type: feature
area: blockchain
domain: settlement
domain: economy
priority: medium
status: deferred
```

AI development rails epic:

```text
type: epic
area: architecture
area: infrastructure
area: testing
domain: ai-dev
priority: high
```

Docs-only PR that references a frontend issue:

```text
type: docs
area: frontend
area: architecture
domain: admin
domain: player-accounts
priority: high
```

## Review Checklist

Before finishing issue or PR triage, verify:

- no old unprefixed replacement labels were added;
- at least one `area:*` and one `domain:*` label are present;
- the `type:*` label matches the actual work;
- the priority matches the current milestone, not historical importance;
- blocked/deferred state is explicit when relevant.
