import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from '@playwright/test';

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}/`;
const paymentsUrl = 'https://payments.example.test';
const headless = process.env.SMOKE_HEADLESS !== 'false';
const errors = [];
const events = [];
const paymentCalls = [];

const server = spawn(
  'pnpm',
  ['--filter', '@elmental/tma', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      VITE_GAME_TRANSPORT: 'mock',
      VITE_GAME_TRACE: 'true',
      VITE_PAYMENTS_URL: paymentsUrl,
      VITE_MOCK_DETERMINISTIC: 'true',
      VITE_MOCK_MATCH_DELAY_MS: '0',
      VITE_MOCK_ACTION_DELAY_MS: '0',
      VITE_MOCK_FINISH_DELAY_MS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  },
);

let browser;
try {
  await waitForServer(server, baseUrl);
  browser = await chromium.launch({ headless });

  const webPage = await browser.newPage();
  wirePage(webPage);
  await blockTelegramScript(webPage);
  await webPage.goto(`${baseUrl}?player=WebSmoke`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await verifyWebDemoControls(webPage);
  await webPage.close();

  const telegramPage = await browser.newPage();
  wirePage(telegramPage);
  await blockTelegramScript(telegramPage);
  await installTelegramRuntime(telegramPage);
  await mockPaymentService(telegramPage);
  await telegramPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await verifyTelegramPaymentControls(telegramPage);
  await telegramPage.close();

  if (errors.length > 0) {
    console.error('[payment-ui-smoke] browser errors detected');
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log('[payment-ui-smoke] passed');
    console.log(JSON.stringify({ paymentCalls, consoleTail: events.slice(-20) }, null, 2));
  }
} catch (err) {
  console.error('[payment-ui-smoke] failed');
  console.error(err);
  console.error(JSON.stringify({ errors, paymentCalls, consoleTail: events.slice(-50) }, null, 2));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await stopChildProcess(server);
}

async function verifyWebDemoControls(page) {
  await page.waitForFunction(() => /tELM Balance/i.test(document.body.innerText), undefined, { timeout: 10_000 });
  const text = await compactBody(page, 1200);
  if (!/Stake: 100 tELM/i.test(text)) throw new Error('Web demo stake is not labelled tELM');
  if (/Top up/i.test(text)) throw new Error('Web demo rendered Stars top-up controls');
  if (/Refund eligible ELM/i.test(text)) throw new Error('Web demo rendered Stars refund controls');
}

async function verifyTelegramPaymentControls(page) {
  await page.waitForFunction(() => /ELM Balance/i.test(document.body.innerText), undefined, { timeout: 10_000 });
  let text = await compactBody(page, 1600);
  if (/tELM Balance/i.test(text)) throw new Error('Telegram runtime rendered demo tELM balance');
  if (!/Top up/i.test(text) || !/Stars/i.test(text)) throw new Error('Telegram runtime did not render Stars controls');
  if (!/Refund eligible ELM/i.test(text)) throw new Error('Telegram runtime did not render Stars refund controls');

  await clickButton(page, /1\s*100 ELM/i);
  await page.waitForFunction(() => /Paid\. Waiting for server balance\./i.test(document.body.innerText), undefined, { timeout: 10_000 });

  await clickButton(page, /Refund eligible ELM/i);
  await page.waitForFunction(() => /Next refundable lot: 1 Stars for 100 unused ELM\./i.test(document.body.innerText), undefined, { timeout: 10_000 });
  await clickButton(page, /1\s*\u2605\s*\/\s*100 ELM/i);
  await page.waitForFunction(() => /Refunded 1 Stars\. Balance updates from server\./i.test(document.body.innerText), undefined, { timeout: 10_000 });

  await page.getByRole('button').first().click();
  await page.waitForFunction(
    () => /Wallet History/i.test(document.body.innerText) &&
      /Stars purchase/i.test(document.body.innerText) &&
      /ELM credited/i.test(document.body.innerText) &&
      /Stars refund pending/i.test(document.body.innerText) &&
      /PvP winnings/i.test(document.body.innerText),
    undefined,
    { timeout: 10_000 },
  );

  text = await compactBody(page, 2400);
  if (/telegramPaymentChargeId|charge_secret|invoice_payload|signed_payload/i.test(text)) {
    throw new Error('Wallet history exposed payment secrets');
  }
}

async function mockPaymentService(page) {
  await page.route(`${paymentsUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }

    const body = request.postDataJSON();
    paymentCalls.push({ path: url.pathname, body: sanitizePaymentBody(body) });

    if (url.pathname === '/payments/stars/invoice') {
      if (body.packageId !== 'stars_1' || typeof body.initData !== 'string') {
        throw new Error(`Unexpected invoice request: ${JSON.stringify(sanitizePaymentBody(body))}`);
      }
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        contentType: 'application/json',
        body: JSON.stringify({
          purchaseId: 'purchase_1',
          accountId: 'telegram:99',
          currency: 'XTR',
          invoiceLink: 'https://t.me/$invoice/test',
          package: {
            id: 'stars_1',
            starsAmount: 1,
            elmAmount: 100,
            title: '100 ELM',
            description: 'Top up 100 paid ELM',
          },
        }),
      });
      return;
    }

    if (url.pathname === '/payments/stars/refund/quote') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        contentType: 'application/json',
        body: JSON.stringify({
          accountId: 'telegram:99',
          telegramUserId: '99',
          refundableStarsAmount: 1,
          refundableElmAmount: 100,
          lots: [{ paymentId: 'purchase_1', starsAmount: 1, elmAmount: 100 }],
          nextLot: { paymentId: 'purchase_1', starsAmount: 1, elmAmount: 100 },
        }),
      });
      return;
    }

    if (url.pathname === '/payments/stars/refund') {
      if (body.starsAmount !== 1 || typeof body.initData !== 'string') {
        throw new Error(`Unexpected refund request: ${JSON.stringify(sanitizePaymentBody(body))}`);
      }
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        contentType: 'application/json',
        body: JSON.stringify({
          accountId: 'telegram:99',
          telegramUserId: '99',
          refundedStarsAmount: 1,
          refundedElmAmount: 100,
          refundedLots: [{ paymentId: 'purchase_1', starsAmount: 1, elmAmount: 100 }],
        }),
      });
      return;
    }

    if (url.pathname === '/payments/wallet/history') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        contentType: 'application/json',
        body: JSON.stringify({
          accountId: 'telegram:99',
          telegramUserId: '99',
          entries: [
            { id: 'payment:purchase_1:purchase', kind: 'stars_purchase', status: 'settled', title: 'Stars purchase', description: '1 Stars for 100 ELM', occurredAt: '2026-05-17T00:00:00.000Z', balanceKind: 'paid_elm', elmAmount: 100, starsAmount: 1, paymentId: 'purchase_1' },
            { id: 'payment:purchase_1:credit', kind: 'elm_credit', status: 'settled', title: 'ELM credited', description: '100 ELM credited from Stars purchase', occurredAt: '2026-05-17T00:00:01.000Z', balanceKind: 'paid_elm', elmAmount: 100, starsAmount: 1, paymentId: 'purchase_1' },
            { id: 'payment:purchase_1:refund', kind: 'stars_refund', status: 'pending', title: 'Stars refund pending', description: '100 ELM for 1 Stars', occurredAt: '2026-05-17T00:00:02.000Z', balanceKind: 'paid_elm', elmAmount: -100, starsAmount: 1, paymentId: 'purchase_1' },
            { id: 'match:7:stake', kind: 'pvp_stake', status: 'settled', title: 'PvP stake', description: 'Match vs Opponent', occurredAt: '2026-05-17T00:00:03.000Z', balanceKind: 'paid_elm', elmAmount: -100, matchId: '7' },
            { id: 'match:7:win', kind: 'pvp_win', status: 'settled', title: 'PvP winnings', description: 'Match vs Opponent', occurredAt: '2026-05-17T00:00:04.000Z', balanceKind: 'paid_elm', elmAmount: 190, matchId: '7' },
          ],
          summary: {
            totalStarsPurchased: 1,
            totalElmCredited: 100,
            totalStarsRefunded: 0,
            totalElmRefunded: 0,
            pendingRefundStars: 1,
            pvpNetElm: 90,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders(),
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unexpected payment smoke path' }),
    });
  });
}

async function installTelegramRuntime(page) {
  await page.addInitScript(() => {
    const noop = () => {};
    window.Telegram = {
      WebApp: {
        ready: noop,
        expand: noop,
        close: noop,
        initData: 'query_id=test&user=%7B%22id%22%3A99%2C%22first_name%22%3A%22Buyer%22%2C%22username%22%3A%22buyer%22%7D&auth_date=1778976000&hash=test',
        initDataUnsafe: {
          user: {
            id: 99,
            first_name: 'Buyer',
            username: 'buyer',
          },
        },
        colorScheme: 'dark',
        themeParams: {},
        isExpanded: true,
        isFullscreen: true,
        safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
        contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
        viewportHeight: 720,
        viewportStableHeight: 720,
        MainButton: {
          text: '',
          color: '',
          textColor: '',
          isVisible: false,
          isActive: true,
          show: noop,
          hide: noop,
          enable: noop,
          disable: noop,
          onClick: noop,
          offClick: noop,
          setText: noop,
          setParams: noop,
        },
        BackButton: {
          isVisible: false,
          show: noop,
          hide: noop,
          onClick: noop,
          offClick: noop,
        },
        HapticFeedback: {
          impactOccurred: noop,
          notificationOccurred: noop,
          selectionChanged: noop,
        },
        onEvent: noop,
        offEvent: noop,
        sendData: noop,
        openLink: noop,
        openInvoice: (_url, cb) => cb?.('paid'),
        openTelegramLink: noop,
        showPopup: (_params, cb) => cb?.('ok'),
        showAlert: (_message, cb) => cb?.(),
        showConfirm: (_message, cb) => cb?.(true),
      },
    };
  });
}

async function blockTelegramScript(page) {
  await page.route('**/telegram-web-app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '',
  }));
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function sanitizePaymentBody(body) {
  if (!body || typeof body !== 'object') return body;
  return {
    ...body,
    ...(typeof body.initData === 'string' ? { initData: '[redacted]' } : {}),
  };
}

function wirePage(page) {
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    events.push(`${type}:${text}`);
    if (type === 'error') errors.push(`${type}:${text}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror:${err.message}`));
}

async function clickButton(page, name, timeout = 15_000) {
  const button = page.getByRole('button', { name }).first();
  await button.waitFor({ state: 'visible', timeout });
  await button.click({ timeout, force: true });
}

async function compactBody(page, maxLength) {
  const text = await page.locator('body').innerText({ timeout: 10_000 });
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function waitForServer(process, url) {
  let output = '';
  process.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  process.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (process.exitCode !== null) {
      throw new Error(`Vite exited before startup:\n${output}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Vite:\n${output}`);
}

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  const kill = (signal) => {
    try {
      if (child.pid && process.platform !== 'win32') {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch {
      // The process may already be gone.
    }
  };

  kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 2000)),
  ]);
  if (exited === 'timeout') kill('SIGKILL');
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) {
          resolve(address.port);
        } else {
          reject(new Error('Failed to allocate free port'));
        }
      });
    });
  });
}
