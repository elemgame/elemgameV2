import crypto from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86_400,
): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get('hash');
    if (!receivedHash) return null;

    const entries: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key !== 'hash') entries.push(`${key}=${value}`);
    }
    entries.sort();
    const dataCheckString = entries.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (!timingSafeHexEqual(receivedHash, expectedHash)) return null;

    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

    const rawUser = params.get('user');
    if (!rawUser) return null;
    const parsed: unknown = JSON.parse(rawUser);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const user = parsed as Record<string, unknown>;
    if (typeof user['id'] !== 'number' || typeof user['first_name'] !== 'string') return null;

    return {
      id: user['id'],
      first_name: user['first_name'],
      ...(typeof user['last_name'] === 'string' ? { last_name: user['last_name'] } : {}),
      ...(typeof user['username'] === 'string' ? { username: user['username'] } : {}),
      ...(typeof user['language_code'] === 'string' ? { language_code: user['language_code'] } : {}),
    };
  } catch {
    return null;
  }
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const aBuffer = Buffer.from(a, 'hex');
  const bBuffer = Buffer.from(b, 'hex');
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}
