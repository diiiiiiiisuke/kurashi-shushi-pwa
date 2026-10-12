// 設定: バックアップ・支払方法・カテゴリ・予算・定期取引
import { fmt, daysBetween, localDate, monthOf } from "../util.js";
import { accountUsage } from "../calc/accounts.js";
import { status as backupState, ageText } from "./backup.js";
import { h, panel, emptyNote, categoryName, accountName, ACCOUNT_KIND_LABEL } from "./common.js";

const addBtn = (action, label) => `<button type="button" class="link" data-action="${action}">＋ ${label}</button>`;
const row = (action, idv, main, sub = "", right = "") =>
  `<button type="button" class="list-item" data-action="${action}" data-id="${h(idv)}"><span class="item-main"><strong>${main}</strong>${sub ? `<small>${sub}</small>` : ""}</span><span class="muted">${right || "編集"}</span></button>`;

export function renderSettings(app) {
  const s = app.state;
  const out = [`<div class="section-heading"><div><p class="eyebrow">SETTINGS</p><h2>設定</h2></div></div>`];

  const last = s.settings.lastBackupAt;
  const lock = s.settings.lock;
  out.push(panel("セキュリティ", `
    <div class="row-between"><span>PINロック</span><strong class="${lock ? "income" : "expense"}">${lock ? "🔒 オン" : "オフ"}</strong></div>
    <p class="muted small">アプリを開くときにPIN（数字4〜8桁）を求めます。スマホを他の人が触ったときに家計を見られないようにします。</p>
    ${lock ? `<label class="field"><span class="field-label">自動でロックするまで</span><select data-lock-after>
        <option value="0" ${s.settings.lockAfter === 0 ? "selected" : ""}>アプリを離れたらすぐ</option>
        <option value="1" ${s.settings.lockAfter === 1 ? "selected" : ""}>アプリを離れて1分後</option>
        <option value="5" ${s.settings.lockAfter === 5 ? "selected" : ""}>アプリを離れて5分後</option></select></label>` : ""}
    <div class="button-row">
      <button type="button" class="${lock ? "secondary" : "primary"}" data-action="pin-set">${lock ? "PINを変更" : "PINロックを設定"}</button>
      ${lock ? `<button type="button" class="secondary" data-action="lock-now">今すぐロック</button><button type="button" class="danger-text" data-action="pin-off">PINロックを解除</button>` : ""}
    </div>
    <p class="muted small">記録はこの端末の中だけに保存され、外部には送信されません（ブラウザの設定で外部との通信を禁止しています）。</p>`, { eyebrow: "SECURITY" }));

  const bs = backupState(app);
  const persisted = app.storagePersisted === true ? "✅ 有効（iPhoneがデータを消しにくくなっています）" : app.storagePersisted === false ? "iPhoneの判断に任せています" : "この端末では未対応";
  out.push(panel("バックアップ", `
    <p class="muted">📱 記録はこのiPhoneの中だけにあります。故障・紛失・機種変更に備えて、<strong>週に1回</strong>iCloudにコピーしておきましょう（7日たつとアプリが知らせます）。</p>
    <p>最後のバックアップ: <strong class="${bs.due ? "expense" : "income"}">${ageText(bs)}</strong></p>
    <button type="button" class="primary wide" data-action="backup-quick">☁️ iCloudに保存（1タップ）</button>
    <div class="button-row"><button type="button" class="secondary" data-action="export">🔒 パスワードを付けて保存</button><button type="button" class="secondary" data-action="import">読み込む（元に戻す）</button></div>
    <details class="howto"><summary>保存のしかた・元に戻し方</summary>
      <ol>
        <li>「iCloudに保存」を押す → <strong>「"ファイル"に保存」</strong>を選ぶ</li>
        <li><strong>iCloud Drive</strong> の中のフォルダ（例: 家計簿バックアップ）を選んで「保存」</li>
        <li>元に戻すとき: このアプリの「読み込む」→ iCloud Drive の一番新しいファイルを選ぶ</li>
      </ol>
      <p class="muted small">ファイルは Apple ID で守られた iCloud に保存されます。さらに守りたいときは「パスワードを付けて保存」を使ってください。GitHub や人に送るチャットには置かないでください。</p>
    </details>
    <p class="muted small">データ保護（消えにくくする設定）: ${persisted}</p>`, { eyebrow: "BACKUP" }));

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

  out.push(panel("データを消す", `<p class="muted small">機種変更の後や、最初からやり直したいときに使います。消す前にバックアップを書き出してください。</p>
    <button type="button" class="danger-text" data-action="reset-all">この端末のデータをすべて消す</button>`, { eyebrow: "RESET" }));

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
