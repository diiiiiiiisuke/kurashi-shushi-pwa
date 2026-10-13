// 起動・画面の切り替え・ボタン操作のまとめ役
import { load, save, generateRecurring, migrate, resetAll } from "./store.js";
import { localDate, monthOf, addMonths, monthLabel, nowIso } from "./util.js";
import { renderHome } from "./ui/home.js";
import { renderRecords, renderRecordList } from "./ui/records.js";
import { renderAnalysis, afterAnalysis } from "./ui/analysis.js";
import { renderDebts, renderSimResult, afterSim } from "./ui/debts.js";
import { renderSettings } from "./ui/settings.js";
import { openSheet, initSheet } from "./ui/forms.js";
import { moveAccount } from "./calc/accounts.js";
import { afterOverview, renderOverview } from "./ui/overview.js";
import { initLock, lockNow } from "./ui/lock.js";
import { isEncryptedBackup } from "./crypto.js";
import { quickBackup, deliverBackup, snoozeBackup, requestPersistence, status as backupStatusOf } from "./ui/backup.js";
import { pendingEncrypted } from "./ui/forms.js";

const VIEWS = {
  home: { render: renderHome, month: true },
  records: { render: renderRecords, month: true },
  analysis: { render: renderAnalysis, month: true, after: afterAnalysis },
  debts: { render: renderDebts, after: a => { afterSim(a); afterOverview(a); } },
  settings: { render: renderSettings },
};

const app = {
  state: load(),
  ctx: { view: "home", month: monthOf(localDate()), filters: { q: "", categoryId: "", scope: "" }, sort: "date-desc", debtId: null, lastDate: null, trendUnit: "monthly" },
  // 状態を変えたら必ずこれを呼ぶ（保存して描き直す）
  commit() {
    generateRecurring(app.state, localDate()); // 定期取引を登録・編集した直後にも反映する
    try { save(app.state); } catch { app.toast("保存できませんでした。ブラウザの設定を確認してください"); }
    render();
  },
  render: () => render(),
  locked: false,
  // バックアップの中身（PIN のハッシュはこの端末の設定なので含めない）
  exportable() { return { ...app.state, settings: { ...app.state.settings, lock: null } }; },
  // 読み込んだデータで置き換える。ロックの設定はこの端末のものを残す
  importData(raw) {
    const data = migrate(raw);
    if (!Array.isArray(data.transactions) || !data.transactions.every(t => t.id && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount))) throw new Error("invalid");
    if (!confirm(`記録 ${data.transactions.length} 件・リマインド ${data.reminders.length} 件のバックアップを読み込みます。今のデータは置き換わります。よろしいですか？`)) return false;
    data.settings.lock = app.state.settings.lock;
    data.settings.lockAfter = app.state.settings.lockAfter;
    app.state = data;
    app.commit();
    app.toast("読み込みました");
    return true;
  },
  resetAll() {
    if (!confirm("この端末の記録をすべて消して、最初からやり直しますか？\n（バックアップファイルがあれば、あとで読み込んで戻せます）")) return;
    if (prompt("確認のため「削除」と入力してください") !== "削除") return;
    resetAll();
    location.reload();
  },
  toast(text) {
    const el = document.querySelector("#toast");
    const sheet = document.querySelector("#sheet");
    (sheet.open ? sheet : document.body).append(el); // 入力シートの上にも表示する
    el.textContent = text; el.hidden = false;
    clearTimeout(app._toast); app._toast = setTimeout(() => (el.hidden = true), 2400);
  },
};

if (generateRecurring(app.state, localDate())) save(app.state);

function render() {
  if (app.locked) return;   // ロック中は記録を画面に出さない
  const v = VIEWS[app.ctx.view];
  const main = document.querySelector("#view");
  document.querySelector("#monthControl").hidden = !v.month;
  document.querySelector("#monthLabel").textContent = monthLabel(app.ctx.month);
  main.innerHTML = v.render(app);
  v.after?.(app);
  // 週1回: アプリを開いたとき（ロック解除後）にバックアップをたずねる（1回の起動で1度だけ）
  if (!app.ctx.backupAsked && app.ctx.view === "home" && backupStatusOf(app).prompt && !document.querySelector("#sheet").open) {
    app.ctx.backupAsked = true;
    setTimeout(() => { if (!app.locked && !document.querySelector("#sheet").open) openSheet(app, "quickBackup"); }, 400);
  }
  document.querySelectorAll("nav [data-view]").forEach(b => b.setAttribute("aria-current", b.dataset.view === app.ctx.view ? "page" : "false"));
}

function show(view) {
  app.ctx.view = view;
  if (view !== "debts") app.ctx.debtId = null;
  render();
  window.scrollTo(0, 0);
}

const find = (list, id) => list.find(x => x.id === id);
const actions = {
  "new-tx": d => openSheet(app, "tx", { debtId: d.debtId }),
  "edit-tx": d => openSheet(app, "tx", { tx: find(app.state.transactions, d.id) }),
  "prev-month": () => { app.ctx.month = addMonths(app.ctx.month, -1); render(); },
  "next-month": () => { app.ctx.month = addMonths(app.ctx.month, 1); render(); },
  "add-reminder": () => openSheet(app, "reminder"),
  "edit-reminder": d => openSheet(app, "reminder", { reminder: find(app.state.reminders, d.id) }),
  "add-category": () => openSheet(app, "category"),
  "edit-category": d => openSheet(app, "category", { category: find(app.state.categories, d.id) }),
  "add-account": () => openSheet(app, "account"),
  "bulk-accounts": () => openSheet(app, "bulkAccount"),
  "move-account": d => { app.state.accounts = moveAccount(app.state.accounts, d.id, Number(d.dir)); app.commit(); },
  "edit-account": d => openSheet(app, "account", { account: find(app.state.accounts, d.id) }),
  "add-budget": () => openSheet(app, "budget"),
  "edit-budget": d => openSheet(app, "budget", { budget: app.state.budgets.find(b => b.categoryId === d.id) }),
  "add-recurring": () => openSheet(app, "recurring"),
  "edit-recurring": d => openSheet(app, "recurring", { recurring: find(app.state.recurring, d.id) }),
  "add-debt": () => openSheet(app, "debt"),
  "edit-debt": d => openSheet(app, "debt", { debt: find(app.state.debts, d.id) }),
  "rebase-debt": d => openSheet(app, "rebase", { debt: find(app.state.debts, d.id) }),
  "open-debt": d => { app.ctx.debtId = d.id; render(); window.scrollTo(0, 0); },
  "close-debt": () => { app.ctx.debtId = null; render(); },
  "archive-debt": d => { const x = find(app.state.debts, d.id); x.archived = !x.archived; app.toast(x.archived ? "完済済みにしました" : "返済中に戻しました"); app.commit(); },
  // 家計簿DB: 月次の行 → その月の「毎日の家計簿」、分析 → カード別ビュー
  "open-month": d => { app.ctx.month = d.id; setRecordsView("daily"); },
  "records-view": d => { app.ctx.view = "records"; setRecordsView(d.id); window.scrollTo(0, 0); },
  export: () => openSheet(app, "exportBackup"),
  backup: () => openSheet(app, "quickBackup"),
  "backup-quick": () => quickBackup(app),
  "backup-encrypted": () => { const text = pendingEncrypted(); if (text) deliverBackup(app, text, true); },
  "backup-snooze": () => snoozeBackup(app),
  "pin-set": () => openSheet(app, "pinSet"),
  "pin-off": () => openSheet(app, "pinOff"),
  "lock-now": () => lockNow(app),
  "reset-all": () => app.resetAll(),
  import: () => document.querySelector("#importFile").click(),
};

document.addEventListener("click", e => {
  const viewBtn = e.target.closest("[data-view]");
  if (viewBtn) return show(viewBtn.dataset.view);
  const el = e.target.closest("[data-action]");
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el.dataset);
});

// 記録の絞り込み・シミュレーション条件は、入力中のフォーカスを保つため一部だけ描き直す
document.addEventListener("input", e => {
  const f = e.target.dataset.filter;
  if (f) { app.ctx.filters[f] = e.target.value; document.querySelector("#recordList").innerHTML = renderRecordList(app); return; }
  const sim = e.target.dataset.sim;
  if (!sim) return;
  if (sim === "repaymentBudget") {
    const v = Math.round(Number(String(e.target.value).replace(/[,\s]/g, "")) || 0);
    app.state.settings.repaymentBudget = v;
    document.querySelectorAll('[data-sim="repaymentBudget"]').forEach(x => { if (x !== e.target) x.value = x.type === "range" ? v : v.toLocaleString("ja-JP"); });
  } else app.state.settings.strategy = e.target.value;
  document.querySelector("#simResult").innerHTML = renderSimResult(app);
  afterSim(app);
  const overview = document.querySelector("#overviewPanel");
  if (overview) { overview.outerHTML = renderOverview(app); afterOverview(app); }
});
document.addEventListener("change", e => {
  if (e.target.matches("[data-reminder-complete]") && e.target.checked) {
    app.state.reminders = app.state.reminders.filter(r => r.id !== e.target.dataset.id);
    app.commit();
    app.toast("リマインドを削除しました");
    document.querySelector('[data-action="add-reminder"]')?.focus({ preventScroll: true });
    return;
  }
  if (e.target.matches("[data-trend-unit]")) {
    app.ctx.trendUnit = e.target.value;
    render();
    document.querySelector("[data-trend-unit]")?.focus();
    return;
  }
  if (e.target.dataset.sim) save(app.state);
  if (e.target.matches("[data-records-view]")) setRecordsView(e.target.value);
  if (e.target.dataset.overview) { app.state.settings[e.target.dataset.overview] = e.target.value; app.commit(); }
  if (e.target.matches("[data-lock-after]")) { app.state.settings.lockAfter = Number(e.target.value); app.commit(); }
  if (e.target.matches("[data-sort]")) { app.ctx.sort = e.target.value; document.querySelector("#recordList").innerHTML = renderRecordList(app); }
});
// 表の行（tr）もキーボードの Enter で開けるようにする
document.addEventListener("keydown", e => {
  const el = e.target.closest?.("tr[data-action]");
  if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); actions[el.dataset.action]?.(el.dataset); }
});

function setRecordsView(view) {
  app.state.settings.recordsView = view;
  app.commit();
}

document.querySelector("#importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { return alert("読み込めませんでした。くらし収支のバックアップファイル（.json）を選んでください。"); }
  if (isEncryptedBackup(raw)) return openSheet(app, "decryptBackup", { payload: raw });
  try { app.importData(raw); } catch { alert("読み込めませんでした。くらし収支のバックアップファイル（.json）を選んでください。"); }
});

let deferredInstall;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; document.querySelector("#install").hidden = false; });
document.querySelector("#install").addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null;
  document.querySelector("#install").hidden = true;
});

// 日付が変わったあとに開き直したとき、定期取引を作成して描き直す
// （ロックの判定を先に済ませるため、少し後に実行する）
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") setTimeout(() => { if (generateRecurring(app.state, localDate())) app.commit(); }, 0);
});

initSheet();
initLock(app, render);
requestPersistence(app);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
