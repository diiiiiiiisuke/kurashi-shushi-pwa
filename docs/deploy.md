# 公開（デプロイ）— Cloudflare Workers（静的アセット）

- 決定: 2026-10-12（`docs/decisions.md`）
- 理由: 今後、同じ GitHub アカウント（`diiiiiiiisuke.github.io`）で別のサイトを公開しても、家計データを読まれないようにするため。
  ブラウザの保存領域はドメインごとに分かれるので、このアプリだけの専用ドメイン（`*.workers.dev`）に移す。

> **2026-10-12 移行完了**: オーナーの iPhone のホーム画面アプリは `kurashi-shushi-pwa.<サブドメイン>.workers.dev` で動いている。本番デプロイ（PR #9・#10・#11）は成功。残りは「4. 古いアプリ（github.io）を片付ける」

> 2026-10-12 追記: Cloudflare の「Create」は今は **Workers** が標準になっているため、オーナーは Workers で作成した（Worker 名 `kurashi-shushi-pwa`）。
> Workers では設定ファイル `wrangler.jsonc` が必要なので追加した。サーバー側のコードは持たず、`dist/` のファイルを配るだけ（Pages と同じ）。

## 仕組み

```
main にマージ → Cloudflare（Workers Builds）が npx wrangler deploy を実行
→ wrangler.jsonc の build.command で bash scripts/build-site.sh → dist/ を作る
→ dist/ の中身だけを公開（docs/・tests/・scripts/ などは公開しない）
→ https://kurashi-shushi-pwa.<アカウントのサブドメイン>.workers.dev に反映
```

- `wrangler.jsonc`: Worker 名・ビルドコマンド・公開フォルダ（`./dist`）だけ。サーバー側のコード（`main`）や外部サービスとの接続（KV・D1 など）は `scripts/security-check.mjs` が禁止している

- `scripts/build-site.sh`: 公開するファイル（`index.html`・`styles.css`・`sw.js`・`manifest.webmanifest`・`icon.svg`・`_headers`・`js/`）だけを `dist/` にコピーする
- `_headers`: Cloudflare が返すセキュリティ用の HTTP ヘッダー（CSP＋埋め込み禁止など）。`scripts/security-check.mjs` が内容を確認する
- プルリクエストごとに「プレビュー用URL」も自動で作られる。マージ前にスマホで試せる（プレビューはデータの保存場所が別なので、本番の記録は見えない。試すときはデモ用ファイルを読み込む）

## オーナーが行う移行手順（スマホのブラウザで。20分ほど）

> 本番の記録を入れる前に行う。もし記録がある場合は、最初に今のアプリで「設定 → バックアップ → 書き出す」をしておく。

### 1. Cloudflare のアカウントを作る
1. https://dash.cloudflare.com/sign-up でアカウントを作る（無料プラン）
2. 右上のアイコン → **My Profile → Authentication** で **2段階認証（Two-Factor Authentication）をオン**にする（GitHub と同じ認証アプリでよい）

### 2. Cloudflare でアプリを作る（Workers。2026-10-12 オーナー作成済み）

Workers & Pages → Create → **Import a repository** → GitHub の `kurashi-shushi-pwa` → Project name `kurashi-shushi-pwa`、Build command は空欄、Deploy command は `npx wrangler deploy`（初期値のまま）。設定ファイル `wrangler.jsonc` がリポジトリにあるので、それ以外の入力は不要。
ビルドに失敗した場合は、Worker の **Deployments（または Builds）→ 失敗したビルド → Retry build**。

### （旧）Cloudflare Pages で作る場合
1. 左メニュー **Workers & Pages → Create → Pages → Connect to Git**
2. **GitHub** を選び、Cloudflare の GitHub アプリをインストールする。このとき **Only select repositories → kurashi-shushi-pwa** だけを選ぶ
3. リポジトリ `kurashi-shushi-pwa` を選んで **Begin setup**
4. 次のように入力する

   | 項目 | 値 |
   | --- | --- |
   | Project name | `kurashi-shushi`（使えない場合は別の名前。これが URL になる） |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | `bash scripts/build-site.sh` |
   | Build output directory | `dist` |

5. **Save and Deploy**。1〜2分で `https://kurashi-shushi.pages.dev`（Project name による）が表示される

### 3. 新しいアプリをホーム画面に追加する
1. iPhone の Safari で新しい URL を開く → 共有 → **ホーム画面に追加**
2. ホーム画面の**新しいアプリ**を開き、「設定 → バックアップ → 読み込む」で記録を入れる（本番開始なら、保有クレカ18枚入りの開始用ファイル）
3. 必要なら「設定 → セキュリティ」で PIN ロックをオンにする（PIN は端末・アプリごとの設定なので、新しいアプリで設定し直す）

### 4. 古いアプリ（github.io）を片付ける（大事）
1. ホーム画面に**古いアプリ**（github.io）が残っていれば、開いて「設定 → データを消す」で中の記録を消し、アイコンを削除する（古いアプリがなければ飛ばす）
2. iPhone の **設定 → アプリ → Safari → 詳細 → Webサイトデータ** で `diiiiiiiisuke.github.io` を左にスワイプして削除する（Safari で開いたときのデータも消える。**workers.dev は消さない**）
3. GitHub → リポジトリ → **Settings → Pages** → Build and deployment の Branch を **None** にして **Save**（github.io での公開を止める）

→ これで `diiiiiiiisuke.github.io` には家計データが残らず、今後そこで別のサイトを公開しても安全。

### 5. 新しい URL を伝える
Claude か Codex に「新しい URL は https://〜.workers.dev」と伝え、`README.md`・`AGENTS.md`・`docs/` の URL を更新してもらう。

## 開発者向けメモ

- 公開するファイルを増やしたら、`sw.js` の `ASSETS` に追加する。`scripts/check.sh` が `dist/` の中身と `ASSETS` のずれを検出する
- `_headers` を変えるときは、`scripts/security-check.mjs` のルール（CSP の一致・埋め込み禁止・他サイトからの読み取り許可の禁止）に従う。変更はオーナーの許可が必要（`AGENTS.md`）
- Cloudflare のビルドでは外部パッケージを使わない（`npm install` しない）
