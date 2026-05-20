---
name: ci-guard
description: Use when checking, debugging, or enforcing Elmental CI; before git commit or git push; after pushing changes; or when a GitHub Actions run, job, check, or log URL is provided. Guides local CI-equivalent verification, GitHub Actions log inspection, and commit/push safety.
---

# CI Guard

Use this skill whenever CI status matters, including before commit/push and when a GitHub Actions URL is provided.

## Local Gate

Before committing or pushing code changes, run the repository gate:

```bash
node scripts/codex-ci-gate.mjs
```

The manual gate mirrors `.github/workflows/ci.yml`:

- `pnpm install --frozen-lockfile`
- shared build and tests
- matrix parity
- TMA tests
- payments tests and build
- Playwright Chromium install. GitHub Actions installs system dependencies with
  `--with-deps`; local gates install the browser binary only because `--with-deps`
  requires interactive sudo on many developer machines.
- local mock smoke
- payments UI smoke
- SpacetimeDB module build
- local SpacetimeDB reducer scenarios
- TMA production build with SpacetimeDB env
- GitHub Pages artifact build with `GITHUB_PAGES=true`

The pre-commit and pre-push hooks intentionally skip `pnpm test:stdb-local-scenarios`. That scenario starts SpacetimeDB, publishes a module, runs Vite, and drives browser flows, so it is too environment-sensitive for automatic local hooks. Timeout coverage that waits production scheduler windows lives in `pnpm test:stdb-local-scenarios:full` and the manual public timeout smoke.

The gate caches a successful result by git tree in `.git/codex-ci-gate.json`. If a push follows an unchanged, already-checked commit, the hook may skip duplicate work.

For markdown-only changes, the gate may skip local CI because the GitHub workflows use `paths-ignore: '**/*.md'`.

Use cross-platform Node-based commands and helpers for local scripts. Do not add shell-specific pipelines, Windows-only `.cmd` assumptions, or Unix-only process cleanup to CI helpers unless a guarded fallback exists for other platforms.

Do not bypass the gate unless the user explicitly approves an emergency bypass. If bypassed, set `CODEX_CI_GUARD_SKIP=1`, state the reason, and still inspect GitHub Actions after push.

## Failing Actions URL

When the user gives a GitHub Actions run/job/log URL:

1. Extract the repository, run ID, and job ID when present.
2. Prefer the GitHub connector for job steps/logs. Use `gh` only when connector coverage is insufficient and authentication works.
3. Identify the first failing step and quote only the shortest useful log snippet.
4. Fix the root cause locally.
5. Run the smallest local command that reproduces the failure, then run `node scripts/codex-ci-gate.mjs` when the fix touches CI-covered code.
6. Commit with a Conventional Commit message.
7. Push the branch.
8. Check GitHub Actions for the pushed SHA. Do not call the work done until required automatic workflows are green or you have reported the remaining failure.

## After Push

For pushes to `main`, check automatic workflows for the pushed SHA:

- `CI`
- `Deploy TMA to GitHub Pages`

Manual workflows such as `Public Multiplayer Smoke`, `Public Timeout Smoke`, and `Configure Telegram Bot` are not required unless the user asks to run or inspect them.

If a workflow is queued or in progress, wait or report that it is still running. If it fails, fetch logs, summarize the root cause, fix, recommit, and push again.
