import TelegramBot from 'node-telegram-bot-api';

// ---------------------------------------------------------------------------
// Telegram Bot
// ---------------------------------------------------------------------------

export function createBot(
  token: string,
  webappUrl: string,
): TelegramBot {
  const bot = new TelegramBot(token, { polling: true });

  console.log('[bot] Starting Telegram bot...');

  // ------------------------------------------------------------------
  // /start — Welcome message with TMA button
  // ------------------------------------------------------------------
  bot.onText(/^\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name ?? 'Player';

    void bot.sendMessage(
      chatId,
      `Welcome to Elmental, ${firstName}!\n\n` +
        `Elmental is a real-time PvP elements game. Pick moves, manage energy, and outread your opponent.\n\n` +
        `Tap the button below to open the game:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎮 Play Elmental',
                web_app: { url: webappUrl },
              },
            ],
          ],
        },
      },
    );
  });

  // ------------------------------------------------------------------
  // /play — Redirect to TMA
  // ------------------------------------------------------------------
  bot.onText(/^\/play/, (msg) => {
    const chatId = msg.chat.id;

    void bot.sendMessage(
      chatId,
      'The game is played inside the Mini App. Tap the button to open it:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎮 Open Game',
                web_app: { url: webappUrl },
              },
            ],
          ],
        },
      },
    );
  });

  // ------------------------------------------------------------------
  // /stats — Show player stats
  // ------------------------------------------------------------------
  bot.onText(/^\/stats/, (msg) => {
    const chatId = msg.chat.id;

    void bot.sendMessage(
      chatId,
      'Stats for the current SpacetimeDB playtest are shown inside the Mini App profile screen.',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Open Game',
                web_app: { url: webappUrl },
              },
            ],
          ],
        },
      },
    );
  });

  // ------------------------------------------------------------------
  // /help — Show help
  // ------------------------------------------------------------------
  bot.onText(/^\/help/, (msg) => {
    const chatId = msg.chat.id;

    void bot.sendMessage(
      chatId,
      `*Elmental — Help*\n\n` +
        `*Commands:*\n` +
        `/start — Welcome & open game\n` +
        `/play  — Open the Mini App\n` +
        `/stats — View your stats\n` +
        `/help  — Show this message\n\n` +
        `*How to play:*\n` +
        `1. Open the game and join a matchmaking queue\n` +
        `2. Choose a mode and wait for another player\n` +
        `3. Each round: pick Earth, Fire, Water, or an enhanced move\n` +
        `4. First to win 3 rounds wins the match\n\n` +
        `*Moves:* Earth, Fire, Water (+ enhanced versions)\n` +
        `*Modes:* Classic, Hardcore (no regen), Chaos (random regen)`,
      { parse_mode: 'Markdown' },
    );
  });

  // ------------------------------------------------------------------
  // Error handler
  // ------------------------------------------------------------------
  bot.on('polling_error', (err) => {
    console.error('[bot] Polling error:', err.message);
  });

  return bot;
}
