#!/usr/bin/env bash
# 依存なしの最低限チェック。コミット前・CIで実行する: bash scripts/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node --check app.js
node --check sw.js
node -e 'JSON.parse(require("fs").readFileSync("manifest.webmanifest","utf8"))'
# sw.js のキャッシュ対象ファイルが実在するか
for f in index.html styles.css app.js manifest.webmanifest icon.svg; do test -f "$f" || { echo "missing: $f"; exit 1; }; done
# 家計データらしきファイルが紛れていないか
if git ls-files | grep -Ei '\.backup\.json$|^private-data/|\.(csv|pdf)$'; then echo "家計データらしきファイルがコミットされています"; exit 1; fi
echo "check: OK"
