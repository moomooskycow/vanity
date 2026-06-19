#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mode="${1:-gate}"

check_syntax() {
  for file in api/*.js canary-observer.js quotes.js test/*.js; do
    node --check "$file"
  done
}

check_json() {
  node -e 'const fs = require("node:fs"); JSON.parse(fs.readFileSync("vercel.json", "utf8"));'
}

scan_secrets() {
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks detect --no-git --redact --source .
  else
    printf 'gitleaks unavailable; skipping local secret scan.\n' >&2
  fi
}

case "$mode" in
  gate)
    check_syntax
    check_json
    node --test
    scan_secrets
    ;;
  coverage)
    rm -rf coverage
    mkdir -p coverage
    NODE_V8_COVERAGE=coverage node --test
    test "$(find coverage -name '*.json' | wc -l | tr -d ' ')" -gt 0
    ;;
  *)
    printf 'usage: %s [gate|coverage]\n' "$0" >&2
    exit 2
    ;;
esac
