import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { validateTelegramInitData } from './telegramInitData.js';

const botToken = '123456:test_bot_token';

describe('Telegram init data validation', () => {
  it('accepts valid Telegram WebApp init data', () => {
    const initData = signedInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: JSON.stringify({ id: 42, first_name: 'Alice', username: 'alice' }),
    });

    expect(validateTelegramInitData(initData, botToken)).toMatchObject({
      id: 42,
      first_name: 'Alice',
      username: 'alice',
    });
  });

  it('rejects tampered init data', () => {
    const initData = signedInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 42, first_name: 'Alice' }),
    });

    expect(validateTelegramInitData(initData.replace('Alice', 'Mallory'), botToken)).toBeNull();
  });
});

function signedInitData(fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const entries = [...params.entries()].map(([key, value]) => `${key}=${value}`).sort();
  const dataCheckString = entries.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}
