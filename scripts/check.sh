#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 127
  fi
}

section() {
  printf '\n==> %s\n' "$1"
}

require git
require node

section "javascript syntax"
git ls-files '*.js' | while IFS= read -r file; do
  node --check "$file" >/dev/null
done

section "tests"
node --test

section "tracked-file secret patterns"
secret_hits="$(
  git grep -InE -- \
    '(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{36,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----|[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*[[:space:]]*=[[:space:]]*['"'"'"]?[A-Za-z0-9_./+=-]{24,})' \
    -- . \
    ':(exclude)test/**' \
    ':(exclude)backlog.d/_done/**' \
    2>/dev/null |
    awk -F: '{ print $1 ":" $2 }' |
    sort -u || true
)"

if [ -n "$secret_hits" ]; then
  echo "potential secret pattern hits (locations only):" >&2
  echo "$secret_hits" >&2
  exit 1
fi

section "done"
