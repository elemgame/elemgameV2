import { loadConfig } from './config.js';
import { createPaymentsServer } from './server.js';
import { createTelegramBotApi } from './telegramBotApi.js';

const config = loadConfig();
const telegram = createTelegramBotApi(config.botToken, config.botApiBaseUrl);
const server = createPaymentsServer({ config, telegram });

server.listen(config.port, () => {
  console.log(`[payments] Service listening on port ${config.port}`);
});

function shutdown(): void {
  console.log('[payments] Shutting down...');
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
