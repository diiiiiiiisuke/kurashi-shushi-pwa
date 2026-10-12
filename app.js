const KEY = "kurashi-shushi-data-v1";
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const today = new Date();
let shownMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let deferredInstall;
let state = load();

function defaultState() { return { transactions: [], debts: [], budgets: [{ category: "食費", amount: 30000 }, { category: "生活費", amount: 10000 }, { category: "交通費", amount: 10000 }, { category: "サブスク", amount: 5000 }], settings: {} }; }
function load() { try { return { ...defaultState(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return defaultState(); } }
function save() { localStorage.setItem(KEY, JSON.stringify(state)); render(); }
function id() { return crypto.randomUUID(); }
function dateValue(value) { return new Date(`${value}T00:00:00`); }
function isInMonth(date) { const d = dateValue(date); return d.getFullYear() === shownMonth.getFullYear() && d.getMonth() === shownMonth.getMonth(); }
function sum(items) { return items.reduce((n, x) => n + Number(x.amount || x.balance || 0), 0); }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])); }

function render() {
  document.querySelector("#monthLabel").textContent = `${shownMonth.getFullYear()}年${shownMonth.getMonth() + 1}月`;
  const monthTransactions = state.transactions.filter(t => isInMonth(t.date));
  const income = sum(monthTransactions.filter(t => t.type === "income"));
  const expense = sum(monthTransactions.filter(t => t.type === "expense"));
  document.querySelector("#monthIncome").textContent = yen.format(income);
  document.querySelector("#monthExpense").textContent = yen.format(expense);
  document.querySelector("#monthBalance").textContent = yen.format(income - expense);
  document.querySelector("#totalDebt").textContent = yen.format(sum(state.debts));
  renderBudget(monthTransactions); renderUpcoming(); renderBusiness(monthTransactions); renderTransactions(); renderDebts();
}
function renderBudget(transactions) {
  const box = document.querySelector("#budgetProgress");
  const rows = state.budgets.map(b => {
    const used = sum(transactions.filter(t => t.type === "expense" && t.category === b.category));
    const pct = b.amount ? Math.min(100, Math.round(used / b.amount * 100)) : 0;
    return `<div class="budget-row"><div class="budget-label"><span>${escapeHtml(b.category)}</span><span>${yen.format(used)} / ${yen.format(b.amount)}</span></div><div class="bar ${used > b.amount ? "over" : ""}"><span style="width:${pct}%"></span></div></div>`;
  });
  box.innerHTML = rows.length ? rows.join("") : `<p class="empty">予算を設定してください</p>`;
}
function renderUpcoming() {
  const box = document.querySelector("#upcomingPayments");
  const rows = state.debts.filter(d => d.balance > 0).sort((a,b) => (a.dueDay || 99) - (b.dueDay || 99)).slice(0,5);
  box.classList.toggle("empty", !rows.length);
  box.innerHTML = rows.length ? rows.map(d => `<div class="list-item"><div><strong>${escapeHtml(d.name)}</strong><small>毎月${d.dueDay || "未設定"}日・予定 ${yen.format(d.payment || 0)}</small></div><span class="amount expense">残 ${yen.format(d.balance)}</span></div>`).join("") : "登録がありません";
}
function renderBusiness(transactions) {
  const revenue = sum(transactions.filter(t => t.type === "income" && t.scope === "business"));
  const cost = sum(transactions.filter(t => t.type === "expense" && t.scope === "business"));
  document.querySelector("#businessSummary").innerHTML = `<div>今月の売上<strong>${yen.format(revenue)}</strong></div><div>今月の経費<strong>${yen.format(cost)}</strong></div><div>概算利益<strong>${yen.format(revenue - cost)}</strong></div><div>未入金は「収支」で管理</div>`;
}
function renderTransactions() {
  const box = document.querySelector("#transactionList");
  const rows = [...state.transactions].sort((a,b) => b.date.localeCompare(a.date));
  box.classList.toggle("empty", !rows.length);
  box.innerHTML = rows.length ? rows.map(t => `<div class="list-item"><div><strong>${escapeHtml(t.description || t.category)}</strong><small>${t.date} · ${escapeHtml(t.scope === "business" ? "事業" : "個人")} · ${escapeHtml(t.category)}</small></div><div><span class="amount ${t.type}">${t.type === "income" ? "+" : "−"}${yen.format(t.amount)}</span><button class="text-button" data-delete-transaction="${t.id}">削除</button></div></div>`).join("") : "まだ取引がありません";
}
function renderDebts() {
  const box = document.querySelector("#debtList");
  const rows = [...state.debts].sort((a,b) => b.balance - a.balance);
  box.classList.toggle("empty", !rows.length);
  box.innerHTML = rows.length ? rows.map(d => `<article class="debt-card"><header><h3>${escapeHtml(d.name)}</h3><span>${escapeHtml(d.kind)}</span></header><p>支払日: 毎月${d.dueDay || "未設定"}日 / 年利: ${d.apr ?? "未設定"}%</p><strong>${yen.format(d.balance)}</strong><p>毎月の予定返済 ${yen.format(d.payment || 0)}</p><button class="text-button" data-delete-debt="${d.id}">削除</button></article>`).join("") : "返済先がありません";
}

const field = (label, input) => `<div class="field"><label>${label}</label>${input}</div>`;
function openForm(kind) {
  const dialog = document.querySelector("#entryDialog"); const title = document.querySelector("#dialogTitle"); const fields = document.querySelector("#formFields");
  if (kind === "transaction") { title.textContent = "収支を入力"; fields.innerHTML = field("日付", `<input name="date" type="date" value="${today.toISOString().slice(0,10)}" required>`) + field("種類", `<select name="type"><option value="expense">支出</option><option value="income">収入</option></select>`) + field("対象", `<select name="scope"><option value="personal">個人</option><option value="business">事業</option></select>`) + field("カテゴリ", `<input name="category" list="categories" placeholder="例: 食費、給与、売上" required><datalist id="categories"><option>食費</option><option>生活費</option><option>交通費</option><option>サブスク</option><option>給与</option><option>副業売上</option><option>事業経費</option><option>返済</option></datalist>`) + field("金額", `<input name="amount" type="number" min="1" inputmode="numeric" required>`) + field("内容", `<input name="description" placeholder="例: スーパー">`); }
  if (kind === "debt") { title.textContent = "返済先を登録"; fields.innerHTML = field("返済先", `<input name="name" placeholder="例: クレジットカード名" required>`) + field("種類", `<select name="kind"><option>クレジットカード</option><option>カードローン</option><option>分割払い</option><option>その他</option></select>`) + field("現在残高", `<input name="balance" type="number" min="0" inputmode="numeric" required>`) + field("毎月の返済予定", `<input name="payment" type="number" min="0" inputmode="numeric">`) + field("支払日", `<input name="dueDay" type="number" min="1" max="31" inputmode="numeric"><small>不明なら空欄で構いません</small>`) + field("年利（%）", `<input name="apr" type="number" min="0" step="0.01" inputmode="decimal">`); }
  if (kind === "budget") { title.textContent = "予算を設定"; fields.innerHTML = field("カテゴリ", `<input name="category" placeholder="例: 食費" required>`) + field("月の予算", `<input name="amount" type="number" min="0" inputmode="numeric" required>`); }
  dialog.dataset.kind = kind; dialog.showModal();
}
document.querySelector("#entryForm").addEventListener("submit", e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const kind = document.querySelector("#entryDialog").dataset.kind; if (kind === "transaction") state.transactions.push({ id:id(), ...f, amount:Number(f.amount) }); if (kind === "debt") state.debts.push({ id:id(), ...f, balance:Number(f.balance), payment:Number(f.payment || 0), dueDay:Number(f.dueDay || 0), apr:f.apr === "" ? null : Number(f.apr) }); if (kind === "budget") state.budgets = [...state.budgets.filter(b => b.category !== f.category), { category:f.category, amount:Number(f.amount) }]; document.querySelector("#entryDialog").close(); save(); });
document.addEventListener("click", e => { const view = e.target.dataset.view; if (view) { document.querySelectorAll(".view").forEach(x => x.classList.toggle("active", x.id === view)); document.querySelectorAll("nav button").forEach(x => x.classList.toggle("selected", x.dataset.view === view)); } if (e.target.dataset.open) openForm(e.target.dataset.open); if (e.target.matches("[data-close]")) document.querySelector("#entryDialog").close(); const tid=e.target.dataset.deleteTransaction, did=e.target.dataset.deleteDebt; if(tid){state.transactions=state.transactions.filter(t=>t.id!==tid);save()} if(did){state.debts=state.debts.filter(d=>d.id!==did);save()} });
document.querySelector("#previousMonth").onclick = () => { shownMonth.setMonth(shownMonth.getMonth()-1); render(); }; document.querySelector("#nextMonth").onclick = () => { shownMonth.setMonth(shownMonth.getMonth()+1); render(); };
document.querySelector("#exportData").onclick = () => { const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download=`kurashi-shushi-${today.toISOString().slice(0,10)}.backup.json`;a.click();URL.revokeObjectURL(a.href); };
document.querySelector("#importData").onchange = async e => { const file=e.target.files[0]; if(!file)return; try{const data=JSON.parse(await file.text());if(!Array.isArray(data.transactions)||!Array.isArray(data.debts))throw new Error();state={...defaultState(),...data};save();alert("データを読み込みました");}catch{alert("読み込めませんでした。くらし収支のバックアップJSONを選択してください。")} e.target.value=""; };
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall=e; document.querySelector("#install").hidden=false; }); document.querySelector("#install").onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;document.querySelector("#install").hidden=true};
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js"); render();
