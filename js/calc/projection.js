// 返済のグラフ用データ（純粋関数）。仕様: docs/spec-v3.md 4章
import { addMonths, monthOf, dateInMonth, daysInMonth } from "../util.js";
import { simulateAll } from "./simulation.js";
import { toSimItem, firstPaymentMonth, balanceAt } from "./debt.js";

const MAX_FUTURE = 120;
const PAST_LIMIT = 12;
const monthEnd = ym => dateInMonth(ym, daysInMonth(ym));
const ceil1000 = v => Math.ceil(v / 1000) * 1000;

// 毎月の最低返済額の合計（最初の月）
export function minimumTotal(items, start) {
  return simulateAll(items, null, "avalanche", start).timeline[0]?.paid ?? 0;
}

// 比べる返済スピード: 最低返済額だけ / 設定額 / 設定額+1万 / 設定額+3万
export function speedOptions(minTotal, budget) {
  const base = Math.max(minTotal, budget || 0);
  const list = [minTotal, base, base + 10000, base + 30000].filter(v => v > 0);
  return [...new Set(list)].sort((a, b) => a - b);
}

/**
 * 残債の推移（実績＋予測）
 * debts: 対象の返済先（アーカイブ除く）、transactions: 全記録
 * 戻り値: { months[], anchorIndex, past: [{ index, balance }], paid: [{ index, amount, future }],
 *           scenarios: [{ budget, isMin, isSelected, result, points: [{ index, balance }] }] }
 */
export function buildProjection(debts, transactions, today, budget, strategy = "avalanche") {
  const items = debts.map(d => toSimItem(d, transactions)).filter(x => x.balance > 0);
  const start = firstPaymentMonth(debts, today, transactions);
  const anchor = addMonths(start, -1);                       // 「今」の残高を置く月
  const ids = new Set(debts.map(d => d.id));
  const pays = transactions.filter(t => ids.has(t.debtId));

  // 実績の開始月: 最初の返済記録・基準日のうち早い方（最大12か月前）
  const firstData = [...pays.map(t => monthOf(t.date)), ...debts.map(d => monthOf(d.baseDate))].sort()[0] || anchor;
  let pastStart = firstData < addMonths(anchor, -PAST_LIMIT) ? addMonths(anchor, -PAST_LIMIT) : firstData;
  if (pastStart > anchor) pastStart = anchor;

  const minTotal = minimumTotal(items, start);
  const speeds = speedOptions(minTotal, budget);
  const selected = Math.max(minTotal, budget || 0);
  const scenarios = speeds.map(b => ({ budget: b, isMin: b === minTotal, isSelected: b === selected, result: simulateAll(items, b === minTotal ? null : b, strategy, start) }));
  const futureLen = Math.min(MAX_FUTURE, Math.max(1, ...scenarios.map(s => (s.result.payable ? s.result.months : MAX_FUTURE))));

  const months = [];
  for (let m = pastStart; m <= anchor; m = addMonths(m, 1)) months.push(m);
  const anchorIndex = months.length - 1;
  for (let i = 0; i < futureLen; i++) months.push(addMonths(start, i));

  const nowBalance = items.reduce((n, x) => n + x.balance, 0);
  const past = months.slice(0, anchorIndex + 1).map((m, index) => ({
    index,
    balance: index === anchorIndex ? nowBalance : debts.reduce((n, d) => n + balanceAt(d, transactions, monthEnd(m)), 0),
  }));
  const paid = months.slice(0, anchorIndex + 1).map((m, index) => ({ index, amount: pays.filter(t => monthOf(t.date) === m).reduce((n, t) => n + t.amount, 0), future: false }));
  // 今月まだ返済していない場合、今月の実績（anchor より後）も棒で出す
  const thisMonth = monthOf(today);
  const sel = scenarios.find(s => s.isSelected) || scenarios[0];
  for (let i = 0; i < futureLen; i++) {
    const m = months[anchorIndex + 1 + i];
    const actual = m === thisMonth ? pays.filter(t => monthOf(t.date) === m).reduce((n, t) => n + t.amount, 0) : 0;
    paid.push({ index: anchorIndex + 1 + i, amount: (sel?.result.timeline[i]?.paid || 0) + actual, future: true });
  }
  for (const s of scenarios) {
    s.points = [{ index: anchorIndex, balance: nowBalance }, ...s.result.timeline.slice(0, futureLen).map((t, i) => ({ index: anchorIndex + 1 + i, balance: t.balance }))];
  }
  return { months, anchorIndex, past, paid, scenarios, minTotal, nowBalance, start };
}

// 返済スピードの比較: 毎月の額ごとの完済月数・利息（spec-v3.md 4.2）
export function speedTable(items, start, budget, strategy = "avalanche", steps = 6) {
  const live = items.filter(x => x.balance > 0);
  const minTotal = minimumTotal(live, start);
  if (!live.length || !minTotal) return { minTotal, rows: [] };
  const top = Math.max(minTotal * 3, (budget || 0) * 1.5);
  const amounts = new Set([minTotal]);
  for (let i = 1; i < steps; i++) amounts.add(ceil1000(minTotal + (top - minTotal) * i / (steps - 1)));
  if (budget && budget > minTotal) amounts.add(budget);
  const base = simulateAll(live, null, strategy, start);
  const rows = [...amounts].sort((a, b) => a - b).map(amount => {
    const r = amount === minTotal ? base : simulateAll(live, amount, strategy, start);
    return {
      amount, payable: r.payable, months: r.months, payoffMonth: r.payoffMonth, totalInterest: r.totalInterest,
      savedMonths: base.payable && r.payable ? base.months - r.months : null,
      savedInterest: base.payable && r.payable ? base.totalInterest - r.totalInterest : null,
      isMin: amount === minTotal, isSelected: amount === Math.max(minTotal, budget || 0),
    };
  });
  return { minTotal, rows };
}

/**
 * 収支と返済を1つのグラフに（docs/spec-v4.md 3章）
 * range: "1y"（前後6か月）| "2y"（前後12か月）| "payoff"（過去12か月〜完済）
 * 戻り値: { months[], nowIndex, rows: [{ month, income, expense, balance, debt, future }] }
 *   debt: 月末の残債（今月は今の残高、未来は予測）。future: 今月より後か
 */
export function buildOverview(state, today, range = "1y") {
  const thisMonth = monthOf(today);
  const debts = state.debts.filter(d => !d.archived);
  const past = range === "1y" ? 6 : 12;
  const proj = buildProjection(debts, state.transactions, today, state.settings.repaymentBudget, state.settings.strategy);
  const sel = proj.scenarios.find(s => s.isSelected) || proj.scenarios[0];
  const payoff = sel?.result.payable ? sel.result.payoffMonth : null;
  let futureN = range === "1y" ? 6 : 12;
  if (range === "payoff") futureN = payoff ? Math.max(1, monthsBetween(thisMonth, payoff)) : MAX_FUTURE;
  futureN = Math.min(futureN, MAX_FUTURE);

  const predicted = new Map((sel?.result.timeline || []).map(t => [t.month, t.balance]));
  // 実績の残債は、基準日・最初の返済記録の月より前は分からないので描かない
  const ids = new Set(debts.map(d => d.id));
  const firstData = [...state.transactions.filter(t => ids.has(t.debtId)).map(t => monthOf(t.date)), ...debts.map(d => monthOf(d.baseDate))].sort()[0];
  const nowBalance = proj.nowBalance;
  const rows = [];
  for (let i = -past + 1; i <= futureN; i++) {
    const month = addMonths(thisMonth, i);
    const txs = state.transactions.filter(t => monthOf(t.date) === month);
    const income = txs.filter(t => t.type === "income").reduce((n, t) => n + t.amount, 0);
    const expense = txs.filter(t => t.type === "expense").reduce((n, t) => n + t.amount, 0);
    let debt;
    if (month < thisMonth) debt = firstData && month >= firstData ? debts.reduce((n, d) => n + balanceAt(d, state.transactions, monthEnd(month)), 0) : null;
    else if (month === thisMonth) debt = predicted.has(month) ? predicted.get(month) : nowBalance;
    else debt = predicted.has(month) ? predicted.get(month) : (payoff && month > payoff ? 0 : null);
    rows.push({ month, income, expense, balance: income - expense, debt, future: month > thisMonth });
  }
  // 返済先がない月は線を描かない
  if (!debts.length) rows.forEach(r => (r.debt = null));
  return { rows, nowIndex: past - 1, nowBalance, payoff, monthlyPayment: sel?.result.timeline[0]?.paid || 0 };
}

function monthsBetween(a, b) {
  const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
