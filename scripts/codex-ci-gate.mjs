#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnCommandSync } from './process-helpers.mjs';

const playwrightInstallArgs = process.platform === 'win32'
  ? ['exec', 'playwright', 'install', 'chromium']
  : ['exec', 'playwright', 'install', '--with-deps', 'chromium'];

const CI_STEPS = [
  step('Install dependencies', 'pnpm', ['install', '--frozen-lockfile']),
  step('Build shared package', 'pnpm', ['--filter', '@elmental/shared', 'build']),
  step('Test shared game logic', 'pnpm', ['--filter', '@elmental/shared', 'test', '--', 'run']),
  step('Check shared/backend matrix parity', 'pnpm', ['test:matrix-parity']),
  step('Test Telegram Mini App', 'pnpm', ['--filter', '@elmental/tma', 'test', '--', '--run']),
  step('Test payments service', 'pnpm', ['--filter', '@elmental/payments', 'test']),
  step('Build payments service', 'pnpm', ['--filter', '@elmental/payments', 'build']),
  step('Install Chromium', 'pnpm', playwrightInstallArgs),
  step('Run local mock smoke', 'pnpm', ['smoke:local-mock']),
  step('Run payments UI smoke', 'pnpm', ['smoke:payments-ui']),
  step('Build SpacetimeDB module', 'spacetime', ['build', '--module-path', 'apps/spacetime/spacetimedb']),
  step('Run local SpacetimeDB reducer scenarios', 'pnpm', ['test:stdb-local-scenarios'], {}, {
    skipOnCommit: true,
    skipOnPush: true,
    reason: 'slow SpacetimeDB/Vite/browser integration scenario; keep for manual/CI',
  }),
  step('Build Telegram Mini App for CI', 'pnpm', ['--filter', '@elmental/tma', 'build'], {
    VITE_GAME_TRANSPORT: 'spacetime',
    VITE_GAME_TRACE: 'true',
    VITE_BUILD_ID: 'local-ci-gate',
    VITE_SPACETIME_URI: 'https://maincloud.spacetimedb.com',
    VITE_SPACETIME_DB: 'elmental-v2',
  }),
  step('Build GitHub Pages artifact', 'pnpm', ['--filter', '@elmental/tma', 'build'], {
    GITHUB_PAGES: 'true',
    VITE_GAME_TRANSPORT: 'spacetime',
    VITE_GAME_TRACE: 'true',
    VITE_BUILD_ID: 'local-ci-gate',
    VITE_SPACETIME_URI: 'https://maincloud.spacetimedb.com',
    VITE_SPACETIME_DB: 'elmental-v2',
  }),
];

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage:
  node scripts/codex-ci-gate.mjs [--list]
  node scripts/codex-ci-gate.mjs --pretool < pre-tool-payload.json

Environment:
  CODEX_CI_GUARD_SKIP=1  Skip the gate after explicit user approval.`);
  process.exit(0);
}

if (args.includes('--list')) {
  for (const [index, ciStep] of CI_STEPS.entries()) {
    const suffix = skipSuffix(ciStep);
    console.log(`${index + 1}. ${ciStep.name}: ${formatCommand(ciStep)}${suffix}`);
  }
  process.exit(0);
}

const pretool = args.includes('--pretool');
const stdin = pretool ? await readStdin() : '';
const payload = parsePayload(stdin);
const command = payload?.tool_input?.command;

if (pretool && (typeof command !== 'string' || !shouldRunForCommand(command))) {
  process.exit(0);
}

const cwd = typeof payload?.cwd === 'string' ? payload.cwd : process.cwd();
const rootResult = git(['rev-parse', '--show-toplevel'], cwd, { quiet: true });
const root = stdout(rootResult).trim();
const action = pretool ? commandAction(command) : 'manual';

if (!root) {
  console.error('[ci-gate] Not inside a git repository.');
  process.exit(2);
}

if (process.env.CODEX_CI_GUARD_SKIP === '1') {
  console.error(`[ci-gate] Skipped by CODEX_CI_GUARD_SKIP=1 for ${action}.`);
  process.exit(0);
}

const changedFiles = filesForAction(action, root);
if (isMarkdownOnly(changedFiles)) {
  console.error('[ci-gate] Skipping local CI for markdown-only changes; GitHub workflows ignore **/*.md.');
  process.exit(0);
}

const selectedSteps = stepsForAction(action);
const tree = treeForAction(action, root);
const commandsHash = hash(JSON.stringify(selectedSteps));
const cachePath = resolve(root, '.git', 'codex-ci-gate.json');
const cache = readCache(cachePath);

if (cache?.tree === tree && cache?.commandsHash === commandsHash && cache?.status === 'passed') {
  console.error(`[ci-gate] Reusing passed CI gate for tree ${tree.slice(0, 12)} from ${cache.completedAt}.`);
  process.exit(0);
}

console.error(`[ci-gate] Running ${selectedSteps.length} local CI steps for ${action} on tree ${tree.slice(0, 12)}.`);

for (const [index, ciStep] of selectedSteps.entries()) {
  console.error(`[ci-gate] ${index + 1}/${selectedSteps.length} ${ciStep.name}: ${formatCommand(ciStep)}`);
  const result = spawnCommandSync(ciStep.command, ciStep.args, {
    cwd: root,
    env: { ...process.env, ...ciStep.env },
    stdio: 'inherit',
  });

  if (result.error) {
    if (ciStep.command === 'spacetime' && result.error.code === 'ENOENT') {
      console.error('[ci-gate] SpacetimeDB CLI is required. Install it from https://install.spacetimedb.com and ensure `spacetime` is on PATH.');
    } else {
      console.error(`[ci-gate] Failed to start ${ciStep.command}: ${result.error.message}`);
    }
    process.exit(2);
  }

  if (result.status !== 0) {
    console.error(`[ci-gate] Failed at step ${index + 1}: ${ciStep.name}.`);
    process.exit(result.status ?? 2);
  }
}

writeCache(cachePath, {
  status: 'passed',
  tree,
  commandsHash,
  completedAt: new Date().toISOString(),
  action,
  steps: selectedSteps.map((ciStep) => ({ name: ciStep.name, command: formatCommand(ciStep) })),
});

console.error('[ci-gate] Local CI gate passed.');

function step(name, command, args, env = {}, options = {}) {
  return { name, command, args, env, ...options };
}

function stepsForAction(action) {
  const skipped = CI_STEPS.filter((ciStep) => shouldSkipStepForAction(ciStep, action));
  for (const ciStep of skipped) {
    console.error(`[ci-gate] ${action} gate skips '${ciStep.name}': ${ciStep.reason}`);
  }
  return CI_STEPS.filter((ciStep) => !shouldSkipStepForAction(ciStep, action));
}

function shouldSkipStepForAction(ciStep, action) {
  return (action === 'commit' && ciStep.skipOnCommit) || (action === 'push' && ciStep.skipOnPush);
}

function skipSuffix(ciStep) {
  const actions = [];
  if (ciStep.skipOnCommit) actions.push('commit');
  if (ciStep.skipOnPush) actions.push('push');
  return actions.length > 0 ? ` (skipped before ${actions.join('/')})` : '';
}

function formatCommand(ciStep) {
  return [ciStep.command, ...ciStep.args].join(' ');
}

function shouldRunForCommand(shellCommand) {
  return containsGitSubcommand(shellCommand, 'commit') || containsGitSubcommand(shellCommand, 'push');
}

function commandAction(shellCommand) {
  if (containsGitSubcommand(shellCommand, 'commit')) return 'commit';
  if (containsGitSubcommand(shellCommand, 'push')) return 'push';
  return 'manual';
}

function containsGitSubcommand(shellCommand, subcommand) {
  const escaped = subcommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const separator = String.raw`(?:^|[;&|()\n]\s*)`;
  const gitOptions = String.raw`(?:-[^\s]+\s+)*`;
  return new RegExp(`${separator}git\\s+${gitOptions}${escaped}\\b`).test(shellCommand);
}

function filesForAction(action, root) {
  if (action === 'commit') {
    return stdout(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], root, { quiet: true })).trim().split(/\r?\n/).filter(Boolean);
  }
  if (action === 'push') {
    const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], root, { quiet: true });
    if (upstream.status === 0) {
      return stdout(git(['diff', '--name-only', '--diff-filter=ACMR', `${stdout(upstream).trim()}..HEAD`], root, { quiet: true })).trim().split(/\r?\n/).filter(Boolean);
    }
  }
  return stdout(git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], root, { quiet: true })).trim().split(/\r?\n/).filter(Boolean);
}

function isMarkdownOnly(files) {
  return files.length > 0 && files.every((file) => file.toLowerCase().endsWith('.md'));
}

function treeForAction(action, root) {
  if (action === 'commit') {
    const written = git(['write-tree'], root, { quiet: true });
    if (written.status === 0 && stdout(written).trim()) return stdout(written).trim();
  }
  if (action === 'manual') {
    const status = stdout(git(['status', '--porcelain=v1'], root, { quiet: true }));
    if (status.trim()) {
      const unstagedDiff = stdout(git(['diff'], root, { quiet: true }));
      const stagedDiff = stdout(git(['diff', '--cached'], root, { quiet: true }));
      return `manual-${hash([status, unstagedDiff, stagedDiff].join('\n')).slice(0, 40)}`;
    }
  }
  const headTree = git(['rev-parse', 'HEAD^{tree}'], root, { quiet: true });
  if (headTree.status !== 0 || !stdout(headTree).trim()) {
    console.error('[ci-gate] Could not resolve git tree for CI cache.');
    process.exit(2);
  }
  return stdout(headTree).trim();
}

function git(gitArgs, cwd, options = {}) {
  const result = spawnSync('git', gitArgs, { cwd, encoding: 'utf8' });
  if (!options.quiet && result.status !== 0) {
    process.stderr.write(stderr(result));
  }
  return result;
}

function stdout(result) {
  return typeof result?.stdout === 'string' ? result.stdout : '';
}

function stderr(result) {
  return typeof result?.stderr === 'string' ? result.stderr : '';
}

function readCache(cachePath) {
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(cachePath, cache) {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parsePayload(value) {
  try {
    return value.trim() ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

async function readStdin() {
  return new Promise((resolveInput) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolveInput(data));
  });
}
