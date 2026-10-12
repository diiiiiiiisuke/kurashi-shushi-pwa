// 返済: 返済先の管理とシミュレーション（docs/spec-v2.md 2.2）
import { fmt, localDate, monthOf, dateInMonth, addMonths, dayLabel, monthLabel, shortMonth, sumBy } from "../util.js";
import { simulateAll, schedule, regularPayment } from "../calc/simulation.js";
import { toSimItem, firstPaymentMonth, debtPayments, monthlyInterest } from "../calc/debt.js";
import { buildProjection, speedTable } from "../calc/projection.js";
import { drawProjection, drawSpeed, COLORS } from "./chart.js";
import { h, panel, metric, bar, emptyNote, METHOD_LABEL, KIND_LABEL, txRow } from "./common.js";

import { nextCardPayments } from "../calc/accounts.js";
import { renderOverview } from "./overview.js";

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

// 予測の線の色: 最低返済額だけ＝グレー、それ以外は順に
const SCENARIO_COLORS = ["#147c82", "#337ea9", "#9065b0", "#d9730d"];
// budget: 全体のグラフは設定額、返済先の詳細は 0（最低返済額を基準に +1万・+3万 を比べる）
function projection(state, debts, budget) {
  const p = buildProjection(debts, state.transactions, localDate(), budget, state.settings.strategy);
  let k = 0;
  for (const sc of p.scenarios) sc.color = sc.isMin ? COLORS.muted : SCENARIO_COLORS[k++ % SCENARIO_COLORS.length];
  return p;
}

// 残債の推移グラフ（実績＋予測）の枠と凡例・表
function projectionBlock(p, canvasId, title) {
  const rows = p.scenarios.map(sc => `<tr class="${sc.isSelected ? "selected" : ""}">
    <td><span class="swatch" style="background:${sc.color}"></span>${sc.isMin ? "最低返済額だけ" : `毎月 ${fmt(sc.budget)}`}${sc.isSelected && !sc.isMin ? " <small>（設定）</small>" : ""}</td>
    <td>${sc.result.payable ? monthLabel(sc.result.payoffMonth) : "完済できません"}</td>
    <td>${sc.result.payable ? monthsText(sc.result.months) : "—"}</td>
    <td>${sc.result.payable ? fmt(sc.result.totalInterest) : "—"}</td></tr>`).join("");
  return `<h3 class="sub">${title}</h3>
    <canvas id="${canvasId}" aria-label="残債の推移グラフ。実線が実績、点線が予測"></canvas>
    <div class="legend"><span class="key solid-line">実績の残債</span><span class="key dash-line">予測の残債（点線）</span><span class="key bar-past">返済額（実績）</span><span class="key bar-future">返済額（予測）</span></div>
    <div class="table-wrap plain"><table><thead><tr><th>返済スピード</th><th>完済</th><th>期間</th><th>利息の合計</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
    ${projectionBlock(projection(app.state, m.debts, app.state.settings.repaymentBudget), "debtChart", "残債の推移（実績と予測）")}
    ${speedBlock(app, m)}
    <h3 class="sub">返済先ごとの完済月（この条件）</h3>
    <div class="list">${b.perDebt.map(d => `<div class="list-row"><span>${h(d.name)}</span><span>${d.payoffMonth ? monthLabel(d.payoffMonth) : "—"} <small class="muted">利息 ${fmt(d.totalInterest)}</small></span></div>`).join("")}</div>
    <p class="muted small">月割りの概算です（実際は日割り計算のため数百円程度ずれます）。</p>`;
}

function speedBlock(app, m) {
  const { rows } = speedTable(m.live, m.start, app.state.settings.repaymentBudget, app.state.settings.strategy);
  if (rows.length < 2) return "";
  return `<h3 class="sub">返済スピードの比較 — 毎月いくら返すと、いつ完済できるか</h3>
    <canvas id="speedChart" aria-label="毎月の返済額ごとの完済までの月数と利息のグラフ"></canvas>
    <div class="legend"><span class="key bar-speed">完済までの月数（棒）</span><span class="key interest-line">利息の合計（点線）</span><span class="key bar-selected">今の設定</span></div>
    <div class="table-wrap plain"><table><thead><tr><th>毎月</th><th>完済</th><th>期間</th><th>利息</th><th>最低だけと比べて</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${r.isSelected ? "selected" : ""}"><td>${fmt(r.amount)}${r.isMin ? " <small>最低</small>" : ""}</td>
      <td>${r.payable ? monthLabel(r.payoffMonth) : "完済できません"}</td><td>${r.payable ? monthsText(r.months) : "—"}</td><td>${r.payable ? fmt(r.totalInterest) : "—"}</td>
      <td>${r.savedMonths ? `${monthsText(r.savedMonths)}早い・利息 −${fmt(r.savedInterest)}` : "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function drawProjectionFor(app, debts, canvasId, budget) {
  const canvas = document.querySelector(`#${canvasId}`);
  if (!canvas) return;
  const p = projection(app.state, debts, budget);
  drawProjection(canvas, p, p.months.map(shortMonth));
}

export function afterSim(app) {
  const state = app.state;
  const detail = state.debts.find(x => x.id === app.ctx.debtId);
  if (detail) return drawProjectionFor(app, [detail], "debtDetailChart", 0);
  drawProjectionFor(app, state.debts.filter(d => !d.archived), "debtChart", state.settings.repaymentBudget);
  const speed = document.querySelector("#speedChart");
  if (speed) {
    const m = model(state);
    drawSpeed(speed, speedTable(m.live, m.start, state.settings.repaymentBudget, state.settings.strategy).rows);
  }
}

function cardPaymentsPanel(state) {
  const result = nextCardPayments(state, localDate());
  const max = Math.max(1, ...result.rows.map(r => r.amount));
  const rows = result.rows.map(r => `<div class="card-payment-row">
    <div class="row-between"><strong>${h(r.name)}</strong><strong class="expense">${fmt(r.amount)}</strong></div>
    <small class="muted">${dayLabel(r.date)} 引き落とし${r.estimated ? ` · 定期支出の見込み ${fmt(r.estimated)} を含む` : ""}</small>
    <div class="bar plain" role="img" aria-label="${h(r.name)}の引き落とし予定 ${fmt(r.amount)}"><span style="width:${r.amount / max * 100}%"></span></div>
  </div>`).join("");
  const missing = result.unconfigured.length ? `<p class="notice">締日・支払日が未設定のカードは合計に含めていません。</p><div class="button-row">${result.unconfigured.map(a => `<button type="button" class="link" data-action="edit-account" data-id="${h(a.id)}">${h(a.name)}を設定</button>`).join("")}</div>` : "";
  return panel("次の支払い予定（カード別）", `
    <div class="row-between big"><span>合計引き落とし額</span><strong class="expense">${fmt(result.total)}</strong></div>
    <p class="muted small">各カードの次回1回分の合計です。締日の翌月払いで計算した概算です。未入力の利用額や休日の振替は含みません。</p>
    ${rows || emptyNote("カードの締日・支払日を設定すると表示されます")}${missing}`, { eyebrow: "NEXT PAYMENT" });
}

function loanPaymentsPanel(state, m) {
  const today = localDate(), ym = monthOf(today);
  const rows = m.debts.filter(d => d.dueDay).map(d => {
    const it = m.items.find(i => i.id === d.id);
    const paid = state.transactions.some(t => t.debtId === d.id && monthOf(t.date) === ym);
    let date = dateInMonth(ym, d.dueDay);
    if (paid || date < today) date = dateInMonth(addMonths(ym, 1), d.dueDay);
    return { name: d.name, date, amount: regularPayment(it, it.balance, monthlyInterest(it.balance, d), it.installmentsLeft), balance: it.balance };
  }).filter(r => r.balance > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return "";
  return panel("ローン・分割・リボの次回返済", `<div class="list">${rows.map(r => `<div class="list-row"><span class="item-main"><strong>${h(r.name)}</strong><small>${dayLabel(r.date)}</small></span><strong class="amount expense">${fmt(r.amount)}</strong></div>`).join("")}</div><p class="muted small">カード一括払いの合計には含めていません。</p>`, { eyebrow: "REPAYMENT SCHEDULE" });
}

function renderList(app) {
  const { state } = app;
  const m = model(state);
  const total = sumBy(m.live, x => x.balance);
  const out = [];
  out.push(`<div class="section-heading"><div><p class="eyebrow">REPAYMENT</p><h2>返済</h2></div><button type="button" class="primary" data-action="add-debt">＋ 返済先</button></div>`);
  out.push(cardPaymentsPanel(state));
  out.push(renderOverview(app));
  out.push(loanPaymentsPanel(state, m));
  if (!m.debts.length) {
    out.push(panel("返済先を登録しましょう", `<p class="muted">カード・ローンごとに、明細の残高・年利・毎月の返済額を登録すると、完済月と利息の見通しが出ます。返済したら ＋ で「返済」カテゴリを選んで記録すると、残高が減ります。</p>`));
  } else {
    out.push(`<div class="metrics">${metric("残債の合計", fmt(total), "expense")}${metric("毎月の返済（最低）", fmt(m.minTotal))}
      ${metric("完済予定", m.plan.payable ? monthLabel(m.plan.payoffMonth) : "—")}${metric("これからの利息", m.plan.payable ? fmt(m.plan.totalInterest) : "—", "expense")}
      ${metric("今月の返済利息", fmt(sumBy(state.transactions.filter(t => monthOf(t.date) === monthOf(localDate())), t => t.interest || 0)), "expense")}</div>`);
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
      <input type="text" inputmode="numeric" data-sim="repaymentBudget" value="${m.budget.toLocaleString("ja-JP")}" aria-label="毎月の返済総額"></span></label>
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
    ${it.balance > 0 ? panel("残債の推移", `${projectionBlock(projection(state, [d], 0), "debtDetailChart", "この返済先だけを、毎月いくら返すと")}<p class="muted small">「毎月 ◯円」は、この返済先に毎月まとめて返した場合です。</p>`, { eyebrow: "CHART" }) : ""}
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
