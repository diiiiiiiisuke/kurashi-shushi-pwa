import test from "node:test";
import assert from "node:assert/strict";
import { buildProjection, speedTable, speedOptions } from "../js/calc/projection.js";
import { balanceAt, toSimItem } from "../js/calc/debt.js";
import { byAccount, monthlyRows } from "../js/calc/summary.js";

const debt = { id: "d", name: "A", method: "fixed", apr: 0, monthlyPayment: 10000, dueDay: 27, baseBalance: 100000, baseDate: "2026-08-01", archived: false };
const txs = [
  { id: "p1", debtId: "d", date: "2026-08-27", amount: 10000, principal: 10000, type: "expense" },
  { id: "p2", debtId: "d", date: "2026-09-27", amount: 10000, principal: 10000, type: "expense" },
  { id: "p0", debtId: "d", date: "2026-07-27", amount: 10000, principal: 10000, type: "expense" }, // 基準日より前
];

test("balanceAt: 基準日以降は元金を引き、基準日より前は足し戻す", () => {
  assert.equal(balanceAt(debt, txs, "2026-08-31"), 90000);
  assert.equal(balanceAt(debt, txs, "2026-09-30"), 80000);
  assert.equal(balanceAt(debt, txs, "2026-07-31"), 100000);  // 7/31 の後〜基準日前の返済はない
  assert.equal(balanceAt(debt, txs, "2026-06-30"), 110000);  // 7/27 の返済前
});

test("buildProjection: 実績は今まで、予測は今の次の月から。今の残高でつながる", () => {
  const p = buildProjection([debt], txs, "2026-10-12", 20000);
  assert.equal(p.months[0], "2026-07");                       // 最初の返済記録の月から
  assert.equal(p.months[p.anchorIndex], "2026-09");          // 今月(10月)はまだ返済前 → 予測は10月から
  assert.equal(p.past.at(-1).balance, 80000);
  assert.equal(p.past[0].balance, 100000);                    // 7月末
  const sel = p.scenarios.find(s => s.isSelected);
  assert.equal(sel.budget, 20000);
  assert.equal(sel.points[0].balance, 80000);
  assert.equal(sel.points.at(-1).balance, 0);
  assert.equal(sel.result.months, 4);
  const min = p.scenarios.find(s => s.isMin);
  assert.equal(min.result.months, 8);
  assert.equal(p.months.length, p.anchorIndex + 1 + 8);      // 最も遅い完済まで
  assert.ok(p.paid.slice(0, p.anchorIndex + 1).every(b => !b.future));
  assert.equal(p.paid.find(b => p.months[b.index] === "2026-08").amount, 10000);
});

test("speedOptions: 最低・設定・+1万・+3万（重複なし・昇順）", () => {
  assert.deepEqual(speedOptions(10000, 0), [10000, 20000, 40000]);
  assert.deepEqual(speedOptions(10000, 15000), [10000, 15000, 25000, 45000]);
});

test("speedTable: 毎月の額が多いほど早く完済し利息が減る", () => {
  const d = { ...debt, apr: 15, baseDate: "2026-10-01", baseBalance: 300000 };
  const { minTotal, rows } = speedTable([toSimItem(d, [])], "2026-10", 25000);
  assert.equal(minTotal, 10000);
  assert.ok(rows.length >= 6);
  assert.ok(rows[0].isMin);
  assert.ok(rows.some(r => r.isSelected && r.amount === 25000));
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].months <= rows[i - 1].months);
    assert.ok(rows[i].totalInterest <= rows[i - 1].totalInterest);
  }
  assert.ok(rows.at(-1).savedInterest > 0);
});

test("byAccount: 支払方法ごと・カテゴリごとの支出（多い順）", () => {
  const r = byAccount([
    { type: "expense", accountId: "card", categoryId: "food", amount: 3000 },
    { type: "expense", accountId: "card", categoryId: "fun", amount: 5000 },
    { type: "expense", accountId: "cash", categoryId: "food", amount: 1000 },
    { type: "income", accountId: "cash", categoryId: "sal", amount: 9999 },
  ]);
  assert.deepEqual(r.map(a => [a.accountId, a.total]), [["card", 8000], ["cash", 1000]]);
  assert.deepEqual(r[0].categories.map(c => c.categoryId), ["fun", "food"]);
});

test("monthlyRows: 新しい月から12行、貯蓄率", () => {
  const state = { transactions: [
    { date: "2026-10-01", type: "income", amount: 200000, categoryId: "sal" },
    { date: "2026-10-02", type: "expense", amount: 50000, categoryId: "food" },
  ], budgets: [{ categoryId: "food", amount: 30000 }] };
  const rows = monthlyRows(state, "2026-10");
  assert.equal(rows.length, 12);
  assert.equal(rows[0].month, "2026-10");
  assert.equal(rows[0].savingRate, 0.75);
  assert.equal(rows[0].budgetUsed, 50000);
  assert.equal(rows[0].top.categoryId, "food");
  assert.equal(rows[1].savingRate, null);
});
