export interface CreateInvoiceLinkInput {
  title: string;
  description: string;
  payload: string;
  starsAmount: number;
  elmAmount: number;
}

export interface TelegramBotApi {
  createInvoiceLink(input: CreateInvoiceLinkInput): Promise<string>;
  answerPreCheckoutQuery(input: AnswerPreCheckoutQueryInput): Promise<void>;
  refundStarPayment(input: RefundStarPaymentInput): Promise<'refunded' | 'already_refunded'>;
}

export interface AnswerPreCheckoutQueryInput {
  preCheckoutQueryId: string;
  ok: boolean;
  errorMessage?: string;
}

export interface RefundStarPaymentInput {
  telegramUserId: string;
  telegramPaymentChargeId: string;
}

export class TelegramBotApiError extends Error {
  readonly confirmedFailure: boolean;

  constructor(message: string, options?: { confirmedFailure?: boolean }) {
    super(message);
    this.name = 'TelegramBotApiError';
    this.confirmedFailure = options?.confirmedFailure ?? false;
  }
}

interface BotApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export function createTelegramBotApi(
  botToken: string,
  botApiBaseUrl = 'https://api.telegram.org',
  fetchImpl: typeof fetch = fetch,
): TelegramBotApi {
  const baseUrl = botApiBaseUrl.replace(/\/+$/, '');

  return {
    async createInvoiceLink(input: CreateInvoiceLinkInput): Promise<string> {
      const response = await fetchImpl(`${baseUrl}/bot${botToken}/createInvoiceLink`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          payload: input.payload,
          currency: 'XTR',
          prices: [
            {
              label: `${input.elmAmount} ELM`,
              amount: input.starsAmount,
            },
          ],
        }),
      });

      const parsed = await response.json() as BotApiResponse<string>;
      if (!response.ok || !parsed.ok || typeof parsed.result !== 'string') {
        throw new Error(parsed.description || `Telegram Bot API failed with HTTP ${response.status}`);
      }

      return parsed.result;
    },

    async answerPreCheckoutQuery(input: AnswerPreCheckoutQueryInput): Promise<void> {
      const response = await fetchImpl(`${baseUrl}/bot${botToken}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: input.preCheckoutQueryId,
          ok: input.ok,
          ...(input.errorMessage ? { error_message: input.errorMessage } : {}),
        }),
      });

      const parsed = await response.json() as BotApiResponse<boolean>;
      if (!response.ok || !parsed.ok) {
        throw new Error(parsed.description || `Telegram Bot API failed with HTTP ${response.status}`);
      }
    },

    async refundStarPayment(input: RefundStarPaymentInput): Promise<'refunded' | 'already_refunded'> {
      const response = await fetchImpl(`${baseUrl}/bot${botToken}/refundStarPayment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: Number(input.telegramUserId),
          telegram_payment_charge_id: input.telegramPaymentChargeId,
        }),
      });

      const parsed = await response.json() as BotApiResponse<boolean>;
      if (!response.ok || !parsed.ok) {
        if (parsed.description?.includes('CHARGE_ALREADY_REFUNDED')) {
          return 'already_refunded';
        }
        throw new TelegramBotApiError(
          parsed.description || `Telegram Bot API failed with HTTP ${response.status}`,
          { confirmedFailure: true },
        );
      }

      return 'refunded';
    },
  };
}
