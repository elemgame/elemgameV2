# Telegram Launch Checklist

The current mechanics test instance runs from GitHub Pages and SpacetimeDB Cloud:

- WebApp URL: `https://elemgame.github.io/elemgameV2/`
- SpacetimeDB server: `https://maincloud.spacetimedb.com`
- SpacetimeDB database: `elmental-v2`
- Bot: `@elemgamebot`
- Main Mini App launch link after BotFather setup: `https://t.me/elemgamebot/?startapp`

## Configure The Bot

Do not commit the bot token.

From GitHub repository secrets/variables, run the manual workflow:

```bash
gh workflow run configure-telegram.yml --repo elemgame/elemgameV2
```

Required repository configuration:

- `TELEGRAM_BOT_TOKEN`: repository secret preferred; repository variable also works.
- `TELEGRAM_WEBAPP_URL`: repository variable, currently `https://elemgame.github.io/elemgameV2/`.

Local fallback:

```bash
export TELEGRAM_BOT_TOKEN='...'
export TELEGRAM_WEBAPP_URL='https://elemgame.github.io/elemgameV2/'
pnpm telegram:configure
```

The script validates the token with `getMe`, sets `/start`, `/play`, `/stats`, `/help`, and configures the chat menu button to open the public TMA.
It also refuses to configure a bot other than `@elemgamebot` and prints the Main Mini App direct launch link.

## BotFather

In BotFather, verify:

- Bot commands are present: `start`, `play`, `stats`, `help`.
- Menu button opens `https://elemgame.github.io/elemgameV2/`.
- The Main Mini App for `@elemgamebot` is configured to `https://elemgame.github.io/elemgameV2/`. This BotFather-only setting is what makes `https://t.me/elemgamebot/?startapp` open the TMA directly.
- The domain is allowed for Telegram Mini Apps if BotFather prompts for it.

## Server Bot Runtime

The legacy `apps/server` process can run the Telegram polling bot. For the current mechanics test, use memory mode because gameplay state lives in SpacetimeDB, not in this Node server:

```bash
TELEGRAM_BOT_TOKEN='...' \
TELEGRAM_WEBAPP_URL='https://elemgame.github.io/elemgameV2/' \
DATA_STORE=memory \
NODE_ENV=production \
JWT_SECRET='replace-with-random-secret' \
pnpm --filter @elmental/server build

TELEGRAM_BOT_TOKEN='...' \
TELEGRAM_WEBAPP_URL='https://elemgame.github.io/elemgameV2/' \
DATA_STORE=memory \
NODE_ENV=production \
JWT_SECRET='replace-with-random-secret' \
pnpm --filter @elmental/server start
```

## Playtest Verification

1. Open the bot in Telegram.
2. Open `https://t.me/elemgamebot/?startapp`.
3. Confirm the TMA opens at the GitHub Pages URL.
4. Confirm the frontend shows the Telegram user name.
5. Start a match with a second Telegram user.
6. Watch SpacetimeDB logs during the test:

```bash
spacetime logs --server maincloud -n 100 elmental-v2
spacetime sql --server maincloud elmental-v2 "SELECT * FROM queue_entry"
spacetime sql --server maincloud elmental-v2 "SELECT id, p_1_name, p_2_name, room, phase, status, p_1_score, p_2_score FROM match_state"
```

Browser fallback remains available for smoke testing outside Telegram:

```bash
https://elemgame.github.io/elemgameV2/?player=alice&room=public
https://elemgame.github.io/elemgameV2/?player=bob&room=public
```

Without `player`/`user` URL parameters, browser users can edit their public name from Profile. The name is stored in browser storage and synced to SpacetimeDB with `setProfile`; Telegram names stay read-only because Telegram profile data is the source of truth.
