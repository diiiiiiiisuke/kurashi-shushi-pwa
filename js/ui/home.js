// ホーム: 今月の状況をひと目で
import { fmt, signed, localDate, monthOf, monthLabel, sumBy } from "../util.js";
import { monthTotals, budgetUsage } from "../calc/summary.js";
import { h, panel, metric, bar, emptyNote, categoryName, txRow } from "./common.js";
import { backupBanner } from "./backup.js";

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

  const budgets = budgetUsage(state, ym).sort((a, b) => b.ratio - a.ratio).slice(0, 5);
  out.push(panel("予算の残り", budgets.length ? budgets.map(b => `<div class="budget-row">
      <div class="row-between"><span>${h(categoryName(state, b.categoryId))}</span><span class="${b.rest < 0 ? "expense" : ""}">${b.rest < 0 ? `${fmt(-b.rest)} 超過` : `残り ${fmt(b.rest)}`}</span></div>
      ${bar(b.ratio, b.rest < 0)}</div>`).join("") : emptyNote("予算が未設定です"),
    { eyebrow: "BUDGET", action: `<button type="button" class="link" data-view="settings">設定</button>` }));

  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt?.localeCompare(a.createdAt)).slice(0, 5);
  if (recent.length) out.push(panel("最近の記録", `<div class="list">${recent.map(x => txRow(state, x)).join("")}</div>`, { eyebrow: "RECENT", action: `<button type="button" class="link" data-view="records">すべて</button>` }));

  return out.join("");
}
