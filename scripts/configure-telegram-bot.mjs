const token = readEnv('TELEGRAM_BOT_TOKEN') ?? readEnv('BOT_TOKEN');
const webappUrl = readEnv('TELEGRAM_WEBAPP_URL') ?? readEnv('WEBAPP_URL') ?? 'https://elemgame.github.io/elemgameV2/';
const expectedBotUsername = (readEnv('TELEGRAM_BOT_USERNAME') ?? 'elemgamebot').replace(/^@/, '');

if (!token || token === 'your_bot_token_here' || token === 'placeholder_bot_token') {
  fail('Set TELEGRAM_BOT_TOKEN before running telegram:configure.');
}

if (!/^https:\/\/.+/i.test(webappUrl)) {
  fail(`TELEGRAM_WEBAPP_URL must be an HTTPS URL, got: ${webappUrl}`);
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

await callTelegram('setChatMenuButton', {
  menu_button: {
    type: 'web_app',
    text: 'Play Elmental',
    web_app: { url: webappUrl },
  },
});
console.log(`[telegram] Menu button configured: ${webappUrl}`);

const menuButton = await callTelegram('getChatMenuButton');
console.log(`[telegram] Current menu button: ${JSON.stringify(menuButton)}`);
console.log('[telegram] Bot API configured the chat menu button only.');
console.log(`[telegram] Main Mini App URL must be set in @BotFather to make https://t.me/${bot.username}/?startapp open this build: ${webappUrl}`);
console.log('[telegram] Configuration complete.');

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

async function callTelegram(method, payload) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.ok) {
    const description = body?.description ?? `${response.status} ${response.statusText}`;
    fail(`Telegram ${method} failed: ${description}`);
  }

  return body.result;
}

function fail(message) {
  console.error(`[telegram] ${message}`);
  process.exit(1);
}
