# 作業ログ

新しいものを上に追加する。書式: 日付・担当（Codex / Claude / 手動）・やったこと・残課題。

---

## 2026-10-12 Claude Code — v2 指示書の作成

- オーナーの依頼: 家計アプリ・返済シミュレーションを再実装したい。まず具体的な指示書を作る
- `docs/spec-v2.md` を作成（画面構成、データモデル v2 と v1 からの移行、返済計算の仕様とテストケース、ファイル構成、7フェーズの実装手順、Codex への依頼文、要確認事項 Q1〜Q5）
- `AGENTS.md`・`docs/roadmap.md`・`docs/README.md` から指示書へ誘導
- 残課題: オーナーが要確認事項に回答 → フェーズ0から実装

## 2026-10-12 Claude Code — GitHub 2段階認証の手順を追加

- オーナーが2段階認証を設定したいとのことで、手順を `docs/security.md` に追記（設定自体はオーナーがGitHub上で行う）

## 2026-10-12 Claude Code — セキュリティ確認と対策

**オーナーからの質問**: セキュリティは大丈夫か。入力したデータが外部に漏れないようにする方法は？

**確認したこと**
- アプリは外部通信をしていない。家計データはスマホの localStorage のみで、GitHubには送られない
- 弱点1: 外部通信を技術的に止める仕組みがなかった
- 弱点2: 画面に出すIDがエスケープされておらず、細工したバックアップJSONを読み込むとスクリプトを埋め込める余地があった
- 注意点: 同じ `diiiiiiiisuke.github.io` で別サイトを公開すると、保存データを読まれうる（同一オリジン）

**やったこと**
- `index.html` に CSP（`connect-src 'self'` など）と `referrer` 無効化を追加
- IDを `escapeHtml()` に通し、`escapeHtml()` で `'` もエスケープするよう修正
- `sw.js` の CACHE を v4 に変更
- `docs/security.md` を追加し、AGENTS.md に「CSPを緩めない」ルールを追加

**検証**: ブラウザで通常操作が動くこと、`fetch("https://example.com")` がCSPでブロックされること、細工したデータを入れても `<img onerror>` が挿入されないことを確認

## 2026-10-12 Claude Code — 引き継ぎ体制の整備と家計簿の改善

**オーナーからの依頼**
- これからやることは全てGitHubにファイルとして残す
- 今は一時的にClaudeを使っているが、普段はCodexで開発するので齟齬なく引き継げるようにする
- スマホからも開発したいのでGitHubでフォルダ管理する
- やりたいこと: 毎日の家計簿と、自分の収支状況の管理をPWAで行う

**やったこと**
- `AGENTS.md`（Codex・Claude共通ルール）、`CLAUDE.md`（AGENTS.mdへの参照のみ）を追加
- `docs/` に要件・設計・ロードマップ・判断記録・作業ログ・スマホ開発手順を追加
- `scripts/check.sh`（構文チェック・家計データの混入チェック）と GitHub Actions の CI を追加
- 収支タブ: 表示月で絞り込み、日付ごとにまとめて1日の収支を表示。月切り替えをホームと共通化
- 収支の編集機能を追加
- 不具合修正: 日付の初期値が `toISOString()`（UTC）だったため、日本時間0〜9時に前日になっていた → `localDate()` に変更
- 不具合修正: Service Worker がキャッシュ優先かつ古いキャッシュを削除しなかったため、更新がスマホに届かなかった → ネットワーク優先にし、`CACHE` を v3 に変更
- README の「リポジトリは非公開に」という記述が実態（public）と合わないため修正

**確認したこと**
- `bash scripts/check.sh` 成功
- ブラウザ（日本時間 7:30 に固定）で、入力の初期日付が当日になること、追加→編集→一覧表示が正しく動くことを確認

**残課題** → `docs/roadmap.md` の「次にやる」を参照

**この時点より前の履歴**（コミットのみ。会話記録はなし）
- `9879881` feat: add household finance PWA
- `d5c6068` feat: add payment cards and finance visualizations
- `34a24f4` fix: show payment method in transaction history
