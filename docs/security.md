# セキュリティとデータの守り方

最終更新: 2026-10-12（PINロック・暗号化バックアップ・自動チェックを追加）

## 1. どこにデータがあるか

| 場所 | 家計データがあるか |
| --- | --- |
| GitHub（このリポジトリ・公開） | **ない**。コードとドキュメントだけ |
| Cloudflare Pages（アプリの配信） | **ない**。アプリのファイルを配るだけで、入力内容は受け取らない |
| スマホのアプリ（ブラウザの保存領域） | **ある**。入力したデータはここだけに保存される |
| 書き出したバックアップ | **ある**。パスワードで暗号化して書き出せる（推奨） |

## 2. 守りたいことと、対策

| 心配なこと | 対策 | 担当 |
| --- | --- | --- |
| アプリが家計データを外部に送る | CSP で外部通信をブラウザが拒否。`scripts/security-check.mjs` が通信・外部URL・外部スクリプトを含む変更を CI で止める | 自動 |
| AI（Codex/Claude）がうっかり危険な変更を入れる | 上の自動チェック＋PRテンプレートのセキュリティ確認欄＋**マージは人が行う**＋`AGENTS.md` の禁止事項 | 自動＋オーナー |
| GitHub アカウントを乗っ取られてコードを書き換えられる | 2段階認証（設定済み）、`main` の保護ルール（4章） | オーナー |
| CI の仕組みを悪用される | ワークフローは読み取り専用の権限・アクションはコミットSHAで固定・`pull_request_target` と secrets を使わない（自動チェックで確認） | 自動 |
| スマホを他の人に触られて家計を見られる | アプリの **PINロック**（自動ロック: すぐ／1分／5分）。ロック中は記録を画面に出さない | オーナーが設定 |
| バックアップファイルを他人に見られる | **パスワードで暗号化して書き出す**（AES-GCM 256bit、PBKDF2-SHA256 60万回） | オーナー |
| 細工したバックアップを読み込んでしまう | 読み込み時に型を整形し、表示はすべて `escapeHtml()` を通す | 自動 |
| 同じドメインの別サイトからデータを読まれる | アプリを専用ドメイン（Cloudflare Pages の `*.pages.dev`）に移し、github.io には家計データを残さない（`docs/deploy.md`） | オーナー（移行） |
| 他のサイトにアプリを埋め込まれる・情報を読まれる | `_headers` で埋め込み禁止（frame-ancestors / X-Frame-Options）、nosniff、他サイトからの読み取り許可（CORS）なし | 自動 |

## 3. アプリ側の対策（実装済み）

- **CSP（Content-Security-Policy）**: `connect-src 'self'` / `script-src 'self'` など。外部への通信・外部スクリプトはブラウザが拒否する
- **PINロック**（設定 → セキュリティ）: 数字4〜8桁。PIN はそのまま保存せず PBKDF2-SHA256（20万回、ソルト付き）のハッシュだけを保存。同じ数字の繰り返し・連番は使えない。5回間違えると30秒ずつ待ち時間が増える。ロック中は記録を画面（DOM）に出さない。PIN のハッシュはバックアップに含めない（端末ごとの設定）
- **暗号化バックアップ**（設定 → バックアップ → 書き出す）: パスワード8文字以上。AES-GCM（改ざんも検出）。読み込み時にパスワードを聞く。暗号化しない書き出しも選べるが非推奨
- **データを消す**（設定 → データを消す／ロック画面 → PINを忘れた場合）: 二重確認のうえ、この端末のデータを消す
- ユーザー入力・読み込んだデータは表示前に `escapeHtml()`、数値欄は読み込み時に数値へ整形
- `referrer` を送らない

**限界（正直に）**: PINロックは「画面を見られない」ための鍵で、端末内のデータそのものは暗号化していない。脱獄や専門的な解析をされた場合は読める可能性がある。いちばん大事なのは、iPhone 本体のパスコード・Face ID。端末内のデータ暗号化は roadmap の候補。

## 4. オーナーが GitHub で行う設定（スマホのブラウザで github.com を開いて行う）

Claude/Codex の権限ではリポジトリの設定画面を変更できないため、以下はオーナーが行う。所要10分ほど。

### 4.1 `main` ブランチを保護する（最重要）
リポジトリ → **Settings → Rules → Rulesets → New ruleset → New branch ruleset**
1. Ruleset name: `main保護`、Enforcement status: **Active**
2. Target branches → **Add target → Include default branch**
3. Rules で次をオンにする
   - **Restrict deletions**（削除禁止）
   - **Block force pushes**（履歴の書き換え禁止）
   - **Require a pull request before merging**（Required approvals は `0` のまま。1人で運用するため）
   - **Require status checks to pass** → **Add checks** で `check` を追加
4. **Create** を押す

→ これで、AI も自分も `main` に直接書き込めず、CI（セキュリティチェック込み）が緑のプルリクエストしかマージできなくなる。

### 4.2 Actions の権限を最小にする
**Settings → Actions → General**
- Actions permissions: **Allow diiiiiiiisuke, and select non-diiiiiiiisuke, actions and reusable workflows** → **Allow actions created by GitHub** だけにチェック
- Workflow permissions: **Read repository contents and packages permissions**
- **Allow GitHub Actions to create and approve pull requests** のチェックを外す

### 4.3 秘密情報の検出をオンにする
**Settings → Code security**（Advanced Security）
- **Secret Protection（Secret scanning）** と **Push protection** を Enable（公開リポジトリは無料）
- **Private vulnerability reporting** を Enable（SECURITY.md の報告窓口）
- Dependabot alerts を Enable（npm パッケージは使っていないが、念のため）

### 4.4 公開先（Cloudflare Pages）
`docs/deploy.md` の手順で移行する。Cloudflare のアカウントにも2段階認証を設定し、Cloudflare の GitHub アプリは **このリポジトリだけ** に限定する。移行後は GitHub Pages を停止する（Settings → Pages → Branch: None）

### 4.5 AI に渡す権限を絞る
- GitHub → 右上アイコン → **Settings → Applications → Installed GitHub Apps** で、ChatGPT（Codex）・Claude の **Repository access** を **Only select repositories → kurashi-shushi-pwa** にする
- Codex の環境設定で、インターネットアクセスは**オフ（または必要最小限）**にする。このリポジトリは外部パッケージ不要なので、オフでもテストは動く

## 5. オーナーの普段の習慣

1. **iPhone 本体にパスコード・Face ID**（済みのはず）
2. **アプリの PIN ロックをオン**（設定 → セキュリティ）
3. **バックアップは週1回（アプリが催促する）、iCloud Drive に保存**。iCloud は Apple ID（2段階認証）で守られている。さらに守りたいときは「パスワードを付けて保存」を使い、パスワードはパスワード管理アプリに保存
4. **AI の変更は、PR のセキュリティ確認欄と CI の緑を見てからマージ**。「外部」「通信」「CSP」「workflows」が出てくる変更は特に慎重に
5. **公開の場（Issue・PR・AIへの相談）に実際の金額・カード番号・口座・スクリーンショットを載せない**。相談はダミーの数値で
6. **移行が終わるまでは `diiiiiiiisuke.github.io` で別サイトを公開しない**（移行後は自由に公開してよい）
7. 共用PCでは使わない

## 6. GitHub 2段階認証の設定手順（済み）

1. 認証アプリを入れる（Google Authenticator / Microsoft Authenticator / iPhoneの「パスワード」アプリ など）
2. スマホのブラウザで github.com を開き、右上アイコン → Settings → Password and authentication → Enable two-factor authentication
3. 「Authenticator app」を選ぶ。同じスマホでQRコードは読めないので「setup key」の文字列をコピーし、認証アプリに手入力で追加する
4. 認証アプリに出る6桁の数字をGitHubに入力
5. **リカバリーコードを保存する**（スマホを失くしたときの唯一の復旧手段。GitHub・このリポジトリには絶対に置かない）
6. 追加で「Passkeys」も登録しておくと、指紋・顔認証でログインでき、予備の手段にもなる

リカバリーコードや認証アプリの設定キーは、このリポジトリ・Issue・AIへの相談に絶対に書かない。

## 7. AIエージェント（Codex / Claude）への約束

`AGENTS.md` の「セキュリティのルール」を参照。要点:
- CSP・`scripts/security-check.mjs`・`.github/workflows/`・`js/crypto.js`・`js/ui/lock.js` は、オーナーが明示的に許可したときだけ変更する
- 外部通信・外部URL・外部スクリプトを追加しない。自動チェックを緩めて通すことは禁止
- 実在のデータ・カード名・番号・パスワードをリポジトリや PR に書かない
- `main` に直接 push しない。マージはオーナー

## 8. 今後の強化案（roadmap にも記載）

- 端末内データの暗号化（PIN から鍵を作る。PIN を忘れると復元できないため慎重に設計）
- Face ID でのロック解除（WebAuthn）
