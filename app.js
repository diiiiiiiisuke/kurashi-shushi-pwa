const KEY = "kurashi-shushi-data-v1";
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const today = new Date();
let shownMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let deferredInstall;
let state = load();

function defaultState() { return { transactions: [], debts: [], cards: [], budgets: [{ category: "食費", amount: 30000 }, { category: "生活費", amount: 10000 }, { category: "交通費", amount: 10000 }, { category: "サブスク", amount: 5000 }], settings: { monthlyRepayment: 115000, annualRate: 18 } }; }
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
  renderBudget(monthTransactions); renderUpcoming(); renderBusiness(monthTransactions); renderExpenseChart(monthTransactions); renderSimulation(); renderTransactions(); renderDebts(); renderCards();
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
function renderExpenseChart(transactions) {
  const totals = {};
  transactions.filter(t => t.type === "expense").forEach(t => totals[t.category] = (totals[t.category] || 0) + Number(t.amount));
  const entries = Object.entries(totals).sort((a,b) => b[1]-a[1]).slice(0,6); const canvas = document.querySelector("#expenseChart"); const ctx = canvas.getContext("2d"); const w = canvas.width, h = canvas.height; ctx.clearRect(0,0,w,h);
  const colors=["#147c82","#1e5c76","#d28938","#b94040","#7563a8","#60804d"]; const max=Math.max(...entries.map(x=>x[1]),1); const gap=18, bw=Math.max(44,(w-gap*(entries.length+1))/Math.max(entries.length,1));
  entries.forEach(([name,value],i)=>{const x=gap+i*(bw+gap), bh=Math.round((value/max)*150), y=185-bh; ctx.fillStyle=colors[i]; ctx.fillRect(x,y,bw,bh);ctx.fillStyle="#162b35";ctx.font="bold 12px sans-serif";ctx.textAlign="center";ctx.fillText(name.length>6?name.slice(0,6)+"…":name,x+bw/2,205);ctx.fillStyle="#61727a";ctx.font="12px sans-serif";ctx.fillText(`${Math.round(value/1000)}千円`,x+bw/2,224);});
  document.querySelector("#expenseLegend").innerHTML=entries.length?entries.map(([n,v],i)=>`<span style="border-left:5px solid ${colors[i]}">${escapeHtml(n)} ${yen.format(v)}</span>`).join(""):"今月の支出を入力するとグラフが表示されます";
}
function renderSimulation() {
  const total=sum(state.debts); const payment=Number(state.settings.monthlyRepayment||0); const rate=Number(state.settings.annualRate||0)/1200; const box=document.querySelector("#simulationBars"); const text=document.querySelector("#simulationText"); if(!total||!payment){text.textContent="返済先と毎月の返済額を登録すると、残債の見通しを表示します。";box.innerHTML="";return;} let balance=total, month=0; const points=[balance]; while(balance>0&&month<120){balance=Math.max(0,balance*(1+rate)-payment);month++;if(month%3===0||balance===0)points.push(balance);} const end=new Date();end.setMonth(end.getMonth()+month); text.textContent=`毎月 ${yen.format(payment)} を返済し、年利 ${Number(state.settings.annualRate||0).toFixed(1)}% と仮定した場合、約${month}か月（${end.getFullYear()}年${end.getMonth()+1}月）で完済見込みです。`; const peak=Math.max(...points,1);box.innerHTML=points.map((p,i)=>`<div style="height:${Math.max(4,Math.round(p/peak*145))}px"><span>${i===0?"現在":`${i*3}月`}</span></div>`).join("");
}
function renderCards() { const box=document.querySelector("#cardList"); const rows=state.cards||[];box.classList.toggle("empty",!rows.length);box.innerHTML=rows.length?rows.map(c=>`<div class="list-item"><div><strong>${escapeHtml(c.name)}</strong><small>締日 ${c.closingDay||"未設定"}日・支払日 ${c.paymentDay||"未設定"}日</small></div><button class="text-button" data-delete-card="${c.id}">削除</button></div>`).join(""):"カードがありません"; }
function renderTransactions() {
  const box = document.querySelector("#transactionList");
  const rows = [...state.transactions].sort((a,b) => b.date.localeCompare(a.date));
  box.classList.toggle("empty", !rows.length);
  box.innerHTML = rows.length ? rows.map(t => { const card=(state.cards||[]).find(c=>c.id===t.paymentMethod); const method=card ? card.name : (t.paymentMethod === "cash" ? "現金・口座" : "未設定"); return `<div class="list-item"><div><strong>${escapeHtml(t.description || t.category)}</strong><small>${t.date} · ${escapeHtml(t.scope === "business" ? "事業" : "個人")} · ${escapeHtml(t.category)} · ${escapeHtml(method)}</small></div><div><span class="amount ${t.type}">${t.type === "income" ? "+" : "−"}${yen.format(t.amount)}</span><button class="text-button" data-delete-transaction="${t.id}">削除</button></div></div>`; }).join("") : "まだ取引がありません";
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
  if (kind === "transaction") { const cardOptions=(state.cards||[]).map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join(""); title.textContent = "収支を入力"; fields.innerHTML = field("日付", `<input name="date" type="date" value="${today.toISOString().slice(0,10)}" required>`) + field("種類", `<select name="type"><option value="expense">支出</option><option value="income">収入</option></select>`) + field("対象", `<select name="scope"><option value="personal">個人</option><option value="business">事業</option></select>`) + field("カテゴリ", `<input name="category" list="categories" placeholder="例: 食費、給与、売上" required><datalist id="categories"><option>食費</option><option>生活費</option><option>交通費</option><option>サブスク</option><option>給与</option><option>副業売上</option><option>事業経費</option><option>返済</option></datalist>`) + field("支払方法", `<select name="paymentMethod"><option value="cash">現金・口座</option>${cardOptions}</select>`) + field("金額", `<input name="amount" type="number" min="1" inputmode="numeric" required>`) + field("内容", `<input name="description" placeholder="例: スーパー">`); }
  if (kind === "debt") { title.textContent = "返済先を登録"; fields.innerHTML = field("返済先", `<input name="name" placeholder="例: クレジットカード名" required>`) + field("種類", `<select name="kind"><option>クレジットカード</option><option>カードローン</option><option>分割払い</option><option>その他</option></select>`) + field("現在残高", `<input name="balance" type="number" min="0" inputmode="numeric" required>`) + field("毎月の返済予定", `<input name="payment" type="number" min="0" inputmode="numeric">`) + field("支払日", `<input name="dueDay" type="number" min="1" max="31" inputmode="numeric"><small>不明なら空欄で構いません</small>`) + field("年利（%）", `<input name="apr" type="number" min="0" step="0.01" inputmode="decimal">`); }
  if (kind === "budget") { title.textContent = "予算を設定"; fields.innerHTML = field("カテゴリ", `<input name="category" placeholder="例: 食費" required>`) + field("月の予算", `<input name="amount" type="number" min="0" inputmode="numeric" required>`); }
  if (kind === "card") { title.textContent = "支払カードを登録"; fields.innerHTML = field("カード名", `<input name="name" placeholder="例: 日常用カード" required>`) + field("締日", `<input name="closingDay" type="number" min="1" max="31" inputmode="numeric">`) + field("支払日", `<input name="paymentDay" type="number" min="1" max="31" inputmode="numeric">`); }
  if (kind === "simulation") { title.textContent = "返済シミュレーションの条件"; fields.innerHTML = field("毎月の返済総額", `<input name="monthlyRepayment" type="number" min="0" inputmode="numeric" value="${state.settings.monthlyRepayment||""}" required>`) + field("想定年利（%）", `<input name="annualRate" type="number" min="0" step="0.01" inputmode="decimal" value="${state.settings.annualRate??""}" required><small>返済方式・日割りは反映しない概算です</small>`); }
  dialog.dataset.kind = kind; dialog.showModal();
}
document.querySelector("#entryForm").addEventListener("submit", e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const kind = document.querySelector("#entryDialog").dataset.kind; if (kind === "transaction") state.transactions.push({ id:id(), ...f, amount:Number(f.amount) }); if (kind === "debt") state.debts.push({ id:id(), ...f, balance:Number(f.balance), payment:Number(f.payment || 0), dueDay:Number(f.dueDay || 0), apr:f.apr === "" ? null : Number(f.apr) }); if (kind === "budget") state.budgets = [...state.budgets.filter(b => b.category !== f.category), { category:f.category, amount:Number(f.amount) }]; if(kind==="card") state.cards.push({id:id(),...f,closingDay:Number(f.closingDay||0),paymentDay:Number(f.paymentDay||0)}); if(kind==="simulation") state.settings={...state.settings,monthlyRepayment:Number(f.monthlyRepayment),annualRate:Number(f.annualRate)}; document.querySelector("#entryDialog").close(); save(); });
document.addEventListener("click", e => { const view = e.target.dataset.view; if (view) { document.querySelectorAll(".view").forEach(x => x.classList.toggle("active", x.id === view)); document.querySelectorAll("nav button").forEach(x => x.classList.toggle("selected", x.dataset.view === view)); } if (e.target.dataset.open) openForm(e.target.dataset.open); if (e.target.matches("[data-close]")) document.querySelector("#entryDialog").close(); const tid=e.target.dataset.deleteTransaction, did=e.target.dataset.deleteDebt, cid=e.target.dataset.deleteCard; if(tid){state.transactions=state.transactions.filter(t=>t.id!==tid);save()} if(did){state.debts=state.debts.filter(d=>d.id!==did);save()} if(cid){state.cards=state.cards.filter(c=>c.id!==cid);save()} });
document.querySelector("#previousMonth").onclick = () => { shownMonth.setMonth(shownMonth.getMonth()-1); render(); }; document.querySelector("#nextMonth").onclick = () => { shownMonth.setMonth(shownMonth.getMonth()+1); render(); };
document.querySelector("#exportData").onclick = () => { const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download=`kurashi-shushi-${today.toISOString().slice(0,10)}.backup.json`;a.click();URL.revokeObjectURL(a.href); };
document.querySelector("#importData").onchange = async e => { const file=e.target.files[0]; if(!file)return; try{const data=JSON.parse(await file.text());if(!Array.isArray(data.transactions)||!Array.isArray(data.debts))throw new Error();state={...defaultState(),...data};save();alert("データを読み込みました");}catch{alert("読み込めませんでした。くらし収支のバックアップJSONを選択してください。")} e.target.value=""; };
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall=e; document.querySelector("#install").hidden=false; }); document.querySelector("#install").onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;document.querySelector("#install").hidden=true};
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js"); render();
