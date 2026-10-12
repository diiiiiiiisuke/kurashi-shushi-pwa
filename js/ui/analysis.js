// 分析: 12か月の推移、カテゴリ別、固定費と変動費、個人と事業
import { fmt, signed, addMonths, shortMonth, monthLabel, sumBy } from "../util.js";
import { trend, inMonth, byCategory, fixedVariable, scopeTotals } from "../calc/summary.js";
import { drawTrend } from "./chart.js";
import { h, panel, metric, emptyNote, categoryName } from "./common.js";
import { accountBreakdown } from "./breakdown.js";
import { renderOverview } from "./overview.js";

export function renderAnalysis(app) {
  const { state, ctx } = app;
  const ym = ctx.month, prev = addMonths(ym, -1);
  const rows = trend(state.transactions, ym, 12);
  const active = rows.filter(r => r.income || r.expense);
  const avg = k => (active.length ? sumBy(active, r => r[k]) / active.length : 0);
  const out = [renderOverview(app)];

  out.push(panel("12か月の推移", `<canvas id="trendChart" aria-label="12か月の収入・支出・収支のグラフ"></canvas>
    <div class="legend"><span class="key income">収入</span><span class="key expense">支出</span><span class="key balance">収支</span></div>
    <div class="metrics three">${metric("平均収入", fmt(avg("income")), "income")}${metric("平均支出", fmt(avg("expense")), "expense")}${metric("平均収支", signed(avg("balance")))}</div>
    <p class="muted small">記録のある月（${active.length}か月）の平均</p>`, { eyebrow: "TREND" }));

  out.push(panel(`${monthLabel(ym)}の支払方法別の支出`, accountBreakdown(state, inMonth(state.transactions, ym)) +
    `<button type="button" class="link" data-action="records-view" data-id="card">カード別の明細を見る ›</button>`, { eyebrow: "BY CARD" }));

  const now = byCategory(inMonth(state.transactions, ym), "expense");
  const before = new Map(byCategory(inMonth(state.transactions, prev), "expense").map(x => [x.categoryId, x.amount]));
  const max = Math.max(1, ...now.map(x => x.amount));
  out.push(panel(`${monthLabel(ym)}の支出`, now.length ? now.map(x => {
    const diff = x.amount - (before.get(x.categoryId) || 0);
    return `<div class="cat-row"><div class="row-between"><span>${h(categoryName(state, x.categoryId))}</span><span><strong>${fmt(x.amount)}</strong> <small class="${diff > 0 ? "expense" : "income"}">前月比 ${signed(diff)}</small></span></div>
      <div class="bar plain"><span style="width:${Math.round(x.amount / max * 100)}%"></span></div></div>`;
  }).join("") : emptyNote("この月の支出はまだありません"), { eyebrow: "CATEGORY" }));

  const fv = fixedVariable(state, ym);
  const fvTotal = fv.fixed + fv.variable;
  const pct = fvTotal ? Math.round(fv.fixed / fvTotal * 100) : 0;
  out.push(panel("固定費と変動費", fvTotal ? `<div class="split-bar" role="img" aria-label="固定費${pct}%、変動費${100 - pct}%"><span class="fixed" style="width:${pct}%"></span><span class="variable" style="width:${100 - pct}%"></span></div>
    <div class="row-between"><span><span class="key fixed">固定費</span> ${fmt(fv.fixed)}（${pct}%）</span><span><span class="key variable">変動費</span> ${fmt(fv.variable)}（${100 - pct}%）</span></div>
    <p class="muted small">固定費・変動費はカテゴリごとに「設定」で変えられます</p>` : emptyNote("この月の支出はまだありません"), { eyebrow: "FIXED / VARIABLE" }));

  const txs = inMonth(state.transactions, ym);
  const biz = scopeTotals(txs, "business"), per = scopeTotals(txs, "personal");
  const interest = sumBy(txs, t => t.interest || 0);
  out.push(panel("個人と事業", `<div class="metrics">
    ${metric("個人の収入", fmt(per.income), "income")}${metric("個人の支出", fmt(per.expense), "expense")}
    ${metric("事業の売上", fmt(biz.income), "income")}${metric("事業の経費", fmt(biz.expense), "expense")}
    ${metric("事業の利益（概算）", signed(biz.balance))}${metric("返済のうち利息", fmt(interest), "expense")}
  </div>`, { eyebrow: "SCOPE" }));

  return out.join("");
}

export function afterAnalysis(app) {
  const canvas = document.querySelector("#trendChart");
  if (!canvas) return;
  const rows = trend(app.state.transactions, app.ctx.month, 12);
  drawTrend(canvas, rows, rows.map(r => shortMonth(r.month)));
}
