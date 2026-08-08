#!/usr/bin/env bash
# Start an isolated Pi delegate with only the fixed KLI read-only test tool.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: make pi-kli-readonly ARGS='Run contract-public and report pass/fail counts.'" >&2
  exit 2
fi

exec pi \
  --provider opencode \
  --model deepseek-v4-flash-free \
  --no-session \
  --approve \
  --no-builtin-tools \
  --extension .pi/extensions/kli-readonly-test/index.ts \
  --print "$*" \
  </dev/null
