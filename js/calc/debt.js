// 返済先の現在残高と、返済額の利息・元金への分割（純粋関数）
// 現在残高は保存せず、基準残高から返済記録の元金を引いて毎回計算する（docs/spec-v2.md 4章）

export function debtPayments(debt, transactions, excludeTxId = null) {
  return transactions.filter(t => t.debtId === debt.id && t.id !== excludeTxId && t.date >= debt.baseDate);
}

export function currentBalance(debt, transactions, excludeTxId = null) {
  const paid = debtPayments(debt, transactions, excludeTxId).reduce((n, t) => n + (Number(t.principal) || 0), 0);
  return Math.max(0, debt.baseBalance - paid);
}

export function installmentsLeft(debt, transactions) {
  if (debt.method !== "installment") return null;
  return Math.max(0, (debt.installmentsLeft || 0) - debtPayments(debt, transactions).length);
}

export function monthlyInterest(balance, debt) {
  if (debt.method === "none" || debt.method === "installment") return 0;
  return Math.floor(balance * (Number(debt.apr) || 0) / 100 / 12);
}

// 返済額 amount を利息と元金に分ける。excludeTxId は編集中の記録（自分自身を残高計算から外す）
export function splitPayment(debt, transactions, amount, excludeTxId = null) {
  const balance = currentBalance(debt, transactions, excludeTxId);
  const interest = Math.min(monthlyInterest(balance, debt), amount);
  const principal = Math.min(amount - interest, balance);
  return { interest, principal };
}

// シミュレーション用の入力に変換する（現在残高・残り回数を計算済みにする）
export function toSimItem(debt, transactions) {
  return {
    id: debt.id, name: debt.name, method: debt.method, apr: Number(debt.apr) || 0,
    monthlyPayment: debt.monthlyPayment, balance: currentBalance(debt, transactions),
    installmentsLeft: installmentsLeft(debt, transactions),
  };
}

// 1回目の返済月: 今月まだ返済を記録しておらず、支払日が今日以降の返済先があれば今月、なければ来月
export function firstPaymentMonth(debts, today, transactions = []) {
  const ym = today.slice(0, 7), day = Number(today.slice(8, 10));
  const paidThisMonth = id => transactions.some(t => t.debtId === id && t.date.slice(0, 7) === ym);
  const dueThisMonth = debts.some(d => !paidThisMonth(d.id) && (d.dueDay || 31) >= day);
  if (dueThisMonth) return ym;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
