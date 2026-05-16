# ELMENTAL

[![CI](https://github.com/elemgame/elemgameV2/actions/workflows/ci.yml/badge.svg)](https://github.com/elemgame/elemgameV2/actions/workflows/ci.yml)
[![Deploy TMA to GitHub Pages](https://github.com/elemgame/elemgameV2/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/elemgame/elemgameV2/actions/workflows/deploy-pages.yml)
[![Public Multiplayer Smoke](https://github.com/elemgame/elemgameV2/actions/workflows/public-smoke.yml/badge.svg)](https://github.com/elemgame/elemgameV2/actions/workflows/public-smoke.yml)
[![Public Timeout Smoke](https://github.com/elemgame/elemgameV2/actions/workflows/public-timeout-smoke.yml/badge.svg)](https://github.com/elemgame/elemgameV2/actions/workflows/public-timeout-smoke.yml)

### Strategic PvP on Blockchain. Not luck. Pressure.

---

> Rock-Paper-Scissors sounds simple.
> Add energy economy, hidden information, and real stakes —
> now you're playing poker with elements.

---

## The Problem

Web3 gaming is stuck between two extremes:

**Casino games** — pure RNG, zero skill, players leave when luck runs out.
**Complex games** — high barrier to entry, months of development, fragmented audience.

There's a gap: **a game simple enough to learn in 30 seconds, deep enough to master over months, with real economic stakes that reward skill over time.**

## The Solution

**Elmental** transforms Rock-Paper-Scissors from a children's game into a strategic battlefield.

Three innovations make this possible:

### 1. Energy Economy

Every match starts with **100 energy**. Every move costs energy. You don't just pick rock, paper, or scissors — you manage a budget.

```
Basic moves:     10 energy  (Earth, Fire, Water)
Enhanced moves:  25 energy  (Earth+, Fire+, Water+)
```

Enhanced moves **flip your weakness**. Earth normally loses to Fire, but Earth+ **beats** Fire. The trade-off: 2.5x the energy cost.

**This creates a decision tree, not a coin flip.**

Should you play it safe with basic moves and conserve energy? Or go all-in with an enhanced move to flip the matchup? Your opponent sees your energy level — they know when you're running low.

### 2. Hidden Information (The Mind Game)

You see your exact energy. Your opponent sees only:

```
LOW  (0-33)   — vulnerable, likely conserving
MED  (34-66)  — could go either way
HIGH (67-100) — has resources for big plays
```

Three rounds of enhanced moves in a row? Your opponent knows you're probably LOW. They'll play basic — cheap and effective against someone who can't afford to enhance.

Unless that's exactly what you want them to think.

**This is poker with elements. You're not guessing — you're reading.**

### 3. Overclock (Controlled Chaos)

Out of energy but need to win this round? **Go into overclock.**

Play a move you can't afford. Your energy goes negative. But:

- **30% chance** your move gets randomized (the chaos tax)
- **Zero regen** next round (the recovery cost)

You choose when to risk it. The game doesn't force randomness on you — you invite it when the stakes are right. Round 5, score 2-2, opponent on LOW energy? That's when overclock turns a losing position into a winning gamble.

### 4. Real Stakes on Blockchain

Every match has a **100 ELM stake**. Winner takes the pool minus 5% rake. This isn't play money — it's on Acki Nacki blockchain with verifiable settlement.

Optional **Energy Boost**: invest 10% of your stake for +20 starting energy. If you win, your boost comes back. If you lose, it's **burned forever**. Deflationary by design.

---

## Why This Works

| Layer | What it adds | Depth |
|-------|-------------|-------|
| Basic RPS triangle | 3 choices | Coin flip |
| + Enhanced moves | 6 choices, 36 matchups | Strategic |
| + Energy management | Resource economy | Poker-like |
| + Hidden energy | Information asymmetry | Mind games |
| + Overclock | Risk/reward decisions | Clutch plays |
| + Real stakes | Economic consequences | Skin in the game |

**On any single round**, luck plays a role. **Over 100 matches**, the better player wins. Just like poker.

The skill curve:
- **Beginner**: picks moves randomly, burns energy fast
- **Intermediate**: reads opponent's energy level, conserves resources
- **Advanced**: sets traps (fake LOW energy, bait overclock), controls tempo
- **Expert**: game-theory optimal mixed strategies with adaptive reads

---

## Game Modes

| Mode | Energy Regen | Character |
|------|-------------|-----------|
| **Classic** | Win +5, Lose +15, Draw +10 | Comeback-friendly. Losing gives more regen — you're never truly out. |
| **Hardcore** | None | 100 energy, that's it. Every point matters. Pure resource management. |
| **Chaos** | Random 0-20 | High variance. Sometimes you regen 20, sometimes 0. Embrace the chaos. |

---

## The Move Matrix

```
         Earth   Fire   Water   Earth+  Fire+   Water+
Earth     --     LOSE   WIN     LOSE    WIN     LOSE
Fire      WIN     --    LOSE    LOSE    LOSE    WIN
Water    LOSE    WIN     --     WIN     LOSE    LOSE
Earth+    WIN    WIN    LOSE     --     LOSE    WIN
Fire+    LOSE    WIN    WIN     WIN      --     LOSE
Water+    WIN    LOSE   WIN     LOSE    WIN      --
```

**Balance**: Each basic move wins 2, loses 3. Each enhanced wins 3, loses 2.
Enhanced costs 2.5x more energy but has better odds. Risk vs. reward.

---

## Architecture

```
    Player A (Telegram)          Player B (Telegram)
         |                            |
    [ Telegram Mini App — React + Vite ]
         |                            |
    [        SpacetimeDB TypeScript Module       ]
    [  Tables | Reducers | Matchmaking | Rounds  ]
         |
    [ Acki Nacki Blockchain — later settlement ]
```

**Current test model**: gameplay, matchmaking, energy, rounds, and rating run in SpacetimeDB so multiple real clients can test the mechanics without blockchain.

**Later hybrid model**: gameplay stays off-chain (instant, free), settlement happens on-chain (trustless, verifiable).

Only **2 transactions per match**: stake escrow + settlement. Everything else is off-chain with a verifiable replay hash.

### Why Acki Nacki?

- **Freemium gas** — DApp ID system lets us sponsor gas. Players never buy SHELL tokens.
- **Parallel execution** — hundreds of concurrent matches, no congestion.
- **Solidity on TVM** — familiar language, advanced VM.
- **Sub-second finality** — settlements feel instant.

---

## What's Built (Current State)

### Local Mock Demo

The production/default path is SpacetimeDB. The frontend can still run as a **standalone mock demo** for local smoke tests and UI demos only; it does not back the public multiplayer instance.

```bash
git clone https://github.com/elemgame/elemgameV2.git
cd elemgameV2
pnpm install
VITE_GAME_TRANSPORT=mock pnpm --filter @elmental/tma dev
# Open http://localhost:5173
```

### Component Status

| Component | Status | Details |
|-----------|--------|---------|
| **Game Logic** | **Production-ready** | 6x6 matrix, energy calc, overclock, ELO — 78 tests passing |
| **Frontend (TMA)** | **Demo-ready** | 6 screens, full game flow, animations, keyboard nav |
| **Mock Provider** | **Test-only** | Deterministic AI flow for local smoke tests and demos |
| **SpacetimeDB Backend** | **Cloud test instance** | TypeScript module with players, queue, matches, round resolution, ELO |
| **Legacy Node Server** | Optional fallback | Express + Socket.io memory server kept for experiments |
| **Smart Contracts** | Written | 6 Solidity contracts — need compilation + deployment |
| **Blockchain Client** | Stubs | @eversdk integration points marked, need real implementation |

### What You Can Do Right Now

1. **Play a full match** — select moves, watch energy drain, read opponent's level
2. **Experience overclock** — run out of energy and risk it on a critical round
3. **See the economy** — stake deducted, payout calculated, boost burned, transactions logged
4. **Try all 3 modes** — Classic (comeback-friendly), Hardcore (no regen), Chaos (random)
5. **Review the code** — clean TypeScript, shared game logic with 78 tests, documented spec

### Public Test Multiplayer Instance

The current public mechanics test runs without blockchain:

- Frontend: `https://elemgame.github.io/elemgameV2/`
- SpacetimeDB Cloud: `https://maincloud.spacetimedb.com`
- Database: `elmental-v2`
- Dashboard: `https://spacetimedb.com/elmental-v2`

GitHub Pages builds `apps/tma` with:

```bash
GITHUB_PAGES=true
VITE_GAME_TRANSPORT=spacetime
VITE_SPACETIME_URI=https://maincloud.spacetimedb.com
VITE_SPACETIME_DB=elmental-v2
VITE_BOT_FALLBACK_SECONDS=30
```

Run the public two-player first-to-3 smoke locally:

```bash
pnpm --filter @elmental/shared build
pnpm test:matrix-parity
pnpm exec playwright install chromium
pnpm smoke:local-mock
pnpm test:stdb-local-scenarios
pnpm smoke:public-match
pnpm smoke:public-timeouts
```

The same smoke is available as the manual GitHub Actions workflow `Public Multiplayer Smoke`. It opens two browser clients against GitHub Pages, verifies matchmaking, three round resolutions, final result, Play Again, and fails on browser console errors or warnings.

`smoke:local-mock` runs a PR-safe deterministic browser match with the mock provider and verifies editable web users plus read-only Telegram profile data.

`test:stdb-local-scenarios` starts a temporary in-memory SpacetimeDB server, publishes the module to a unique local database, runs room isolation, AI fallback matchmaking, invalid/duplicate move rejection, a full PvP match, Play Again, forfeit, timeout settlements, and checks the resulting `match_state` rows. It waits for real server timeout constants, so it takes a few minutes.

`Public Timeout Smoke` is a longer manual workflow for reconnect/timeout behavior. It verifies a one-player timeout win and a both-player disconnect/reconnect draw recovery against the public SpacetimeDB instance.

The floating report button opens a GitHub issue draft with the current game state, public environment, recent client trace logs, and replicated SpacetimeDB `game_event` logs. Sensitive URL/auth fields are redacted before the issue body is generated.

### Telegram Bot Launch

Telegram launch for the public mechanics instance is documented in `docs/telegram-launch.md`.

GitHub has a manual `Configure Telegram Bot` workflow that reads `TELEGRAM_BOT_TOKEN` from repository secrets/variables and `TELEGRAM_WEBAPP_URL` from repository variables:

```bash
gh workflow run configure-telegram.yml --repo elemgame/elemgameV2
```

The same configuration can be run locally when the token is available:

```bash
export TELEGRAM_BOT_TOKEN='...'
export TELEGRAM_WEBAPP_URL='https://elemgame.github.io/elemgameV2/'
pnpm telegram:configure
```

This configures bot commands and the Telegram menu button. The token must stay outside git.

Outside Telegram, browser users can edit their public name from Profile. Telegram users are read from the Telegram profile and are not editable inside the app.

### Local Test Multiplayer Instance

For mechanics testing, run SpacetimeDB locally. No blockchain, Postgres, or Redis is required.

```bash
pnpm install
```

Terminal 1:

```bash
pnpm stdb:start
```

Terminal 2:

```bash
pnpm stdb:publish:clear
```

Terminal 3:

```bash
pnpm --filter @elmental/tma dev
```

Open two clients with different dev users:

```text
http://localhost:5173/?player=alice
http://localhost:5173/?player=bob
```

Both clients connect to SpacetimeDB at `VITE_SPACETIME_URI`, enter the reducer-driven queue, and play a real PvP match through the local database module. For LAN/mobile testing, set `VITE_SPACETIME_URI` to the reachable SpacetimeDB URL.

If a player is alone in a queue, the backend creates an `AI Practice Bot` match after `VITE_BOT_FALLBACK_SECONDS` seconds. Set it to `0`, or add `?botFallbackSeconds=0` to the URL, to disable the fallback while testing pure two-player matchmaking.

### Gameplay Provider Boundary

The TMA uses `apps/tma/src/services/gameProvider/types.ts` as the contract between UI flow and data backends.

- `gameService.ts` translates provider events into Zustand store updates, timers, local economy presentation, haptics, and sounds.
- `gameProvider/mockProvider.ts` is deterministic for local smoke tests and demos; production balance, matchmaking, and results come from SpacetimeDB.
- `gameProvider/spacetimeProvider.ts` is the SpacetimeDB adapter and the only non-generated frontend file that imports generated bindings.
- Future settlement or blockchain adapters should replace/extend this provider layer instead of changing match screens.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + Vite + TypeScript | Fast dev, type safety |
| UI | Tailwind CSS + Framer Motion | Dark gaming theme, smooth animations |
| State | Zustand | Simple, performant, no boilerplate |
| Telegram | @telegram-apps/sdk (TWA) | Native Mini App integration |
| Realtime Backend | SpacetimeDB TypeScript module | Tables, reducers, subscriptions, persistent local state |
| Legacy Server | Node.js + Express + Socket.io | Optional fallback for experiments |
| Bot | Telegram Bot API | Matchmaking, onboarding |
| Database | SpacetimeDB | Persistent tables + realtime subscriptions |
| Blockchain | Acki Nacki (TVM Solidity) | Fast, cheap, freemium gas |
| SDK | @eversdk/core | Official TVM SDK |
| Token | ELM (TIP-3) | Standard fungible token on TVM |

## Project Structure

```
elmental-v2/
  apps/
    tma/          — Telegram Mini App (React, SpacetimeDB client, mock test transport)
    spacetime/    — SpacetimeDB module (matchmaking, rounds, player state)
    server/       — Legacy Node.js realtime server experiments
  contracts/      — Smart contracts (6 Solidity files)
  packages/
    shared/       — Game logic (types, constants, matrix, energy, ELO)
  docs/           — Game design specification
```

---

## Roadmap

### Phase 1: Playable Demo (Done)
- [x] Game design specification
- [x] Shared game logic with tests
- [x] TMA frontend with all screens
- [x] Mock test provider with AI
- [x] Server-authoritative SpacetimeDB economy for mechanics testing

### Phase 2: Infrastructure
- [x] Local SpacetimeDB test instance for real multiplayer mechanics
- [x] Production SpacetimeDB deployment
- [x] Telegram Bot configuration ([#19](https://github.com/elemgame/elemgameV2/issues/19))
- [x] CI/CD pipeline ([#11](https://github.com/elemgame/elemgameV2/issues/11))

### Phase 3: Blockchain
- [ ] TIP-3 ELM Token ([#1](https://github.com/elemgame/elemgameV2/issues/1))
- [ ] Compile & deploy contracts to Shellnet ([#3](https://github.com/elemgame/elemgameV2/issues/3))
- [ ] Real @eversdk integration ([#2](https://github.com/elemgame/elemgameV2/issues/2))
- [ ] Escrow token flow ([#7](https://github.com/elemgame/elemgameV2/issues/7))

### Phase 4: Multiplayer
- [x] SpacetimeDB client-server integration
- [x] Disconnect recovery ([#13](https://github.com/elemgame/elemgameV2/issues/13))
- [x] E2E: first real PvP match on local SpacetimeDB

### Phase 5: Polish
- [ ] Card art integration ([#15](https://github.com/elemgame/elemgameV2/issues/15))
- [x] Sound effects ([#14](https://github.com/elemgame/elemgameV2/issues/14))
- [ ] Tournament mode
- [ ] Leaderboard UI

---

## Economy At a Glance

```
Player stakes 100 ELM
         |
   Match pool: 200 ELM
         |
   +----- 5% rake (10 ELM) ---> Treasury
   |
   Winner gets 190 ELM (net +90)
   Loser  gets   0 ELM (net -100)

   Optional Energy Boost:
   +10 ELM stake → +20 starting energy
   Win: boost returned
   Lose: boost BURNED (deflationary)
```

**Deflationary pressure**: every boost loss permanently removes ELM from circulation.

---

## The Thesis

The best games in history share three properties:

1. **Simple rules** — anyone can start playing immediately
2. **Deep strategy** — mastery takes years, not hours
3. **Meaningful stakes** — decisions have real consequences

Chess has 1 and 2 but not 3. Poker has all three — and it's a billion-dollar industry.

**Elmental is poker mechanics applied to the simplest game ever invented, with blockchain-enforced stakes.**

The market for this exists: 900M+ Telegram users, growing Web3 gaming ecosystem, zero competitors in the "strategic RPS with real stakes" niche.

The timing is right: Acki Nacki's freemium gas model eliminates the biggest UX barrier in Web3 gaming — forcing users to buy gas tokens before playing.

The execution is underway: playable demo, 78 tests, 15 issues, clear roadmap.

---

## Quick Start

```bash
# Clone
git clone https://github.com/elemgame/elemgameV2.git
cd elemgameV2

# Install
pnpm install

# Run the demo
cd apps/tma && npx vite --host

# Run tests
cd packages/shared && npx vitest run
```

---

## Contributing

Check [open issues](https://github.com/elemgame/elemgameV2/issues) — issues labeled `good first issue` are great starting points.

## License

MIT
