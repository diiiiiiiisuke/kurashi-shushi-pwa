// 収支と返済を1つのグラフで（棒＝収支、折れ線＝残りの残債）。仕様: docs/spec-v4.md 3章
import { fmt, signed, localDate, monthOf, monthLabel, shortMonth } from "../util.js";
import { buildOverview } from "../calc/projection.js";
import { monthTotals } from "../calc/summary.js";
import { drawOverview } from "./chart.js";
import { options, panel, metric } from "./common.js";

const BARS = [{ value: "both", name: "📊 収入と支出" }, { value: "net", name: "📊 収支（黒字・赤字）" }];
const RANGES = [{ value: "1y", name: "📅 前後6か月" }, { value: "2y", name: "📅 前後12か月" }, { value: "payoff", name: "📅 完済まで" }];

export function renderOverview(app) {
  const s = app.state;
  const today = localDate();
  const o = buildOverview(s, today, s.settings.overviewRange);
  const t = monthTotals(s.transactions, monthOf(today));
  const hasDebt = s.debts.some(d => !d.archived);
  return panel("収支と返済", `
    <div class="overview-controls">
      <select data-overview="overviewBars" aria-label="棒グラフの表示">${options(BARS, s.settings.overviewBars, "value")}</select>
      <select data-overview="overviewRange" aria-label="期間">${options(RANGES, s.settings.overviewRange, "value")}</select>
    </div>
    <canvas id="overviewChart" aria-label="毎月の収支（棒）と残りの残債（折れ線）のグラフ。今月より後の残債は予測で点線"></canvas>
    <div class="legend">
      ${s.settings.overviewBars === "net" ? `<span class="key income">黒字</span><span class="key expense">赤字</span>` : `<span class="key income">収入</span><span class="key expense">支出</span>`}
      ${hasDebt ? `<span class="key solid-line">残債（実績）</span><span class="key dash-line">残債（予測）</span>` : ""}
    </div>
    <div class="metrics overview-metrics">
      ${metric("今月の収支", signed(t.balance), t.balance >= 0 ? "income" : "expense")}
      ${metric("残りの残債", hasDebt ? fmt(o.nowBalance) : "—", "expense")}
      ${metric("完済予定", hasDebt ? (o.payoff ? monthLabel(o.payoff) : "完済できません") : "—")}
      ${metric("毎月の返済", hasDebt ? fmt(o.monthlyPayment) : "—")}
    </div>`, { eyebrow: "CASHFLOW × DEBT" });
}

export function afterOverview(app) {
  const canvas = document.querySelector("#overviewChart");
  if (!canvas) return;
  const s = app.state;
  const o = buildOverview(s, localDate(), s.settings.overviewRange);
  drawOverview(canvas, o, o.rows.map(r => shortMonth(r.month)), s.settings.overviewBars);
}
