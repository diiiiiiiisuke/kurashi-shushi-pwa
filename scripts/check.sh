#!/usr/bin/env bash
# 依存なしの最低限チェック。コミット前・CIで実行する: bash scripts/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# 構文チェック（package.json の "type": "module" により js/ は ES Modules として読まれる）
for f in sw.js $(find js -name '*.js' | sort); do node --check "$f"; done
node -e 'JSON.parse(require("fs").readFileSync("manifest.webmanifest","utf8"))'

# sw.js のキャッシュ対象と実在ファイルが一致しているか
node -e '
const fs = require("fs"), path = require("path");
const src = fs.readFileSync("sw.js", "utf8");
const listed = [...src.matchAll(/"\.\/([^"]*)"/g)].map(m => m[1]).filter(Boolean);
const missing = listed.filter(f => !fs.existsSync(f));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const unlisted = walk("js").filter(f => !listed.includes(f));
if (missing.length || unlisted.length) { console.error("sw.js の ASSETS がずれています", { missing, unlisted }); process.exit(1); }
'

# 公開用ファイル（dist/）が sw.js の ASSETS と _headers だけで、docs などを含まないか
bash scripts/build-site.sh > /dev/null
node -e '
const fs = require("fs"), path = require("path");
const src = fs.readFileSync("sw.js", "utf8");
const want = new Set([...src.matchAll(/"\.\/([^"]+)"/g)].map(m => m[1]).concat(["sw.js", "_headers"]));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative("dist", path.join(d, e.name))]);
const got = new Set(walk("dist"));
const extra = [...got].filter(f => !want.has(f)), missing = [...want].filter(f => !got.has(f));
if (extra.length || missing.length) { console.error("dist/ の中身がずれています", { extra, missing }); process.exit(1); }
'
rm -rf dist

# 自動テスト（Node 標準のテストランナー、パッケージ不要）
node --test tests/*.test.mjs > /tmp/kurashi-test.log 2>&1 || { cat /tmp/kurashi-test.log; exit 1; }
grep -E '^# (pass|fail)' /tmp/kurashi-test.log

# セキュリティ: 外部通信・外部スクリプト・CSPの変更・ワークフローの権限を確認
node scripts/security-check.mjs

# 家計データらしきファイルが紛れていないか
if git ls-files | grep -Ei '\.backup\.json$|^private-data/|\.(csv|pdf)$'; then echo "家計データらしきファイルがコミットされています"; exit 1; fi
echo "check: OK"
