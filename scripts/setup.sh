#!/usr/bin/env bash
# macOS / Linux launcher: the real logic is the cross-platform scripts/setup.mjs (needs only Node >= 18).
cd "$(dirname "$0")/.." || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js is not installed. Install the LTS from https://nodejs.org (or: brew install node), then run this again."; exit 1; }
exec node scripts/setup.mjs "$@"
