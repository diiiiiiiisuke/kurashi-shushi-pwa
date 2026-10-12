// 記録: 毎日の家計簿（表示月の記録を日付ごとに）
import { fmt, signed, dayLabel } from "../util.js";
import { totals, inMonth } from "../calc/summary.js";
import { h, options, txRow, categoryName } from "./common.js";

export function filterRecords(state, ctx) {
  const { q, categoryId, scope } = ctx.filters;
  const word = q.trim().toLowerCase();
  return inMonth(state.transactions, ctx.month)
    .filter(t => !categoryId || t.categoryId === categoryId)
    .filter(t => !scope || t.scope === scope)
    .filter(t => !word || `${t.memo} ${categoryName(state, t.categoryId)}`.toLowerCase().includes(word))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function renderRecordList(app) {
  const { state, ctx } = app;
  const rows = filterRecords(state, ctx);
  if (!rows.length) return `<p class="empty">${ctx.filters.q || ctx.filters.categoryId || ctx.filters.scope ? "条件に合う記録がありません" : "この月の記録はまだありません。右下の ＋ から記録できます"}</p>`;
  const sum = totals(rows);
  const days = new Map();
  for (const t of rows) days.set(t.date, [...(days.get(t.date) || []), t]);
  return `<p class="muted small">${rows.length}件 · 収入 ${fmt(sum.income)} · 支出 ${fmt(sum.expense)}</p>` +
    [...days].map(([date, items]) => {
      const net = totals(items).balance;
      return `<div class="day-heading"><span>${dayLabel(date)}</span><span class="amount ${net >= 0 ? "income" : "expense"}">${signed(net)}</span></div><div class="list">${items.map(t => txRow(state, t)).join("")}</div>`;
    }).join("");
}

export function renderRecords(app) {
  const { state, ctx } = app;
  const f = ctx.filters;
  const cats = state.categories.filter(c => !c.archived || c.id === f.categoryId);
  return `<div class="section-heading"><div><p class="eyebrow">DAILY LOG</p><h2>記録</h2></div></div>
    <div class="filters">
      <input type="search" data-filter="q" placeholder="メモ・カテゴリで検索" value="${h(f.q)}" aria-label="検索">
      <select data-filter="categoryId" aria-label="カテゴリで絞り込み"><option value="">すべてのカテゴリ</option>
        <optgroup label="支出">${options(cats.filter(c => c.type === "expense"), f.categoryId)}</optgroup>
        <optgroup label="収入">${options(cats.filter(c => c.type === "income"), f.categoryId)}</optgroup></select>
      <select data-filter="scope" aria-label="区分で絞り込み"><option value="">個人＋事業</option><option value="personal" ${f.scope === "personal" ? "selected" : ""}>個人</option><option value="business" ${f.scope === "business" ? "selected" : ""}>事業</option></select>
    </div>
    <div id="recordList">${renderRecordList(app)}</div>`;
}
