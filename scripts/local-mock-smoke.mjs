import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from '@playwright/test';

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}/`;
const headless = process.env.SMOKE_HEADLESS !== 'false';
const errors = [];
const events = [];

const server = spawn(
  'pnpm',
  ['--filter', '@elmental/tma', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      VITE_GAME_TRANSPORT: 'mock',
      VITE_GAME_TRACE: 'true',
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
  try {
    const page = await browser.newPage();
    wirePage(page);
    await blockTelegramScript(page);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await openProfileAndEditName(page);
    await verifyTelegramProfileIsReadOnly(browser);
    await openSettings(page);
    await playMockMatch(page);

    if (errors.length > 0) {
      console.error('[local-mock-smoke] browser console errors/warnings detected');
      for (const error of errors) console.error(error);
      process.exitCode = 1;
    } else {
      console.log('[local-mock-smoke] passed');
      console.log(JSON.stringify({ consoleTail: events.slice(-20) }, null, 2));
    }
  } finally {
    await browser.close();
  }
} catch (err) {
  console.error('[local-mock-smoke] failed');
  console.error(err);
  console.error(JSON.stringify({ errors, consoleTail: events.slice(-50) }, null, 2));
  process.exitCode = 1;
} finally {
  await stopChildProcess(server);
}

async function openProfileAndEditName(page) {
  await page.getByRole('button').first().click();
  const input = page.getByRole('textbox', { name: 'Web username' });
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill('Local Smoke');
  await page.locator('form').getByRole('button').click();
  await page.waitForFunction(() => /Local Smoke/.test(document.body.innerText) && /@local_smoke/.test(document.body.innerText), undefined, { timeout: 10_000 });
  await page.getByRole('button').first().click();
}

async function verifyTelegramProfileIsReadOnly(browser) {
  const page = await browser.newPage();
  wirePage(page);
  await blockTelegramScript(page);
  await page.addInitScript(() => {
    const noop = () => {};
    window.Telegram = {
      WebApp: {
        ready: noop,
        expand: noop,
        close: noop,
        initData: 'query_id=test',
        initDataUnsafe: {
          user: {
            id: 777001,
            first_name: 'Telegram',
            last_name: 'Tester',
            username: 'tg_tester',
          },
        },
        colorScheme: 'dark',
        themeParams: {},
        isExpanded: true,
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
        openTelegramLink: noop,
        showPopup: (_params, cb) => cb?.('ok'),
        showAlert: (_message, cb) => cb?.(),
        showConfirm: (_message, cb) => cb?.(true),
      },
    };
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('button').first().click();
  await page.waitForFunction(
    () => /tg_tester/.test(document.body.innerText) && /Telegram Tester/.test(document.body.innerText),
    undefined,
    { timeout: 10_000 },
  );
  await expectNoWebUsernameInput(page);
  await page.close();
}

async function expectNoWebUsernameInput(page) {
  const count = await page.getByRole('textbox', { name: 'Web username' }).count();
  if (count > 0) throw new Error('Telegram profile rendered editable Web username input');
}

async function blockTelegramScript(page) {
  await page.route('**/telegram-web-app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '',
  }));
}

async function openSettings(page) {
  await page.getByRole('button').nth(1).click();
  await page.waitForFunction(() => /Settings/i.test(document.body.innerText), undefined, { timeout: 10_000 });
  await page.getByRole('button').first().click();
}

async function playMockMatch(page) {
  await clickButton(page, /PLAY NOW/i, 10_000);
  await waitReadyForMove(page, 1);

  for (let round = 1; round <= 3; round += 1) {
    await clickButton(page, /FIRE\s*10/i);
    if (round < 3) {
      await waitRoundResult(page, /YOU WIN/i, `${round} : 0`);
      await clickButton(page, /CONTINUE/i);
      await waitRoundOverlayGone(page);
      await waitReadyForMove(page, round + 1);
    }
  }

  await page.waitForFunction(() => /VICTORY!/i.test(document.body.innerText), undefined, { timeout: 20_000 });
}

function wirePage(page) {
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    const line = `${type}:${text}`;
    events.push(line);
    if (type === 'error' || type === 'warning') errors.push(line);
  });
  page.on('pageerror', (err) => errors.push(`pageerror:${err.message}`));
}

async function clickButton(page, name, timeout = 15_000) {
  const button = page.getByRole('button', { name }).first();
  await button.waitFor({ state: 'visible', timeout });
  await button.click({ timeout, force: true });
}

async function waitReadyForMove(page, round, timeout = 15_000) {
  await page.waitForFunction(
    ({ round }) => {
      const text = document.body.innerText.replace(/\s+/g, ' ');
      return text.includes('Select Move') && text.includes('ROUND') && text.includes(String(round));
    },
    { round },
    { timeout },
  );
  await page.getByRole('button', { name: /FIRE\s*10/i }).first().waitFor({ state: 'visible', timeout });
}

async function waitRoundResult(page, label, expectedScore, timeout = 15_000) {
  await page.waitForFunction(
    ({ labelSource, labelFlags, expectedScore }) => {
      const text = document.body.innerText.replace(/\s+/g, ' ');
      return new RegExp(labelSource, labelFlags).test(text) && text.includes(expectedScore);
    },
    { labelSource: label.source, labelFlags: label.flags, expectedScore },
    { timeout },
  );
}

async function waitRoundOverlayGone(page, timeout = 15_000) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return !/YOU WIN|YOU LOSE|ROUND DRAW/i.test(text) && /Select Move/i.test(text);
    },
    undefined,
    { timeout },
  );
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
  if (child.exitCode !== null || child.signalCode !== null) return;

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
