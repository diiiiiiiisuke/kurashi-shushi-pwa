// 入力シート（<dialog id="sheet">）。kind ごとに「HTML を作る」「入力中の連動」「保存」を定義する
import { id, nowIso, localDate, monthOf, addMonths, fmt } from "../util.js";
import { newCategory, CASH_ACCOUNT_ID } from "../store.js";
import { categoryRank } from "../calc/summary.js";
import { parseAccountNames, accountUsage } from "../calc/accounts.js";
import { createPinLock, verifyPin, isValidPin, encryptBackup, decryptBackup } from "../crypto.js";
import { status as backupState, ageText } from "./backup.js";
import { splitPayment, currentBalance } from "../calc/debt.js";
import { h, field, options, METHOD_LABEL, KIND_LABEL, ACCOUNT_KIND_LABEL } from "./common.js";

const dialog = () => document.querySelector("#sheet");
const form = () => document.querySelector("#sheetForm");
const num = v => Math.round(Number(String(v ?? "").replace(/[,，\s]/g, "")) || 0);
const optNum = v => (String(v ?? "").trim() === "" ? null : num(v));
const activeAccounts = (state, keep) => state.accounts.filter(a => !a.archived || a.id === keep);
const activeDebts = (state, keep) => state.debts.filter(d => !d.archived || d.id === keep);

const yesNo = (name, checked, label) => `<label class="check"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> ${label}</label>`;
const buttons = (extra = "") => `<div class="sheet-actions">${extra}<span class="spacer"></span><button type="button" class="secondary" data-close>キャンセル</button><button class="primary" value="save">保存</button></div>`;
const deleteButton = (label = "削除") => `<button type="button" class="danger-text" data-sheet-delete>${label}</button>`;

// ───────── 収支（クイック入力） ─────────

function categoryChips(app, type, selected) {
  const rank = categoryRank(app.state.transactions, localDate());
  const cats = app.state.categories
    .filter(c => c.type === type && (!c.archived || c.id === selected))
    .sort((a, b) => (rank.get(b.id) || 0) - (rank.get(a.id) || 0) || a.order - b.order);
  const chip = (c, i) => `<label class="chip"><input type="radio" name="categoryId" value="${h(c.id)}" ${c.id === selected ? "checked" : ""} ${i === 0 ? "required" : ""}><span>${h(c.name)}</span></label>`;
  const top = cats.slice(0, 12), rest = cats.slice(12);
  const restOpen = rest.some(c => c.id === selected) ? "open" : "";
  return top.map(chip).join("") + (rest.length ? `<details class="more-chips" ${restOpen}><summary>その他のカテゴリ</summary>${rest.map((c, i) => chip(c, i + 12)).join("")}</details>` : "");
}

const txKind = {
  title: (app, o) => (o.tx ? "記録を編集" : "記録する"),
  html(app, o) {
    const s = app.state, t = o.tx;
    const type = t?.type || o.type || "expense";
    const repayCat = s.categories.find(c => c.isRepayment && !c.archived);
    const categoryId = t?.categoryId || o.categoryId || (o.debtId ? repayCat?.id : "");
    const date = t?.date || app.ctx.lastDate || localDate();
    const accountId = t?.accountId || s.settings.lastAccountId || CASH_ACCOUNT_ID;
    const scope = t?.scope || s.categories.find(c => c.id === categoryId)?.scope || "personal";
    const lastDateHint = !t && app.ctx.lastDate && app.ctx.lastDate !== localDate()
      ? `<button type="button" class="link" data-set-date="${localDate()}">今日にする</button>` : "";
    return `
      <div class="segmented" role="radiogroup" aria-label="種類">
        <label><input type="radio" name="type" value="expense" ${type === "expense" ? "checked" : ""}><span>支出</span></label>
        <label><input type="radio" name="type" value="income" ${type === "income" ? "checked" : ""}><span>収入</span></label>
      </div>
      <label class="amount-input"><span aria-hidden="true">¥</span><input name="amount" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${t ? t.amount : ""}" aria-label="金額" required></label>
      <fieldset class="chips" data-chips><legend>カテゴリ</legend>${categoryChips(app, type, categoryId)}</fieldset>
      <div class="debt-fields" data-debt-fields hidden>
        ${field("返済先", `<select name="debtId"><option value="">（選択しない）</option>${options(activeDebts(s, t?.debtId), t?.debtId || o.debtId)}</select>`)}
        <div class="two-col">
          ${field("うち元金", `<input name="principal" type="text" inputmode="numeric" value="${t?.principal ?? ""}">`)}
          ${field("うち利息", `<input name="interest" type="text" inputmode="numeric" value="${t?.interest ?? ""}">`)}
        </div>
        <small class="hint" data-debt-hint>返済額から自動で計算します（明細と違えば直せます）</small>
      </div>
      <div class="two-col">
        ${field("日付", `<input name="date" type="date" value="${date}" required>`, lastDateHint)}
        ${field("支払方法", `<select name="accountId">${options(activeAccounts(s, accountId), accountId)}</select>`)}
      </div>
      <div class="two-col">
        ${field("区分", `<select name="scope"><option value="personal" ${scope === "personal" ? "selected" : ""}>個人</option><option value="business" ${scope === "business" ? "selected" : ""}>事業</option></select>`)}
        ${field("メモ", `<input name="memo" maxlength="60" value="${h(t?.memo || "")}" placeholder="任意">`)}
      </div>
      <div class="sheet-actions">${t ? deleteButton() : `<button class="secondary" value="continue">保存して続ける</button>`}<span class="spacer"></span><button type="button" class="secondary" data-close>閉じる</button><button class="primary" value="save">保存</button></div>`;
  },
  // 入力に合わせて、カテゴリの並び・区分・返済欄を連動させる
  onInput(app, o, e) {
    const f = form(), s = app.state, name = e?.target?.name;
    if (name === "type") f.querySelector("[data-chips]").innerHTML = `<legend>カテゴリ</legend>${categoryChips(app, f.elements.type.value, "")}`;
    const cat = s.categories.find(c => c.id === f.elements.categoryId?.value);
    if (name === "categoryId" && cat) f.elements.scope.value = cat.scope;
    const debtBox = f.querySelector("[data-debt-fields]");
    debtBox.hidden = !cat?.isRepayment;
    if (name === "principal" || name === "interest") f.dataset.manualSplit = "1";
    if (["amount", "debtId", "categoryId", undefined].includes(name) && !debtBox.hidden && !f.dataset.manualSplit) {
      const debt = s.debts.find(d => d.id === f.elements.debtId.value);
      if (debt && num(f.elements.amount.value) > 0) {
        const split = splitPayment(debt, s.transactions, num(f.elements.amount.value), o.tx?.id);
        f.elements.principal.value = split.principal;
        f.elements.interest.value = split.interest;
        f.querySelector("[data-debt-hint]").textContent = `返済前の残高 ${fmt(currentBalance(debt, s.transactions, o.tx?.id))}。明細と違えば直せます`;
      } else if (!debt) { f.elements.principal.value = ""; f.elements.interest.value = ""; }
    }
  },
  submit(app, o, data, action) {
    const s = app.state;
    const amount = num(data.amount);
    if (amount <= 0) return "金額を入力してください";
    const cat = s.categories.find(c => c.id === data.categoryId);
    if (!cat) return "カテゴリを選んでください";
    const debtId = cat.isRepayment && data.debtId ? data.debtId : null;
    const tx = {
      ...(o.tx || { id: id(), createdAt: nowIso(), recurringId: null }),
      date: data.date, type: cat.type, amount, categoryId: cat.id, accountId: data.accountId,
      scope: data.scope, memo: data.memo.trim(),
      debtId, principal: debtId ? num(data.principal) : null, interest: debtId ? num(data.interest) : null,
      updatedAt: nowIso(),
    };
    s.transactions = o.tx ? s.transactions.map(x => (x.id === tx.id ? tx : x)) : [...s.transactions, tx];
    s.settings.lastAccountId = tx.accountId;
    app.ctx.lastDate = tx.date;
    if (!o.tx && monthOf(tx.date) !== app.ctx.month) app.ctx.month = monthOf(tx.date);
    if (action === "continue") {
      const f = form();
      f.elements.amount.value = ""; f.elements.memo.value = "";
      if (f.elements.principal) { f.elements.principal.value = ""; f.elements.interest.value = ""; delete f.dataset.manualSplit; }
      f.elements.amount.focus();
      app.toast(`${cat.name} ${fmt(amount)} を保存しました`);
      return "keep-open";
    }
    app.toast(o.tx ? "更新しました" : "保存しました");
  },
  remove(app, o) {
    app.state.transactions = app.state.transactions.filter(t => t.id !== o.tx.id);
    app.toast("削除しました");
  },
};

// ───────── あとで買うもの ─────────
const reminderKind = {
  title: (app, o) => o.reminder ? "リマインドを編集" : "リマインドを追加",
  html(app, o) {
    const r = o.reminder;
    const categories = app.state.categories.filter(c => c.type === "expense" && (!c.archived || c.id === r?.categoryId));
    return `
      ${field("あとで買うもの", `<input name="name" maxlength="80" required value="${h(r?.name || "")}" placeholder="例: 洗剤の詰め替え">`)}
      ${field("カテゴリ（任意）", `<select name="categoryId"><option value="">指定しない</option>${options(categories, r?.categoryId)}</select>`)}
      ${field("メモ（任意）", `<textarea name="memo" maxlength="200" rows="3" placeholder="例: 帰りに買う">${h(r?.memo || "")}</textarea>`)}
      ${buttons(r ? deleteButton() : "")}`;
  },
  submit(app, o, d) {
    const name = d.name.trim();
    if (!name) return "あとで買うものを入力してください";
    const values = { name, memo: d.memo.trim(), categoryId: d.categoryId || null };
    if (o.reminder) Object.assign(o.reminder, values);
    else app.state.reminders.push({ id: id(), createdAt: nowIso(), ...values });
    app.toast(o.reminder ? "リマインドを更新しました" : "リマインドを追加しました");
  },
  remove(app, o) {
    app.state.reminders = app.state.reminders.filter(r => r.id !== o.reminder.id);
    app.toast("リマインドを削除しました");
  },
};

// ───────── カテゴリ ─────────

const categoryKind = {
  title: (app, o) => (o.category ? "カテゴリを編集" : "カテゴリを追加"),
  html(app, o) {
    const c = o.category || { type: o.type || "expense", group: "variable", scope: "personal" };
    return `
      ${field("名前", `<input name="name" required maxlength="20" value="${h(c.name || "")}">`)}
      ${field("種類", `<select name="type" ${o.category ? "disabled" : ""}><option value="expense" ${c.type === "expense" ? "selected" : ""}>支出</option><option value="income" ${c.type === "income" ? "selected" : ""}>収入</option></select>`, o.category ? "作成後は変更できません" : "")}
      ${field("費用の種類（支出のみ）", `<select name="group"><option value="variable" ${c.group === "variable" ? "selected" : ""}>変動費</option><option value="fixed" ${c.group === "fixed" ? "selected" : ""}>固定費</option></select>`)}
      ${field("入力時の区分", `<select name="scope"><option value="personal" ${c.scope === "personal" ? "selected" : ""}>個人</option><option value="business" ${c.scope === "business" ? "selected" : ""}>事業</option></select>`)}
      ${yesNo("isRepayment", c.isRepayment, "返済のカテゴリ（選ぶと返済先を指定できる）")}
      ${buttons(o.category ? deleteButton(o.category.archived ? "使用を再開" : "使わない（非表示）") : "")}`;
  },
  submit(app, o, d) {
    const s = app.state;
    const name = d.name.trim();
    const type = o.category ? o.category.type : d.type;
    if (s.categories.some(c => c.name === name && c.type === type && c.id !== o.category?.id)) return "同じ名前のカテゴリがあります";
    const values = { name, group: type === "income" ? "variable" : d.group, scope: d.scope, isRepayment: type === "expense" && d.isRepayment === "on" };
    if (o.category) Object.assign(o.category, values);
    else s.categories.push(newCategory(name, type, values.group, values, s.categories.length));
  },
  remove(app, o) { o.category.archived = !o.category.archived; },
};

// ───────── 支払方法 ─────────

const accountKind = {
  title: (app, o) => (o.account ? "支払方法を編集" : "支払方法を追加"),
  html(app, o) {
    const a = o.account || { kind: "card" };
    const kinds = Object.entries(ACCOUNT_KIND_LABEL).map(([value, name]) => ({ value, name }));
    return `
      ${field("名前", `<input name="name" required maxlength="20" value="${h(a.name || "")}" placeholder="例: 日常用カード">`)}
      ${field("種類", `<select name="kind">${options(kinds, a.kind, "value")}</select>`)}
      <div class="two-col">
        ${field("締日（カード）", `<input name="closingDay" type="number" min="1" max="31" inputmode="numeric" value="${a.closingDay ?? ""}">`)}
        ${field("支払日（カード）", `<input name="paymentDay" type="number" min="1" max="31" inputmode="numeric" value="${a.paymentDay ?? ""}">`)}
      </div>
      <p class="hint">カードの引き落とし予定は締日の翌月払いとして計算します。締日・支払日を登録すると「返済」タブで合計を確認できます。</p>
      ${o.account && o.account.id !== CASH_ACCOUNT_ID && accountUsage(app.state, o.account.id).used ? `<p class="hint">この支払方法は記録で使われているため削除できません。「使わない」にすると、過去の記録は残したまま入力の選択肢から消えます。</p>` : ""}
      ${buttons(o.account && o.account.id !== CASH_ACCOUNT_ID ? deleteButton(accountUsage(app.state, o.account.id).used ? (o.account.archived ? "使用を再開" : "使わない（非表示）") : "削除") : "")}`;
  },
  submit(app, o, d) {
    const values = { name: d.name.trim(), kind: d.kind, closingDay: optNum(d.closingDay), paymentDay: optNum(d.paymentDay) };
    if (o.account) Object.assign(o.account, values);
    else app.state.accounts.push({ id: id(), archived: false, ...values });
  },
  // 使われていなければ削除、使われていれば非表示（記録を壊さない）
  remove(app, o) {
    const s = app.state, a = o.account;
    if (accountUsage(s, a.id).used) { a.archived = !a.archived; app.toast(a.archived ? `「${a.name}」を非表示にしました` : `「${a.name}」の使用を再開しました`); return; }
    if (!confirm(`「${a.name}」を削除しますか？`)) return "cancel";
    s.accounts = s.accounts.filter(x => x !== a);
    if (s.settings.lastAccountId === a.id) s.settings.lastAccountId = CASH_ACCOUNT_ID;
    app.toast(`「${a.name}」を削除しました`);
  },
};

// ───────── 支払方法をまとめて追加（Notion の「名前」列を貼り付け） ─────────

const bulkAccountKind = {
  title: () => "支払方法をまとめて追加",
  html() {
    const kinds = Object.entries(ACCOUNT_KIND_LABEL).map(([value, name]) => ({ value, name }));
    return `
      <p class="hint">Notion の「名前」列を選んでコピーし、下に貼り付けてください。1行に1件。表ごとコピーした場合は、各行の最初の列を名前として使います。見出しの「名前」や重複・登録済みのものは追加しません。</p>
      ${field("名前（1行に1件）", `<textarea name="names" rows="7" placeholder="例:\nAカード\nBカード\nCカード" autocomplete="off"></textarea>`)}
      ${field("種類", `<select name="kind">${options(kinds, "card", "value")}</select>`)}
      <div class="bulk-preview" data-bulk-preview aria-live="polite"></div>
      ${buttons()}`;
  },
  onInput(app) {
    const f = form();
    const r = parseAccountNames(f.elements.names.value, app.state.accounts.map(a => a.name));
    f.querySelector("[data-bulk-preview]").innerHTML = !r.add.length && !r.existing.length ? "" :
      `<p><strong>追加する ${r.add.length}件</strong>${r.existing.length ? `（登録済みのため追加しない: ${r.existing.map(h).join("、")}）` : ""}</p>
       <div class="bulk-tags">${r.add.map(n => `<span class="tag tag-gray">💳 ${h(n)}</span>`).join("")}</div>`;
  },
  submit(app, o, d) {
    const r = parseAccountNames(d.names, app.state.accounts.map(a => a.name));
    if (!r.add.length) return r.existing.length ? "すべて登録済みです" : "名前を貼り付けてください";
    for (const name of r.add) app.state.accounts.push({ id: id(), name, kind: d.kind, closingDay: null, paymentDay: null, archived: false });
    app.toast(`${r.add.length}件を追加しました`);
  },
};

// ───────── 予算 ─────────

const budgetKind = {
  title: (app, o) => (o.budget ? "予算を編集" : "予算を追加"),
  html(app, o) {
    const s = app.state, b = o.budget;
    const used = new Set(s.budgets.map(x => x.categoryId));
    const cats = s.categories.filter(c => c.type === "expense" && !c.archived && (!used.has(c.id) || c.id === b?.categoryId));
    if (!cats.length) return `<p>予算を設定できるカテゴリがありません。</p>${buttons()}`;
    return `
      ${field("カテゴリ", `<select name="categoryId" ${b ? "disabled" : ""}>${options(cats, b?.categoryId)}</select>`)}
      ${field("毎月の予算", `<input name="amount" type="text" inputmode="numeric" required value="${b?.amount ?? ""}">`)}
      ${buttons(b ? deleteButton() : "")}`;
  },
  submit(app, o, d) {
    const amount = num(d.amount);
    if (o.budget) o.budget.amount = amount;
    else app.state.budgets.push({ categoryId: d.categoryId, amount });
  },
  remove(app, o) { app.state.budgets = app.state.budgets.filter(b => b !== o.budget); },
};

// ───────── 定期取引 ─────────

const recurringKind = {
  title: (app, o) => (o.recurring ? "定期取引を編集" : "定期取引を追加"),
  html(app, o) {
    const s = app.state, r = o.recurring || { day: 25, active: true, scope: "personal", accountId: s.settings.lastAccountId };
    const group = type => s.categories.filter(c => c.type === type && (!c.archived || c.id === r.categoryId));
    return `
      ${field("名前", `<input name="name" required maxlength="30" value="${h(r.name || "")}" placeholder="例: 家賃、給与、動画サブスク">`)}
      ${field("カテゴリ", `<select name="categoryId" required><optgroup label="支出">${options(group("expense"), r.categoryId)}</optgroup><optgroup label="収入">${options(group("income"), r.categoryId)}</optgroup></select>`)}
      <div class="two-col">
        ${field("金額", `<input name="amount" type="text" inputmode="numeric" required value="${r.amount ?? ""}">`)}
        ${field("毎月の日付", `<input name="day" type="number" min="1" max="31" inputmode="numeric" required value="${r.day}">`, "31なら月末")}
      </div>
      <div class="two-col">
        ${field("支払方法", `<select name="accountId">${options(activeAccounts(s, r.accountId), r.accountId)}</select>`)}
        ${field("区分", `<select name="scope"><option value="personal" ${r.scope === "personal" ? "selected" : ""}>個人</option><option value="business" ${r.scope === "business" ? "selected" : ""}>事業</option></select>`)}
      </div>
      ${yesNo("active", r.active, "毎月自動で記録する")}
      ${o.recurring ? "" : yesNo("thisMonth", true, "今月分も記録する（日付が過ぎていれば）")}
      ${buttons(o.recurring ? deleteButton() : "")}`;
  },
  submit(app, o, d) {
    const cat = app.state.categories.find(c => c.id === d.categoryId);
    const amount = num(d.amount);
    if (amount <= 0) return "金額を入力してください";
    const values = { name: d.name.trim(), type: cat.type, categoryId: cat.id, amount, day: Math.min(31, Math.max(1, num(d.day))), accountId: d.accountId, scope: d.scope, memo: d.name.trim(), active: d.active === "on" };
    const thisMonth = monthOf(localDate());
    if (o.recurring) Object.assign(o.recurring, values);
    else app.state.recurring.push({ id: id(), ...values, lastGeneratedMonth: d.thisMonth === "on" ? addMonths(thisMonth, -1) : thisMonth });
  },
  remove(app, o) { app.state.recurring = app.state.recurring.filter(r => r !== o.recurring); app.toast("定期取引を削除しました（記録済みの分は残ります）"); },
};

// ───────── 返済先 ─────────

const debtKind = {
  title: (app, o) => (o.debt ? "返済先を編集" : "返済先を追加"),
  html(app, o) {
    const d = o.debt || { kind: "card", method: "fixed", baseDate: localDate() };
    const kinds = Object.entries(KIND_LABEL).map(([value, name]) => ({ value, name }));
    const methods = Object.entries(METHOD_LABEL).map(([value, name]) => ({ value, name }));
    return `
      ${field("返済先の名前", `<input name="name" required maxlength="30" value="${h(d.name || "")}" placeholder="例: Aカード リボ">`)}
      <div class="two-col">
        ${field("種類", `<select name="kind">${options(kinds, d.kind, "value")}</select>`)}
        ${field("返済方式", `<select name="method">${options(methods, d.method, "value")}</select>`)}
      </div>
      <div class="two-col">
        ${field("年利（%）", `<input name="apr" type="number" min="0" max="30" step="0.01" inputmode="decimal" value="${d.apr ?? ""}">`, "無利息・分割は0でOK")}
        ${field("支払日", `<input name="dueDay" type="number" min="1" max="31" inputmode="numeric" value="${d.dueDay ?? ""}">`)}
      </div>
      <div data-method-fields>
        ${field("毎月の返済額", `<input name="monthlyPayment" type="text" inputmode="numeric" value="${d.monthlyPayment ?? ""}">`)}
        ${field("残りの支払回数", `<input name="installmentsLeft" type="number" min="1" inputmode="numeric" value="${d.installmentsLeft ?? ""}">`)}
      </div>
      ${o.debt ? `<p class="hint">残高を変えるときは、詳細画面の「明細の残高に合わせる」を使ってください。</p>` : `
      <div class="two-col">
        ${field("現在の残高", `<input name="baseBalance" type="text" inputmode="numeric" required>`)}
        ${field("残高の日付", `<input name="baseDate" type="date" value="${d.baseDate}" required>`, "明細で確認した日")}
      </div>`}
      ${buttons(o.debt ? deleteButton("削除") : "")}`;
  },
  onInput() {
    const f = form(), m = f.elements.method.value;
    const pay = f.elements.monthlyPayment.closest(".field"), left = f.elements.installmentsLeft.closest(".field");
    left.hidden = m !== "installment";
    pay.hidden = m === "installment";
    pay.querySelector(".field-label").textContent = m === "principal" ? "毎月の元金（利息は別に加算）" : "毎月の返済額（利息込み）";
  },
  submit(app, o, d) {
    const values = {
      name: d.name.trim(), kind: d.kind, method: d.method, apr: Number(d.apr) || 0, dueDay: optNum(d.dueDay),
      monthlyPayment: num(d.monthlyPayment), installmentsLeft: d.method === "installment" ? optNum(d.installmentsLeft) : null,
    };
    if (d.method === "installment" && !values.installmentsLeft) return "残りの支払回数を入力してください";
    if (d.method !== "installment" && values.monthlyPayment <= 0) return "毎月の返済額を入力してください";
    if (o.debt) Object.assign(o.debt, values);
    else app.state.debts.push({ id: id(), ...values, baseBalance: num(d.baseBalance), baseDate: d.baseDate, archived: false });
  },
  remove(app, o) {
    const linked = app.state.transactions.filter(t => t.debtId === o.debt.id).length;
    if (!confirm(`「${o.debt.name}」を削除しますか？${linked ? `\n返済の記録 ${linked} 件は支出として残ります。` : ""}\n完済しただけなら「完済済みにする」を使うと履歴を残せます。`)) return "cancel";
    app.state.transactions.forEach(t => { if (t.debtId === o.debt.id) Object.assign(t, { debtId: null, principal: null, interest: null }); });
    app.state.debts = app.state.debts.filter(x => x !== o.debt);
    app.ctx.debtId = null;
  },
};

// ───────── 明細の残高に合わせる ─────────

const rebaseKind = {
  title: () => "明細の残高に合わせる",
  html(app, o) {
    const bal = currentBalance(o.debt, app.state.transactions);
    return `
      <p class="hint">カード会社の明細やアプリで確認した残高を入れてください。アプリの残高計算（利息の概算）をここでリセットします。今のアプリ上の残高: <strong>${fmt(bal)}</strong></p>
      <div class="two-col">
        ${field("明細の残高", `<input name="baseBalance" type="text" inputmode="numeric" required value="${bal}">`)}
        ${field("確認した日", `<input name="baseDate" type="date" required value="${localDate()}">`)}
      </div>
      <p class="hint">この日付より前の返済記録は残高計算に使わなくなります（記録自体は残ります）。</p>
      ${buttons()}`;
  },
  submit(app, o, d) { o.debt.baseBalance = num(d.baseBalance); o.debt.baseDate = d.baseDate; },
};

// ───────── PINロック ─────────

const pinInput = (name, label) => field(label, `<input name="${name}" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="8" required>`);

const pinSetKind = {
  title: app => (app.state.settings.lock ? "PINを変更" : "PINロックを設定"),
  html(app) {
    return `<p class="hint">アプリを開くときに、数字4〜8桁のPINを求めます。PINはそのまま保存せず、元に戻せない形（ハッシュ）で保存します。<strong>PINを忘れると、この端末のデータは開けなくなります</strong>（バックアップから戻すことはできます）。</p>
      ${app.state.settings.lock ? pinInput("current", "今のPIN") : ""}
      ${pinInput("pin", "新しいPIN（数字4〜8桁）")}
      ${pinInput("confirm", "新しいPIN（もう一度）")}
      ${buttons()}`;
  },
  async submit(app, o, d) {
    if (app.state.settings.lock && !(await verifyPin(d.current, app.state.settings.lock))) return "今のPINが違います";
    if (!isValidPin(d.pin)) return "PINは数字4〜8桁にしてください";
    if (/^(\d)\1+$/.test(d.pin) || "0123456789".includes(d.pin) || "9876543210".includes(d.pin)) return "同じ数字の繰り返しや連番は避けてください";
    if (d.pin !== d.confirm) return "確認用のPINが一致しません";
    app.state.settings.lock = await createPinLock(d.pin);
    app.toast("PINロックを設定しました");
  },
};

const pinOffKind = {
  title: () => "PINロックを解除",
  html: () => `<p class="hint">解除すると、PINなしでアプリが開くようになります。</p>${pinInput("current", "今のPIN")}${buttons()}`,
  async submit(app, o, d) {
    if (!(await verifyPin(d.current, app.state.settings.lock))) return "PINが違います";
    app.state.settings.lock = null;
    app.toast("PINロックを解除しました");
  },
};

// ───────── バックアップ（暗号化） ─────────

const passInput = (name, label) => field(label, `<input name="${name}" type="password" autocomplete="new-password" minlength="8">`);

// 1タップバックアップ（週1回の催促でも開く）。ボタンは main.js の data-action で処理する
const quickBackupKind = {
  title: () => "☁️ バックアップ",
  html(app) {
    const st = backupState(app);
    return `
      <p>最後のバックアップ: <strong>${ageText(st)}</strong></p>
      <p class="hint">下のボタンを押すと保存先を選ぶ画面が出ます。<strong>「"ファイル"に保存」→「iCloud Drive」</strong>を選んで「保存」を押せば完了です。iPhoneが壊れても、このファイルから元に戻せます。</p>
      <button type="button" class="primary wide" data-action="backup-quick">☁️ iCloudに保存</button>
      <p class="center"><button type="button" class="link" data-action="export">🔒 パスワードを付けて保存したい場合</button></p>
      <div class="sheet-actions"><button type="button" class="link" data-action="backup-snooze">あとで（明日また確認）</button><span class="spacer"></span><button type="button" class="secondary" data-close>閉じる</button></div>`;
  },
  submit() { return "keep-open"; },
};


// パスワード付き: 暗号化に時間がかかるため、①暗号化 → ②「保存する」ボタンで共有シート、の2段階
const exportBackupKind = {
  title: () => "🔒 パスワードを付けて保存",
  html: () => `
    <p class="hint">パスワードを付けると、ファイルを見られても中身は読めません。<strong>パスワードを忘れると元に戻せなくなる</strong>ので、iPhoneの「パスワード」アプリなどに保存してください。</p>
    ${passInput("password", "パスワード（8文字以上）")}
    ${passInput("confirm", "パスワード（もう一度）")}
    ${buttons()}`,
  async submit(app, o, d) {
    if ((d.password || "").length < 8) return "パスワードは8文字以上にしてください";
    if (d.password !== d.confirm) return "確認用のパスワードが一致しません";
    const text = JSON.stringify(await encryptBackup(app.exportable(), d.password), null, 2);
    openSheet(app, "encryptedReady", { text });
    return "keep-open";
  },
};

const encryptedReadyKind = {
  title: () => "🔒 保存の準備ができました",
  html: () => `<p class="hint">ボタンを押して、<strong>「"ファイル"に保存」→「iCloud Drive」</strong>を選んでください。</p>
    <button type="button" class="primary wide" data-action="backup-encrypted">☁️ iCloudに保存</button>
    <div class="sheet-actions"><span class="spacer"></span><button type="button" class="secondary" data-close>閉じる</button></div>`,
  submit() { return "keep-open"; },
};

export const pendingEncrypted = () => (current?.k === encryptedReadyKind ? current.opts.text : null);

const decryptBackupKind = {
  title: () => "暗号化されたバックアップを読み込む",
  html: () => `<p class="hint">書き出したときのパスワードを入力してください。</p>${field("パスワード", `<input name="password" type="password" autocomplete="current-password" required>`)}${buttons()}`,
  async submit(app, o, d) {
    let data;
    try { data = await decryptBackup(o.payload, d.password); } catch { return "パスワードが違うか、ファイルが壊れています"; }
    try { if (!app.importData(data)) return; } catch { return "くらし収支のバックアップではありません"; }
  },
};

const KINDS = { reminder: reminderKind, pinSet: pinSetKind, pinOff: pinOffKind, quickBackup: quickBackupKind, exportBackup: exportBackupKind, encryptedReady: encryptedReadyKind, decryptBackup: decryptBackupKind, tx: txKind, category: categoryKind, account: accountKind, bulkAccount: bulkAccountKind, budget: budgetKind, recurring: recurringKind, debt: debtKind, rebase: rebaseKind };

let current = null;

export function openSheet(app, kind, opts = {}) {
  const k = KINDS[kind];
  current = { app, k, opts };
  const f = form();
  delete f.dataset.manualSplit;
  f.innerHTML = `<div class="sheet-heading"><h2>${k.title(app, opts)}</h2><button type="button" class="icon-button" data-close aria-label="閉じる">×</button></div><p class="form-error" role="alert" hidden></p>${k.html(app, opts)}`;
  dialog().showModal();
  k.onInput?.(app, opts);
  const first = opts.tx ? null : f.querySelector("[name=amount], [name=name]");
  first?.focus();
}

export function initSheet() {
  const f = form();
  f.addEventListener("input", e => current?.k.onInput?.(current.app, current.opts, e));
  f.addEventListener("change", e => { if (e.target.type === "radio") current?.k.onInput?.(current.app, current.opts, e); });
  f.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) dialog().close();
    const setDate = e.target.closest("[data-set-date]");
    if (setDate) { f.elements.date.value = setDate.dataset.setDate; setDate.remove(); }
    if (e.target.closest("[data-sheet-delete]") && current) {
      const { app, k, opts } = current;
      if (k === txKind && !confirm("この記録を削除しますか？")) return;
      if (k.remove(app, opts) === "cancel") return;
      dialog().close(); app.commit();
    }
  });
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (!current) return;
    const { app, k, opts } = current;
    const data = Object.fromEntries(new FormData(f));
    for (const el of f.querySelectorAll("select:disabled")) data[el.name] = el.value;
    const btns = f.querySelectorAll("button");
    btns.forEach(b => (b.disabled = true));   // 暗号化などの処理中に二度押ししない
    let result;
    try { result = await k.submit(app, opts, data, e.submitter?.value); } finally { btns.forEach(b => (b.disabled = false)); }
    const err = f.querySelector(".form-error");
    if (typeof result === "string" && result !== "keep-open") { err.textContent = result; err.hidden = false; return; }
    err.hidden = true;
    if (result !== "keep-open") dialog().close();
    app.commit();
  });
}
