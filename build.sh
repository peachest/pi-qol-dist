#!/bin/bash
# Rebuild dist/qol.js from upstream source snapshot in src/.
# Usage: ./build.sh   (expects src/ populated by .github/workflows or manually)
set -euo pipefail
cd "$(dirname "$0")"
export TMPDIR="${TMPDIR:-$HOME/tmp}"
npx -y esbuild src/extensions/qol.ts --bundle --platform=node --format=esm \
  --outfile=dist/qol.js \
  --external:@earendil-works/* --external:node:*
cp src/extensions/qol/session-search/regex-worker.mjs dist/
echo "bundle rebuilt: dist/qol.js"
