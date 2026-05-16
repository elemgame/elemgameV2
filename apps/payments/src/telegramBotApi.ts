export interface CreateInvoiceLinkInput {
  title: string;
  description: string;
  payload: string;
  starsAmount: number;
  elmAmount: number;
}

export interface TelegramBotApi {
  createInvoiceLink(input: CreateInvoiceLinkInput): Promise<string>;
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
  };
}
