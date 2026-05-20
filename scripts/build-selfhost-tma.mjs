#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = process.env.SELFHOST_TMA_OUT_DIR ?? path.join(repoRoot, '.runtime-data/tma-selfhost-dist');
const publicOrigin = getPublicOrigin();
const spacetimeDb = process.env.VITE_SPACETIME_DB ?? process.env.PAYMENTS_SPACETIME_DB ?? process.env.SPACETIME_DB ?? 'elmental-v2';
const buildId = process.env.VITE_BUILD_ID ?? `selfhost-${Date.now()}`;

fs.mkdirSync(path.dirname(outDir), { recursive: true });

const env = {
  ...process.env,
  GITHUB_PAGES: 'false',
  VITE_BASE_PATH: '/',
  VITE_BUILD_ID: buildId,
  VITE_GAME_TRANSPORT: process.env.VITE_GAME_TRANSPORT ?? 'spacetime',
  VITE_GAME_TRACE: process.env.VITE_GAME_TRACE ?? 'true',
  VITE_SPACETIME_URI: process.env.VITE_SPACETIME_URI ?? publicOrigin,
  VITE_SPACETIME_DB: spacetimeDb,
  VITE_PAYMENTS_URL: process.env.VITE_PAYMENTS_URL ?? publicOrigin,
  VITE_BOT_FALLBACK_SECONDS: process.env.VITE_BOT_FALLBACK_SECONDS ?? '30',
};

console.log(`[selfhost:tma] origin=${env.VITE_SPACETIME_URI}`);
console.log(`[selfhost:tma] database=${env.VITE_SPACETIME_DB}`);
console.log(`[selfhost:tma] buildId=${env.VITE_BUILD_ID}`);
console.log(`[selfhost:tma] outDir=${outDir}`);

const tmaRoot = path.join(repoRoot, 'apps/tma');
const relativeOutDir = path.relative(tmaRoot, outDir);

const typecheck = run('pnpm', ['exec', 'tsc'], tmaRoot, env);
if (typecheck.status !== 0) process.exit(typecheck.status ?? 1);

const build = run('pnpm', ['exec', 'vite', 'build', '--outDir', relativeOutDir, '--emptyOutDir'], tmaRoot, env);
process.exit(build.status ?? 1);

function getPublicOrigin() {
  const explicit = process.env.PUBLIC_ORIGIN ?? process.env.SELFHOST_PUBLIC_ORIGIN;
  if (explicit) return explicit.replace(/\/+$/, '');

  const webappUrl = process.env.TELEGRAM_WEBAPP_URL;
  if (webappUrl) {
    try {
      return new URL(webappUrl).origin;
    } catch {
      // Fall through to the local default.
    }
  }

  return 'http://127.0.0.1:8081';
}

function run(command, args, cwd, env) {
  return spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  });
}
