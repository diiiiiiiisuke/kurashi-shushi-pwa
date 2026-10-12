import test from "node:test";
import assert from "node:assert/strict";
import { parseAccountNames, accountUsage, moveAccount } from "../js/calc/accounts.js";
import { buildOverview } from "../js/calc/projection.js";
import { defaultState } from "../js/store.js";

test("まとめて追加: Notion の列コピー（見出し・空行・記号・重複を除く）", () => {
  const text = "名前\nAカード\n\n・Bカード\n1. Cカード\nAカード\n  Dカード  \n";
  assert.deepEqual(parseAccountNames(text).add, ["Aカード", "Bカード", "Cカード", "Dカード"]);
});

test("まとめて追加: 表ごとコピー（タブ区切り）は各行の最初の項目、登録済みは分ける", () => {
  const text = "名前\t年会費\t締日\nAカード\t無料\t15\nBカード\t1100\t末";
  const r = parseAccountNames(text, ["bカード"]);
  assert.deepEqual(r.add, ["Aカード"]);
  assert.deepEqual(r.existing, ["Bカード"]);
});

test("使用状況: 記録・定期取引で使っていれば削除できない", () => {
  const s = defaultState();
  s.accounts.push({ id: "a" }, { id: "b" }, { id: "c" });
  s.transactions.push({ accountId: "a", date: "2026-10-03", type: "expense", amount: 500 });
  s.recurring.push({ accountId: "b" });
  assert.deepEqual(accountUsage(s, "a", "2026-10"), { used: true, count: 1, monthCount: 1, monthTotal: 500 });
  assert.equal(accountUsage(s, "b").used, true);
  assert.equal(accountUsage(s, "c").used, false);
});

test("並べ替え: 現金・口座は先頭のまま", () => {
  const list = [{ id: "cash" }, { id: "a" }, { id: "b" }];
  assert.deepEqual(moveAccount(list, "b", -1).map(a => a.id), ["cash", "b", "a"]);
  assert.deepEqual(moveAccount(list, "a", -1).map(a => a.id), ["cash", "a", "b"]);
  assert.deepEqual(moveAccount(list, "cash", 1).map(a => a.id), ["cash", "a", "b"]);
});

test("収支と返済: 過去は実績の残債、未来は予測、今月で区切る", () => {
  const s = defaultState();
  const cat = s.categories[0].id;
  s.debts.push({ id: "d", name: "A", method: "fixed", apr: 0, monthlyPayment: 10000, dueDay: 27, baseBalance: 100000, baseDate: "2026-08-01", archived: false });
  s.transactions.push(
    { id: "p", debtId: "d", date: "2026-09-27", type: "expense", amount: 10000, principal: 10000, categoryId: cat, accountId: "cash" },
    { id: "i", date: "2026-09-25", type: "income", amount: 200000, categoryId: cat, accountId: "cash" },
  );
  s.settings.repaymentBudget = 20000;
  const o = buildOverview(s, "2026-10-12", "1y");
  assert.equal(o.rows.length, 12);
  assert.equal(o.rows[o.nowIndex].month, "2026-10");
  const sep = o.rows.find(r => r.month === "2026-09");
  assert.deepEqual([sep.income, sep.expense, sep.debt, sep.future], [200000, 10000, 90000, false]);
  assert.equal(o.rows[o.nowIndex].debt, 70000);            // 今月の返済予定 2万を引いた月末予測
  assert.equal(o.rows.find(r => r.month === "2027-02").debt, 0);
  assert.equal(o.rows.at(-1).future, true);
  assert.equal(o.rows.find(r => r.month === "2026-07").debt, null);   // 基準日（8月）より前は描かない
  const p = buildOverview(s, "2026-10-12", "payoff");
  assert.equal(p.rows.at(-1).month, "2027-02");            // 完済月まで
  assert.equal(p.payoff, "2027-02");
});

test("並べ替え: 非表示のものは飛ばして入れ替える", () => {
  const list = [{ id: "cash" }, { id: "a" }, { id: "x", archived: true }, { id: "b" }];
  assert.deepEqual(moveAccount(list, "b", -1).map(a => a.id), ["cash", "b", "x", "a"]);
});
