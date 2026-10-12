#!/usr/bin/env bash
# 公開するファイルだけを dist/ に集める（Cloudflare Pages のビルドコマンド）。docs/deploy.md
# docs/・tests/・scripts/・AGENTS.md などは公開しない
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
cp index.html styles.css sw.js manifest.webmanifest icon.svg _headers dist/
cp -R js dist/js
echo "build: dist/ に $(find dist -type f | wc -l | tr -d ' ') ファイル"
