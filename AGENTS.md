# AGENTS.md

## Project

Elmental V2 is a Telegram Mini App PvP game prototype. The current priority is a public mechanics-testing instance with real users, real matchmaking, and no blockchain settlement. Blockchain code and legacy Node server code can stay in the repo, but gameplay fixes should target the SpacetimeDB path first.

Public test instance:

- Frontend: `https://elemgame.github.io/elemgameV2/`
- SpacetimeDB server: `https://maincloud.spacetimedb.com`
- SpacetimeDB database: `elmental-v2`
- SpacetimeDB dashboard: `https://spacetimedb.com/elmental-v2`

## Architecture

- `apps/tma`: React + Vite Telegram Mini App frontend.
- `apps/spacetime/spacetimedb`: SpacetimeDB TypeScript module. This is the authoritative multiplayer backend.
- `apps/tma/src/module_bindings`: generated SpacetimeDB TypeScript bindings used by the frontend.
- `packages/shared`: shared game rules, constants, types, and tests.
- `apps/server`: legacy Express/Socket.io experiment. Do not route the active multiplayer flow through it unless explicitly requested.
- `contracts`: future blockchain settlement. Do not spend time on it for the current mechanics instance.

## Current Backend Approach

Use SpacetimeDB as the server-authoritative backend:

- Tables store players, queue entries, matches, round results, and game events.
- Reducers mutate state. They do not return gameplay data to the client.
- Clients subscribe to tables and derive UI state from replicated table rows.
- Matchmaking happens through `join_queue` with a room key. Players only match inside the same room.
- Moves are submitted through `submit_move`. The current test flow does not require commit/reveal UX.
- The scheduler only expires stale rounds/matches. It must not auto-pick moves or auto-advance active gameplay.
- Use `game_event` rows plus console logs for traceability.

When editing SpacetimeDB code, also follow `apps/spacetime/AGENTS.md`.

## Frontend Approach

- Default transport is SpacetimeDB. Mock mode is only for local demos via `VITE_GAME_TRANSPORT=mock`.
- The frontend must not decide round winners locally for real matches. It sends reducer calls and waits for subscribed table updates.
- Do not auto-submit moves from timers. A real player must choose their own move.
- Match screens should tolerate subscription delay and reconnects without black screens.
- Ignore stale active/settled match updates that do not belong to the current/latest active match.
- Keep `VITE_GAME_TRACE=true` enabled for public testing until the multiplayer flow is stable.

## Game Specification

Basic element cycle:

- `Fire` beats `Earth`
- `Earth` beats `Water`
- `Water` beats `Fire`

Moves:

- Basic moves cost `10` energy: `Earth`, `Fire`, `Water`.
- Enhanced moves cost `25` energy: `Earth+`, `Fire+`, `Water+`.
- First player to `3` round wins takes the match.
- Classic regen: win `+5`, lose `+15`, draw `+10`.
- Hardcore regen: `0`.
- Chaos regen: deterministic server roll `0..20`.
- Overclock can randomize a move with `30%` chance when energy goes negative.

Outcome matrix, row move vs column move:

```text
         Earth   Fire   Water   Earth+  Fire+   Water+
Earth     Draw   Lose   Win     Lose    Win     Lose
Fire      Win    Draw   Lose    Lose    Lose    Win
Water     Lose   Win    Draw    Win     Lose    Lose
Earth+    Win    Win    Lose    Draw    Lose    Win
Fire+     Lose   Win    Win     Win     Draw    Lose
Water+    Win    Lose   Win     Lose    Win     Draw
```

The matrix must stay identical in:

- `packages/shared/src/game-logic.ts`
- `packages/shared/src/__tests__/game-logic.test.ts`
- `apps/spacetime/spacetimedb/src/index.ts`
- README/spec docs

## Local Commands

Install:

```bash
pnpm install
```

Run local SpacetimeDB:

```bash
pnpm stdb:start
pnpm stdb:publish:clear
```

Generate bindings after schema changes:

```bash
pnpm stdb:generate
```

Publish the cloud backend:

```bash
pnpm stdb:publish:cloud
```

Run frontend locally against cloud:

```bash
VITE_GAME_TRANSPORT=spacetime \
VITE_GAME_TRACE=true \
VITE_SPACETIME_URI=https://maincloud.spacetimedb.com \
VITE_SPACETIME_DB=elmental-v2 \
pnpm --filter @elmental/tma dev
```

Build the exact GitHub Pages artifact:

```bash
pnpm --filter @elmental/shared build
GITHUB_PAGES=true \
VITE_GAME_TRANSPORT=spacetime \
VITE_GAME_TRACE=true \
VITE_SPACETIME_URI=https://maincloud.spacetimedb.com \
VITE_SPACETIME_DB=elmental-v2 \
pnpm --filter @elmental/tma build
```

Core verification:

```bash
spacetime build --module-path apps/spacetime/spacetimedb
pnpm --filter @elmental/shared build
pnpm --filter @elmental/shared test -- run
pnpm --filter @elmental/tma build
```

## Deployment

GitHub Pages deployment is handled by `.github/workflows/deploy-pages.yml` on pushes to `main`. The workflow builds `apps/tma/dist` with:

- `GITHUB_PAGES=true`
- `VITE_GAME_TRANSPORT=spacetime`
- `VITE_SPACETIME_URI=https://maincloud.spacetimedb.com`
- `VITE_SPACETIME_DB=elmental-v2`

Vite uses `/elemgameV2/` as the base path when `GITHUB_PAGES=true`.

## Debugging

Useful SpacetimeDB commands:

```bash
spacetime logs --server maincloud elmental-v2
spacetime sql --server maincloud elmental-v2 "SELECT * FROM game_event ORDER BY id DESC LIMIT 20"
spacetime sql --server maincloud elmental-v2 "SELECT id, room, phase, status, current_round, p1_score, p2_score FROM match_state ORDER BY id DESC LIMIT 20"
```

Watch for these regressions:

- A user stays in queue while already having an active match.
- More than one active match exists for one identity.
- The scheduler chooses moves for players.
- Result screens wait forever after a match is settled.
- Matrix outcomes differ by player position.
- Browser console shows SpacetimeDB SDK errors or subscription errors.

## Editing Rules

- Keep changes scoped to the active multiplayer path unless the user asks otherwise.
- Prefer shared helpers and generated SpacetimeDB bindings over ad hoc client logic.
- Regenerate bindings when table/reducer signatures change.
- Do not commit local `.env`, build artifacts, or logs.
- Do not reset or revert unrelated user changes.
