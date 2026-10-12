// 返済: 返済先の管理とシミュレーション（docs/spec-v2.md 2.2）
import { fmt, localDate, monthLabel, sumBy } from "../util.js";
import { simulateAll, schedule } from "../calc/simulation.js";
import { toSimItem, firstPaymentMonth, debtPayments } from "../calc/debt.js";
import { drawBalanceLines, COLORS } from "./chart.js";
import { h, panel, metric, bar, emptyNote, METHOD_LABEL, KIND_LABEL, txRow } from "./common.js";

function model(state) {
  const today = localDate();
  const debts = state.debts.filter(d => !d.archived);
  const items = debts.map(d => toSimItem(d, state.transactions));
  const live = items.filter(x => x.balance > 0);
  const start = firstPaymentMonth(debts, today, state.transactions);
  const minOnly = simulateAll(live, null, state.settings.strategy, start);
  const minTotal = minOnly.timeline[0]?.paid ?? 0;
  const budget = state.settings.repaymentBudget || minTotal;
  const plan = simulateAll(live, budget, state.settings.strategy, start);
  return { debts, items, live, start, minOnly, plan, minTotal, budget };
}

const monthsText = n => (n >= 12 ? `${Math.floor(n / 12)}年${n % 12 ? `${n % 12}か月` : ""}` : `${n}か月`);

export function renderSimResult(app) {
  const m = model(app.state);
  if (!m.live.length) return emptyNote("返済中の返済先がありません");
  const { minOnly: a, plan: b } = m;
  const warn = [];
  if (b.shortfall) warn.push(`毎月の返済額の合計（${fmt(m.minTotal)}）より少ないため、最低返済額で計算しています`);
  for (const s of b.stuck) warn.push(`「${h(s.name)}」は今の返済額では利息（月 ${fmt(s.interest)}）以下で、残高が減りません。最低 ${fmt(s.minPayment)} 必要です`);
  const col = (title, r) => `<div class="compare-col"><h3>${title}</h3>
    <p><span>完済</span><strong>${r.payable ? monthLabel(r.payoffMonth) : "完済できません"}</strong></p>
    <p><span>期間</span><strong>${r.payable ? monthsText(r.months) : "—"}</strong></p>
    <p><span>利息の合計</span><strong>${r.payable ? fmt(r.totalInterest) : "—"}</strong></p></div>`;
  const saved = a.payable && b.payable && (a.months > b.months || a.totalInterest > b.totalInterest)
    ? `<p class="good">${a.months > b.months ? `<strong>${monthsText(a.months - b.months)}</strong>早く完済し、` : ""}利息が <strong>${fmt(a.totalInterest - b.totalInterest)}</strong> 減ります</p>` : "";
  return `${warn.map(w => `<p class="notice">${w}</p>`).join("")}
    <div class="compare">${col("最低返済額だけ", a)}${col(`毎月 ${fmt(m.budget)}`, b)}</div>${saved}
    <canvas id="debtChart" aria-label="残債の推移グラフ"></canvas>
    <div class="legend"><span class="key muted-line">最低返済額だけ</span><span class="key plan-line">この条件</span></div>
    <h3 class="sub">返済先ごとの完済月（この条件）</h3>
    <div class="list">${b.perDebt.map(d => `<div class="list-row"><span>${h(d.name)}</span><span>${d.payoffMonth ? monthLabel(d.payoffMonth) : "—"} <small class="muted">利息 ${fmt(d.totalInterest)}</small></span></div>`).join("")}</div>
    <p class="muted small">月割りの概算です（実際は日割り計算のため数百円程度ずれます）。</p>`;
}

export function afterSim(app) {
  const canvas = document.querySelector("#debtChart");
  if (!canvas) return;
  const m = model(app.state);
  const start = sumBy(m.live, x => x.balance);
  drawBalanceLines(canvas, [
    { color: COLORS.muted, dashed: true, start, points: m.minOnly.timeline },
    { color: COLORS.income, start, points: m.plan.timeline },
  ]);
}

function renderList(app) {
  const { state } = app;
  const m = model(state);
  const total = sumBy(m.live, x => x.balance);
  const out = [];
  out.push(`<div class="section-heading"><div><p class="eyebrow">REPAYMENT</p><h2>返済</h2></div><button type="button" class="primary" data-action="add-debt">＋ 返済先</button></div>`);
  if (!m.debts.length) {
    out.push(panel("返済先を登録しましょう", `<p class="muted">カード・ローンごとに、明細の残高・年利・毎月の返済額を登録すると、完済月と利息の見通しが出ます。返済したら ＋ で「返済」カテゴリを選んで記録すると、残高が減ります。</p>`));
  } else {
    out.push(`<div class="metrics">${metric("残債の合計", fmt(total), "expense")}${metric("毎月の返済（最低）", fmt(m.minTotal))}
      ${metric("完済予定", m.plan.payable ? monthLabel(m.plan.payoffMonth) : "—")}${metric("これからの利息", m.plan.payable ? fmt(m.plan.totalInterest) : "—", "expense")}</div>`);
    out.push(`<div class="debt-grid">${m.debts.map(d => {
      const it = m.items.find(x => x.id === d.id);
      const payoff = m.plan.perDebt.find(x => x.id === d.id)?.payoffMonth;
      const paidRatio = d.baseBalance ? 1 - it.balance / d.baseBalance : 1;
      return `<button type="button" class="debt-card" data-action="open-debt" data-id="${h(d.id)}">
        <span class="row-between"><strong>${h(d.name)}</strong><small>${KIND_LABEL[d.kind] || ""}</small></span>
        <span class="debt-balance">${fmt(it.balance)}</span>
        ${bar(paidRatio)}
        <small>年利 ${d.apr}% · ${d.method === "installment" ? `残り${it.installmentsLeft}回` : `毎月 ${fmt(d.monthlyPayment)}`}${d.dueDay ? ` · ${d.dueDay}日払い` : ""}</small>
        <small>${it.balance <= 0 ? "完済 🎉" : payoff ? `完済予定 ${monthLabel(payoff)}` : "この条件では完済できません"}</small></button>`;
    }).join("")}</div>`);
  }

  const s = state.settings;
  const max = Math.max(m.minTotal * 3, s.repaymentBudget || 0, 10000);
  if (m.live.length) out.push(panel("シミュレーション", `
    <label class="field"><span class="field-label">毎月返済に回せる総額</span>
      <span class="sim-input"><input type="range" data-sim="repaymentBudget" min="${m.minTotal}" max="${Math.ceil(max / 1000) * 1000}" step="1000" value="${m.budget}" aria-label="毎月の返済総額（スライダー）">
      <input type="text" inputmode="numeric" data-sim="repaymentBudget" value="${m.budget}" aria-label="毎月の返済総額"></span></label>
    <div class="segmented small" role="radiogroup" aria-label="返済の作戦">
      <label><input type="radio" name="strategy" data-sim="strategy" value="avalanche" ${s.strategy !== "snowball" ? "checked" : ""}><span>金利の高い順</span></label>
      <label><input type="radio" name="strategy" data-sim="strategy" value="snowball" ${s.strategy === "snowball" ? "checked" : ""}><span>残高の少ない順</span></label>
    </div>
    <p class="muted small">最低返済額を超える分を、選んだ順に上乗せして返す計算です。金利の高い順のほうが利息は少なくなります。</p>
    <div id="simResult">${renderSimResult(app)}</div>`, { eyebrow: "SIMULATION" }));

  const archived = state.debts.filter(d => d.archived);
  if (archived.length) out.push(`<details class="panel"><summary>完済済み（${archived.length}件）</summary><div class="list">${archived.map(d => `<button type="button" class="list-item" data-action="open-debt" data-id="${h(d.id)}"><span>${h(d.name)}</span><small>詳細</small></button>`).join("")}</div></details>`);
  return out.join("");
}

function renderDetail(app, d) {
  const { state } = app;
  const it = toSimItem(d, state.transactions);
  const rows = schedule(it, firstPaymentMonth([d], localDate(), state.transactions));
  const pays = debtPayments(d, state.transactions).sort((a, b) => b.date.localeCompare(a.date));
  const older = state.transactions.filter(t => t.debtId === d.id && t.date < d.baseDate).length;
  return `<button type="button" class="link back" data-action="close-debt">‹ 返済の一覧</button>
    <div class="section-heading"><div><p class="eyebrow">${KIND_LABEL[d.kind] || ""}</p><h2>${h(d.name)}</h2></div><button type="button" class="secondary" data-action="edit-debt" data-id="${h(d.id)}">編集</button></div>
    <section class="panel">
      <div class="row-between big"><span>現在の残高</span><strong class="expense">${fmt(it.balance)}</strong></div>
      ${bar(d.baseBalance ? 1 - it.balance / d.baseBalance : 1)}
      <dl class="facts">
        <dt>返済方式</dt><dd>${METHOD_LABEL[d.method]}</dd>
        <dt>年利</dt><dd>${d.apr}%</dd>
        <dt>${d.method === "installment" ? "残りの回数" : d.method === "principal" ? "毎月の元金" : "毎月の返済額"}</dt><dd>${d.method === "installment" ? `${it.installmentsLeft}回` : fmt(d.monthlyPayment)}</dd>
        <dt>支払日</dt><dd>${d.dueDay ? `毎月${d.dueDay}日` : "未設定"}</dd>
        <dt>基準の残高</dt><dd>${fmt(d.baseBalance)}（${d.baseDate}）</dd>
      </dl>
      <div class="button-row">
        <button type="button" class="primary" data-action="new-tx" data-debt-id="${h(d.id)}">返済を記録</button>
        <button type="button" class="secondary" data-action="rebase-debt" data-id="${h(d.id)}">明細の残高に合わせる</button>
        <button type="button" class="secondary" data-action="archive-debt" data-id="${h(d.id)}">${d.archived ? "返済中に戻す" : "完済済みにする"}</button>
      </div>
    </section>
    ${panel("返済予定表", rows.length ? `<div class="table-wrap"><table><thead><tr><th>月</th><th>返済額</th><th>利息</th><th>元金</th><th>残高</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${monthLabel(r.month).replace("年", "/").replace("月", "")}</td><td>${fmt(r.payment)}</td><td>${fmt(r.interest)}</td><td>${fmt(r.principal)}</td><td>${fmt(r.balance)}</td></tr>`).join("")}
      </tbody></table></div><p class="muted small">最低返済額だけ払った場合。利息の合計 ${fmt(sumBy(rows, r => r.interest))}</p>`
      : emptyNote(it.balance > 0 ? "今の返済額では残高が減りません。毎月の返済額を見直してください" : "完済しています"), { eyebrow: "SCHEDULE" })}
    ${panel("返済の記録", pays.length ? `<div class="list">${pays.map(t => txRow(state, t)).join("")}</div>` : emptyNote("まだ記録がありません"), { eyebrow: "HISTORY" })}
    ${older ? `<p class="muted small">基準日（${d.baseDate}）より前の返済記録 ${older} 件は残高計算に含めていません。</p>` : ""}`;
}

export function renderDebts(app) {
  const d = app.state.debts.find(x => x.id === app.ctx.debtId);
  return d ? renderDetail(app, d) : renderList(app);
}
