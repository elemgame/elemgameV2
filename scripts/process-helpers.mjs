import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function spawnCommand(command, args = [], options = {}) {
  const invocation = resolveCommand(command, args);
  return spawn(invocation.command, invocation.args, {
    ...options,
    shell: false,
  });
}

export function spawnCommandSync(command, args = [], options = {}) {
  const invocation = resolveCommand(command, args);
  return spawnSync(invocation.command, invocation.args, {
    ...options,
    shell: false,
  });
}

export async function stopProcessTree(child, timeoutMs = 3000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === 'win32' && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        shell: false,
      });
      killer.once('exit', resolve);
      killer.once('error', resolve);
    });
    return;
  }

  const kill = (signal) => {
    try {
      if (child.pid) {
        try {
          process.kill(-child.pid, signal);
        } catch {
          process.kill(child.pid, signal);
        }
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
    new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
  ]);
  if (exited === 'timeout') kill('SIGKILL');
}

export function resolveCommand(command, args = []) {
  if (command === 'pnpm') return resolvePnpm(args);
  if (command === 'spacetime') return resolveSpacetime(args);
  return { command, args };
}

function resolvePnpm(args) {
  const pnpmEntrypoint = findPnpmEntrypoint();
  if (pnpmEntrypoint) return { command: process.execPath, args: [pnpmEntrypoint, ...args] };
  return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args };
}

function resolveSpacetime(args) {
  const explicit = process.env.SPACETIME_CLI;
  if (explicit && existsSync(explicit)) return { command: explicit, args };

  const candidates = [
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.resolve(process.env.LOCALAPPDATA, 'SpacetimeDB', 'spacetime.exe')
      : null,
    path.resolve(os.homedir(), '.local', 'bin', 'spacetime'),
  ].filter(Boolean);

  const candidate = candidates.find((item) => existsSync(item));
  return { command: candidate ?? 'spacetime', args };
}

function findPnpmEntrypoint() {
  const candidates = [
    isPnpmEntrypoint(process.env.npm_execpath) ? process.env.npm_execpath : null,
    process.env.APPDATA
      ? path.resolve(process.env.APPDATA, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
      : null,
    ...localPnpmToolCandidates(),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function localPnpmToolCandidates() {
  if (!process.env.LOCALAPPDATA) return [];
  const root = path.resolve(process.env.LOCALAPPDATA, 'pnpm', '.tools', 'pnpm');
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.resolve(root, entry.name, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'));
  } catch {
    return [];
  }
}

function isPnpmEntrypoint(value) {
  return typeof value === 'string' && value.includes('pnpm') && path.basename(value).toLowerCase() === 'pnpm.cjs';
}

