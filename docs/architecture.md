# 設計（v4）

仕様の詳細・計算の根拠は [spec-v2.md](spec-v2.md)・[spec-v3.md](spec-v3.md)・[spec-v4.md](spec-v4.md)。ここは「今のコードがどう動いているか」の地図。

## 全体の流れ

```
index.html ──> js/main.js
                 ├─ store.load()            localStorage を読み、v1 なら migrate() して保存
                 ├─ generateRecurring()     定期取引の未作成分を記録に追加
                 ├─ render()                今のタブの render 関数で #view を描き直す
                 └─ イベント委任
                      click  [data-view]    タブ切り替え
                      click  [data-action]  actions[...]（入力シートを開く・月の移動など）
                      input  [data-filter]  記録の絞り込み（リストだけ描き直す）
                      input  [data-sim]     シミュレーション条件（結果だけ描き直す）
```

- 状態は `app.state`（保存されるデータ）と `app.ctx`（表示中のタブ・月・絞り込みなど保存しないもの）
- 状態を変えたら `app.commit()`。定期取引の作成 → 保存 → 再描画を行う
- 入力はすべて `<dialog id="sheet">`。`js/ui/forms.js` の `openSheet(app, kind, opts)` が kind（tx / category / account / budget / recurring / debt / rebase）ごとにフォームを作る。各 kind は `title / html / onInput / submit / remove` を持つ
- グラフは `js/ui/chart.js`（canvas、ライブラリなし）。描画は `render` の後の `after` で行う

## 画面（タブ）

| タブ | ファイル | 主な内容 |
| --- | --- | --- |
| ホーム | `ui/home.js` | 今月の収入・支出・収支・今日の支出、予算の残り、最近の記録、バックアップ警告（返済専用の表示は返済タブへ集約） |
| 記録（家計簿DB） | `ui/records.js` | Notion風の表。プルダウンでビュー切替（毎日の家計簿／月次の管理／カード別／カテゴリ別／テーブル）。選んだビューは `settings.recordsView` に保存。検索・絞り込み・並び替え。行タップで編集 |
| 分析 | `ui/analysis.js` | 12か月推移、支払方法別の支出（`ui/breakdown.js` の積み上げ棒）、カテゴリ別（前月比）、固定費/変動費、個人/事業 |
| 返済 | `ui/debts.js` | カード別の次回支払い日・金額・横棒グラフと合計引き落とし額、収支と返済のグラフ（`ui/overview.js`）、ローン等の次回返済、残債サマリー、返済先カード、シミュレーション比較、残債の推移グラフ（実績＝実線・予測＝点線、返済スピード別）、返済スピードの比較グラフ、返済先の詳細（推移グラフ・予定表・返済履歴） |
| 設定 | `ui/settings.js` | バックアップ、支払方法（今月の利用額・↑↓並べ替え・📋まとめて追加・未使用なら削除/使用中なら非表示）、予算、定期取引、カテゴリ |
| ＋ボタン | `ui/forms.js`（tx） | クイック入力。返済カテゴリを選ぶと返済先・元金・利息の欄が出る |

## データモデル（schemaVersion 2）

`localStorage["kurashi-shushi-data-v1"]`（キー名は v1 のまま）。バックアップファイルも同じ形式。項目の意味は [spec-v2.md 3章](spec-v2.md#3-データモデルschemaversion-2)。

| キー | 中身 |
| --- | --- |
| `transactions` | 記録。`categoryId`・`accountId` で参照。返済は `debtId`・`principal`・`interest` を持つ |
| `categories` | カテゴリ。削除せず `archived` で非表示にする（過去の記録を壊さない） |
| `accounts` | 支払方法。`id: "cash"` の「現金・口座」は必ずある |
| `budgets` | `{ categoryId, amount }` |
| `recurring` | 定期取引。`lastGeneratedMonth` まで作成済み |
| `debts` | 返済先。**現在残高は保存しない**（`baseBalance` − `baseDate` 以降の返済記録の `principal`） |
| `settings` | `repaymentBudget`・`strategy`・`lastBackupAt`・`lastAccountId` |

- v1 のデータは初回起動時に `migrate()` で変換し、元データを `kurashi-shushi-data-v1-backup` に1回だけ退避する
- 形式を変えるときは `SCHEMA_VERSION` を上げて `migrate()` に変換を追加する

## 計算（`js/calc/`、テストは `tests/`）

- `debt.js`: 現在残高、返済額の利息/元金分割（利息 = floor(残高 × 年利 / 12)）、残り回数、1回目の返済月
- `simulation.js`: `simulateAll(items, budget, strategy, startMonth)` で全返済先を月ごとに計算。最低返済額 → 余りを作戦順に上乗せ → 完済した分は翌月から余りに回る。`schedule()` は1件の返済予定表
- `summary.js`: 月の集計、カテゴリ別、予算消化、12か月推移、固定費/変動費、カテゴリ使用回数、支払方法別（`byAccount`）、月次の行（`monthlyRows`）
- `projection.js`: `buildProjection()` 残債の実績（`balanceAt` で月末残高を逆算）＋返済スピード別の予測、`speedTable()` 毎月の額ごとの完済月数・利息
- グラフ: `ui/chart.js` の `drawProjection()`（過去に最低1/4の幅を割り当てる）、`drawSpeed()`、`drawTrend()`
- `accounts.js`: `parseAccountNames()`（貼り付けた Notion の列・表から名前を取り出す）、`accountUsage()`、`moveAccount()`
- `projection.js` の `buildOverview()`: 収支と返済のグラフ用（過去は実績、今月以降の残債は予測）。描画は `ui/chart.js` の `drawOverview()`（返済タブのみ）
- タグの色: `ui/common.js` の `tagColor()`（名前から Notion の9色を決める）

## セキュリティ（詳しくは [security.md](security.md)）

- `js/crypto.js`: PIN のハッシュ化（PBKDF2）、バックアップの暗号化（AES-GCM）。Web Crypto のみ
- `js/ui/lock.js`: ロック画面。`app.locked` の間は `render()` が何も描かない。`visibilitychange` で自動ロック
- `settings.lock`（PIN のハッシュ）と `settings.lockAfter` は端末ごとの設定。書き出すバックアップには含めず、読み込み時は今の端末の設定を残す
- `scripts/security-check.mjs`: CSP の完全一致、`js/` での通信 API・外部URL・eval の禁止、`localStorage` は `store.js` だけ、ワークフローの権限と SHA 固定を検査（テスト: `tests/security.test.mjs`）

## 公開（[deploy.md](deploy.md)）

- Cloudflare Pages。ビルドコマンド `bash scripts/build-site.sh`、出力 `dist/`（`sw.js` の ASSETS と `_headers` だけ）
- `_headers` で CSP（index.html の meta と同じ＋`frame-ancestors 'none'`）などのヘッダーを返す

## バックアップ（[spec-backup.md](spec-backup.md)）

- `js/calc/backup.js`（催促の判定）、`js/ui/backup.js`（共有シートで保存・ダウンロードへの切り替え・ホームの案内・`storage.persist()`）
- 起動時（ロック解除後）、7日以上バックアップしていなければ「☁️ バックアップ」シートを1回表示。`settings.backupSnoozeUntil` で翌日まで延期

## Service Worker（`sw.js`）

- ネットワーク優先で、取得したものをキャッシュに保存。オフライン時はキャッシュを返す
- `CACHE` 名を変えると古いキャッシュを削除する。**アプリのファイルを変えたら番号を上げる**
- `ASSETS` に全ファイルを列挙する（`scripts/check.sh` が過不足を検出）

## 次回カード引き落としの計算

- `js/calc/accounts.js` の `nextCardPayments(state, today)`。カードごとに今日以降の最初の支払日を選び、締日の翌月払いとして、その請求期間（前回締日の翌日〜締日）のカード支出を合算
- 未来の定期支出も請求期間内なら見積もりに加える。`recurringId`と月・`lastGeneratedMonth`で作成済みの記録との二重計上を防ぎ、予測を保存データへ書き込まない
- 収入・現金/口座・`debtId`付きの返済・返済カテゴリを一括払いの合計から除外。分割・リボ・ローンは返済先の予定として別に表示
- 非表示のカードでも請求対象の記録があれば表示。締日/支払日未設定のカードは合計から除外し、設定用ボタンを表示
- 合計引き落とし額は各カードの次回1回分の合計（支払日は異なる場合がある）。未入力の利用、当月/翌々月払い、休日の振替、請求確定・引き落とし実績の照合は未対応
- 保存形式はschemaVersion 2のまま変更なし。編集・記録・定期取引変更で再計算。シミュレーション入力では返済グラフも再描画
