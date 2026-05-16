import { chromium } from '@playwright/test';

const baseUrl = (process.env.PUBLIC_TMA_URL ?? 'https://elemgame.github.io/elemgameV2/').replace(/\/?$/, '/');
const room = process.env.SMOKE_ROOM?.trim() || `public-smoke-${Date.now()}`;
const playerPrefix = process.env.SMOKE_PLAYER_PREFIX ?? 'smoke';
const headless = process.env.SMOKE_HEADLESS !== 'false';
const slowMo = Number(process.env.SMOKE_SLOWMO_MS ?? 0);

const errors = [];
const events = [];
const snapshots = [];

const browser = await chromium.launch({ headless, slowMo });

try {
  const context = await browser.newContext();
  const p1 = await context.newPage();
  const p2 = await context.newPage();

  for (const [label, page] of [
    ['p1', p1],
    ['p2', p2],
  ]) {
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      const line = `${label}:${type}:${text}`;
      events.push(line);
      if (type === 'error' || type === 'warning') errors.push(line);
    });
    page.on('pageerror', (err) => errors.push(`${label}:pageerror:${err.message}`));
  }

  const p1Url = `${baseUrl}?player=${playerPrefix}_a&room=${room}`;
  const p2Url = `${baseUrl}?player=${playerPrefix}_b&room=${room}`;
  console.log(`[public-smoke] opening ${p1Url}`);
  console.log(`[public-smoke] opening ${p2Url}`);

  await Promise.all([
    p1.goto(p1Url, { waitUntil: 'domcontentloaded', timeout: 30_000 }),
    p2.goto(p2Url, { waitUntil: 'domcontentloaded', timeout: 30_000 }),
  ]);

  await Promise.all([
    clickButton(p1, /PLAY NOW/i, 30_000),
    clickButton(p2, /PLAY NOW/i, 30_000),
  ]);

  await Promise.all([waitReadyForMove(p1, 1), waitReadyForMove(p2, 1)]);

  for (let round = 1; round <= 3; round += 1) {
    console.log(`[public-smoke] round ${round}: p1 Fire, p2 Earth`);
    await Promise.all([
      clickButton(p1, /FIRE\s*10/i),
      clickButton(p2, /EARTH\s*10/i),
    ]);

    if (round === 3) {
      await Promise.all([
        waitFinalResult(p1, /VICTORY!/i),
        waitFinalResult(p2, /DEFEAT/i),
      ]);
      snapshots.push({
        round,
        p1: await compactBody(p1, 600),
        p2: await compactBody(p2, 600),
      });
      break;
    }

    await Promise.all([
      waitRoundResult(p1, /YOU WIN/i, `${round} : 0`),
      waitRoundResult(p2, /YOU LOSE/i, `0 : ${round}`),
    ]);

    snapshots.push({
      round,
      p1: await compactBody(p1, 600),
      p2: await compactBody(p2, 600),
    });

    if (round < 3) {
      await Promise.all([
        clickButton(p1, /CONTINUE/i),
        clickButton(p2, /CONTINUE/i),
      ]);
      await Promise.all([waitRoundOverlayGone(p1), waitRoundOverlayGone(p2)]);
      await Promise.all([waitReadyForMove(p1, round + 1), waitReadyForMove(p2, round + 1)]);
    }
  }

  const final = {
    p1: await compactBody(p1, 900),
    p2: await compactBody(p2, 900),
  };
  console.log('[public-smoke] full match settled');
  console.log(JSON.stringify({ room, final, snapshots, consoleTail: events.slice(-25) }, null, 2));

  await Promise.all([
    clickButton(p1, /PLAY AGAIN/i),
    clickButton(p2, /PLAY AGAIN/i),
  ]);
  await Promise.all([waitReadyForMove(p1, 1), waitReadyForMove(p2, 1)]);
  console.log('[public-smoke] play again created a second match');

  const forfeit = p1.getByRole('button', { name: /forfeit/i }).first();
  if (await forfeit.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await forfeit.click({ force: true });
    await p1.waitForTimeout(1_000);
  }

  if (errors.length > 0) {
    console.error('[public-smoke] browser console errors/warnings detected');
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('[public-smoke] failed');
  console.error(err);
  console.error(JSON.stringify({ room, errors, snapshots, consoleTail: events.slice(-50) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
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

async function waitRoundResult(page, label, expectedScore, timeout = 30_000) {
  await page.waitForFunction(
    ({ labelSource, labelFlags, expectedScore }) => {
      const text = document.body.innerText.replace(/\s+/g, ' ');
      return new RegExp(labelSource, labelFlags).test(text) && text.includes(expectedScore);
    },
    { labelSource: label.source, labelFlags: label.flags, expectedScore },
    { timeout },
  );
}

async function waitRoundOverlayGone(page, timeout = 30_000) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return !/YOU WIN|YOU LOSE|ROUND DRAW/i.test(text) && /Select Move/i.test(text);
    },
    undefined,
    { timeout },
  );
}

async function waitFinalResult(page, label, timeout = 30_000) {
  await page.waitForFunction(
    ({ labelSource, labelFlags }) => new RegExp(labelSource, labelFlags).test(document.body.innerText),
    { labelSource: label.source, labelFlags: label.flags },
    { timeout },
  );
}

async function compactBody(page, maxLength) {
  const text = await page.locator('body').innerText({ timeout: 10_000 });
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
