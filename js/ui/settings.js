// 設定: バックアップ・支払方法・カテゴリ・予算・定期取引
import { fmt, daysBetween, localDate, monthOf } from "../util.js";
import { accountUsage } from "../calc/accounts.js";
import { h, panel, emptyNote, categoryName, accountName, ACCOUNT_KIND_LABEL } from "./common.js";

const addBtn = (action, label) => `<button type="button" class="link" data-action="${action}">＋ ${label}</button>`;
const row = (action, idv, main, sub = "", right = "") =>
  `<button type="button" class="list-item" data-action="${action}" data-id="${h(idv)}"><span class="item-main"><strong>${main}</strong>${sub ? `<small>${sub}</small>` : ""}</span><span class="muted">${right || "編集"}</span></button>`;

export function renderSettings(app) {
  const s = app.state;
  const out = [`<div class="section-heading"><div><p class="eyebrow">SETTINGS</p><h2>設定</h2></div></div>`];

  const last = s.settings.lastBackupAt;
  out.push(panel("バックアップ", `
    <p class="muted">記録はこのスマホのブラウザの中だけに保存されています。故障・機種変更・ブラウザのデータ削除に備えて、月に1回は書き出してください。<strong>書き出したファイルはGitHubや人に送るチャットに置かないでください。</strong></p>
    <p>最後のバックアップ: <strong>${last ? `${last.slice(0, 10)}（${daysBetween(last.slice(0, 10), localDate())}日前）` : "まだありません"}</strong></p>
    <div class="button-row"><button type="button" class="primary" data-action="export">書き出す</button><button type="button" class="secondary" data-action="import">読み込む</button></div>`, { eyebrow: "BACKUP" }));

  out.push(panel("支払方法（クレカ・口座）", accountsBody(s), { eyebrow: "ACCOUNTS", action: addBtn("add-account", "追加") }));

  out.push(panel("毎月の予算", s.budgets.length ? `<div class="list">${s.budgets.map(b => row("edit-budget", b.categoryId, h(categoryName(s, b.categoryId)), "", fmt(b.amount))).join("")}</div>` : emptyNote("予算がありません"), { eyebrow: "BUDGET", action: addBtn("add-budget", "追加") }));

  out.push(panel("定期取引", `<p class="muted small">家賃・給与・サブスクなど毎月決まったものは、ここに登録すると指定日に自動で記録されます。</p>` +
    (s.recurring.length ? `<div class="list">${s.recurring.map(r => row("edit-recurring", r.id, h(r.name), `毎月${r.day}日 · ${h(categoryName(s, r.categoryId))} · ${h(accountName(s, r.accountId))}${r.active ? "" : " · 停止中"}`, `${r.type === "income" ? "+" : "−"}${fmt(r.amount)}`)).join("")}</div>` : emptyNote("定期取引はありません")),
    { eyebrow: "RECURRING", action: addBtn("add-recurring", "追加") }));

  const catList = type => {
    const cats = s.categories.filter(c => c.type === type && !c.archived).sort((a, b) => a.order - b.order);
    return `<div class="list">${cats.map(c => row("edit-category", c.id, h(c.name), [type === "expense" ? (c.group === "fixed" ? "固定費" : "変動費") : "", c.scope === "business" ? "事業" : "", c.isRepayment ? "返済" : ""].filter(Boolean).join(" · "))).join("")}</div>`;
  };
  out.push(panel("カテゴリ", `<h3 class="sub">支出</h3>${catList("expense")}<h3 class="sub">収入</h3>${catList("income")}
    ${archivedList(s.categories.filter(c => c.archived), c => row("edit-category", c.id, h(c.name)))}`, { eyebrow: "CATEGORIES", action: addBtn("add-category", "追加") }));

  out.push(panel("このアプリについて", `<p class="muted">データはこの端末の中だけに保存され、外部には送信されません（外部との通信はブラウザの設定で禁止しています）。アプリのコードは GitHub で公開されていますが、記録したデータは含まれません。</p>`, { eyebrow: "ABOUT" }));
  return out.join("");
}

// 支払方法の一覧: 今月の利用額・件数、並べ替え、まとめて追加（docs/spec-v4.md 2章）
function accountsBody(s) {
  const month = monthOf(localDate());
  const active = s.accounts.filter(a => !a.archived);
  const items = active.map((a, i) => {
    const u = accountUsage(s, a.id, month);
    const icon = a.kind === "card" ? "💳" : a.kind === "bank" ? "🏦" : "👛";
    const sub = [ACCOUNT_KIND_LABEL[a.kind], a.closingDay ? `${a.closingDay}日締め` : "", a.paymentDay ? `${a.paymentDay}日払い` : "", u.monthCount ? `今月 ${fmt(u.monthTotal)}（${u.monthCount}件）` : "今月の利用なし"].filter(Boolean).join(" · ");
    const move = a.id === "cash" ? `<span class="move-gap"></span>` : `<span class="move">
      <button type="button" class="icon-mini" data-action="move-account" data-id="${h(a.id)}" data-dir="-1" aria-label="${h(a.name)}を上へ" ${i <= 1 ? "disabled" : ""}>↑</button>
      <button type="button" class="icon-mini" data-action="move-account" data-id="${h(a.id)}" data-dir="1" aria-label="${h(a.name)}を下へ" ${i === active.length - 1 ? "disabled" : ""}>↓</button></span>`;
    return `<div class="acc-row">${move}${row("edit-account", a.id, `${icon} ${h(a.name)}`, sub)}</div>`;
  }).join("");
  const cards = active.filter(a => a.kind === "card").length;
  return `<p class="muted small">クレカ ${cards}枚。入力の「支払方法」にこの順で並びます。使わなくなったカードは編集から「削除」または「使わない」にできます。</p>
    <div class="list">${items}</div>
    <div class="button-row"><button type="button" class="secondary" data-action="bulk-accounts">📋 まとめて追加（Notion から貼り付け）</button></div>
    ${archivedList(s.accounts.filter(a => a.archived), a => row("edit-account", a.id, h(a.name), "使わない（非表示）"))}`;
}

function archivedList(items, render) {
  return items.length ? `<details class="archived"><summary>非表示にしたもの（${items.length}）</summary><div class="list">${items.map(render).join("")}</div></details>` : "";
}
