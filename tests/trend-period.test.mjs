import test from "node:test";
import assert from "node:assert/strict";
import { periodTrend, monthTotals } from "../js/calc/summary.js";
import { renderAnalysis } from "../js/ui/analysis.js";
import { defaultState } from "../js/store.js";

const txs = [
  { date: "2026-09-30", type: "expense", amount: 9000 },
  { date: "2026-10-04", type: "expense", amount: 1000 },
  { date: "2026-10-05", type: "expense", amount: 2000 },
  { date: "2026-10-06", type: "expense", amount: 3000 },
  { date: "2026-11-01", type: "expense", amount: 8000 },
];

test("日別は選択月の全日を表示し、記録のない日を0にする", () => {
  const rows = periodTrend(txs, "2026-10", "daily");
  assert.equal(rows.length, 31);
  assert.equal(rows[0].label, "10/1");
  assert.equal(rows[0].count, 0);
  assert.equal(rows[0].expense, 0);
  assert.equal(rows[3].expense, 1000);
  assert.equal(rows.at(-1).end, "2026-10-31");
  assert.equal(rows.reduce((sum, row) => sum + row.expense, 0), 6000);
});

test("週別は月曜〜日曜で分け、月外の取引を含めない", () => {
  const rows = periodTrend(txs, "2026-10", "weekly");
  assert.deepEqual(rows.map(r => [r.start, r.end]), [
    ["2026-10-01", "2026-10-04"], ["2026-10-05", "2026-10-11"],
    ["2026-10-12", "2026-10-18"], ["2026-10-19", "2026-10-25"],
    ["2026-10-26", "2026-10-31"],
  ]);
  assert.deepEqual(rows.map(r => r.expense), [1000, 5000, 0, 0, 0]);
  assert.deepEqual(rows.map(r => r.count), [1, 2, 0, 0, 0]);
});

test("うるう年の2月と6週ある月でも全日を一度だけ集計する", () => {
  assert.equal(periodTrend([], "2024-02", "daily").length, 29);
  const leap = periodTrend([{ date: "2024-02-29", type: "income", amount: 2500 }], "2024-02", "weekly");
  assert.equal(leap.at(-1).end, "2024-02-29");
  assert.equal(leap.at(-1).income, 2500);
  const six = periodTrend([], "2026-08", "weekly");
  assert.equal(six.length, 6);
  assert.equal(six[0].start, "2026-08-01");
  assert.equal(six.at(-1).end, "2026-08-31");
});

test("月別の既定表示は選択月までの12か月で、年越しも扱う", () => {
  const rows = periodTrend(txs, "2026-10");
  assert.equal(rows.length, 12);
  assert.equal(rows[0].start, "2025-11-01");
  assert.equal(rows.at(-1).label, "26/10");
  assert.equal(rows.at(-1).expense, 6000);
  assert.equal(rows.at(-1).count, 3);
});

test("日別と週別の収入・支出・収支の合計が選択月の集計と一致する", () => {
  const records = [...txs, { date: "2026-10-05", type: "income", amount: 20000 }];
  const expected = monthTotals(records, "2026-10");
  for (const unit of ["daily", "weekly"]) {
    const rows = periodTrend(records, "2026-10", unit);
    for (const key of ["income", "expense", "balance"]) {
      assert.equal(rows.reduce((sum, r) => sum + r[key], 0), expected[key]);
    }
  }
});

test("切り替えに合わせてグラフ見出しと平均の単位・金額も更新する", () => {
  const s = defaultState();
  s.transactions = txs.filter(t => t.date.startsWith("2026-10")).map(t => ({ ...t, categoryId: s.categories[0].id, accountId: "cash", scope: "personal" }));
  for (const [trendUnit, title, count, average] of [
    ["daily", "2026年10月の日別推移", "記録のある日（3日）の平均", "2,000"],
    ["weekly", "2026年10月の週別推移", "記録のある週（2週）の平均", "3,000"],
    ["monthly", "12か月の推移", "記録のある月（1か月）の平均", "6,000"],
  ]) {
    const html = renderAnalysis({ state: s, ctx: { month: "2026-10", trendUnit } }).split("BY CARD")[0];
    assert.ok(html.includes(title));
    assert.ok(html.includes(count));
    assert.ok(html.includes(average));
  }
});
