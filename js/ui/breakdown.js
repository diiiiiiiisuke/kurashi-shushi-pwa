// 支払方法別・カテゴリ別の内訳（マネーフォワード風の積み上げ棒）。仕様: docs/spec-v3.md 3章
import { fmt } from "../util.js";
import { byAccount } from "../calc/summary.js";
import { h, tag, tagColor, TAG_FG, categoryName, accountName, ACCOUNT_KIND_LABEL } from "./common.js";

export function stackedBar(state, categories, total, label) {
  return `<div class="stack" role="img" aria-label="${h(label)}">${categories.map(c => {
    const name = categoryName(state, c.categoryId);
    return `<span style="width:${(c.amount / total * 100).toFixed(2)}%;background:${TAG_FG[tagColor(name)]}" title="${h(name)} ${fmt(c.amount)}"></span>`;
  }).join("")}</div>`;
}

function legend(state, categories, limit = 4) {
  const top = categories.slice(0, limit), rest = categories.slice(limit);
  const restSum = rest.reduce((n, c) => n + c.amount, 0);
  return `<div class="stack-legend">${top.map(c => `<span>${tag(categoryName(state, c.categoryId))} ${fmt(c.amount)}</span>`).join("")}${rest.length ? `<span class="muted">ほか${rest.length}件 ${fmt(restSum)}</span>` : ""}</div>`;
}

// 1つの支払方法の見出し（カード別ビューのグループ見出しにも使う）
export function accountSummary(state, a, grandTotal) {
  const acc = state.accounts.find(x => x.id === a.accountId);
  const kind = acc ? ACCOUNT_KIND_LABEL[acc.kind] : "";
  return `<div class="acc-head">
    <div class="row-between"><span class="acc-name">${acc?.kind === "card" ? "💳" : acc?.kind === "bank" ? "🏦" : "👛"} <strong>${h(accountName(state, a.accountId))}</strong> <small class="muted">${kind}</small></span>
      <span><strong>${fmt(a.total)}</strong> <small class="muted">${grandTotal ? Math.round(a.total / grandTotal * 100) : 0}%</small></span></div>
    ${stackedBar(state, a.categories, a.total, `${accountName(state, a.accountId)}の内訳`)}
    ${legend(state, a.categories)}
  </div>`;
}

export function accountBreakdown(state, txs) {
  const rows = byAccount(txs);
  const total = rows.reduce((n, a) => n + a.total, 0);
  if (!rows.length) return `<p class="empty">この月の支出はまだありません</p>`;
  return `<div class="acc-list">${rows.map(a => accountSummary(state, a, total)).join("")}</div>`;
}
