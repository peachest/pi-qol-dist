#!/bin/bash
# Rebuild dist/qol.js from upstream source snapshot in src/.
# Usage: ./build.sh   (expects src/ populated by .github/workflows or manually)
set -euo pipefail
cd "$(dirname "$0")"
export TMPDIR="${TMPDIR:-$HOME/tmp}"
# Local patches applied over the upstream snapshot in src/. The daily upstream
# sync replaces src/ wholesale; patches re-apply here on every build and fail
# loudly on conflict instead of silently dropping local changes.
# NOTE: no nullglob — it would silently delete the unquoted globs in the
# esbuild --external:<pkg>/* flags below.
for patch in patches/*.patch; do
  [ -e "$patch" ] || continue
  echo "applying local patch: $patch"
  git apply --check "$patch"
  git apply "$patch"
done
npx -y esbuild src/extensions/qol.ts --bundle --platform=node --format=esm \
  --outfile=dist/qol.js \
  --external:@earendil-works/* --external:node:*
# Match the installed package name used by extension-manager settings.
node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const path = "dist/qol.js";
  const content = readFileSync(path, "utf8");
  const upstream = "\"@vanillagreen/pi-qol\"";
  if (content.split(upstream).length !== 3) throw new Error("Expected two upstream QOL config IDs; inspect upstream changes");
  writeFileSync(path, content.replaceAll(upstream, "\"@peachest/pi-qol-dist\""));
'
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
