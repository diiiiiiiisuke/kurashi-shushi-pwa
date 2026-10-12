import test from "node:test";
import assert from "node:assert/strict";
import { simulateAll, schedule } from "../js/calc/simulation.js";
import { splitPayment, currentBalance, installmentsLeft } from "../js/calc/debt.js";

const debt = (o) => ({ id: o.id || "a", name: o.id || "a", method: "fixed", apr: 0, monthlyPayment: 0, balance: 0, installmentsLeft: null, ...o });

test("1. 年利0%・残高10万・月1万 → 10か月、利息0", () => {
  const r = simulateAll([debt({ balance: 100000, monthlyPayment: 10000 })], null, "avalanche", "2026-11");
  assert.equal(r.payable, true);
  assert.equal(r.months, 10);
  assert.equal(r.totalInterest, 0);
  assert.equal(r.payoffMonth, "2027-08");
});

test("2. 年利15%・残高10万・月1万 → 1か月目は利息1,250・元金8,750", () => {
  const [first] = schedule(debt({ balance: 100000, apr: 15, monthlyPayment: 10000 }), "2026-11");
  assert.equal(first.interest, 1250);
  assert.equal(first.principal, 8750);
  assert.equal(first.balance, 91250);
});

test("3. 返済額が利息以下 → 完済できない、最低15,001円", () => {
  const r = simulateAll([debt({ balance: 1000000, apr: 18, monthlyPayment: 10000 })], null, "avalanche", "2026-11");
  assert.equal(r.payable, false);
  assert.equal(r.payoffMonth, null);
  assert.equal(r.stuck[0].minPayment, 15001);
});

test("4. 分割 残高12万・残り12回 → 12か月で完済", () => {
  const r = simulateAll([debt({ method: "installment", balance: 120000, installmentsLeft: 12 })], null, "avalanche", "2026-11");
  assert.equal(r.months, 12);
  assert.equal(r.totalPaid, 120000);
});

const two = [
  debt({ id: "high", balance: 300000, apr: 18, monthlyPayment: 10000 }),
  debt({ id: "small", balance: 50000, apr: 10, monthlyPayment: 1000 }),
];

test("5. 余りは作戦の順に充てる（avalanche は高金利、snowball は少額が先に完済）", () => {
  const av = simulateAll(two, 40000, "avalanche", "2026-11");
  const sb = simulateAll(two, 40000, "snowball", "2026-11");
  const pay = (r, id) => r.perDebt.find(d => d.id === id).payoffMonth;
  assert.ok(pay(av, "high") < pay(av, "small"));
  assert.ok(pay(sb, "small") < pay(sb, "high"));
});

test("6. avalanche の総利息 ≤ snowball の総利息、繰上げで利息が減る", () => {
  const av = simulateAll(two, 40000, "avalanche", "2026-11");
  const sb = simulateAll(two, 40000, "snowball", "2026-11");
  const min = simulateAll(two, null, "avalanche", "2026-11");
  assert.ok(av.totalInterest <= sb.totalInterest);
  assert.ok(av.totalInterest < min.totalInterest);
  assert.ok(av.months < min.months);
});

test("7. 最後の月は残高ぴったりで終わり、マイナスにならない", () => {
  const rows = schedule(debt({ balance: 105000, apr: 12, monthlyPayment: 10000 }), "2026-11");
  assert.equal(rows.at(-1).balance, 0);
  assert.ok(rows.every(r => r.balance >= 0 && r.principal > 0));
  const r = simulateAll(two, 40000, "avalanche", "2026-11");
  assert.ok(r.timeline.every(m => m.balance >= 0));
  assert.equal(r.timeline.at(-1).balance, 0);
});

test("予算が最低返済額の合計より少ないと不足額を返す", () => {
  const r = simulateAll(two, 10000, "avalanche", "2026-11");
  assert.equal(r.shortfall, 1000);
});

test("返済記録: 利息と元金に分け、残高は基準残高から元金を引く", () => {
  const d = { id: "d", method: "fixed", apr: 15, baseBalance: 100000, baseDate: "2026-10-01", installmentsLeft: null };
  assert.deepEqual(splitPayment(d, [], 10000), { interest: 1250, principal: 8750 });
  const txs = [
    { id: "t1", debtId: "d", date: "2026-10-05", principal: 8750 },
    { id: "t0", debtId: "d", date: "2026-09-30", principal: 5000 }, // 基準日より前は数えない
  ];
  assert.equal(currentBalance(d, txs), 91250);
  assert.equal(currentBalance(d, txs, "t1"), 100000); // 編集中の記録は除外
  // 残高を超える返済は残高まで
  assert.deepEqual(splitPayment({ ...d, apr: 0 }, [], 200000), { interest: 0, principal: 100000 });
  const inst = { ...d, method: "installment", installmentsLeft: 12 };
  assert.equal(installmentsLeft(inst, txs), 11);
});

test("1回目の返済月: 今月分を返済済み・支払日を過ぎたら来月", async () => {
  const { firstPaymentMonth } = await import("../js/calc/debt.js");
  const d = { id: "d", dueDay: 27 };
  assert.equal(firstPaymentMonth([d], "2026-10-12"), "2026-10");
  assert.equal(firstPaymentMonth([d], "2026-10-28"), "2026-11");
  assert.equal(firstPaymentMonth([d], "2026-12-12", [{ debtId: "d", date: "2026-12-10" }]), "2027-01");
});
