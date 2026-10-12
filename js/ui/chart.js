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

const man = v => (Math.abs(v) >= 10000 ? `${+(v / 10000).toFixed(v % 10000 && Math.abs(v) < 100000 ? 1 : 0)}万` : short(v));

function line(ctx, pts, color, width, dashed) {
  if (pts.length < 2) return;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dashed ? [6, 4] : []);
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * 残債の推移（実績＝実線、予測＝点線）と毎月の返済額（棒）。docs/spec-v3.md 4.1
 * p: buildProjection() の戻り値。scenarios[].color を付けて渡す
 */
export function drawProjection(canvas, p, labels) {
  const { ctx, w, h } = setup(canvas, 260);
  const pad = { l: 40, r: 38, t: 16, b: 26 };
  const n = p.months.length;
  // 実績（過去）が短くても見えるよう、過去側に最低でも幅の約1/4を割り当てる
  const W = w - pad.l - pad.r, pastN = p.anchorIndex + 1, futN = n - pastN;
  const pastW = futN ? Math.max(W * pastN / n, p.anchorIndex ? W * 0.24 : 0) : W;
  const pastStep = pastW / pastN, futStep = futN ? (W - pastW) / futN : 0;
  const x = i => (i <= p.anchorIndex ? pad.l + pastStep * (i + 0.5) : pad.l + pastW - pastStep / 2 + futStep * (i - p.anchorIndex));
  const step = Math.min(pastStep, futStep || pastStep);
  const maxBal = Math.max(1, p.nowBalance, ...p.past.map(q => q.balance));
  const maxPay = Math.max(1, ...p.paid.map(b => b.amount)) * 1.15;
  const yB = v => pad.t + (h - pad.t - pad.b) * (1 - v / maxBal);
  const yP = v => pad.t + (h - pad.t - pad.b) * (1 - v / maxPay);
  const nowX = x(p.anchorIndex);

  // 未来側の背景
  ctx.fillStyle = "#eef5f5"; ctx.fillRect(nowX, pad.t, w - pad.r - nowX, h - pad.t - pad.b);
  ctx.fillStyle = COLORS.text; ctx.textAlign = "left"; ctx.fillText("予測 →", nowX + 6, h - pad.b - 6); ctx.textAlign = "right"; if (p.anchorIndex) ctx.fillText("← 実績", nowX - 6, h - pad.b - 6);
  // 目盛り（左＝残債、右＝返済額）
  ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.text; ctx.lineWidth = 1;
  for (const f of [0, 0.5, 1]) {
    const yy = pad.t + (h - pad.t - pad.b) * (1 - f);
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(man(maxBal * f), pad.l - 4, yy + 4);
    ctx.textAlign = "left"; ctx.fillText(man(maxPay * f), w - pad.r + 4, yy + 4);
  }
  // 棒（返済額）: 実績は濃く、予測は薄く＋点線の枠
  for (const b of p.paid) {
    const bw = Math.max(2, Math.min(16, (b.future ? futStep : pastStep) * 0.6));
    if (!b.amount) continue;
    const bx = x(b.index) - bw / 2, by = yP(b.amount), bh = yP(0) - by;
    if (b.future) {
      ctx.fillStyle = "#d9e9ea"; ctx.fillRect(bx, by, bw, bh);
      if (bw >= 8) { ctx.strokeStyle = "#7fa8b5"; ctx.setLineDash([3, 2]); ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1); ctx.setLineDash([]); }
    } else { ctx.fillStyle = "#5f8f9c"; ctx.fillRect(bx, by, bw, bh); }
  }
  // 予測の線（点線）。設定額のものを太く・最後に描く
  const sorted = [...p.scenarios].sort((a, b) => a.isSelected - b.isSelected);
  for (const s of sorted) {
    line(ctx, s.points.map(q => [x(q.index), yB(q.balance)]), s.color, s.isSelected ? 3 : 1.6, true);
    const end = s.points.at(-1);
    if (end && end.balance === 0) { ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x(end.index), yB(0), s.isSelected ? 4 : 3, 0, 7); ctx.fill(); }
  }
  // 実績の線（実線）
  line(ctx, p.past.map(q => [x(q.index), yB(q.balance)]), COLORS.balance, 3, false);
  ctx.fillStyle = COLORS.balance; ctx.beginPath(); ctx.arc(nowX, yB(p.nowBalance), 4.5, 0, 7); ctx.fill();
  // 「今」の縦線
  ctx.strokeStyle = COLORS.balance; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(nowX, pad.t - 6); ctx.lineTo(nowX, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = COLORS.balance; ctx.textAlign = "center"; ctx.font = "bold 11px -apple-system, sans-serif"; ctx.fillText("今", nowX, pad.t - 7 < 9 ? 10 : pad.t - 7);
  ctx.font = "11px -apple-system, sans-serif";
  // 月のラベル（6つ程度）
  ctx.fillStyle = COLORS.text;
  let lastX = -99;
  for (let i = 0; i < n; i++) if (i === p.anchorIndex || (x(i) - lastX > 46 && Math.abs(x(i) - nowX) > 40) || i === 0) { if (x(i) - lastX > 30) { ctx.fillText(labels[i], x(i), h - 8); lastX = x(i); } }
}

// 返済スピードの比較: 棒＝完済までの月数、点線＝利息の合計。docs/spec-v3.md 4.2
export function drawSpeed(canvas, rows) {
  const { ctx, w, h } = setup(canvas, 230);
  const pad = { l: 46, r: 40, t: 20, b: 26 };
  const ok = rows.filter(r => r.payable);
  const maxM = Math.max(1, ...ok.map(r => r.months)) * 1.12;
  const maxI = Math.max(1, ...ok.map(r => r.totalInterest)) * 1.12;
  const step = (w - pad.l - pad.r) / rows.length;
  const x = i => pad.l + step * (i + 0.5);
  const yM = v => pad.t + (h - pad.t - pad.b) * (1 - v / maxM);
  const yI = v => pad.t + (h - pad.t - pad.b) * (1 - v / maxI);
  ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.text; ctx.lineWidth = 1;
  for (const f of [0, 0.5, 1]) {
    const yy = pad.t + (h - pad.t - pad.b) * (1 - f);
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(`${Math.round(maxM * f)}か月`.replace(/^0か月$/, "0"), pad.l - 3, yy + 4);
    ctx.textAlign = "left"; ctx.fillText(man(maxI * f), w - pad.r + 4, yy + 4);
  }
  const bw = Math.min(34, step * 0.6);
  rows.forEach((r, i) => {
    ctx.textAlign = "center";
    if (r.payable) {
      ctx.fillStyle = r.isSelected ? COLORS.income : r.isMin ? COLORS.muted : "#a9cdd0";
      ctx.fillRect(x(i) - bw / 2, yM(r.months), bw, yM(0) - yM(r.months));
      ctx.fillStyle = r.isSelected ? COLORS.income : COLORS.text; ctx.font = `${r.isSelected ? "bold " : ""}11px -apple-system, sans-serif`;
      ctx.fillText(`${r.months}`, x(i), yM(r.months) - 4);
    } else { ctx.fillStyle = COLORS.expense; ctx.fillText("×", x(i), yM(0) - 6); }
    ctx.font = `${r.isSelected ? "bold " : ""}11px -apple-system, sans-serif`;
    ctx.fillStyle = r.isSelected ? COLORS.income : COLORS.text; ctx.fillText(man(r.amount), x(i), h - 8);
  });
  ctx.font = "11px -apple-system, sans-serif";
  const pts = rows.map((r, i) => (r.payable ? [x(i), yI(r.totalInterest)] : null)).filter(Boolean);
  line(ctx, pts, "#d9730d", 2, true);
  ctx.fillStyle = "#d9730d"; pts.forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 7); ctx.fill(); });
}

/**
 * 収支（棒）と残りの残債（折れ線）。左＝収支、右＝残債。今月より後は背景を塗り、残債は点線（docs/spec-v4.md 3章）
 * o: buildOverview() の戻り値、mode: "both"（収入と支出）| "net"（収支）
 */
export function drawOverview(canvas, o, labels, mode = "both") {
  const { ctx, w, h } = setup(canvas, 250);
  const pad = { l: 40, r: 40, t: 16, b: 26 };
  const rows = o.rows, n = rows.length;
  const step = (w - pad.l - pad.r) / n;
  const x = i => pad.l + step * (i + 0.5);
  const vals = mode === "net" ? rows.map(r => r.balance) : rows.flatMap(r => [r.income, r.expense]);
  const maxV = Math.max(1, ...vals) * 1.1, minV = Math.min(0, ...vals) * 1.1;
  const yV = v => pad.t + (h - pad.t - pad.b) * (maxV - v) / (maxV - minV);
  const debts = rows.map(r => r.debt).filter(v => v != null);
  const maxD = Math.max(1, ...debts) * 1.08;
  const yD = v => pad.t + (h - pad.t - pad.b) * (1 - v / maxD);
  const nowX = x(o.nowIndex) + step / 2;

  ctx.fillStyle = "#eef5f5"; ctx.fillRect(nowX, pad.t, w - pad.r - nowX, h - pad.t - pad.b);
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
  for (const f of [0, 0.5, 1]) {
    const yy = pad.t + (h - pad.t - pad.b) * (1 - f);
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
    ctx.fillStyle = COLORS.text; ctx.textAlign = "right"; ctx.fillText(man(minV + (maxV - minV) * f), pad.l - 4, yy + 4);
    if (debts.length) { ctx.textAlign = "left"; ctx.fillText(man(maxD * f), w - pad.r + 4, yy + 4); }
  }
  if (minV < 0) { ctx.strokeStyle = "#9aa8ad"; ctx.beginPath(); ctx.moveTo(pad.l, yV(0)); ctx.lineTo(w - pad.r, yV(0)); ctx.stroke(); }

  // 棒（収支）。未来の月は記録がないので空
  const bw = Math.max(2, Math.min(14, step * (mode === "net" ? 0.55 : 0.32)));
  rows.forEach((r, i) => {
    if (mode === "net") {
      if (!r.balance) return;
      ctx.fillStyle = r.balance >= 0 ? COLORS.income : COLORS.expense;
      const top = yV(Math.max(0, r.balance)), bot = yV(Math.min(0, r.balance));
      ctx.fillRect(x(i) - bw / 2, top, bw, Math.max(1, bot - top));
    } else {
      if (r.income) { ctx.fillStyle = COLORS.income; ctx.fillRect(x(i) - bw - 1, yV(r.income), bw, yV(0) - yV(r.income)); }
      if (r.expense) { ctx.fillStyle = COLORS.expense; ctx.fillRect(x(i) + 1, yV(r.expense), bw, yV(0) - yV(r.expense)); }
    }
  });

  // 折れ線（残債）: 今月までは実線、今月から先は点線
  const pts = rows.map((r, i) => (r.debt == null ? null : [x(i), yD(r.debt), r.future, i]));
  const pastPts = pts.filter(p => p && p[3] <= o.nowIndex);
  const futPts = pts.filter(p => p && p[3] >= o.nowIndex);
  line(ctx, pastPts, COLORS.balance, 3, false);
  line(ctx, futPts, COLORS.balance, 2.5, true);
  for (const p of pts) if (p) { ctx.fillStyle = p[2] ? "#fff" : COLORS.balance; ctx.strokeStyle = COLORS.balance; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill(); ctx.stroke(); }

  // 「今月」の区切りとラベル
  ctx.strokeStyle = COLORS.balance; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(nowX, pad.t); ctx.lineTo(nowX, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = COLORS.text; ctx.textAlign = "left"; ctx.fillText("予測 →", nowX + 5, pad.t + 12);
  // 月のラベル: 今月は必ず太字で出し、ほかは今月・隣のラベルと重ならないものだけ
  ctx.textAlign = "center";
  const nowLX = x(o.nowIndex);
  ctx.fillStyle = COLORS.balance; ctx.font = "bold 11px -apple-system, sans-serif"; ctx.fillText(labels[o.nowIndex], nowLX, h - 8);
  ctx.fillStyle = COLORS.text; ctx.font = "11px -apple-system, sans-serif";
  let lastX = -99;
  rows.forEach((r, i) => { if (i !== o.nowIndex && Math.abs(x(i) - nowLX) >= 42 && x(i) - lastX >= 42) { ctx.fillText(labels[i], x(i), h - 8); lastX = x(i); } });
  ctx.font = "11px -apple-system, sans-serif";
}

export { COLORS };
