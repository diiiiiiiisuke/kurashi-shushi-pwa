// 画面部品の共通関数
import { escapeHtml, fmt } from "../util.js";

export const h = escapeHtml;

export function field(label, input, hint = "") {
  return `<label class="field"><span class="field-label">${label}</span>${input}${hint ? `<small>${hint}</small>` : ""}</label>`;
}

export function options(items, selected, valueKey = "id", labelKey = "name") {
  return items.map(x => `<option value="${h(x[valueKey])}" ${String(x[valueKey]) === String(selected ?? "") ? "selected" : ""}>${h(x[labelKey])}</option>`).join("");
}

export function panel(title, body, { eyebrow = "", action = "" } = {}) {
  return `<section class="panel"><div class="section-heading"><div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}<h2>${title}</h2></div>${action}</div>${body}</section>`;
}

export function metric(label, value, tone = "") {
  return `<div class="metric ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
}

export function bar(ratio, over = false) {
  return `<div class="bar ${over ? "over" : ""}" role="presentation"><span style="width:${Math.max(0, Math.min(100, Math.round(ratio * 100)))}%"></span></div>`;
}

export const amountClass = type => (type === "income" ? "income" : "expense");
export const amountText = t => `${t.type === "income" ? "+" : "−"}${fmt(t.amount)}`;

export const categoryName = (state, id) => state.categories.find(c => c.id === id)?.name ?? "（不明）";
export const accountName = (state, id) => state.accounts.find(a => a.id === id)?.name ?? "（不明）";

export const METHOD_LABEL = { fixed: "定額（利息込み）", principal: "元金定額＋利息", installment: "分割（回数指定）", none: "無利息" };
export const KIND_LABEL = { card: "クレジットカード", loan: "ローン", installment: "分割払い", other: "その他" };
export const ACCOUNT_KIND_LABEL = { cash: "現金", bank: "口座", card: "カード" };

export function emptyNote(text) { return `<p class="empty">${text}</p>`; }

export function txRow(state, t) {
  const sub = [categoryName(state, t.categoryId), accountName(state, t.accountId), t.scope === "business" ? "事業" : ""].filter(Boolean).map(h).join(" · ");
  return `<button type="button" class="list-item" data-action="edit-tx" data-id="${h(t.id)}">
    <span class="item-main"><strong>${h(t.memo || categoryName(state, t.categoryId))}</strong><small>${sub}${t.recurringId ? " · 定期" : ""}${t.interest ? ` · うち利息 ${fmt(t.interest)}` : ""}</small></span>
    <span class="amount ${amountClass(t.type)}">${amountText(t)}</span></button>`;
}
