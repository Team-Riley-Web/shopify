#!/usr/bin/env bash
# End-to-end check of the new-store path: copy the starter, install the
# package, run init, build the mock catalog and run the e2e suite.
#   scripts/verify-scaffold.sh v1.1.0            # install the published tag
#   scripts/verify-scaffold.sh ./pkg.tgz         # install a local `npm pack` tarball
# Env: STARTER (default ~/Sites/starter), KEEP=1 to keep the temp dir.
set -euo pipefail
SPEC="${1:?usage: verify-scaffold.sh <tag|tarball>}"
STARTER="${STARTER:-$HOME/Sites/starter}"
case "$SPEC" in
  *.tgz) SPEC="$(cd "$(dirname "$SPEC")" && pwd)/$(basename "$SPEC")" ;;
  v*)    SPEC="github:Team-Riley-Web/team-riley-shopify#$SPEC" ;;
esac
WORK="$(mktemp -d "${TMPDIR:-/tmp}/scaffold-XXXXXX")"
trap '[ "${KEEP:-0}" = 1 ] && echo "kept $WORK" || rm -rf "$WORK"' EXIT
echo "starter: $STARTER  ->  $WORK"
git -C "$STARTER" archive HEAD | tar -x -C "$WORK"
cd "$WORK"
echo "== npm i $SPEC"
npm i --no-audit --no-fund --save "$SPEC" > npm-install.log 2>&1
echo "== init"
npx team-riley-shopify
echo "== install dev deps"
npm i --no-audit --no-fund > npm-install-2.log 2>&1
npx playwright install chromium > playwright-install.log 2>&1
echo "== astro check"
npx astro check 2>&1 | tail -3
echo "== build + e2e (mock catalog)"
npm run test:e2e 2>&1 | tail -12
echo "== leak checks"
if grep -ql 'GetProducts' dist/_astro/*.js 2>/dev/null; then echo "LEAK: catalog queries in the browser bundle"; exit 1; fi
echo "ok: no catalog queries in the browser bundle"
echo "SCAFFOLD OK"
