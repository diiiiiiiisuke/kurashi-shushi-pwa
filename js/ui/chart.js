// canvas のグラフ（ライブラリなし）。高解像度画面でもにじまないよう devicePixelRatio に合わせる
const COLORS = { income: "#147c82", expense: "#c0504d", balance: "#123747", grid: "#dbe4e5", text: "#61727a", muted: "#9aa8ad" };

function setup(canvas, height) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  canvas.width = w * dpr; canvas.height = height * dpr; canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.font = "11px -apple-system, sans-serif";
  return { ctx, w, h: height };
}

const short = v => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000)}万` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}千` : "0");

// 12か月の収入・支出（棒）と収支（線）
export function drawTrend(canvas, rows, labels) {
  const { ctx, w, h } = setup(canvas, 220);
  const pad = { l: 36, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...rows.flatMap(r => [r.income, r.expense]));
  const min = Math.min(0, ...rows.map(r => r.balance));
  const y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min));
  const step = (w - pad.l - pad.r) / rows.length;
  const bw = Math.max(3, step / 2 - 3);

  ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.text; ctx.textAlign = "right";
  // 小さいマイナスは目盛りを省く（0 と重なるため）
  for (const v of [...(min < -max * 0.15 ? [min] : []), 0, max / 2, max]) {
    ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(w - pad.r, y(v)); ctx.stroke();
    ctx.fillText(short(v), pad.l - 4, y(v) + 4);
  }
  rows.forEach((r, i) => {
    const x = pad.l + i * step + step / 2;
    ctx.fillStyle = COLORS.income; ctx.fillRect(x - bw - 1, y(r.income), bw, y(0) - y(r.income));
    ctx.fillStyle = COLORS.expense; ctx.fillRect(x + 1, y(r.expense), bw, y(0) - y(r.expense));
    if ((rows.length - 1 - i) % 2 === 0 || rows.length <= 6) { ctx.fillStyle = COLORS.text; ctx.textAlign = "center"; ctx.fillText(labels[i], x, h - 8); }
  });
  ctx.strokeStyle = COLORS.balance; ctx.lineWidth = 2; ctx.beginPath();
  rows.forEach((r, i) => { const x = pad.l + i * step + step / 2; i ? ctx.lineTo(x, y(r.balance)) : ctx.moveTo(x, y(r.balance)); });
  ctx.stroke();
  rows.forEach((r, i) => { ctx.fillStyle = COLORS.balance; ctx.beginPath(); ctx.arc(pad.l + i * step + step / 2, y(r.balance), 2.5, 0, 7); ctx.fill(); });
}

// 残債の推移（複数の線）。series: [{ label, color, dashed, points: [{ month, balance }] }]
export function drawBalanceLines(canvas, series) {
  const { ctx, w, h } = setup(canvas, 200);
  const pad = { l: 40, r: 10, t: 10, b: 24 };
  const n = Math.max(2, ...series.map(s => s.points.length + 1));
  const max = Math.max(1, ...series.flatMap(s => s.points.map(p => p.balance)), ...series.map(s => s.start || 0));
  const x = i => pad.l + (w - pad.l - pad.r) * i / (n - 1);
  const y = v => pad.t + (h - pad.t - pad.b) * (1 - v / max);

  ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.text; ctx.textAlign = "right";
  for (const v of [0, max / 2, max]) { ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(w - pad.r, y(v)); ctx.stroke(); ctx.fillText(short(v), pad.l - 4, y(v) + 4); }
  ctx.textAlign = "center";
  const years = Math.ceil((n - 1) / 12);
  for (let yr = 0; yr <= years; yr++) { const i = yr * 12; if (i < n) ctx.fillText(yr ? `${yr}年後` : "今", x(i), h - 8); }

  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.setLineDash(s.dashed ? [5, 4] : []);
    ctx.beginPath(); ctx.moveTo(x(0), y(s.start));
    s.points.forEach((p, i) => ctx.lineTo(x(i + 1), y(p.balance)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export { COLORS };
