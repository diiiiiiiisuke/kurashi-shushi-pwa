// 集計（純粋関数）
import { addMonths, monthOf, sumBy, daysBetween } from "../util.js";

export const inMonth = (txs, ym) => txs.filter(t => monthOf(t.date) === ym);

export function totals(txs) {
  const income = sumBy(txs.filter(t => t.type === "income"), t => t.amount);
  const expense = sumBy(txs.filter(t => t.type === "expense"), t => t.amount);
  return { income, expense, balance: income - expense };
}

export function monthTotals(txs, ym) { return totals(inMonth(txs, ym)); }

// カテゴリ別の合計（多い順）
export function byCategory(txs, type) {
  const map = new Map();
  for (const t of txs) if (t.type === type) map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
  return [...map].map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount);
}

export function budgetUsage(state, ym) {
  const txs = inMonth(state.transactions, ym).filter(t => t.type === "expense");
  return state.budgets.map(b => {
    const used = sumBy(txs.filter(t => t.categoryId === b.categoryId), t => t.amount);
    return { ...b, used, rest: b.amount - used, ratio: b.amount ? used / b.amount : 0 };
  });
}

// 直近 n か月の推移（古い順）
export function trend(txs, endYm, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const month = addMonths(endYm, i - n + 1);
    return { month, ...monthTotals(txs, month) };
  });
}

export function fixedVariable(state, ym) {
  const group = new Map(state.categories.map(c => [c.id, c.group]));
  const txs = inMonth(state.transactions, ym).filter(t => t.type === "expense");
  const fixed = sumBy(txs.filter(t => group.get(t.categoryId) === "fixed"), t => t.amount);
  return { fixed, variable: sumBy(txs, t => t.amount) - fixed };
}

export function scopeTotals(txs, scope) { return totals(txs.filter(t => t.scope === scope)); }

// カテゴリの使用回数（直近 days 日）。クイック入力の並び順に使う
export function categoryRank(txs, today, days = 30) {
  const rank = new Map();
  for (const t of txs) {
    const ago = daysBetween(t.date, today);
    if (ago >= 0 && ago < days) rank.set(t.categoryId, (rank.get(t.categoryId) || 0) + 1);
  }
  return rank;
}

// 支払方法別の支出（多い順）。各支払方法の中もカテゴリ別に多い順（spec-v3.md 3章）
export function byAccount(txs) {
  const map = new Map();
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const a = map.get(t.accountId) || { accountId: t.accountId, total: 0, count: 0, cats: new Map() };
    a.total += t.amount; a.count++;
    a.cats.set(t.categoryId, (a.cats.get(t.categoryId) || 0) + t.amount);
    map.set(t.accountId, a);
  }
  return [...map.values()]
    .map(a => ({ accountId: a.accountId, total: a.total, count: a.count, categories: [...a.cats].map(([categoryId, amount]) => ({ categoryId, amount })).sort((x, y) => y.amount - x.amount) }))
    .sort((a, b) => b.total - a.total);
}

// 月次の管理: 1行＝1か月（新しい順）
export function monthlyRows(state, endYm, n = 12) {
  return trend(state.transactions, endYm, n).reverse().map(r => {
    const txs = inMonth(state.transactions, r.month);
    const top = byCategory(txs, "expense")[0] || null;
    const budget = state.budgets.reduce((s, b) => s + b.amount, 0);
    const budgetUsed = txs.filter(t => t.type === "expense" && state.budgets.some(b => b.categoryId === t.categoryId)).reduce((s, t) => s + t.amount, 0);
    return { ...r, count: txs.length, savingRate: r.income ? r.balance / r.income : null, top, budget, budgetUsed };
  });
}
