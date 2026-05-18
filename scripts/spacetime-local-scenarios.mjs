import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const repoRoot = new URL('..', import.meta.url);
const headless = process.env.SMOKE_HEADLESS !== 'false';
const slowMo = Number(process.env.SMOKE_SLOWMO_MS ?? 0);
const stdbPort = await getFreePort();
const tmaPort = await getFreePort();
const stdbUrl = `http://127.0.0.1:${stdbPort}`;
const tmaUrl = `http://127.0.0.1:${tmaPort}/`;
const database = `elmental-scenario-${Date.now()}`;
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'elmental-stdb-'));
const room = `scenario-${Date.now()}`;
const isolationRoomA = `${room}-a`;
const isolationRoomB = `${room}-b`;
const maxRoundRoom = `${room}-max-round`;
const errors = [];
const events = [];
const snapshots = [];

let stdbServer;
let tmaServer;
let browser;

try {
  stdbServer = startProcess(
    'spacetime',
    [
      'start',
      '--listen-addr',
      `127.0.0.1:${stdbPort}`,
      '--data-dir',
      dataDir,
      '--in-memory',
      '--non-interactive',
    ],
    { cwd: repoRoot },
  );
  await waitForHttp(`${stdbUrl}/v1/ping`, stdbServer, 'SpacetimeDB');
  console.log(`[spacetime-local] server ready at ${stdbUrl}`);

  await runCommand(
    'spacetime',
    [
      'publish',
      '--server',
      stdbUrl,
      '--module-path',
      'apps/spacetime/spacetimedb',
      '--delete-data=always',
      '-y',
      database,
    ],
    { cwd: repoRoot },
  );
  console.log(`[spacetime-local] published ${database}`);

  tmaServer = startProcess(
    'pnpm',
    ['--filter', '@elmental/tma', 'dev', '--host', '127.0.0.1', '--port', String(tmaPort), '--strictPort'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VITE_GAME_TRANSPORT: 'spacetime',
        VITE_GAME_TRACE: 'true',
        VITE_SPACETIME_URI: stdbUrl,
        VITE_SPACETIME_DB: database,
      },
    },
  );
  await waitForHttp(tmaUrl, tmaServer, 'TMA Vite');
  console.log(`[spacetime-local] app ready at ${tmaUrl}`);

  browser = await chromium.launch({ headless, slowMo });
  await verifyRoomIsolation();
  await verifySoloQueueWaitsForPlayers();
  await verifyFullMatchAndForfeit();
  await verifyMaxRoundCurrentScoreSettlement();
  await verifyTimeoutScenarios();
  await verifySqlState();

  if (errors.length > 0) {
    console.error('[spacetime-local] browser console errors/warnings detected');
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log('[spacetime-local] passed');
    console.log(JSON.stringify({ database, room, snapshots, consoleTail: events.slice(-30) }, null, 2));
  }
} catch (err) {
  console.error('[spacetime-local] failed');
  console.error(err);
  console.error(JSON.stringify({ database, room, errors, snapshots, consoleTail: events.slice(-60) }, null, 2));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await stopChildProcess(tmaServer);
  await stopChildProcess(stdbServer);
  await rm(dataDir, { recursive: true, force: true });
}

async function verifyRoomIsolation() {
  const p1 = await newLabeledPage('iso-a');
  const p2 = await newLabeledPage('iso-b');

  await Promise.all([
    p1.goto(playerUrl('isolated_a', isolationRoomA), { waitUntil: 'domcontentloaded', timeout: 30_000 }),
    p2.goto(playerUrl('isolated_b', isolationRoomB), { waitUntil: 'domcontentloaded', timeout: 30_000 }),
  ]);
  await Promise.all([
    clickButton(p1, /PLAY NOW/i, 30_000),
    clickButton(p2, /PLAY NOW/i, 30_000),
  ]);
  await Promise.all([
    p1.getByRole('button', { name: /Cancel Search/i }).waitFor({ state: 'visible', timeout: 15_000 }),
    p2.getByRole('button', { name: /Cancel Search/i }).waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  await p1.waitForTimeout(2500);
  await assertNoText(p1, /Select Move/i, 'isolated player A matched across rooms');
  await assertNoText(p2, /Select Move/i, 'isolated player B matched across rooms');
  await Promise.all([
    clickButton(p1, /Cancel Search/i),
    clickButton(p2, /Cancel Search/i),
  ]);
  await Promise.all([p1.close(), p2.close()]);
  snapshots.push({ scenario: 'room-isolation', rooms: [isolationRoomA, isolationRoomB] });
}

async function verifySoloQueueWaitsForPlayers() {
  const p1 = await newLabeledPage('solo-queue');
  const soloRoom = `${room}-solo`;

  await p1.goto(playerUrl('solo_waits', soloRoom, { botFallbackSeconds: 1 }), {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await clickButton(p1, /PLAY NOW/i, 30_000);
  await p1.getByRole('button', { name: /Cancel Search/i }).waitFor({ state: 'visible', timeout: 15_000 });
  await p1.waitForTimeout(3500);
  await assertNoText(p1, /Select Move|AI Practice Bot/i, 'solo player matched without a real opponent');
  snapshots.push({
    scenario: 'solo-queue-waits-for-player',
    room: soloRoom,
    p1: await compactBody(p1, 360),
  });
  await clickButton(p1, /Cancel Search/i);
  await p1.close();
}

async function verifyFullMatchAndForfeit() {
  const p1 = await newLabeledPage('p1');
  const p2 = await newLabeledPage('p2');

  await Promise.all([
    p1.goto(playerUrl('scenario_a', room), { waitUntil: 'domcontentloaded', timeout: 30_000 }),
    p2.goto(playerUrl('scenario_b', room), { waitUntil: 'domcontentloaded', timeout: 30_000 }),
  ]);

  await Promise.all([
    clickButton(p1, /PLAY NOW/i, 30_000),
    clickButton(p2, /PLAY NOW/i, 30_000),
  ]);
  await Promise.all([waitReadyForMove(p1, 1), waitReadyForMove(p2, 1)]);
  await Promise.all([
    assertNoText(p1, /AI Practice Bot/i, 'player 1 matched with bot despite real opponent'),
    assertNoText(p2, /AI Practice Bot/i, 'player 2 matched with bot despite real opponent'),
  ]);
  await expectLegacySubmitRejected(p1, 0, /submit_move is disabled/i);

  for (let round = 1; round <= 3; round += 1) {
    console.log(`[spacetime-local] round ${round}: p1 Fire, p2 Earth`);
    if (round === 1) {
      await clickButton(p1, /FIRE\s*10/i);
      await clickButton(p2, /EARTH\s*10/i);
    } else {
      await Promise.all([
        clickButton(p1, /FIRE\s*10/i),
        clickButton(p2, /EARTH\s*10/i),
      ]);
    }

    if (round === 3) {
      await Promise.all([
        waitFinalResult(p1, /VICTORY!/i),
        waitFinalResult(p2, /DEFEAT/i),
      ]);
      snapshots.push({
        scenario: 'full-match-final',
        p1: await compactBody(p1, 450),
        p2: await compactBody(p2, 450),
      });
      break;
    }

    await Promise.all([
      waitRoundResult(p1, /YOU WIN/i, `${round} : 0`),
      waitRoundResult(p2, /YOU LOSE/i, `0 : ${round}`),
    ]);
    snapshots.push({
      scenario: 'full-match',
      round,
      p1: await compactBody(p1, 450),
      p2: await compactBody(p2, 450),
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

  await Promise.all([
    clickButton(p1, /PLAY AGAIN/i),
    clickButton(p2, /PLAY AGAIN/i),
  ]);
  await Promise.all([waitReadyForMove(p1, 1), waitReadyForMove(p2, 1)]);

  await clickButton(p1, /Forfeit match/i);
  await Promise.all([
    p1.waitForFunction(() => /DEFEAT/i.test(document.body.innerText), undefined, { timeout: 30_000 }),
    p2.waitForFunction(() => /VICTORY!/i.test(document.body.innerText), undefined, { timeout: 30_000 }),
  ]);
  snapshots.push({
    scenario: 'forfeit',
    p1: await compactBody(p1, 450),
    p2: await compactBody(p2, 450),
  });

  await clickButton(p2, /Back to Home/i);
  const p2Balance = await readElmBalance(p2);
  await p2.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitBalance(p2, p2Balance);
  snapshots.push({
    scenario: 'balance-persists-after-refresh',
    balance: p2Balance,
    p2: await compactBody(p2, 300),
  });
  const secondDevice = await newLabeledPage('p2-second-device');
  await secondDevice.goto(playerUrl('scenario_b', room), {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await waitBalance(secondDevice, p2Balance);
  snapshots.push({
    scenario: 'balance-shared-across-devices',
    balance: p2Balance,
    p2: await compactBody(secondDevice, 300),
  });
  await secondDevice.close();
  await Promise.all([p1.close(), p2.close()]);
}

async function verifyTimeoutScenarios() {
  const p1 = await newLabeledPage('timeout-p1');
  const p2 = await newLabeledPage('timeout-p2');
  const timeoutRoom = `${room}-timeouts`;

  await Promise.all([
    p1.goto(playerUrl('timeout_a', timeoutRoom), { waitUntil: 'domcontentloaded', timeout: 30_000 }),
    p2.goto(playerUrl('timeout_b', timeoutRoom), { waitUntil: 'domcontentloaded', timeout: 30_000 }),
  ]);

  await startTwoPlayerMatch(p1, p2);
  console.log('[spacetime-local] timeout scenario: result phase timeout');
  await Promise.all([
    clickButton(p1, /FIRE\s*10/i),
    clickButton(p2, /EARTH\s*10/i),
  ]);
  await Promise.all([
    waitRoundResult(p1, /YOU WIN/i, '1 : 0'),
    waitRoundResult(p2, /YOU LOSE/i, '0 : 1'),
  ]);
  await Promise.all([
    waitFinalResult(p1, /VICTORY!/i, 90_000),
    waitFinalResult(p2, /DEFEAT/i, 90_000),
  ]);
  snapshots.push({
    scenario: 'result-timeout',
    p1: await compactBody(p1, 360),
    p2: await compactBody(p2, 360),
  });

  await Promise.all([
    clickButton(p1, /PLAY AGAIN/i),
    clickButton(p2, /PLAY AGAIN/i),
  ]);
  await Promise.all([waitReadyForMove(p1, 1), waitReadyForMove(p2, 1)]);
  console.log('[spacetime-local] timeout scenario: one-player timeout');
  await clickButton(p1, /FIRE\s*10/i);
  await Promise.all([
    waitFinalResult(p1, /VICTORY!/i, 90_000),
    waitFinalResult(p2, /DEFEAT/i, 90_000),
  ]);
  snapshots.push({
    scenario: 'one-player-timeout',
    p1: await compactBody(p1, 360),
    p2: await compactBody(p2, 360),
  });

  await Promise.all([
    clickButton(p1, /PLAY AGAIN/i),
    clickButton(p2, /PLAY AGAIN/i),
  ]);
  await Promise.all([waitReadyForMove(p1, 1), waitReadyForMove(p2, 1)]);
  console.log('[spacetime-local] timeout scenario: both-player timeout');
  await Promise.all([
    waitFinalResult(p1, /DRAW/i, 90_000),
    waitFinalResult(p2, /DRAW/i, 90_000),
  ]);
  snapshots.push({
    scenario: 'both-player-timeout',
    p1: await compactBody(p1, 360),
    p2: await compactBody(p2, 360),
  });
  await Promise.all([p1.close(), p2.close()]);
}

async function verifyMaxRoundCurrentScoreSettlement() {
  const p1 = await newLabeledPage('max-round-p1');
  const p2 = await newLabeledPage('max-round-p2');

  await Promise.all([
    p1.goto(playerUrl('max_round_a', maxRoundRoom), { waitUntil: 'domcontentloaded', timeout: 30_000 }),
    p2.goto(playerUrl('max_round_b', maxRoundRoom), { waitUntil: 'domcontentloaded', timeout: 30_000 }),
  ]);

  await startTwoPlayerMatch(p1, p2);
  for (let round = 1; round <= 5; round += 1) {
    const p1Move = /FIRE\s*10/i;
    const p2Move = round === 1 ? /EARTH\s*10/i : /FIRE\s*10/i;
    console.log(`[spacetime-local] max-round scenario round ${round}: p1 Fire, p2 ${round === 1 ? 'Earth' : 'Fire'}`);
    await Promise.all([
      clickButton(p1, p1Move),
      clickButton(p2, p2Move),
    ]);

    if (round === 5) {
      await Promise.all([
        waitFinalScore(p1, /VICTORY!/i, 1, 0),
        waitFinalScore(p2, /DEFEAT/i, 0, 1),
      ]);
      break;
    }

    await Promise.all([
      waitRoundResult(p1, round === 1 ? /YOU WIN/i : /DRAW/i, '1 : 0'),
      waitRoundResult(p2, round === 1 ? /YOU LOSE/i : /DRAW/i, '0 : 1'),
    ]);
    await Promise.all([
      clickButton(p1, /CONTINUE/i),
      clickButton(p2, /CONTINUE/i),
    ]);
    await Promise.all([waitRoundOverlayGone(p1), waitRoundOverlayGone(p2)]);
    await Promise.all([waitReadyForMove(p1, round + 1), waitReadyForMove(p2, round + 1)]);
  }

  await assertMatchScoreByRoom(maxRoundRoom, [[1, 0], [0, 1]]);
  snapshots.push({
    scenario: 'max-round-current-score-settlement',
    room: maxRoundRoom,
    p1: await compactBody(p1, 360),
    p2: await compactBody(p2, 360),
  });
  await Promise.all([p1.close(), p2.close()]);
}

async function assertMatchScoreByRoom(matchRoom, expectedScores) {
  const output = await runCommand(
    'spacetime',
    [
      'sql',
      '--server',
      stdbUrl,
      database,
      `SELECT room, status, p_1_score, p_2_score FROM match_state WHERE room = '${matchRoom}'`,
    ],
    { cwd: repoRoot },
  );
  const found = expectedScores.some(([p1Score, p2Score]) => {
    const expected = new RegExp(
      `"${escapeRegex(matchRoom)}"\\s*\\|\\s*"settled"\\s*\\|\\s*${p1Score}\\s*\\|\\s*${p2Score}`,
    );
    return expected.test(output);
  });
  if (!found) {
    const expectedLabel = expectedScores.map(([p1Score, p2Score]) => `${p1Score}:${p2Score}`).join(' or ');
    throw new Error(`Unexpected score for room ${matchRoom}; expected ${expectedLabel}\n${output}`);
  }
}

async function verifySqlState() {
  const output = await runCommand(
    'spacetime',
    [
      'sql',
      '--server',
      stdbUrl,
      database,
      'SELECT id, room, phase, status, current_round, p_1_score, p_2_score FROM match_state',
    ],
    { cwd: repoRoot },
  );
  if (!output.includes(room) || !output.includes('settled')) {
    throw new Error(`Unexpected match_state query output:\n${output}`);
  }
  snapshots.push({ scenario: 'sql-state', output: output.replace(/\s+/g, ' ').trim().slice(0, 700) });

  const playerOutput = await runCommand(
    'spacetime',
    [
      'sql',
      '--server',
      stdbUrl,
      database,
      'SELECT name, balance, wins, losses FROM player',
    ],
    { cwd: repoRoot },
  );
  if (!playerOutput.includes('scenario_a') || !playerOutput.includes('scenario_b')) {
    throw new Error(`Unexpected player balance query output:\n${playerOutput}`);
  }
  snapshots.push({ scenario: 'sql-player-balances', output: playerOutput.replace(/\s+/g, ' ').trim().slice(0, 700) });
}

async function startTwoPlayerMatch(p1, p2) {
  await Promise.all([
    clickButton(p1, /PLAY NOW/i, 30_000),
    clickButton(p2, /PLAY NOW/i, 30_000),
  ]);
  await Promise.all([waitReadyForMove(p1, 1), waitReadyForMove(p2, 1)]);
}

async function newLabeledPage(label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  wirePage(page, label);
  await blockTelegramScript(page);
  page.on('close', () => context.close().catch(() => undefined));
  return page;
}

async function blockTelegramScript(page) {
  await page.route('**/telegram-web-app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '',
  }));
}

function playerUrl(player, matchRoom, extraParams = {}) {
  const url = new URL(tmaUrl);
  url.searchParams.set('player', player);
  url.searchParams.set('room', matchRoom);
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function wirePage(page, label) {
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

async function waitAnyRoundResult(page, timeout = 30_000) {
  await page.waitForFunction(
    () => /YOU WIN|YOU LOSE|DRAW/i.test(document.body.innerText),
    undefined,
    { timeout },
  );
}

async function waitRoundOverlayGone(page, timeout = 30_000) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return !/YOU WIN|YOU LOSE|DRAW/i.test(text) && /Select Move/i.test(text);
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

async function waitFinalScore(page, label, myScore, opponentScore, timeout = 30_000) {
  await waitFinalResult(page, label, timeout);
  await page.waitForFunction(
    ({ myScore, opponentScore }) => {
      const text = document.body.innerText.replace(/\s+/g, ' ');
      const scorePattern = new RegExp(`You\\s+${myScore}\\s+vs\\s+\\S+\\s+${opponentScore}(\\s|$)`, 'i');
      return scorePattern.test(text);
    },
    { myScore, opponentScore },
    { timeout },
  );
}

async function waitBalance(page, expectedBalance, timeout = 30_000) {
  await page.waitForFunction(
    ({ expectedBalance }) => {
      const text = document.body.innerText.replace(/\s+/g, ' ');
      return text.toLowerCase().includes('elm balance') && text.includes(expectedBalance);
    },
    { expectedBalance },
    { timeout },
  );
}

async function readElmBalance(page, timeout = 30_000) {
  await page.waitForFunction(
    () => /ELM Balance/i.test(document.body.innerText),
    undefined,
    { timeout },
  );
  const text = (await page.locator('body').innerText({ timeout })).replace(/\s+/g, ' ');
  const match = text.match(/ELM Balance\s*([\d,]+)/i);
  if (!match) throw new Error(`Could not read ELM balance from page:\n${text.slice(0, 500)}`);
  return match[1];
}

async function expectLegacySubmitRejected(page, move, expectedMessage) {
  const result = await page.evaluate(
    async ({ uri, database, move }) => {
      const storageKeys = Array.from({ length: sessionStorage.length }, (_value, index) => sessionStorage.key(index)).filter(Boolean);
      const tokenKey = storageKeys.find((key) => key.startsWith('elmental.stdb.token.'));
      const matchKey = storageKeys.find((key) => key.startsWith(`elmental.stdb.activeMatch.${database}.`));
      const token = tokenKey ? sessionStorage.getItem(tokenKey) ?? undefined : undefined;
      const matchId = matchKey ? sessionStorage.getItem(matchKey) : null;
      if (!token || !matchId) return { ok: false, message: 'Missing active SpacetimeDB session' };

      const { DbConnection } = await import('/src/module_bindings/index.ts');
      return await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const timeout = setTimeout(() => finish({ ok: false, message: 'Reducer call timed out' }), 10_000);
        const connection = DbConnection.builder()
          .withUri(uri)
          .withDatabaseName(database)
          .withToken(token)
          .withCompression('none')
          .onConnect(async (connected) => {
            try {
              await connected.reducers.submitMove({ matchId: BigInt(matchId), move });
              finish({ ok: true, message: '' });
            } catch (err) {
              finish({ ok: false, message: err instanceof Error ? err.message : String(err) });
            } finally {
              clearTimeout(timeout);
              connected.disconnect();
            }
          })
          .onConnectError((_ctx, error) => {
            clearTimeout(timeout);
            finish({ ok: false, message: error instanceof Error ? error.message : String(error) });
          })
          .build();
        setTimeout(() => connection.disconnect(), 10_500);
      });
    },
    { uri: stdbUrl, database, move },
  );

  if (result.ok) throw new Error(`Expected legacy reducer submitMove(${move}) to fail`);
  if (!expectedMessage.test(result.message)) {
    throw new Error(`Unexpected reducer rejection for move ${move}: ${result.message}`);
  }
  snapshots.push({ scenario: 'legacy-submit-rejection', move, message: result.message });
}

async function assertNoText(page, pattern, message) {
  const text = await page.locator('body').innerText({ timeout: 10_000 });
  if (pattern.test(text)) throw new Error(message);
}

async function compactBody(page, maxLength) {
  const text = await page.locator('body').innerText({ timeout: 10_000 });
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
}

async function waitForHttp(url, child, label) {
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  const started = Date.now();
  while (Date.now() - started < 45_000) {
    if (child.exitCode !== null) throw new Error(`${label} exited before startup:\n${output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the process is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}:\n${output}`);
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      const output = `${stdout}${stderr}`;
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${code}\n${output}`));
    });
  });
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
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 3000)),
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
