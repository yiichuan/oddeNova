#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: bash scripts/create-worktree.sh <path> <new-branch> [base-ref]" >&2
  exit 1
fi

source_root=$(git rev-parse --show-toplevel)
destination=$1
branch=$2
base=${3:-origin/main}

git fetch origin
git worktree add -b "$branch" "$destination" "$base"
if [[ -f "$source_root/.env.local" ]]; then
  cp -p "$source_root/.env.local" "$destination/.env.local"
else
  echo "Warning: $source_root/.env.local does not exist; no environment file was copied." >&2
fi
