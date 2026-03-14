import crypto from 'crypto';
import type { TelegramUser, SessionPayload } from '../types.js';

// ---------------------------------------------------------------------------
// Telegram initData validation
// Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// ---------------------------------------------------------------------------

/**
 * Validates Telegram WebApp initData HMAC signature.
 * Returns the parsed TelegramUser if valid, null otherwise.
 */
export function validateInitData(
  initData: string,
  botToken: string,
): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get('hash');
    if (!receivedHash) return null;

    // Build the data-check-string: all fields except hash, sorted alphabetically, joined by \n
    const entries: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key !== 'hash') {
        entries.push(`${key}=${value}`);
      }
    }
    entries.sort();
    const dataCheckString = entries.join('\n');

    // secret_key = HMAC-SHA256(bot_token, "WebAppData")
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // expected_hash = HMAC-SHA256(data_check_string, secret_key)
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== receivedHash) return null;

    // Optionally check expiry (auth_date should be within 24h)
    const authDate = params.get('auth_date');
    if (authDate) {
      const age = Date.now() / 1000 - parseInt(authDate, 10);
      if (age > 86400) {
        console.warn('initData is older than 24h, rejecting');
        return null;
      }
    }

    // Parse user JSON
    const userRaw = params.get('user');
    if (!userRaw) return null;

    const parsed: unknown = JSON.parse(userRaw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const obj = parsed as Record<string, unknown>;
    if (typeof obj['id'] !== 'number' || typeof obj['first_name'] !== 'string') {
      return null;
    }

    const user: TelegramUser = {
      id: obj['id'] as number,
      first_name: obj['first_name'] as string,
    };
    if (typeof obj['username'] === 'string') user.username = obj['username'];
    if (typeof obj['last_name'] === 'string') user.last_name = obj['last_name'];
    if (typeof obj['language_code'] === 'string') user.language_code = obj['language_code'];

    return user;
  } catch (err) {
    console.error('validateInitData error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// JWT-like session tokens (simple HMAC-based, not full JWT)
// Format: base64url(payload).base64url(hmac)
// ---------------------------------------------------------------------------

function base64url(buf: Buffer | string): string {
  const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(pad), 'base64').toString('utf8');
}

export function createSessionToken(userId: number, secret: string): string {
  const payload: SessionPayload = {
    userId,
    telegramId: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
  };

  const payloadStr = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payloadStr)
    .digest();

  return `${payloadStr}.${base64url(sig)}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadStr, receivedSig] = parts;
    if (!payloadStr || !receivedSig) return null;

    const expectedSig = base64url(
      crypto.createHmac('sha256', secret).update(payloadStr).digest(),
    );

    if (expectedSig !== receivedSig) return null;

    const payload: unknown = JSON.parse(base64urlDecode(payloadStr));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

    const p = payload as Record<string, unknown>;
    if (
      typeof p['userId'] !== 'number' ||
      typeof p['telegramId'] !== 'number' ||
      typeof p['iat'] !== 'number' ||
      typeof p['exp'] !== 'number'
    ) {
      return null;
    }

    if (p['exp'] as number < Math.floor(Date.now() / 1000)) {
      return null; // expired
    }

    return {
      userId: p['userId'] as number,
      telegramId: p['telegramId'] as number,
      iat: p['iat'] as number,
      exp: p['exp'] as number,
    };
  } catch {
    return null;
  }
}
