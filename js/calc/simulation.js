// 返済シミュレーション（純粋関数）。仕様: docs/spec-v2.md 5章
// 月割りの概算。実際のカード会社は日割り（年365日）で計算するため誤差がある
import { addMonths } from "../util.js";
import { monthlyInterest } from "./debt.js";

const MAX_MONTHS = 600;

// 通常の毎月の返済額（最低返済額）。balance + interest を超えない
export function regularPayment(item, balance, interest, left) {
  let pay;
  if (item.method === "principal") pay = (Number(item.monthlyPayment) || 0) + interest;
  else if (item.method === "installment") pay = Math.ceil(balance / Math.max(1, left || 1));
  else pay = Number(item.monthlyPayment) || 0;
  return Math.min(pay, balance + interest);
}

// 最低返済額では残高が減らない返済先と、残高を減らすのに必要な最低額
export function stuckDebts(items) {
  return items.filter(x => x.balance > 0).flatMap(item => {
    const interest = monthlyInterest(item.balance, item);
    const pay = regularPayment(item, item.balance, interest, item.installmentsLeft);
    if (pay > interest) return [];
    const minPayment = item.method === "principal" ? 1 : interest + 1;
    return [{ id: item.id, name: item.name, interest, minPayment }];
  });
}

/**
 * items: [{ id, name, method, apr, monthlyPayment, balance, installmentsLeft }]
 * budget: 毎月返済に回せる総額。null なら最低返済額だけ払う
 * strategy: "avalanche"（年利の高い順）| "snowball"（残高の少ない順）
 * startMonth: 1回目の返済月 "YYYY-MM"
 */
export function simulateAll(items, budget, strategy = "avalanche", startMonth = "2026-01") {
  const debts = items.filter(x => x.balance > 0).map(x => ({ ...x, bal: x.balance, left: x.installmentsLeft, interestSum: 0, payoffMonth: null }));
  const timeline = [];
  let totalInterest = 0, totalPaid = 0, months = 0, shortfall = 0, payable = true;

  while (debts.some(d => d.bal > 0)) {
    if (months >= MAX_MONTHS) { payable = false; break; }
    const month = addMonths(startMonth, months);
    const before = debts.reduce((n, d) => n + d.bal, 0);
    let monthInterest = 0, monthPaid = 0, minTotal = 0;
    const active = debts.filter(d => d.bal > 0);

    for (const d of active) {
      const interest = monthlyInterest(d.bal, d);
      const pay = regularPayment(d, d.bal, interest, d.left);
      d.bal = d.bal + interest - pay;
      d.interestSum += interest;
      if (d.method === "installment" && d.left) d.left -= 1;
      monthInterest += interest; monthPaid += pay; minTotal += pay;
    }

    if (budget != null) {
      if (budget < minTotal) shortfall = Math.max(shortfall, minTotal - budget);
      let extra = Math.max(0, budget - minTotal);
      const order = debts.filter(d => d.bal > 0).sort(strategy === "snowball"
        ? (a, b) => a.bal - b.bal || b.apr - a.apr
        : (a, b) => b.apr - a.apr || a.bal - b.bal);
      for (const d of order) {
        if (extra <= 0) break;
        const x = Math.min(extra, d.bal);
        d.bal -= x; extra -= x; monthPaid += x;
      }
    }

    months++;
    totalInterest += monthInterest; totalPaid += monthPaid;
    for (const d of debts) if (d.bal <= 0 && !d.payoffMonth) { d.bal = 0; d.payoffMonth = month; }
    const after = debts.reduce((n, d) => n + d.bal, 0);
    timeline.push({ month, balance: after, interest: monthInterest, paid: monthPaid });
    if (after >= before) { payable = false; break; }
  }

  return {
    payable,
    months,
    payoffMonth: payable && months ? addMonths(startMonth, months - 1) : null,
    totalInterest, totalPaid, shortfall,
    perDebt: debts.map(d => ({ id: d.id, name: d.name, payoffMonth: d.payoffMonth, totalInterest: d.interestSum })),
    stuck: payable ? [] : stuckDebts(items),
    timeline,
  };
}

// 1つの返済先の返済予定表（最低返済額のみ）
export function schedule(item, startMonth) {
  const rows = [];
  let bal = item.balance, left = item.installmentsLeft;
  for (let i = 0; bal > 0 && i < MAX_MONTHS; i++) {
    const interest = monthlyInterest(bal, item);
    const pay = regularPayment(item, bal, interest, left);
    if (pay <= interest) break;
    bal = bal + interest - pay;
    if (item.method === "installment" && left) left -= 1;
    rows.push({ month: addMonths(startMonth, i), payment: pay, interest, principal: pay - interest, balance: bal });
  }
  return rows;
}
