# くらし収支

スマホで毎日の家計簿、自分の収支状況（個人・事業）、カード・ローンの返済状況を管理する、依存関係のないPWAです。

- アプリ: https://diiiiiiiisuke.github.io/kurashi-shushi-pwa/
- 開発する人・AIエージェントは、まず [AGENTS.md](AGENTS.md) と [docs/](docs/README.md) を読んでください
- スマホからの開発手順: [docs/mobile-workflow.md](docs/mobile-workflow.md)
- 次にやること: [docs/roadmap.md](docs/roadmap.md)

## 大切な扱い

- このリポジトリには **アプリのコードとドキュメントだけ** を置きます。家計データ、明細、APIキー、PDFはコミットしません（リポジトリは公開です）。
- 記録は端末内（ブラウザの localStorage）に保存され、外部には送信しません。機種変更・ブラウザデータ削除の前に、アプリの「設定」からバックアップを書き出してください。

## 開発

```sh
python3 -m http.server 8000   # http://localhost:8000 で確認
bash scripts/check.sh         # コミット前のチェック
```

アプリのファイルを変更したら `sw.js` の `CACHE` の番号を上げてください。
