import test from "node:test";
import assert from "node:assert/strict";
import { monthTotals, byCategory, trend, fixedVariable, budgetUsage, categoryRank } from "../js/calc/summary.js";

const txs = [
  { date: "2026-10-01", type: "income", amount: 250000, categoryId: "sal", scope: "personal" },
  { date: "2026-10-02", type: "expense", amount: 1200, categoryId: "food", scope: "personal" },
  { date: "2026-10-05", type: "expense", amount: 800, categoryId: "food", scope: "personal" },
  { date: "2026-10-27", type: "expense", amount: 80000, categoryId: "rent", scope: "personal" },
  { date: "2026-09-10", type: "expense", amount: 5000, categoryId: "food", scope: "personal" },
];
const state = { transactions: txs, categories: [{ id: "rent", group: "fixed" }, { id: "food", group: "variable" }], budgets: [{ categoryId: "food", amount: 30000 }] };

test("月の集計", () => {
  assert.deepEqual(monthTotals(txs, "2026-10"), { income: 250000, expense: 82000, balance: 168000 });
});
test("カテゴリ別は多い順", () => {
  assert.deepEqual(byCategory(txs.filter(t => t.date.startsWith("2026-10")), "expense").map(x => x.categoryId), ["rent", "food"]);
});
test("12か月推移は古い順で、月をまたぐ", () => {
  const t = trend(txs, "2027-01", 12);
  assert.equal(t.length, 12);
  assert.equal(t[0].month, "2026-02");
  assert.equal(t.at(-1).month, "2027-01");
  assert.equal(t.find(x => x.month === "2026-09").expense, 5000);
});
test("固定費と変動費", () => {
  assert.deepEqual(fixedVariable(state, "2026-10"), { fixed: 80000, variable: 2000 });
});
test("予算の消化", () => {
  const [b] = budgetUsage(state, "2026-10");
  assert.equal(b.used, 2000);
  assert.equal(b.rest, 28000);
});
test("カテゴリの使用回数（直近30日）", () => {
  const r = categoryRank(txs, "2026-10-12");
  assert.equal(r.get("food"), 2);
  assert.equal(r.get("rent"), undefined); // 未来の日付は数えない
});
