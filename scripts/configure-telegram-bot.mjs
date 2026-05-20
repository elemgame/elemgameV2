const token = readEnv('TELEGRAM_BOT_TOKEN') ?? readEnv('BOT_TOKEN');
const webappUrl = readEnv('TELEGRAM_WEBAPP_URL') ?? readEnv('WEBAPP_URL') ?? 'https://elemgame.github.io/elemgameV2/';
const webhookUrl = normalizeWebhookUrl(
  readEnv('TELEGRAM_WEBHOOK_URL') ?? readEnv('PAYMENTS_WEBHOOK_URL') ?? readEnv('VITE_PAYMENTS_URL'),
);
const webhookSecret = readEnv('PAYMENTS_WEBHOOK_SECRET') ?? readEnv('TELEGRAM_WEBHOOK_SECRET');
const expectedBotUsername = (readEnv('TELEGRAM_BOT_USERNAME') ?? 'elemgamebot').replace(/^@/, '');
const menuChatIds = parseChatIds(readEnv('TELEGRAM_MENU_CHAT_IDS'));

if (!token || token === 'your_bot_token_here' || token === 'placeholder_bot_token') {
  fail('Set TELEGRAM_BOT_TOKEN before running telegram:configure.');
}

if (!/^https:\/\/.+/i.test(webappUrl)) {
  fail(`TELEGRAM_WEBAPP_URL must be an HTTPS URL, got: ${webappUrl}`);
}

if (webhookUrl && !/^https:\/\/.+/i.test(webhookUrl)) {
  fail(`TELEGRAM_WEBHOOK_URL/PAYMENTS URL must resolve to an HTTPS URL, got: ${webhookUrl}`);
}

const apiBase = `https://api.telegram.org/bot${token}`;
const activeCommands = [
  { command: 'start', description: 'Open Elmental' },
  { command: 'play', description: 'Open the Mini App' },
];
const commandScopes = [
  { type: 'default' },
  { type: 'all_private_chats' },
  { type: 'all_group_chats' },
  { type: 'all_chat_administrators' },
];

const bot = await callTelegram('getMe');
console.log(`[telegram] Bot: @${bot.username} (${bot.first_name})`);

if (bot.username.toLowerCase() !== expectedBotUsername.toLowerCase()) {
  fail(`Expected @${expectedBotUsername}, got @${bot.username}. Refusing to configure the wrong bot.`);
}

for (const scope of commandScopes) {
  await callTelegram('deleteMyCommands', { scope });
}

await callTelegram('setMyCommands', {
  commands: activeCommands,
  scope: { type: 'default' },
});
console.log(`[telegram] Commands configured: ${activeCommands.map((command) => `/${command.command}`).join(' ')}`);

const menuButtonPayload = {
  type: 'web_app',
  text: 'Play Elmental',
  web_app: { url: webappUrl },
};

await callTelegram('setChatMenuButton', {
  menu_button: menuButtonPayload,
});
console.log(`[telegram] Default menu button configured: ${webappUrl}`);

const menuButton = await callTelegram('getChatMenuButton');
console.log(`[telegram] Current default menu button: ${JSON.stringify(menuButton)}`);

for (const chatId of menuChatIds) {
  try {
    await callTelegram('setChatMenuButton', {
      chat_id: chatId,
      menu_button: menuButtonPayload,
    }, { fatal: false });
    const chatMenuButton = await callTelegram('getChatMenuButton', { chat_id: chatId }, { fatal: false });
    console.log(`[telegram] Chat ${chatId} menu button: ${JSON.stringify(chatMenuButton)}`);
  } catch (error) {
    console.warn(`[telegram] Could not configure menu button for chat ${chatId}: ${formatError(error)}`);
  }
}

if (webhookUrl) {
  const webhookPayload = {
    url: webhookUrl,
    allowed_updates: ['message', 'pre_checkout_query'],
  };
  if (webhookSecret) webhookPayload.secret_token = webhookSecret;
  await callTelegram('setWebhook', webhookPayload);
  const webhookInfo = await callTelegram('getWebhookInfo');
  console.log(`[telegram] Webhook configured: ${webhookInfo.url}`);
  console.log(`[telegram] Webhook pending updates: ${webhookInfo.pending_update_count ?? 0}`);
} else {
  console.log('[telegram] Webhook not configured because TELEGRAM_WEBHOOK_URL/PAYMENTS URL is not set.');
}

console.log(`[telegram] Main Mini App URL must be set in @BotFather to make https://t.me/${bot.username}/?startapp open this build: ${webappUrl}`);
console.log('[telegram] Configuration complete.');

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizeWebhookUrl(value) {
  if (!value) return undefined;
  const url = value.replace(/\/+$/, '');
  if (/\/telegram\/webhook$/i.test(url)) return url;
  return `${url}/telegram/webhook`;
}

function parseChatIds(value) {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (/^-?\d+$/.test(entry) ? Number(entry) : entry));
}

async function callTelegram(method, payload, options = {}) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.ok) {
    const description = body?.description ?? `${response.status} ${response.statusText}`;
    const message = `Telegram ${method} failed: ${description}`;
    if (options.fatal === false) {
      throw new Error(message);
    }
    fail(message);
  }

  return body.result;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  console.error(`[telegram] ${message}`);
  process.exit(1);
}
