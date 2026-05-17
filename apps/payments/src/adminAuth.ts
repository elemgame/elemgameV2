import type { PaymentsConfig } from './config.js';
import { validateTelegramInitData, type TelegramUser } from './telegramInitData.js';

export interface AdminIdentity {
  telegramId: number;
  user: TelegramUser;
}

export type AdminAuthResult =
  | { ok: true; admin: AdminIdentity }
  | { ok: false; status: 401 | 403 | 503; code: string; message: string };

export function authenticateAdmin(initData: unknown, config: PaymentsConfig): AdminAuthResult {
  if (config.adminTelegramIds.size === 0) {
    return {
      ok: false,
      status: 503,
      code: 'admin_disabled',
      message: 'Admin access is disabled',
    };
  }

  if (typeof initData !== 'string' || !initData) {
    return {
      ok: false,
      status: 401,
      code: 'missing_telegram_auth',
      message: 'Telegram auth is required',
    };
  }

  const user = validateTelegramInitData(initData, config.botToken);
  if (!user) {
    return {
      ok: false,
      status: 401,
      code: 'invalid_telegram_auth',
      message: 'Invalid Telegram auth',
    };
  }

  if (!config.adminTelegramIds.has(user.id)) {
    return {
      ok: false,
      status: 403,
      code: 'admin_forbidden',
      message: 'Admin access denied',
    };
  }

  return {
    ok: true,
    admin: {
      telegramId: user.id,
      user,
    },
  };
}
