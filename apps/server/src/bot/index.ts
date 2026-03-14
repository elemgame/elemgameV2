import TelegramBot from 'node-telegram-bot-api';
import { getUserByTelegramId } from '../db/index.js';

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
        `Elmental is a PvP blockchain card game. Stake tokens, pick your moves, and outsmart your opponent!\n\n` +
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
    const telegramId = msg.from?.id;

    if (!telegramId) {
      void bot.sendMessage(chatId, 'Could not identify your Telegram account.');
      return;
    }

    getUserByTelegramId(telegramId)
      .then((user) => {
        if (!user) {
          void bot.sendMessage(
            chatId,
            "You haven't played yet! Open the game to get started.",
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🎮 Play Now', web_app: { url: webappUrl } }],
                ],
              },
            },
          );
          return;
        }

        const total = user.wins + user.losses;
        const winRate =
          total > 0 ? ((user.wins / total) * 100).toFixed(1) : '0.0';

        void bot.sendMessage(
          chatId,
          `📊 *Your Stats*\n\n` +
            `🏆 Rating: ${user.rating}\n` +
            `✅ Wins: ${user.wins}\n` +
            `❌ Losses: ${user.losses}\n` +
            `📈 Win Rate: ${winRate}%\n` +
            (user.wallet_address
              ? `\n💳 Wallet: \`${user.wallet_address.slice(0, 12)}...\``
              : '\n💳 No wallet linked yet'),
          { parse_mode: 'Markdown' },
        );
      })
      .catch((err: unknown) => {
        console.error('[bot] /stats error:', err);
        void bot.sendMessage(chatId, 'Failed to fetch stats. Try again later.');
      });
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
        `2. Stake tokens and choose your game mode\n` +
        `3. Each round: commit your move hash, then reveal\n` +
        `4. First to win 3 rounds takes the pot!\n\n` +
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
