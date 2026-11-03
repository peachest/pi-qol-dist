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
# Carry upstream kendex.extensionManager metadata (displayName + settings schema):
# extension-manager builds its quick-settings tabs from the installed package.json,
# not from extension code — without this, pi-qol gets no settings tab.
if [ -f src/package.json ]; then
  node -e '
    const fs = require("fs");
    const up = JSON.parse(fs.readFileSync("src/package.json", "utf8"));
    const path = "package.json";
    const dist = JSON.parse(fs.readFileSync(path, "utf8"));
    dist.kendex = up.kendex;
    fs.writeFileSync(path, JSON.stringify(dist, null, 2) + "\n");
  '
  echo "merged upstream kendex metadata into package.json"
else
  echo "WARN: src/package.json missing, kendex metadata not merged" >&2
fi
echo "bundle rebuilt: dist/qol.js"
