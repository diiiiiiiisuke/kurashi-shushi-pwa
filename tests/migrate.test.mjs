import test from "node:test";
import assert from "node:assert/strict";
import { migrate, generateRecurring, defaultState, CASH_ACCOUNT_ID } from "../js/store.js";

const v1 = {
  transactions: [
    { id: "t1", date: "2026-10-01", type: "income", scope: "personal", category: "給与", paymentMethod: "cash", amount: 250000, description: "" },
    { id: "t2", date: "2026-10-02", type: "expense", scope: "personal", category: "食費", paymentMethod: "c1", amount: 1200, description: "スーパー" },
    { id: "t3", date: "2026-10-03", type: "expense", scope: "personal", category: "生活費", paymentMethod: "cash", amount: 800, description: "" },
    { id: "t4", date: "2026-10-04", type: "expense", scope: "personal", category: "返済", paymentMethod: "cash", amount: 10000, description: "" },
  ],
  debts: [{ id: "d1", name: "Aカード", kind: "クレジットカード", balance: 300000, payment: 10000, dueDay: 27, apr: null }],
  cards: [{ id: "c1", name: "日常用", closingDay: 15, paymentDay: 0 }],
  budgets: [{ category: "食費", amount: 30000 }, { category: "生活費", amount: 10000 }],
  settings: { monthlyRepayment: 115000, annualRate: 18 },
};

test("新規の支出カテゴリに個人・変動費のカフェがある", () => {
  const s = defaultState();
  const cafe = s.categories.find(c => c.name === "カフェ" && c.type === "expense");
  assert.ok(cafe);
  assert.equal(cafe.group, "variable");
  assert.equal(cafe.scope, "personal");
  assert.equal(cafe.archived, false);
  assert.ok(cafe.order < s.categories.find(c => c.name === "日用品").order);
});

test("既存データにもカフェを1件だけ追加し、記録とカテゴリIDを保持する", () => {
  const s = defaultState();
  s.categories = s.categories.filter(c => c.name !== "カフェ");
  s.transactions = [{ id: "existing", date: "2026-10-13", type: "expense", amount: 1000, categoryId: s.categories[0].id, accountId: "cash" }];
  const original = structuredClone(s);
  const updated = migrate(structuredClone(s));
  assert.deepEqual(updated.transactions, original.transactions);
  assert.deepEqual(updated.categories.filter(c => c.name !== "カフェ"), original.categories);
  assert.deepEqual(updated.budgets, original.budgets);
  assert.equal(updated.categories.filter(c => c.name === "カフェ").length, 1);
  assert.deepEqual(migrate(structuredClone(updated)), updated);
});

test("すでに追加済みのカフェは重複せず、非表示などの設定も保持する", () => {
  const s = defaultState();
  const cafe = s.categories.find(c => c.name === "カフェ");
  cafe.id = "custom-cafe";
  cafe.archived = true;
  cafe.group = "fixed";
  const updated = migrate(structuredClone(s));
  assert.equal(updated.categories.filter(c => c.name === "カフェ").length, 1);
  assert.deepEqual(updated.categories.find(c => c.name === "カフェ"), cafe);
});

test("8. v1 → v2: 件数・金額の合計が変わらない", () => {
  const s = migrate(structuredClone(v1), "2026-10-12");
  assert.equal(s.schemaVersion, 2);
  assert.equal(s.transactions.length, 4);
  assert.equal(s.transactions.reduce((n, t) => n + t.amount, 0), 262000);
  const cat = id => s.categories.find(c => c.id === id);
  assert.equal(cat(s.transactions[1].categoryId).name, "食費");
  assert.equal(cat(s.transactions[2].categoryId).name, "生活費");       // 無いカテゴリは作る
  assert.equal(cat(s.transactions[3].categoryId).isRepayment, true);
  assert.equal(s.transactions[1].accountId, "c1");
  assert.equal(s.transactions[0].accountId, CASH_ACCOUNT_ID);
  assert.equal(s.transactions[1].memo, "スーパー");
  assert.equal(s.accounts.find(a => a.id === "c1").paymentDay, null);
  assert.equal(s.budgets.length, 2);
  assert.equal(cat(s.budgets[1].categoryId).name, "生活費");
  const d = s.debts[0];
  assert.equal(d.baseBalance, 300000);
  assert.equal(d.baseDate, "2026-10-12");
  assert.equal(d.apr, 18);                 // v1 の想定年利を引き継ぐ
  assert.equal(d.kind, "card");
  assert.equal(s.settings.repaymentBudget, 115000);
});

test("migrate は何度実行しても同じ", () => {
  const once = migrate(structuredClone(v1), "2026-10-12");
  const twice = migrate(structuredClone(once), "2026-10-12");
  assert.deepEqual(twice, once);
});

test("新規は既定カテゴリ・現金口座・予算を持つ", () => {
  const s = defaultState();
  assert.ok(s.categories.some(c => c.isRepayment));
  assert.equal(s.accounts[0].id, CASH_ACCOUNT_ID);
  assert.equal(s.budgets.length, 4);
});

test("定期取引: 2か月開かなくても2か月分作り、二重に作らない", () => {
  const s = defaultState();
  s.recurring.push({ id: "r1", name: "家賃", type: "expense", amount: 80000, categoryId: s.categories[8].id, accountId: "cash", scope: "personal", day: 27, active: true, lastGeneratedMonth: "2026-08" });
  assert.equal(generateRecurring(s, "2026-10-12"), 1);   // 9/27 のみ（10/27 はまだ）
  assert.equal(generateRecurring(s, "2026-10-12"), 0);
  assert.equal(generateRecurring(s, "2026-12-01"), 2);   // 10/27, 11/27
  assert.deepEqual(s.transactions.map(t => t.date), ["2026-09-27", "2026-10-27", "2026-11-27"]);
});

test("定期取引: 31日指定は月末に合わせる", () => {
  const s = defaultState();
  s.recurring.push({ id: "r", name: "x", type: "income", amount: 1, categoryId: "c", accountId: "cash", scope: "personal", day: 31, active: true, lastGeneratedMonth: "2027-01" });
  generateRecurring(s, "2027-03-01");
  assert.equal(s.transactions[0].date, "2027-02-28");
});

test("細工したバックアップの数値欄は数値に直す", () => {
  const s = migrate({ ...defaultState(), debts: [{ id: "x", name: "n", apr: "<img src=x onerror=alert(1)>", dueDay: "<b>", baseDate: "<i>", method: "x", baseBalance: "1" }] });
  assert.equal(s.debts[0].apr, 0);
  assert.equal(s.debts[0].dueDay, null);
  assert.match(s.debts[0].baseDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(s.debts[0].method, "fixed");
});
