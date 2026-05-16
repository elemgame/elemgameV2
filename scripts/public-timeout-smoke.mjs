import { chromium } from '@playwright/test';

const baseUrl = (process.env.PUBLIC_TMA_URL ?? 'https://elemgame.github.io/elemgameV2/').replace(/\/?$/, '/');
const roomPrefix = process.env.SMOKE_ROOM_PREFIX?.trim() || `timeout-smoke-${Date.now()}`;
const headless = process.env.SMOKE_HEADLESS !== 'false';
const slowMo = Number(process.env.SMOKE_SLOWMO_MS ?? 0);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 80_000);

const browser = await chromium.launch({ headless, slowMo });
const errors = [];
const events = [];

try {
  const onePlayer = await runOnePlayerTimeout();
  const bothPlayers = await runBothPlayersTimeout();

  console.log(JSON.stringify({ onePlayer, bothPlayers, consoleTail: events.slice(-40) }, null, 2));

  if (errors.length > 0) {
    console.error('[timeout-smoke] browser console errors/warnings detected');
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('[timeout-smoke] failed');
  console.error(err);
  console.error(JSON.stringify({ errors, consoleTail: events.slice(-80) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}

async function runOnePlayerTimeout() {
  const room = `${roomPrefix}-one`;
  const p1Context = await browser.newContext();
  const p2Context = await browser.newContext();
  const p1 = await p1Context.newPage();
  const p2 = await p2Context.newPage();
  wirePage('one:p1', p1);
  wirePage('one:p2', p2);

  await openPair(p1, p2, room, 'timeout_one');
  await Promise.all([waitReadyForMove(p1, 1), waitReadyForMove(p2, 1)]);

  console.log(`[timeout-smoke] ${room}: p1 submits, p2 goes offline`);
  await clickButton(p1, /FIRE\s*10/i);
  await p2Context.setOffline(true);

  await p1.waitForFunction(() => /VICTORY!/i.test(document.body.innerText), undefined, { timeout: timeoutMs });
  const p1Final = await compactBody(p1, 900);

  await p2Context.setOffline(false);
  await waitForResultAfterReconnect(p2, /DEFEAT/i);
  const p2Final = await compactBody(p2, 900);

  await Promise.all([p1Context.close(), p2Context.close()]);
  console.log(`[timeout-smoke] ${room}: timeout win verified`);

  return { room, p1Final, p2Final };
}

async function runBothPlayersTimeout() {
  const room = `${roomPrefix}-both`;
  const p1Context = await browser.newContext();
  const p2Context = await browser.newContext();
  const p1 = await p1Context.newPage();
  const p2 = await p2Context.newPage();
  wirePage('both:p1', p1);
  wirePage('both:p2', p2);

  await openPair(p1, p2, room, 'timeout_both');
  await Promise.all([waitReadyForMove(p1, 1), waitReadyForMove(p2, 1)]);

  console.log(`[timeout-smoke] ${room}: both players go offline before selecting moves`);
  await Promise.all([p1Context.setOffline(true), p2Context.setOffline(true)]);
  await p1.waitForTimeout(timeoutMs);
  await Promise.all([p1Context.setOffline(false), p2Context.setOffline(false)]);

  await Promise.all([
    waitForResultAfterReconnect(p1, /DRAW/i),
    waitForResultAfterReconnect(p2, /DRAW/i),
  ]);

  const p1Final = await compactBody(p1, 900);
  const p2Final = await compactBody(p2, 900);

  await Promise.all([p1Context.close(), p2Context.close()]);
  console.log(`[timeout-smoke] ${room}: both-player draw recovery verified`);

  return { room, p1Final, p2Final };
}

async function openPair(p1, p2, room, playerPrefix) {
  await Promise.all([
    p1.goto(`${baseUrl}?player=${playerPrefix}_a&room=${room}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }),
    p2.goto(`${baseUrl}?player=${playerPrefix}_b&room=${room}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }),
  ]);
  await Promise.all([
    clickButton(p1, /PLAY NOW/i, 30_000),
    clickButton(p2, /PLAY NOW/i, 30_000),
  ]);
}

function wirePage(label, page) {
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    const line = `${label}:${type}:${text}`;
    events.push(line);
    if (type === 'error' || type === 'warning') errors.push(line);
  });
  page.on('pageerror', (err) => errors.push(`${label}:pageerror:${err.message}`));
}

async function clickButton(page, name, timeout = 15_000) {
  const button = page.getByRole('button', { name }).first();
  await button.waitFor({ state: 'visible', timeout });
  await button.click({ timeout, force: true });
}

async function waitReadyForMove(page, round, timeout = 30_000) {
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

async function compactBody(page, maxLength) {
  const text = await page.locator('body').innerText({ timeout: 10_000 });
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function waitForResultAfterReconnect(page, pattern) {
  if (await hasBodyText(page, pattern, 10_000)) return;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(
    ({ source, flags }) => new RegExp(source, flags).test(document.body.innerText),
    { source: pattern.source, flags: pattern.flags },
    { timeout: 30_000 },
  );
}

async function hasBodyText(page, pattern, timeout) {
  try {
    await page.waitForFunction(
      ({ source, flags }) => new RegExp(source, flags).test(document.body.innerText),
      { source: pattern.source, flags: pattern.flags },
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}
