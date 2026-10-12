# 指示書: くらし収支 v2（家計簿 ＋ 返済シミュレーション 再実装）

- 作成: 2026-10-12（Claude Code）
- 状態: **実装済み（2026-10-12、フェーズ0〜6）**。要確認事項はすべて仮の決定で確定
- 実装担当: Codex（フェーズごとに1つのプルリクエスト）
- 前提: `AGENTS.md` のルール（依存なし・ビルドなし・CSPを緩めない・データは端末内のみ）をすべて守る

---

## 1. 目的

v1 は「入力して一覧・集計を見る」まではできるが、次の点が弱い。v2 ではここを作り直す。

| 課題（v1） | v2 で目指す状態 |
| --- | --- |
| 毎日の入力に手数がかかる（7項目を毎回選ぶ） | **金額とカテゴリを選ぶだけで1件3秒**。日付・支払方法は前回の値を引き継ぐ |
| カテゴリが自由入力で表記ゆれする（「食費」「食料品」） | カテゴリをマスタ化し、予算・集計がずれない |
| 固定費・給与を毎月手入力 | 定期取引を登録すると毎月自動で入る |
| 返済しても残高が変わらない | 返済を記録すると、利息と元金に分けて残高が減る |
| 返済シミュレーションが「全残債の合計×1つの年利」の概算 | **返済先ごと**に返済方式・年利で毎月計算し、完済月・総利息・返済順の作戦を比較できる |
| 月をまたいだ推移が見えない | 12か月の収支推移グラフ |
| `app.js` 1ファイル・テストなし | 機能ごとのファイル分割と、計算部分の自動テスト |

## 2. 画面構成

下部タブは5つ。どの画面からでも押せる「＋」ボタン（右下に固定）で記録を入力する。

| タブ | 役割 | 主な表示 |
| --- | --- | --- |
| ホーム | 今月の状況をひと目で | 今月の収入・支出・収支／今日の支出／予算の残り（上位5件）／次の支払予定3件／完済見込み |
| 記録 | 毎日の家計簿 | 月切り替え、日付ごとの一覧（1日の合計つき）、検索・カテゴリ・個人/事業で絞り込み、編集・削除 |
| 分析 | 収支の状況 | 12か月の収入・支出・収支の推移グラフ／カテゴリ別の支出（今月・前月比）／固定費と変動費の割合／事業の売上・経費・利益 |
| 返済 | 返済管理とシミュレーション | 残債の合計・完済予定・総利息見込み／返済先カード一覧／シミュレーション（後述） |
| 設定 | マスタとデータ | カテゴリ／支払方法（現金・口座・カード）／予算／定期取引／バックアップ（最終バックアップ日を表示） |

### 2.1 クイック入力（＋ボタン）

画面下からせり上がるシート（`<dialog>`）。上から順に並べる。

1. 支出 / 収入 の切り替え（初期値: 支出）
2. **金額**（自動でフォーカスし、数字キーボードを出す。`inputmode="numeric"`）
3. **カテゴリ**: よく使う順にボタンを並べる（直近30日の使用回数順、最大12個＋「その他」）
4. 日付（初期値: 今日。前回入力した日付が今日でなければ、その日付を小さく候補表示）
5. 支払方法（初期値: 前回と同じ）
6. 個人 / 事業（初期値: カテゴリの設定に従う）
7. メモ（任意）
8. 「保存」と「保存して続けて入力」。後者は金額とメモだけを空にしてシートを開いたままにする

返済カテゴリを選んだときだけ「返済先」の選択欄を出す（4章）。

### 2.2 返済タブ

1. **サマリー**: 残債合計、毎月の返済額合計、完済予定（年月）、これから払う利息の合計
2. **返済先カード**（返済先ごと）: 名前、残高、年利、返済方式、毎月の返済額、支払日、完済予定、進捗バー（`残高 / 基準残高`）。タップで詳細へ
3. **返済先の詳細**: 毎月の返済予定表（月・返済額・うち利息・うち元金・残高）、返済履歴、「明細の残高に合わせる」ボタン
4. **シミュレーション**（このタブの中心）
   - 入力: 「毎月返済に回せる総額」（スライダー＋数値入力）、作戦（金利の高い順／残高の少ない順）
   - 出力: 「最低返済額だけ払った場合」と「この条件で払った場合」を並べて比較
     - 完済月、総利息、何か月早まるか、利息がいくら減るか
     - 残債の推移グラフ（2本の線）
     - 返済先ごとの完済月の一覧
   - 完済できない場合（返済額が利息以下）は赤字で「この返済額では残高が減りません」と表示し、最低いくら必要かを示す

## 3. データモデル（schemaVersion 2）

保存先は v1 と同じ `localStorage["kurashi-shushi-data-v1"]`（キー名は変えない。`docs/decisions.md` 参照）。金額はすべて **円の整数**。日付は `"YYYY-MM-DD"`（端末のローカル日付）、月は `"YYYY-MM"`。

```js
{
  schemaVersion: 2,

  transactions: [{
    id: "uuid",
    date: "2026-10-12",
    type: "expense" | "income",
    amount: 1200,                    // 正の整数
    categoryId: "uuid",
    accountId: "uuid",               // 支払方法
    scope: "personal" | "business",
    memo: "",
    debtId: null | "uuid",           // 返済のときだけ
    principal: null | 9000,          // 返済のうち元金（返済のときだけ）
    interest: null | 1000,           // 返済のうち利息（返済のときだけ）
    recurringId: null | "uuid",      // 定期取引から自動作成されたもの
    createdAt: "ISO日時", updatedAt: "ISO日時"
  }],

  categories: [{
    id, name: "食費",
    type: "expense" | "income",
    group: "variable" | "fixed",     // 変動費 / 固定費（収入は "variable" 固定）
    scope: "personal" | "business",  // 入力時の初期値
    isRepayment: false,              // true のカテゴリを選ぶと返済先の選択欄を出す
    order: 0, archived: false        // 削除の代わりにアーカイブ（過去の記録を壊さない）
  }],

  accounts: [{
    id, name: "現金",
    kind: "cash" | "bank" | "card",
    closingDay: null | 15, paymentDay: null | 10,   // カードのみ
    archived: false
  }],

  budgets: [{ categoryId, amount }],               // 毎月の予算

  recurring: [{
    id, name: "家賃", type: "expense", amount: 80000,
    categoryId, accountId, scope, memo: "",
    day: 27,                         // 毎月の日付。月末を超える場合はその月の末日
    active: true,
    lastGeneratedMonth: "2026-10"    // ここまで作成済み
  }],

  debts: [{
    id, name: "Aカード リボ",
    kind: "card" | "loan" | "installment" | "other",
    method: "fixed" | "principal" | "installment" | "none",   // 5章
    apr: 15.0,                       // 年利%（無利息は 0）
    monthlyPayment: 10000,           // 毎月の返済額（method により意味が変わる。5章）
    installmentsLeft: null | 12,     // method=installment のときの残り回数
    dueDay: 27,
    baseBalance: 300000,             // 基準残高（明細で確認した残高）
    baseDate: "2026-10-01",          // 基準残高の日付
    archived: false
  }],

  settings: {
    repaymentBudget: 115000,          // 毎月返済に回せる総額
    strategy: "avalanche" | "snowball",
    lastBackupAt: null | "ISO日時"
  }
}
```

### 3.1 v1 からの移行（`migrate(data)`）

`load()` とバックアップの読み込みの両方で、同じ `migrate()` を通す。`schemaVersion` が無ければ v1 とみなす。

| v1 | v2 |
| --- | --- |
| `transactions[].category`（文字列） | 同じ名前・同じ type のカテゴリを作成（無ければ）し `categoryId` に。名前が「返済」のものは `isRepayment: true` |
| `transactions[].paymentMethod === "cash"` | 既定の口座「現金・口座」（kind: cash）の `accountId` |
| `transactions[].paymentMethod === カードID` | `cards[]` から作った accounts（kind: card、同じID）の `accountId` |
| `transactions[].description` | `memo` |
| `cards[]` | `accounts[]`（kind: card、`closingDay`/`paymentDay` の 0 は null） |
| `budgets[].category`（文字列） | 対応するカテゴリ（無ければ作成）の `categoryId` |
| `debts[].balance` | `baseBalance`、`baseDate` は移行した日 |
| `debts[].payment` | `monthlyPayment`、`method: "fixed"` |
| `debts[].apr === null` | v1 の `settings.annualRate` |
| `debts[].dueDay === 0` | `null` |
| `settings.monthlyRepayment` | `settings.repaymentBudget` |

- 移行前に、v1 のデータを `localStorage["kurashi-shushi-data-v1-backup"]` に1回だけ退避する（失敗時の保険）
- 移行は何度実行しても同じ結果になる（v2 を渡したら何もしない）

### 3.2 初期カテゴリ（新規利用時）

- 支出・変動費: 食費、日用品、交通費、交際費、趣味・娯楽、衣服・美容、医療、その他
- 支出・固定費: 家賃、水道光熱費、通信費、サブスク、保険
- 支出・返済: 返済（`isRepayment: true`）
- 支出・事業: 事業経費（scope: business）
- 収入: 給与、副業売上（scope: business）、その他収入

## 4. 返済の記録と残高

- 返済先の **現在残高** は保存しない。次の式で毎回計算する
  `現在残高 = baseBalance − (baseDate 以降の、その debtId の返済記録の principal の合計)`
  こうすると、記録の編集・削除をしても残高がずれない
- 返済を入力したとき、`interest` と `principal` を自動で入れる（入力欄で修正もできる）
  - `interest = floor(返済日時点の残高 × apr / 100 / 12)`（method が none なら 0）
  - `principal = amount − interest`（0 未満なら 0、残高を超えるなら残高まで）
- 「明細の残高に合わせる」: 実際の明細の残高と日付を入力すると、`baseBalance` と `baseDate` を上書きする。利息の誤差はこれで定期的にリセットする前提
- 返済の記録は通常の支出としても集計する（家計の支出に含める）。分析画面では「うち利息」を別に表示する

## 5. 返済シミュレーションの計算仕様

計算は `js/calc/simulation.js` に **画面に依存しない純粋な関数** として実装し、自動テストを書く。

### 5.1 返済方式（`method`）

| method | 想定 | 毎月の返済額 | `monthlyPayment` の意味 |
| --- | --- | --- | --- |
| `fixed` | リボ（定額）、カードローン、元利均等 | 一定額（最後の月は残り全額） | 毎月の返済額（利息込み） |
| `principal` | 元金定額リボ、元金均等 | 元金 + その月の利息 | 毎月の元金 |
| `installment` | 分割払い（手数料込みで回数固定） | `ceil(残高 / 残り回数)` | 使わない（`installmentsLeft` を使う） |
| `none` | 無利息の立替・家族からの借入など | 一定額 | 毎月の返済額 |

### 5.2 1か月の計算（全方式共通）

```
interest  = method が none / installment なら 0、それ以外は floor(balance × apr / 100 / 12)
payment   = 上の表の毎月の返済額。ただし balance + interest を超えない
principal = payment − interest
balance   = balance − principal
```

- 実際のカード会社は日割り（年365日）で計算するため、v2 は「月割りの概算」と画面に明記する
- 全体の残高が1か月で減らなかったら計算を止め、`payable: false` と `stuck: [{ id, name, interest, minPayment }]`（`minPayment = interest + 1`）を返す
- 上限は 600 か月。超えたら `payable: false`
- 1か月目: 今月まだ返済を記録しておらず、支払日が今日以降の返済先があれば今月、なければ来月（`firstPaymentMonth`）

### 5.3 複数の返済先と作戦（`simulateAll`）

```
入力: debts[], budget（毎月返済に回せる総額）, strategy
毎月:
  1. 全返済先について 5.2 の通常返済額を計算する（最低返済額）
  2. 余り = budget − 最低返済額の合計（0 未満なら不足として警告し、余りは 0）
  3. 余りを作戦の順に、残っている返済先へ追加で元金に充てる
     - avalanche: 年利の高い順（同じなら残高の少ない順）
     - snowball : 残高の少ない順（同じなら年利の高い順）
  4. 完済した返済先の最低返済額は、翌月から余りに加わる（自然に次の返済先へ回る）
出力: { payable, months, payoffMonth: "YYYY-MM", totalInterest, totalPaid,
        perDebt: [{ id, payoffMonth, totalInterest }],
        timeline: [{ month: "YYYY-MM", balance, interest, paid }] }
```

比較表示は `simulateAll(debts, 最低返済額の合計, strategy)` と `simulateAll(debts, budget, strategy)` の2回分を並べる。

### 5.4 テストで必ず確かめるケース（`tests/simulation.test.mjs`）

1. 残高 100,000・年利 0%・月 10,000（fixed）→ 10か月、利息 0
2. 残高 100,000・年利 15%・月 10,000（fixed）→ 1か月目の利息 1,250、元金 8,750
3. 返済額が利息以下（残高 1,000,000・年利 18%・月 10,000）→ `payable: false`、`minPayment: 15001`
4. 分割（残高 120,000・残り 12回）→ 12か月で完済
5. 2件・budget が最低返済額の合計より多い → avalanche は年利の高い方が先に完済、snowball は残高の少ない方が先に完済
6. avalanche の総利息 ≤ snowball の総利息
7. 最後の月は残高ぴったりで終わり、残高がマイナスにならない
8. v1 形式のデータを `migrate()` に通すと v2 形式になり、件数・金額の合計が変わらない（`tests/migrate.test.mjs`）

## 6. ファイル構成（ビルドなしの ES Modules）

```
index.html                 <script type="module" src="js/main.js">
styles.css
sw.js                      ASSETS に js/ 以下をすべて列挙する
js/
  main.js                  起動、タブ切り替え、render の呼び出し
  store.js                 load / save / migrate / 定期取引の自動作成
  util.js                  yen, localDate, escapeHtml, id, 月の計算
  calc/
    summary.js             月の集計、予算消化、カテゴリ別、12か月推移（純粋関数）
    simulation.js          5章の返済計算（純粋関数）
    debt.js                現在残高、利息・元金の自動分割（純粋関数）
  ui/
    home.js  records.js  analysis.js  debts.js  settings.js
    entry-sheet.js         クイック入力
    chart.js               グラフ描画（canvas、ライブラリなし）
tests/
  simulation.test.mjs  migrate.test.mjs  summary.test.mjs
```

- `calc/` は DOM・localStorage に触らない（Node でそのままテストできるように）
- テストは Node 標準の `node --test tests/`（パッケージ不要）。`scripts/check.sh` に追加する
- `node --check` の対象を `js/**/*.js` に広げる
- CSP は変更不要（`script-src 'self'` で ES Modules は動く）

## 7. 実装フェーズ（1フェーズ＝1プルリクエスト）

各フェーズの完了時に: `bash scripts/check.sh` が通る／`sw.js` の CACHE を上げる／`docs/worklog.md`・`docs/roadmap.md`・必要なら `docs/architecture.md` を更新する。

| # | 内容 | 完了条件 |
| --- | --- | --- |
| 0 | **土台**: ファイル分割（6章）、`migrate()`、テストの仕組み、check.sh 更新。見た目と機能は v1 のまま | v1 のデータが入った状態で開いても全データが表示される／migrate のテストが通る |
| 1 | **計算**: `calc/simulation.js`・`calc/debt.js` とテスト（5.4 の全ケース） | テストがすべて通る（画面はまだ変えない） |
| 2 | **返済タブ**: 2.2 の画面、返済先の登録・編集・アーカイブ、返済記録と残高計算、明細に合わせる | 返済を記録すると残高が減る／記録を削除すると戻る／シミュレーションで2条件の比較が出る |
| 3 | **家計簿**: クイック入力（2.1）、カテゴリ・支払方法・予算の管理画面（編集・アーカイブ）、記録タブの絞り込み | 1件を「金額＋カテゴリ＋保存」の3タップで入力できる |
| 4 | **定期取引**: 登録画面と、起動時に未作成の月の分を自動作成 | 2か月開かなくても、開いた時点で2か月分が作られる。二重に作られない |
| 5 | **ホーム・分析**: 2章のホームと分析タブ、12か月推移グラフ | 前月比・固定費と変動費の割合が表示される |
| 6 | **仕上げ**: 最終バックアップ日の表示と30日超の警告、空の状態の案内、アクセシビリティ（ボタンのラベル、文字の大きさ） | スマホ実機で全タブを操作して崩れがない |

### Codex への依頼文（フェーズごとにコピーして使う）

```
AGENTS.md と docs/spec-v2.md を読んでください。
docs/spec-v2.md の「フェーズ N」を実装してください。仕様にない判断が必要なときは、
勝手に決めずに docs/spec-v2.md の「要確認事項」に追記してプルリクエストの説明に書いてください。
完了条件を満たし、scripts/check.sh を通し、docs/worklog.md と docs/roadmap.md を更新してください。
```

## 8. やらないこと（v2 の範囲外）

- 銀行・カード明細の自動取り込み（外部通信が必要になるため。CSV取り込みは将来検討）
- 複数端末の同期・クラウド保存
- 日割り（365日）での正確な利息計算
- 外部のグラフライブラリ・UIフレームワークの導入
- パスコードロック・暗号化バックアップ（別タスク。`docs/security.md`）

## 9. 要確認事項

2026-10-12 オーナー回答: **すべて仮の決定どおりで確定**。新しく判断が必要になったら下に追加する。

| # | 質問 | 決定 |
| --- | --- | --- |
| Q1 | 返済中のカード・ローンの返済方式は？（明細や契約書の「定額リボ」「元利定額」「元金定額」など） | すべて `fixed`（利息込みの定額） |
| Q2 | シミュレーションの作戦は、利息が最も減る「金利の高い順」と、件数が早く減る「残高の少ない順」のどちらを初期値にするか | 金利の高い順（avalanche） |
| Q3 | カードで買い物したときの支出は「使った日」で記録するか「引き落とし日」で記録するか | 使った日（家計簿として自然）。引き落とし予定は将来の機能 |
| Q4 | 事業の収支を家計の収支と合算して表示するか、分けるか | ホームは合算、分析タブで個人/事業を分けて表示 |
| Q5 | 初期カテゴリ（3.2）に足したい・消したいものはあるか | 3.2 のまま |
