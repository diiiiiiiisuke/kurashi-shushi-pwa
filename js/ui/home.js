// ホーム: 今月の状況をひと目で
import { fmt, signed, localDate, monthOf, monthLabel, dateInMonth, addMonths, daysBetween, sumBy, dayLabel } from "../util.js";
import { monthTotals, budgetUsage } from "../calc/summary.js";
import { simulateAll, regularPayment } from "../calc/simulation.js";
import { toSimItem, firstPaymentMonth, monthlyInterest } from "../calc/debt.js";
import { h, panel, metric, bar, emptyNote, categoryName, txRow } from "./common.js";
import { renderOverview } from "./overview.js";
import { backupBanner } from "./backup.js";

// 次の支払予定（返済と、まだ記録されていない定期の支出）
export function upcoming(state, today, limit = 3) {
  const ym = monthOf(today);
  const next = day => { const d = dateInMonth(ym, day); return d >= today ? d : dateInMonth(addMonths(ym, 1), day); };
  const items = [];
  for (const d of state.debts.filter(d => !d.archived && d.dueDay)) {
    const it = toSimItem(d, state.transactions);
    if (it.balance <= 0) continue;
    const interest = monthlyInterest(it.balance, d);
    const paid = state.transactions.some(t => t.debtId === d.id && monthOf(t.date) === ym);
    items.push({ date: paid ? dateInMonth(addMonths(ym, 1), d.dueDay) : next(d.dueDay), name: d.name, amount: regularPayment(it, it.balance, interest, it.installmentsLeft), kind: "返済" });
  }
  for (const r of state.recurring.filter(r => r.active && r.type === "expense")) {
    const m = addMonths(r.lastGeneratedMonth || addMonths(ym, -1), 1);
    items.push({ date: dateInMonth(m, r.day), name: r.name, amount: r.amount, kind: "定期" });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

export function renderHome(app) {
  const { state, ctx } = app;
  const today = localDate();
  const ym = ctx.month;
  const t = monthTotals(state.transactions, ym);
  const isThisMonth = ym === monthOf(today);
  const todayExpense = sumBy(state.transactions.filter(x => x.date === today && x.type === "expense"), x => x.amount);
  const out = [];

  if (!state.transactions.length && !state.debts.length) {
    out.push(panel("はじめに", `<ol class="steps">
      <li>右下の <strong>＋</strong> から、今日の支出を1件記録してみる</li>
      <li>「設定」で、使っているカードと毎月の予算を登録する</li>
      <li>家賃・給与などは「設定 → 定期取引」に登録すると毎月自動で記録される</li>
      <li>カード・ローンの返済は「返済」タブで登録すると、完済の見通しが出る</li></ol>`, { eyebrow: "WELCOME" }));
  }

  out.push(backupBanner(app));

  out.push(`<div class="metrics">
    ${metric(isThisMonth ? "今月の収入" : `${monthLabel(ym)}の収入`, fmt(t.income), "income")}
    ${metric("支出", fmt(t.expense), "expense")}
    ${metric("収支", signed(t.balance), t.balance >= 0 ? "income" : "expense")}
    ${isThisMonth ? metric("今日の支出", fmt(todayExpense)) : ""}
  </div>`);

  if (state.transactions.length || state.debts.length) out.push(renderOverview(app));

  const budgets = budgetUsage(state, ym).sort((a, b) => b.ratio - a.ratio).slice(0, 5);
  out.push(panel("予算の残り", budgets.length ? budgets.map(b => `<div class="budget-row">
      <div class="row-between"><span>${h(categoryName(state, b.categoryId))}</span><span class="${b.rest < 0 ? "expense" : ""}">${b.rest < 0 ? `${fmt(-b.rest)} 超過` : `残り ${fmt(b.rest)}`}</span></div>
      ${bar(b.ratio, b.rest < 0)}</div>`).join("") : emptyNote("予算が未設定です"),
    { eyebrow: "BUDGET", action: `<button type="button" class="link" data-view="settings">設定</button>` }));

  const next = upcoming(state, today);
  out.push(panel("次の支払予定", next.length ? `<div class="list">${next.map(x => `<div class="list-row"><span class="item-main"><strong>${h(x.name)}</strong><small>${dayLabel(x.date)} · ${x.kind}</small></span><span class="amount expense">${fmt(x.amount)}</span></div>`).join("")}</div>` : emptyNote("返済先や定期の支出を登録すると表示されます"), { eyebrow: "NEXT" }));

  const debts = state.debts.filter(d => !d.archived);
  if (debts.length) {
    const items = debts.map(d => toSimItem(d, state.transactions)).filter(x => x.balance > 0);
    const r = simulateAll(items, state.settings.repaymentBudget || null, state.settings.strategy, firstPaymentMonth(debts, today, state.transactions));
    const total = sumBy(items, x => x.balance);
    out.push(panel("完済の見通し", `<div class="row-between big"><span>残債</span><strong class="expense">${fmt(total)}</strong></div>
      <p class="muted">${!items.length ? "すべて完済しています 🎉" : r.payable ? `<strong>${monthLabel(r.payoffMonth)}</strong>に完済見込み（あと${r.months}か月・これから払う利息 約${fmt(r.totalInterest)}）` : "今の返済額では完済できません。返済タブで確認してください"}</p>`,
      { eyebrow: "REPAYMENT", action: `<button type="button" class="link" data-view="debts">詳しく</button>` }));
  }

  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt?.localeCompare(a.createdAt)).slice(0, 5);
  if (recent.length) out.push(panel("最近の記録", `<div class="list">${recent.map(x => txRow(state, x)).join("")}</div>`, { eyebrow: "RECENT", action: `<button type="button" class="link" data-view="records">すべて</button>` }));

  return out.join("");
}
