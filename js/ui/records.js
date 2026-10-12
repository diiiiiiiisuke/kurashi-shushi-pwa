// 記録タブ「家計簿DB」: Notion のデータベースのように、ビューを切り替えて記録を見る（docs/spec-v3.md 2章）
import { fmt, signed, dayLabel, monthLabel } from "../util.js";
import { totals, inMonth, byAccount, monthlyRows } from "../calc/summary.js";
import { h, options, tag, bar, categoryName, accountName } from "./common.js";
import { accountSummary } from "./breakdown.js";

export const RECORD_VIEWS = [
  { value: "daily", name: "📅 毎日の家計簿" },
  { value: "monthly", name: "🗓 月次の管理" },
  { value: "card", name: "💳 カード別" },
  { value: "category", name: "🏷 カテゴリ別" },
  { value: "table", name: "📋 テーブル" },
];
const SORTS = [
  { value: "date-desc", name: "日付が新しい順" }, { value: "date-asc", name: "日付が古い順" },
  { value: "amount-desc", name: "金額が大きい順" }, { value: "amount-asc", name: "金額が小さい順" },
];

export const currentView = state => (RECORD_VIEWS.some(v => v.value === state.settings.recordsView) ? state.settings.recordsView : "daily");

export function filterRecords(state, ctx) {
  const { q, categoryId, scope } = ctx.filters;
  const word = q.trim().toLowerCase();
  return inMonth(state.transactions, ctx.month)
    .filter(t => !categoryId || t.categoryId === categoryId)
    .filter(t => !scope || t.scope === scope)
    .filter(t => !word || `${t.memo} ${categoryName(state, t.categoryId)} ${accountName(state, t.accountId)}`.toLowerCase().includes(word))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
}

// ───────── Notion風の表 ─────────

const COLUMNS = {
  title: { label: "Aa 内容", cls: "c-title", cell: (s, t) => `<span class="t-title">${h(t.memo || categoryName(s, t.categoryId))}</span>${t.recurringId ? ' <small class="muted">定期</small>' : ""}` },
  date: { label: "📅 日付", cls: "c-date", cell: (s, t) => dayLabel(t.date) },
  category: { label: "🏷 カテゴリ", cls: "", cell: (s, t) => tag(categoryName(s, t.categoryId)) },
  account: { label: "💳 支払方法", cls: "", cell: (s, t) => tag(accountName(s, t.accountId)) },
  amount: { label: "# 金額", cls: "num", cell: (s, t) => `<span class="amount ${t.type === "income" ? "income" : "expense"}">${t.type === "income" ? "+" : "−"}${fmt(t.amount)}</span>${t.interest ? `<small class="muted">利息 ${fmt(t.interest)}</small>` : ""}` },
  scope: { label: "区分", cls: "", cell: (s, t) => (t.scope === "business" ? tag("事業") : '<span class="muted">個人</span>') },
};
// スマホで横スクロールしなくても金額が見えるよう、金額は2列目に置く
const VIEW_COLUMNS = {
  daily: ["title", "amount", "category", "account", "scope"],
  card: ["title", "amount", "date", "category", "scope"],
  category: ["title", "amount", "date", "account", "scope"],
  table: ["title", "amount", "date", "category", "account", "scope"],
};

function table(state, cols, groups) {
  const head = `<thead><tr>${cols.map(c => `<th class="${COLUMNS[c].cls}">${COLUMNS[c].label}</th>`).join("")}</tr></thead>`;
  const body = groups.map(g => (g.head ? `<tr class="group"><th colspan="${cols.length}">${g.head}</th></tr>` : "") +
    g.rows.map(t => `<tr data-action="edit-tx" data-id="${h(t.id)}" tabindex="0">${cols.map(c => `<td class="${COLUMNS[c].cls}">${COLUMNS[c].cell(state, t)}</td>`).join("")}</tr>`).join("")).join("");
  return `<div class="db-scroll"><table class="db">${head}<tbody>${body}</tbody></table></div><button type="button" class="db-new" data-action="new-tx">＋ 新規</button>`;
}

const groupHead = (title, rows) => {
  const t = totals(rows);
  return `<span class="g-title">${title}</span><span class="g-count">${rows.length}</span><span class="g-sum">${t.income ? `<span class="income">+${fmt(t.income)}</span> ` : ""}<span class="expense">−${fmt(t.expense)}</span></span>`;
};

function groupBy(rows, key) {
  const map = new Map();
  for (const t of rows) map.set(key(t), [...(map.get(key(t)) || []), t]);
  return map;
}

function dailyView(state, rows) {
  return table(state, VIEW_COLUMNS.daily, [...groupBy(rows, t => t.date)].map(([date, items]) => {
    const net = totals(items).balance;
    return { head: `<span class="g-title">${dayLabel(date)}</span><span class="g-count">${items.length}</span><span class="g-sum amount ${net >= 0 ? "income" : "expense"}">${signed(net)}</span>`, rows: items };
  }));
}

function cardView(state, rows) {
  const grand = totals(rows).expense;
  const order = byAccount(rows).map(a => a.accountId);
  const groups = groupBy(rows, t => t.accountId);
  const ids = [...order, ...[...groups.keys()].filter(id => !order.includes(id))];
  return `<div class="card-groups">${ids.map(id => {
    const items = groups.get(id);
    const sum = byAccount(items)[0];
    const head = sum ? accountSummary(state, sum, grand) : `<div class="acc-head"><strong>${h(accountName(state, id))}</strong> <small class="muted">支出なし</small></div>`;
    return `<section class="db-group">${head}${table(state, VIEW_COLUMNS.card, [{ rows: items }]).replace(/<button type="button" class="db-new"[^>]*>.*?<\/button>/, "")}</section>`;
  }).join("")}</div><button type="button" class="db-new" data-action="new-tx">＋ 新規</button>`;
}

function categoryView(state, rows) {
  const groups = [...groupBy(rows, t => t.categoryId)].sort((a, b) => totals(b[1]).expense + totals(b[1]).income - totals(a[1]).expense - totals(a[1]).income);
  return table(state, VIEW_COLUMNS.category, groups.map(([id, items]) => {
    const budget = state.budgets.find(b => b.categoryId === id);
    const used = totals(items).expense;
    return { head: groupHead(tag(categoryName(state, id)), items) + (budget ? `<div class="g-budget">予算 ${fmt(budget.amount)} の ${Math.round(used / budget.amount * 100)}%${bar(used / budget.amount, used > budget.amount)}</div>` : ""), rows: items };
  }));
}

function tableView(state, rows, sort) {
  const [key, dir] = sort.split("-");
  const sorted = [...rows].sort((a, b) => (key === "amount" ? a.amount - b.amount : a.date.localeCompare(b.date)) * (dir === "asc" ? 1 : -1));
  return table(state, VIEW_COLUMNS.table, [{ rows: sorted }]);
}

function monthlyView(state, ctx) {
  const rows = monthlyRows(state, ctx.month, 12);
  const pct = v => (v == null ? "—" : `${Math.round(v * 100)}%`);
  return `<div class="db-scroll"><table class="db">
    <thead><tr><th class="c-title">🗓 月</th><th class="num"># 収入</th><th class="num"># 支出</th><th class="num"># 収支</th><th class="num">貯蓄率</th><th>予算の消化</th><th>🏷 支出の多いカテゴリ</th><th class="num">件数</th></tr></thead>
    <tbody>${rows.map(r => `<tr data-action="open-month" data-id="${r.month}" tabindex="0" class="${r.count ? "" : "dim"}">
      <td class="c-title"><span class="t-title">${monthLabel(r.month)}</span></td>
      <td class="num income">${fmt(r.income)}</td><td class="num expense">${fmt(r.expense)}</td>
      <td class="num amount ${r.balance >= 0 ? "income" : "expense"}">${signed(r.balance)}</td>
      <td class="num">${pct(r.savingRate)}</td>
      <td class="c-budget">${r.budget ? `${pct(r.budgetUsed / r.budget)}${bar(r.budgetUsed / r.budget, r.budgetUsed > r.budget)}` : "—"}</td>
      <td>${r.top ? `${tag(categoryName(state, r.top.categoryId))} <small>${fmt(r.top.amount)}</small>` : "—"}</td>
      <td class="num">${r.count}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted small">行をタップすると、その月の「毎日の家計簿」を開きます。</p>`;
}

export function renderRecordList(app) {
  const { state, ctx } = app;
  const view = currentView(state);
  if (view === "monthly") return monthlyView(state, ctx);
  const rows = filterRecords(state, ctx);
  const filtered = ctx.filters.q || ctx.filters.categoryId || ctx.filters.scope;
  if (!rows.length) return `<p class="empty">${filtered ? "条件に合う記録がありません" : "この月の記録はまだありません。右下の ＋ から記録できます"}</p><button type="button" class="db-new" data-action="new-tx">＋ 新規</button>`;
  const sum = totals(rows);
  const summary = `<p class="db-summary">${rows.length}件 · 収入 <span class="income">${fmt(sum.income)}</span> · 支出 <span class="expense">${fmt(sum.expense)}</span> · 収支 ${signed(sum.balance)}</p>`;
  if (view === "card") return summary + cardView(state, rows);
  if (view === "category") return summary + categoryView(state, rows);
  if (view === "table") return summary + tableView(state, rows, ctx.sort);
  return summary + dailyView(state, rows);
}

export function renderRecords(app) {
  const { state, ctx } = app;
  const f = ctx.filters;
  const view = currentView(state);
  const cats = state.categories.filter(c => !c.archived || c.id === f.categoryId);
  const filters = view === "monthly" ? "" : `<div class="filters">
      <input type="search" data-filter="q" placeholder="🔍 メモ・カテゴリ・支払方法で検索" value="${h(f.q)}" aria-label="検索">
      <select data-filter="categoryId" aria-label="カテゴリで絞り込み"><option value="">すべてのカテゴリ</option>
        <optgroup label="支出">${options(cats.filter(c => c.type === "expense"), f.categoryId)}</optgroup>
        <optgroup label="収入">${options(cats.filter(c => c.type === "income"), f.categoryId)}</optgroup></select>
      <select data-filter="scope" aria-label="区分で絞り込み"><option value="">個人＋事業</option><option value="personal" ${f.scope === "personal" ? "selected" : ""}>個人</option><option value="business" ${f.scope === "business" ? "selected" : ""}>事業</option></select>
      ${view === "table" ? `<select data-sort aria-label="並び替え">${options(SORTS, ctx.sort, "value")}</select>` : ""}
    </div>`;
  return `<div class="db-head">
      <h2><span aria-hidden="true">📒</span> 家計簿DB</h2>
      <select class="view-select" data-records-view aria-label="ビューを切り替える">${options(RECORD_VIEWS, view, "value")}</select>
    </div>
    ${filters}
    <div id="recordList">${renderRecordList(app)}</div>`;
}
