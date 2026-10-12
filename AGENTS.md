# AGENTS.md — AIエージェント共通の作業ルール

このファイルは Codex / Claude Code など、このリポジトリで作業するすべてのAIエージェント向けの引き継ぎ書です。
**作業を始める前に必ずこのファイルと `docs/` を読むこと。** 会話の記憶ではなく、このリポジトリの中身を正とします。

## プロジェクト概要

- アプリ名: **くらし収支**（家計簿・収支管理PWA）
- 目的: オーナーが **毎日の家計簿** と **自分の収支状況（個人・事業・返済）** をスマホで管理する
- 形式: 依存ライブラリなし・ビルドなしの静的PWA（HTML / CSS / 素のJavaScript の ES Modules）
- データ保存: 端末の `localStorage`（キー `kurashi-shushi-data-v1`）。サーバーには一切送信しない
- 公開: GitHub Pages（`main` ブランチのルートを配信）
- オーナーはスマホから GitHub で開発・管理する。日常の開発は **Codex**、Claude Code は一時的な利用

## ファイル構成

```
/                       ← GitHub Pages で配信されるアプリ本体
├── index.html          画面の枠（タブ・＋ボタン・入力シート）。CSP もここ
├── styles.css          スタイル
├── js/
│   ├── main.js         起動・タブ切り替え・ボタン操作（data-action）のまとめ役
│   ├── store.js        保存・読み込み・v1→v2 移行・定期取引の自動作成
│   ├── util.js         金額・日付・エスケープなどの共通関数
│   ├── calc/           計算（DOM に触らない純粋関数。テスト対象）
│   │   ├── debt.js         返済先の現在残高・利息と元金の分割
│   │   ├── simulation.js   返済シミュレーション
│   │   ├── projection.js   返済グラフ用（実績＋予測、返済スピードの比較）
│   │   └── summary.js      月の集計・予算・推移・支払方法別
│   └── ui/             画面（ホーム・家計簿DB・分析・返済・設定・入力シート・グラフ・カード別内訳）
├── tests/              node --test で動く自動テスト（パッケージ不要）
├── sw.js               Service Worker（ASSETS に全ファイルを列挙）
├── manifest.webmanifest / icon.svg
├── package.json        依存なし。js/ を ES Modules として Node で読むためだけ
├── AGENTS.md / CLAUDE.md / README.md
├── docs/               指示書・仕様・設計・ToDo・判断記録・作業ログ
├── scripts/check.sh    構文・ASSETS・テスト・データ混入のチェック
└── .github/workflows/  CI（check.sh を実行）
```

詳しくは `docs/README.md` を参照。

## 絶対に守ること

1. **家計データをコミットしない。** バックアップJSON（`*.backup.json`）、明細CSV・PDF、口座番号、APIキーなどは置かない。リポジトリは公開（public）なので特に注意。
2. **外部へのデータ送信を追加しない。** 外部API・解析タグ・CDN読み込みを入れる場合は、事前にオーナーへ確認し `docs/decisions.md` に記録する。
3. **保存データの互換性を壊さない。** データ形式を変える場合は `schemaVersion` を上げ、`js/store.js` の `migrate()` に旧形式からの変換とテストを追加し、`docs/architecture.md` を更新する。
   - 状態を変えたら `app.commit()` を呼ぶ（保存と再描画）
   - 計算は `js/calc/` に純粋関数で書き、`tests/` にテストを足す
   - `js/` にファイルを追加・削除したら `sw.js` の `ASSETS` も直す（check.sh が検出する）
4. **アプリのファイルを変えたら `sw.js` の `CACHE` の番号を上げる**（例: `kurashi-shushi-v3` → `v4`）。上げないとスマホに古い版が残る。
5. **UIの文言は日本語。** 金額は `yen.format()` を使う。日付は `localDate()` を使う（`toISOString()` はUTCなので日本時間の朝に前日になる）。
6. ユーザー入力・インポートしたデータをHTMLに出すときは、IDも含めて必ず `escapeHtml()` を通す。
7. **`index.html` の Content-Security-Policy を緩めない。** 外部通信を禁止してデータ流出を防いでいる。詳しくは `docs/security.md`。

## 現在進行中の作業

v2（`docs/spec-v2.md`）・v3（`docs/spec-v3.md`: Notion風DB・カード別・返済グラフ）は実装済み。次は `docs/roadmap.md` の「次にやる」から。仕様にない判断が必要なときは勝手に決めず、`docs/spec-v2.md` の「要確認事項」に追記してオーナーに確認する。

## 作業の流れ（毎回）

1. `docs/roadmap.md` で次にやることを確認する
2. 実装する（既存コードの書き方に合わせる。新しいライブラリやビルド工程は入れない）
3. `bash scripts/check.sh` を実行して通す
4. 可能ならブラウザで動作確認する（`python3 -m http.server` → `http://localhost:8000`）
5. **ドキュメントを更新する**（ここが引き継ぎの要）
   - `docs/worklog.md` の先頭に、日付・やったこと・残課題を追記
   - 終わった項目は `docs/roadmap.md` でチェックを付ける。新しい課題も追加する
   - 仕様や方針を決めたら `docs/decisions.md` に追記
   - データ形式・画面構成を変えたら `docs/architecture.md` を更新
6. コミットメッセージは `feat:` / `fix:` / `docs:` / `chore:` で始め、内容は日本語でも英語でもよい

## 動作確認

- ローカル: `python3 -m http.server 8000` を実行し、`http://localhost:8000` を開く
- Service Worker はネットワーク優先なので、オンラインで再読み込みすれば新しい版になる
- 本番: GitHub Pages（`https://diiiiiiiisuke.github.io/kurashi-shushi-pwa/`）。`main` にマージすると反映される
