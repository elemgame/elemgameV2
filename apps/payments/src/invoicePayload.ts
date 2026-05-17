import crypto from 'crypto';

const PAYLOAD_PREFIX = 'eg1';
const SEPARATOR = '|';
const MAX_TELEGRAM_PAYLOAD_BYTES = 128;

export interface InvoicePayloadClaims {
  purchaseId: string;
  packageId: string;
  telegramUserId: string;
  accountId: string;
}

export function createPurchaseId(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function createSignedInvoicePayload(claims: InvoicePayloadClaims, secret: string): string {
  validateClaims(claims);
  if (!secret) throw new Error('Payment payload secret is required');

  const body = payloadBody(claims);
  const signature = signPayloadBody(body, secret);
  const payload = `${body}${SEPARATOR}${signature}`;
  if (Buffer.byteLength(payload, 'utf8') > MAX_TELEGRAM_PAYLOAD_BYTES) {
    throw new Error('Invoice payload exceeds Telegram 128 byte limit');
  }
  return payload;
}

export function verifySignedInvoicePayload(payload: string, secret: string): InvoicePayloadClaims | null {
  if (!secret || Buffer.byteLength(payload, 'utf8') > MAX_TELEGRAM_PAYLOAD_BYTES) return null;
  const parts = payload.split(SEPARATOR);
  if (parts.length !== 6 || parts[0] !== PAYLOAD_PREFIX) return null;

  const [prefix, purchaseId, packageId, telegramUserId, accountId, receivedSignature] = parts;
  const body = [prefix, purchaseId, packageId, telegramUserId, accountId].join(SEPARATOR);
  const expectedSignature = signPayloadBody(body, secret);
  if (!timingSafeEqual(receivedSignature, expectedSignature)) return null;

  const claims = { purchaseId, packageId, telegramUserId, accountId };
  try {
    validateClaims(claims);
  } catch {
    return null;
  }
  return claims;
}

function payloadBody(claims: InvoicePayloadClaims): string {
  return [
    PAYLOAD_PREFIX,
    claims.purchaseId,
    claims.packageId,
    claims.telegramUserId,
    claims.accountId,
  ].join(SEPARATOR);
}

function signPayloadBody(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

function validateClaims(claims: InvoicePayloadClaims): void {
  if (!/^[a-f0-9]{16}$/.test(claims.purchaseId)) throw new Error('Invalid purchase id');
  if (!/^stars_(1|5|10)$/.test(claims.packageId)) throw new Error('Invalid package id');
  if (!/^\d{1,20}$/.test(claims.telegramUserId)) throw new Error('Invalid Telegram user id');
  if (claims.accountId !== `telegram:${claims.telegramUserId}`) throw new Error('Invalid account id');
  if (Object.values(claims).some(value => value.includes(SEPARATOR))) {
    throw new Error('Invoice payload fields cannot contain separator');
  }
}
