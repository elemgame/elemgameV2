# ELMENTAL

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

Enhanced moves **flip your weakness**. Earth normally loses to Water, but Earth+ **beats** Water. The trade-off: 2.5x the energy cost.

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
Earth     --     WIN    LOSE    LOSE    LOSE    WIN
Fire     LOSE     --    WIN     WIN     LOSE    LOSE
Water    WIN     LOSE    --     LOSE    WIN     LOSE
Earth+   WIN     LOSE   WIN      --     WIN     LOSE
Fire+    WIN     WIN    LOSE    LOSE     --     WIN
Water+   LOSE    LOSE   WIN     WIN     LOSE     --
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
    [    Game Server — Node.js + Socket.io    ]
    [  Matchmaking | Rounds | Energy | Replay  ]
         |
    [ Acki Nacki Blockchain ]
    [ ELM Token | Escrow | Settlement ]
```

**Hybrid model**: gameplay happens off-chain (instant, free), settlement happens on-chain (trustless, verifiable).

Only **2 transactions per match**: stake escrow + settlement. Everything else is off-chain with a verifiable replay hash.

### Why Acki Nacki?

- **Freemium gas** — DApp ID system lets us sponsor gas. Players never buy SHELL tokens.
- **Parallel execution** — hundreds of concurrent matches, no congestion.
- **Solidity on TVM** — familiar language, advanced VM.
- **Sub-second finality** — settlements feel instant.

---

## What's Built (Current State)

### Playable Demo

The frontend is a **fully functional standalone demo**. No server needed. AI opponent. Real game logic. Real economy simulation.

```bash
git clone https://github.com/elemgame/elemgameV2.git
cd elemgameV2
pnpm install
cd apps/tma && npx vite --host
# Open http://localhost:5173
```

### Component Status

| Component | Status | Details |
|-----------|--------|---------|
| **Game Logic** | **Production-ready** | 6x6 matrix, energy calc, overclock, ELO — 78 tests passing |
| **Frontend (TMA)** | **Demo-ready** | 6 screens, full game flow, animations, keyboard nav |
| **Mock Engine** | **Complete** | AI with 3 personalities, full economy, transaction ledger |
| **Game Server** | Scaffolded | Express + Socket.io + Bot — compiles, needs DB/Redis |
| **Smart Contracts** | Written | 6 Solidity contracts — need compilation + deployment |
| **Blockchain Client** | Stubs | @eversdk integration points marked, need real implementation |

### What You Can Do Right Now

1. **Play a full match** — select moves, watch energy drain, read opponent's level
2. **Experience overclock** — run out of energy and risk it on a critical round
3. **See the economy** — stake deducted, payout calculated, boost burned, transactions logged
4. **Try all 3 modes** — Classic (comeback-friendly), Hardcore (no regen), Chaos (random)
5. **Review the code** — clean TypeScript, shared game logic with 78 tests, documented spec

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + Vite + TypeScript | Fast dev, type safety |
| UI | Tailwind CSS + Framer Motion | Dark gaming theme, smooth animations |
| State | Zustand | Simple, performant, no boilerplate |
| Telegram | @telegram-apps/sdk (TWA) | Native Mini App integration |
| Server | Node.js + Express + Socket.io | Real-time PvP rounds |
| Bot | Telegram Bot API | Matchmaking, onboarding |
| Database | PostgreSQL + Redis | Persistence + matchmaking queue |
| Blockchain | Acki Nacki (TVM Solidity) | Fast, cheap, freemium gas |
| SDK | @eversdk/core | Official TVM SDK |
| Token | ELM (TIP-3) | Standard fungible token on TVM |

## Project Structure

```
elmental-v2/
  apps/
    tma/          — Telegram Mini App (React, 6 screens, mock engine)
    server/       — Game server (Node.js, 13 modules)
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
- [x] Mock game engine with AI
- [x] Full economy simulation

### Phase 2: Infrastructure
- [ ] PostgreSQL + Redis setup ([#5](https://github.com/elemgame/elemgameV2/issues/5))
- [ ] Telegram Bot configuration ([#6](https://github.com/elemgame/elemgameV2/issues/6))
- [ ] CI/CD pipeline ([#11](https://github.com/elemgame/elemgameV2/issues/11))

### Phase 3: Blockchain
- [ ] TIP-3 ELM Token ([#1](https://github.com/elemgame/elemgameV2/issues/1))
- [ ] Compile & deploy contracts to Shellnet ([#3](https://github.com/elemgame/elemgameV2/issues/3))
- [ ] Real @eversdk integration ([#2](https://github.com/elemgame/elemgameV2/issues/2))
- [ ] Escrow token flow ([#7](https://github.com/elemgame/elemgameV2/issues/7))

### Phase 4: Multiplayer
- [ ] Socket.io client-server integration ([#4](https://github.com/elemgame/elemgameV2/issues/4))
- [ ] Disconnect recovery ([#13](https://github.com/elemgame/elemgameV2/issues/13))
- [ ] E2E: first real PvP match ([#10](https://github.com/elemgame/elemgameV2/issues/10))

### Phase 5: Polish
- [ ] Card art integration ([#15](https://github.com/elemgame/elemgameV2/issues/15))
- [ ] Sound effects ([#14](https://github.com/elemgame/elemgameV2/issues/14))
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
