# Telegram Launch Checklist

The current mechanics test instance runs from GitHub Pages and SpacetimeDB Cloud:

- WebApp URL: `https://elemgame.github.io/elemgameV2/`
- SpacetimeDB server: `https://maincloud.spacetimedb.com`
- SpacetimeDB database: `elmental-v2`

## Configure The Bot

Do not commit the bot token.

```bash
export TELEGRAM_BOT_TOKEN='...'
export TELEGRAM_WEBAPP_URL='https://elemgame.github.io/elemgameV2/'
pnpm telegram:configure
```

The script validates the token with `getMe`, sets `/start`, `/play`, `/stats`, `/help`, and configures the chat menu button to open the public TMA.

## BotFather

In BotFather, verify:

- Bot commands are present: `start`, `play`, `stats`, `help`.
- Menu button opens `https://elemgame.github.io/elemgameV2/`.
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
2. Send `/start`.
3. Tap the WebApp button.
4. Confirm the TMA opens at the GitHub Pages URL.
5. Confirm the frontend shows the Telegram user name.
6. Start a match with a second Telegram user.
7. Watch SpacetimeDB logs during the test:

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
