## 変更内容
<!-- 何を・なぜ変えたか -->

## セキュリティ確認（マージ前にオーナーが確認する）
- [ ] CI（check）が緑（`scripts/security-check.mjs` を含む）
- [ ] 外部への通信・外部のスクリプト／URL を追加していない
- [ ] `index.html` の Content-Security-Policy、`scripts/security-check.mjs`、`.github/workflows/` を変えていない（変えた場合は理由を下に書く）
- [ ] 実在の家計データ・カード番号・口座番号・パスワードを含めていない
- [ ] 保存データの形式を変えた場合、`migrate()` とテストで既存データを引き継げる

セキュリティに関わる変更の理由（あれば）:

## 確認したこと
- [ ] `bash scripts/check.sh`
- [ ] `docs/worklog.md`・`docs/roadmap.md` を更新
