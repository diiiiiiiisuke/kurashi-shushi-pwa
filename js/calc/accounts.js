// 支払方法（カード等）の計算（純粋関数）。仕様: docs/spec-v4.md 2章
import { monthOf, addMonths, dateInMonth } from "../util.js";

// カードごとの次回引き落とし。締日の翌月払い・一括払いの見積もり。
// 定期取引の予測は保存せず、作成済みの記録と二重に数えない。
export function nextCardPayments(state, today) {
  const repaymentIds = new Set(state.categories.filter(c => c.isRepayment).map(c => c.id));
  const isPurchase = t => t.type === "expense" && !t.debtId && !repaymentIds.has(t.categoryId);
  const validDay = d => Number.isInteger(d) && d >= 1 && d <= 31;
  const rows = [], unconfigured = [];
  for (const a of state.accounts.filter(a => a.kind === "card")) {
    if (!validDay(a.closingDay) || !validDay(a.paymentDay)) {
      if (!a.archived) unconfigured.push(a);
      continue;
    }
    let paymentMonth = monthOf(today);
    if (dateInMonth(paymentMonth, a.paymentDay) < today) paymentMonth = addMonths(paymentMonth, 1);
    const closingMonth = addMonths(paymentMonth, -1);
    const from = dateInMonth(addMonths(closingMonth, -1), a.closingDay);
    const through = dateInMonth(closingMonth, a.closingDay);
    const recorded = state.transactions.filter(t => t.accountId === a.id && isPurchase(t) && t.date > from && t.date <= through);
    let amount = recorded.reduce((n, t) => n + t.amount, 0), estimated = 0;
    for (const r of state.recurring.filter(r => r.active && r.accountId === a.id && isPurchase(r))) {
      for (const m of [addMonths(closingMonth, -1), closingMonth]) {
        const date = dateInMonth(m, r.day);
        if (date <= from || date > through || date <= today || (r.lastGeneratedMonth && m <= r.lastGeneratedMonth)) continue;
        if (state.transactions.some(t => t.recurringId === r.id && monthOf(t.date) === m)) continue;
        amount += r.amount;
        estimated += r.amount;
      }
    }
    // 非表示のカードも、次回請求に含まれる記録があれば残す。
    if (!a.archived || amount > 0) rows.push({ accountId: a.id, name: a.name, date: dateInMonth(paymentMonth, a.paymentDay), amount, estimated, from, through });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  return { rows, total: rows.reduce((n, r) => n + r.amount, 0), unconfigured };
}

const HEADER_WORDS = new Set(["名前", "name", "カード名", "カード", "クレジットカード"]);

/**
 * 貼り付けたテキストから名前の一覧を作る（Notion の列・表のコピーに対応）
 * 戻り値: { add: [新しく追加する名前], existing: [登録済みの名前], }
 */
export function parseAccountNames(text, existingNames = []) {
  const existing = new Set(existingNames.map(n => n.trim().toLowerCase()));
  const seen = new Set();
  const add = [], already = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const first = raw.split(/\t|,|，/)[0] || "";
    const name = first.replace(/^\s*(?:[・\-*•●◯○□■▪︎]|\d+[.)．、])\s*/u, "").trim().slice(0, 30);
    if (!name || HEADER_WORDS.has(name.toLowerCase())) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    (existing.has(key) ? already : add).push(name);
  }
  return { add, existing: already };
}

// その支払方法が記録・定期取引で使われているか（使われていなければ削除してよい）
export function accountUsage(state, accountId, month = null) {
  const txs = state.transactions.filter(t => t.accountId === accountId);
  const inMonth = month ? txs.filter(t => t.date.startsWith(month) && t.type === "expense") : [];
  return {
    used: txs.length > 0 || state.recurring.some(r => r.accountId === accountId),
    count: txs.length,
    monthCount: inMonth.length,
    monthTotal: inMonth.reduce((n, t) => n + t.amount, 0),
  };
}

// 並べ替え: id を dir（-1 上へ / +1 下へ）に1つ動かす。非表示のものは飛ばす。現金・口座は先頭に固定
export function moveAccount(accounts, id, dir) {
  const list = [...accounts];
  const i = list.findIndex(a => a.id === id);
  if (i < 1) return list;
  let j = i + dir;
  while (j >= 1 && j < list.length && list[j].archived) j += dir;
  if (j < 1 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}
