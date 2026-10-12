# 設計

## 全体

- 静的ファイルのみ。`index.html` が `app.js` と `styles.css` を読み込む
- `app.js` はグローバル変数 `state` に全データを持ち、`save()` で `localStorage` に保存して `render()` で画面全体を描き直す
- 入力はすべて1つの `<dialog id="entryDialog">` を使い回す。`openForm(kind, existing)` が `kind` に応じてフォーム項目を生成し、送信時に `kind` ごとに `state` を更新する
- ボタンの動作は `data-*` 属性で判定する（`data-view` / `data-open` / `data-edit-transaction` / `data-delete-*`）

## 画面（タブ）

| タブ | section id | 内容 |
| --- | --- | --- |
| ホーム | `dashboard` | 月の収入・支出・収支・残債、予算、支払予定、事業の売上、支出グラフ、返済シミュレーション |
| 収支 | `transactions` | 表示中の月の取引を日付ごとに表示。編集・削除 |
| 返済 | `debts` | 返済先カード |
| 設定 | `settings` | 支払カード、バックアップ |

月の切り替え（`.month-control`）はホームと収支タブで共通。表示月は `shownMonth`。

## データモデル

`localStorage["kurashi-shushi-data-v1"]` に次のJSONを保存する。バックアップファイルも同じ形式。

```js
{
  transactions: [{
    id: "uuid",
    date: "YYYY-MM-DD",          // 端末のローカル日付
    type: "income" | "expense",
    scope: "personal" | "business",
    category: "食費",             // 自由入力
    paymentMethod: "cash" | "<cards[].id>",
    amount: 1200,                 // 円・正の整数
    description: "スーパー"
  }],
  debts: [{
    id, name, kind: "クレジットカード" | "カードローン" | "分割払い" | "その他",
    balance: 0,                   // 現在残高
    payment: 0,                   // 毎月の返済予定
    dueDay: 0,                    // 支払日（0 = 未設定）
    apr: null | 15.0              // 年利%
  }],
  cards: [{ id, name, closingDay: 0, paymentDay: 0 }],
  budgets: [{ category: "食費", amount: 30000 }],   // カテゴリ名がキー
  settings: { monthlyRepayment: 115000, annualRate: 18 }
}
```

- `load()` は `defaultState()` に保存データを上書きマージするので、トップレベルのキー追加は互換性を保てる
- 形式を変えるときはキー名のバージョンを上げずに `load()` でマイグレーションする方針（[decisions.md](decisions.md)）

## Service Worker（`sw.js`）

- ネットワーク優先で、取得したものをキャッシュに保存。オフライン時はキャッシュを返す
- `CACHE` 名を変えると、activate 時に古いキャッシュを削除する
- **アプリのファイルを変更したら `CACHE` の番号を上げる**
