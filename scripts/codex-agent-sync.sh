#!/usr/bin/env sh
set -eu

remote="${CODEX_SYNC_REMOTE:-origin}"
branch="${CODEX_SYNC_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

if [ "$branch" = "HEAD" ]; then
  echo "[codex-sync] detached HEAD; fetching ${remote} only"
  git fetch --prune "$remote"
  exit 0
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[codex-sync] not inside a git worktree" >&2
  exit 1
fi

git fetch --prune "$remote" "$branch"

upstream="${remote}/${branch}"
if ! git rev-parse --verify --quiet "$upstream" >/dev/null; then
  echo "[codex-sync] upstream ${upstream} not found after fetch" >&2
  exit 1
fi

local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "$upstream")"
base_sha="$(git merge-base HEAD "$upstream")"

if [ "$local_sha" = "$remote_sha" ]; then
  echo "[codex-sync] ${branch} is up to date with ${upstream}"
  exit 0
fi

if [ "$local_sha" = "$base_sha" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "[codex-sync] ${branch} is behind ${upstream}, but the worktree has local changes." >&2
    echo "[codex-sync] Commit/stash/inspect local changes before pulling." >&2
    exit 2
  fi
  echo "[codex-sync] fast-forwarding ${branch} to ${upstream}"
  git merge --ff-only "$upstream"
  exit 0
fi

if [ "$remote_sha" = "$base_sha" ]; then
  echo "[codex-sync] ${branch} is ahead of ${upstream}; no pull needed"
  exit 0
fi

echo "[codex-sync] ${branch} and ${upstream} have diverged; manual rebase/merge is required." >&2
exit 3
