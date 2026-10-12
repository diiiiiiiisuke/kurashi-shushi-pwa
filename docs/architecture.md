# 設計（v2）

仕様の詳細・計算の根拠は [spec-v2.md](spec-v2.md)。ここは「今のコードがどう動いているか」の地図。

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
| ホーム | `ui/home.js` | 今月の収入・支出・収支・今日の支出、予算の残り、次の支払予定、完済の見通し、最近の記録、バックアップ警告 |
| 記録 | `ui/records.js` | 表示月の記録を日付ごとに。検索・カテゴリ・個人/事業の絞り込み。タップで編集 |
| 分析 | `ui/analysis.js` | 12か月推移、カテゴリ別（前月比）、固定費/変動費、個人/事業、返済のうち利息 |
| 返済 | `ui/debts.js` | 残債サマリー、返済先カード、シミュレーション比較、返済先の詳細（予定表・返済履歴） |
| 設定 | `ui/settings.js` | バックアップ、支払方法、予算、定期取引、カテゴリ |
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
- `summary.js`: 月の集計、カテゴリ別、予算消化、12か月推移、固定費/変動費、カテゴリ使用回数

## Service Worker（`sw.js`）

- ネットワーク優先で、取得したものをキャッシュに保存。オフライン時はキャッシュを返す
- `CACHE` 名を変えると古いキャッシュを削除する。**アプリのファイルを変えたら番号を上げる**
- `ASSETS` に全ファイルを列挙する（`scripts/check.sh` が過不足を検出）
