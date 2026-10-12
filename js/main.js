// 起動・画面の切り替え・ボタン操作のまとめ役
import { load, save, generateRecurring, migrate } from "./store.js";
import { localDate, monthOf, addMonths, monthLabel, nowIso } from "./util.js";
import { renderHome } from "./ui/home.js";
import { renderRecords, renderRecordList } from "./ui/records.js";
import { renderAnalysis, afterAnalysis } from "./ui/analysis.js";
import { renderDebts, renderSimResult, afterSim } from "./ui/debts.js";
import { renderSettings } from "./ui/settings.js";
import { openSheet, initSheet } from "./ui/forms.js";

const VIEWS = {
  home: { render: renderHome, month: true },
  records: { render: renderRecords, month: true },
  analysis: { render: renderAnalysis, month: true, after: afterAnalysis },
  debts: { render: renderDebts, after: afterSim },
  settings: { render: renderSettings },
};

const app = {
  state: load(),
  ctx: { view: "home", month: monthOf(localDate()), filters: { q: "", categoryId: "", scope: "" }, debtId: null, lastDate: null },
  // 状態を変えたら必ずこれを呼ぶ（保存して描き直す）
  commit() {
    generateRecurring(app.state, localDate()); // 定期取引を登録・編集した直後にも反映する
    try { save(app.state); } catch { app.toast("保存できませんでした。ブラウザの設定を確認してください"); }
    render();
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
  const v = VIEWS[app.ctx.view];
  const main = document.querySelector("#view");
  document.querySelector("#monthControl").hidden = !v.month;
  document.querySelector("#monthLabel").textContent = monthLabel(app.ctx.month);
  main.innerHTML = v.render(app);
  v.after?.(app);
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
  "add-category": () => openSheet(app, "category"),
  "edit-category": d => openSheet(app, "category", { category: find(app.state.categories, d.id) }),
  "add-account": () => openSheet(app, "account"),
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
  export: exportData,
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
    document.querySelectorAll('[data-sim="repaymentBudget"]').forEach(x => { if (x !== e.target) x.value = v; });
  } else app.state.settings.strategy = e.target.value;
  document.querySelector("#simResult").innerHTML = renderSimResult(app);
  afterSim(app);
});
document.addEventListener("change", e => { if (e.target.dataset.sim) save(app.state); });

function exportData() {
  app.state.settings.lastBackupAt = nowIso();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(app.state, null, 2)], { type: "application/json" }));
  a.download = `kurashi-shushi-${localDate()}.backup.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  app.commit();
  app.toast("バックアップを書き出しました");
}

document.querySelector("#importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = migrate(JSON.parse(await file.text()));
    if (!Array.isArray(data.transactions) || !data.transactions.every(t => t.id && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount))) throw new Error();
    if (!confirm(`記録 ${data.transactions.length} 件のバックアップを読み込みます。今のデータは置き換わります。よろしいですか？`)) return;
    app.state = data;
    app.commit();
    app.toast("読み込みました");
  } catch {
    alert("読み込めませんでした。くらし収支のバックアップファイル（.json）を選んでください。");
  }
});

let deferredInstall;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; document.querySelector("#install").hidden = false; });
document.querySelector("#install").addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null;
  document.querySelector("#install").hidden = true;
});

// 日付が変わったあとに開き直したとき、定期取引を作成して描き直す
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && generateRecurring(app.state, localDate())) app.commit();
});

initSheet();
render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
