import { verifySignedInvoicePayload } from './invoicePayload.js';
import { findElmStarsPackage } from './packages.js';
import type { TelegramBotApi } from './telegramBotApi.js';

export interface SuccessfulStarsPaymentEvent {
  purchaseId: string;
  accountId: string;
  telegramUserId: string;
  packageId: string;
  starsAmount: number;
  elmAmount: number;
  telegramPaymentChargeId: string;
  invoicePayload: string;
}

export interface PaymentEventRecorder {
  recordSuccessfulPayment(event: SuccessfulStarsPaymentEvent): Promise<void>;
}

export const noopPaymentEventRecorder: PaymentEventRecorder = {
  async recordSuccessfulPayment(event: SuccessfulStarsPaymentEvent): Promise<void> {
    console.log(
      `[payments] Successful Stars payment received purchase=${event.purchaseId} account=${event.accountId} charge=${event.telegramPaymentChargeId}`,
    );
  },
};

interface TelegramUpdate {
  update_id?: number;
  pre_checkout_query?: TelegramPreCheckoutQuery;
  message?: TelegramMessage;
}

interface TelegramPreCheckoutQuery {
  id?: string;
  from?: { id?: number };
  currency?: string;
  total_amount?: number;
  invoice_payload?: string;
}

interface TelegramMessage {
  from?: { id?: number };
  successful_payment?: TelegramSuccessfulPayment;
}

interface TelegramSuccessfulPayment {
  currency?: string;
  total_amount?: number;
  invoice_payload?: string;
  telegram_payment_charge_id?: string;
}

interface HandleUpdateDeps {
  payloadSecret: string;
  telegram: TelegramBotApi;
  recorder: PaymentEventRecorder;
}

export async function handleTelegramUpdate(update: unknown, deps: HandleUpdateDeps): Promise<string> {
  const typedUpdate = update as TelegramUpdate;
  if (typedUpdate.pre_checkout_query) {
    return handlePreCheckoutQuery(typedUpdate.pre_checkout_query, deps);
  }
  if (typedUpdate.message?.successful_payment) {
    return handleSuccessfulPayment(typedUpdate.message, typedUpdate.message.successful_payment, deps);
  }
  return 'ignored';
}

async function handlePreCheckoutQuery(query: TelegramPreCheckoutQuery, deps: HandleUpdateDeps): Promise<string> {
  const queryId = typeof query.id === 'string' ? query.id : '';
  if (!queryId) return 'invalid_pre_checkout_query';

  const validation = validateStarsPayment({
    payload: query.invoice_payload,
    currency: query.currency,
    totalAmount: query.total_amount,
    telegramUserId: query.from?.id,
    payloadSecret: deps.payloadSecret,
  });

  await deps.telegram.answerPreCheckoutQuery({
    preCheckoutQueryId: queryId,
    ok: validation.ok,
    ...(validation.ok ? {} : { errorMessage: validation.error }),
  });

  return validation.ok ? 'pre_checkout_accepted' : 'pre_checkout_rejected';
}

async function handleSuccessfulPayment(
  message: TelegramMessage,
  payment: TelegramSuccessfulPayment,
  deps: HandleUpdateDeps,
): Promise<string> {
  const invoicePayload = typeof payment.invoice_payload === 'string' ? payment.invoice_payload : '';
  const validation = validateStarsPayment({
    payload: invoicePayload,
    currency: payment.currency,
    totalAmount: payment.total_amount,
    telegramUserId: message.from?.id,
    payloadSecret: deps.payloadSecret,
  });
  if (!validation.ok) {
    console.warn(`[payments] Ignoring invalid successful_payment update: ${validation.error}`);
    return 'successful_payment_rejected';
  }

  const chargeId = payment.telegram_payment_charge_id;
  if (!chargeId) {
    console.warn('[payments] Ignoring successful_payment without telegram_payment_charge_id');
    return 'successful_payment_rejected';
  }

  await deps.recorder.recordSuccessfulPayment({
    purchaseId: validation.claims.purchaseId,
    accountId: validation.claims.accountId,
    telegramUserId: validation.claims.telegramUserId,
    packageId: validation.package.id,
    starsAmount: validation.package.starsAmount,
    elmAmount: validation.package.elmAmount,
    telegramPaymentChargeId: chargeId,
    invoicePayload,
  });

  return 'successful_payment_recorded';
}

function validateStarsPayment(input: {
  payload?: string;
  currency?: string;
  totalAmount?: number;
  telegramUserId?: number;
  payloadSecret: string;
}): (
  | { ok: true; claims: NonNullable<ReturnType<typeof verifySignedInvoicePayload>>; package: NonNullable<ReturnType<typeof findElmStarsPackage>> }
  | { ok: false; error: string }
) {
  if (input.currency !== 'XTR') return { ok: false, error: 'Invalid payment currency' };
  if (typeof input.payload !== 'string') return { ok: false, error: 'Missing invoice payload' };
  if (typeof input.telegramUserId !== 'number') return { ok: false, error: 'Missing Telegram user' };

  const claims = verifySignedInvoicePayload(input.payload, input.payloadSecret);
  if (!claims) return { ok: false, error: 'Invalid invoice payload' };
  if (claims.telegramUserId !== String(input.telegramUserId)) {
    return { ok: false, error: 'Invoice belongs to another Telegram user' };
  }

  const selectedPackage = findElmStarsPackage(claims.packageId);
  if (!selectedPackage) return { ok: false, error: 'Unknown ELM package' };
  if (input.totalAmount !== selectedPackage.starsAmount) {
    return { ok: false, error: 'Invalid Stars amount' };
  }

  return { ok: true, claims, package: selectedPackage };
}
