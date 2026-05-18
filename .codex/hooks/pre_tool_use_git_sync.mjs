#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const stdin = await new Promise((resolveInput) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    data += chunk;
  });
  process.stdin.on("end", () => resolveInput(data));
});

let payload;
try {
  payload = stdin.trim() ? JSON.parse(stdin) : {};
} catch {
  process.exit(0);
}

const command = payload?.tool_input?.command;
if (typeof command !== "string" || !shouldSyncBefore(command)) {
  process.exit(0);
}

const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
const rootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd,
  encoding: "utf8",
});

if (rootResult.status !== 0) {
  process.exit(0);
}

const root = rootResult.stdout.trim();
const syncScript = resolve(root, "scripts/codex-agent-sync.sh");
if (!existsSync(syncScript)) {
  console.error(`[codex-sync] Missing sync script: ${syncScript}`);
  process.exit(2);
}

const syncResult = spawnSync("bash", [syncScript], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});

if (syncResult.stdout) {
  process.stderr.write(syncResult.stdout);
}
if (syncResult.stderr) {
  process.stderr.write(syncResult.stderr);
}

if (syncResult.status === 0) {
  process.exit(0);
}

console.error(
  `[codex-sync] Refusing to run '${firstCommandLine(command)}' until repository sync is resolved.`
);
process.exit(2);

function shouldSyncBefore(command) {
  return containsGitSubcommand(command, "commit") || containsGitSubcommand(command, "push");
}

function containsGitSubcommand(command, subcommand) {
  const escaped = subcommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const separator = String.raw`(?:^|[;&|()\n]\s*)`;
  const gitOptions = String.raw`(?:-[^\s]+\s+)*`;
  return new RegExp(`${separator}git\\s+${gitOptions}${escaped}\\b`).test(command);
}

function firstCommandLine(command) {
  return command.split("\n", 1)[0].trim().slice(0, 140);
}
