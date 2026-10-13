// 保存・読み込み・v1/v2 からの移行・定期取引の自動作成
// migrate() と generateRecurring() は localStorage に触らない純粋関数（テスト対象）
import { id, nowIso, localDate, addMonths, monthOf, dateInMonth } from "./util.js";

export const KEY = "kurashi-shushi-data-v1";          // キー名は変えない（docs/decisions.md）
export const V1_BACKUP_KEY = "kurashi-shushi-data-v1-backup";
export const SCHEMA_VERSION = 3;
export const CASH_ACCOUNT_ID = "cash";

const DEFAULT_CATEGORIES = [
  ["食費", "expense", "variable"], ["カフェ", "expense", "variable"], ["コンビニ", "expense", "variable"], ["日用品", "expense", "variable"], ["交通費", "expense", "variable"],
  ["交際費", "expense", "variable"], ["趣味・娯楽", "expense", "variable"], ["衣服・美容", "expense", "variable"],
  ["医療", "expense", "variable"], ["その他", "expense", "variable"],
  ["家賃", "expense", "fixed"], ["水道光熱費", "expense", "fixed"], ["通信費", "expense", "fixed"],
  ["サブスク", "expense", "fixed"], ["保険", "expense", "fixed"],
  ["返済", "expense", "fixed", { isRepayment: true }],
  ["事業経費", "expense", "variable", { scope: "business" }],
  ["給与", "income", "variable"], ["副業売上", "income", "variable", { scope: "business" }], ["その他収入", "income", "variable"],
];
const DEFAULT_BUDGETS = [["食費", 30000], ["日用品", 10000], ["交通費", 10000], ["サブスク", 5000]];

export function newCategory(name, type, group = "variable", extra = {}, order = 0) {
  return { id: id(), name, type, group: type === "income" ? "variable" : group, scope: "personal", isRepayment: false, order, archived: false, ...extra };
}

export function defaultState() {
  const categories = DEFAULT_CATEGORIES.map(([n, t, g, x], i) => newCategory(n, t, g, x, i));
  const byName = name => categories.find(c => c.name === name && c.type === "expense");
  return {
    schemaVersion: SCHEMA_VERSION,
    transactions: [],
    categories,
    accounts: [{ id: CASH_ACCOUNT_ID, name: "現金・口座", kind: "cash", closingDay: null, paymentDay: null, archived: false }],
    budgets: DEFAULT_BUDGETS.map(([n, amount]) => ({ categoryId: byName(n).id, amount })),
    recurring: [],
    debts: [],
    reminders: [],
    settings: { repaymentBudget: 0, strategy: "avalanche", lastBackupAt: null, lastAccountId: CASH_ACCOUNT_ID, recordsView: "daily", overviewBars: "both", overviewRange: "1y", lock: null, lockAfter: 1, backupSnoozeUntil: null },
  };
}

// v1 → 最新形式。v2以降は既存データを保持して、不足項目を補う。
export function migrate(data, today = localDate()) {
  if (!data || typeof data !== "object") return defaultState();
  if (data.schemaVersion >= 2) return normalize(data);

  const s = defaultState();
  const v1Settings = data.settings || {};
  const findOrCreate = (name, type, scope = "personal") => {
    name = String(name || "").trim() || (type === "income" ? "その他収入" : "その他");
    let c = s.categories.find(x => x.name === name && x.type === type);
    if (!c) {
      c = newCategory(name, type, "variable", { scope, isRepayment: type === "expense" && name === "返済" }, s.categories.length);
      s.categories.push(c);
    }
    return c;
  };

  s.accounts.push(...(data.cards || []).map(c => ({
    id: String(c.id), name: String(c.name || "カード"), kind: "card",
    closingDay: Number(c.closingDay) || null, paymentDay: Number(c.paymentDay) || null, archived: false,
  })));
  const accountIds = new Set(s.accounts.map(a => a.id));

  s.transactions = (data.transactions || []).map(t => {
    const type = t.type === "income" ? "income" : "expense";
    const scope = t.scope === "business" ? "business" : "personal";
    return {
      id: String(t.id || id()), date: String(t.date), type, amount: Math.round(Number(t.amount) || 0),
      categoryId: findOrCreate(t.category, type, scope).id,
      accountId: accountIds.has(String(t.paymentMethod)) ? String(t.paymentMethod) : CASH_ACCOUNT_ID,
      scope, memo: String(t.description || ""),
      debtId: null, principal: null, interest: null, recurringId: null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
  });

  if (Array.isArray(data.budgets)) {
    s.budgets = data.budgets.map(b => ({ categoryId: findOrCreate(b.category, "expense").id, amount: Math.round(Number(b.amount) || 0) }));
  }

  s.debts = (data.debts || []).map(d => ({
    id: String(d.id || id()), name: String(d.name || "返済先"),
    kind: { "クレジットカード": "card", "カードローン": "loan", "分割払い": "installment" }[d.kind] || "other",
    method: "fixed",
    apr: d.apr == null || d.apr === "" ? Number(v1Settings.annualRate) || 0 : Number(d.apr),
    monthlyPayment: Math.round(Number(d.payment) || 0), installmentsLeft: null,
    dueDay: Number(d.dueDay) || null,
    baseBalance: Math.round(Number(d.balance) || 0), baseDate: today, archived: false,
  }));

  s.settings.repaymentBudget = Math.round(Number(v1Settings.monthlyRepayment) || 0);
  return s;
}

// 欠けたキーを既定値で補う（バックアップの読み込み時にも使う）
export function normalize(data) {
  const d = defaultState();
  const s = { ...d, ...data, settings: { ...d.settings, ...(data.settings || {}) } };
  for (const k of ["transactions", "categories", "accounts", "budgets", "recurring", "debts", "reminders"]) if (!Array.isArray(s[k])) s[k] = d[k];
  if (!s.accounts.some(a => a.id === CASH_ACCOUNT_ID)) s.accounts.unshift(d.accounts[0]);
  // 既存の端末にも新しい標準カテゴリを追加する。既存の同名カテゴリはそのまま使う。
  if (!s.categories.some(c => c.type === "expense" && c.name === "カフェ")) {
    const foodOrder = s.categories.find(c => c.type === "expense" && c.name === "食費")?.order;
    s.categories = [...s.categories, newCategory("カフェ", "expense", "variable", {}, (Number.isFinite(foodOrder) ? foodOrder : 0) + 0.5)];
  }
  if (!s.categories.some(c => c.type === "expense" && c.name === "コンビニ")) {
    const cafeOrder = s.categories.find(c => c.type === "expense" && c.name === "カフェ")?.order;
    s.categories = [...s.categories, newCategory("コンビニ", "expense", "variable", {}, (Number.isFinite(cafeOrder) ? cafeOrder : 0) + 0.25)];
  }
  s.schemaVersion = SCHEMA_VERSION;
  sanitize(s);
  return s;
}

// 画面にそのまま出す数値・日付を型どおりにそろえる（細工したバックアップ対策。文字列は表示時に escapeHtml する）
const int = v => Math.round(Number(v) || 0);
const intOrNull = v => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const ymd = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : localDate());
const ym = v => (/^\d{4}-\d{2}$/.test(String(v)) ? String(v) : null);
function sanitize(s) {
  const reminderIds = new Set();
  s.reminders = s.reminders.filter(r => r && typeof r === "object" && !Array.isArray(r))
    .map(r => {
      const reminderId = typeof r.id === "string" && r.id && !reminderIds.has(r.id) ? r.id : id();
      reminderIds.add(reminderId);
      return {
        id: reminderId,
        name: String(r.name ?? "").trim().slice(0, 80),
        memo: String(r.memo ?? "").trim().slice(0, 200),
        categoryId: s.categories.some(c => c.id === r.categoryId) ? r.categoryId : null,
        createdAt: typeof r.createdAt === "string" && !Number.isNaN(Date.parse(r.createdAt)) ? r.createdAt : nowIso(),
      };
    }).filter(r => r.name);

  for (const t of s.transactions) {
    t.date = ymd(t.date); t.amount = int(t.amount);
    if (t.debtId != null) { t.principal = int(t.principal); t.interest = int(t.interest); }
  }
  for (const a of s.accounts) { a.closingDay = intOrNull(a.closingDay); a.paymentDay = intOrNull(a.paymentDay); }
  for (const b of s.budgets) b.amount = int(b.amount);
  for (const r of s.recurring) { r.amount = int(r.amount); r.day = Math.min(31, Math.max(1, int(r.day))); r.lastGeneratedMonth = ym(r.lastGeneratedMonth); }
  for (const d of s.debts) {
    d.apr = Number(d.apr) || 0; d.monthlyPayment = int(d.monthlyPayment); d.baseBalance = int(d.baseBalance);
    d.dueDay = intOrNull(d.dueDay); d.installmentsLeft = intOrNull(d.installmentsLeft); d.baseDate = ymd(d.baseDate);
    if (!["fixed", "principal", "installment", "none"].includes(d.method)) d.method = "fixed";
  }
  s.settings.repaymentBudget = int(s.settings.repaymentBudget);
  if (s.settings.strategy !== "snowball") s.settings.strategy = "avalanche";
  if (!["daily", "monthly", "card", "category", "table"].includes(s.settings.recordsView)) s.settings.recordsView = "daily";
  if (!["both", "net"].includes(s.settings.overviewBars)) s.settings.overviewBars = "both";
  if (!["1y", "2y", "payoff"].includes(s.settings.overviewRange)) s.settings.overviewRange = "1y";
  const lock = s.settings.lock;
  s.settings.lock = lock && typeof lock.salt === "string" && typeof lock.hash === "string" ? { salt: lock.salt, hash: lock.hash, iterations: int(lock.iterations) || 200000 } : null;
  if (![0, 1, 5].includes(s.settings.lockAfter)) s.settings.lockAfter = 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.settings.backupSnoozeUntil))) s.settings.backupSnoozeUntil = null;
  if (s.settings.lastBackupAt != null && Number.isNaN(Date.parse(s.settings.lastBackupAt))) s.settings.lastBackupAt = null;
}

// 定期取引: 前回作成した月の翌月から、今日までに日付が来た月の分を作る。作成した件数を返す
export function generateRecurring(state, today = localDate()) {
  const thisMonth = monthOf(today);
  let created = 0;
  for (const r of state.recurring) {
    if (!r.active) continue;
    let m = addMonths(r.lastGeneratedMonth || addMonths(thisMonth, -1), 1);
    for (let guard = 0; m <= thisMonth && guard < 24; guard++, m = addMonths(m, 1)) {
      const date = dateInMonth(m, r.day);
      if (date > today) break;
      state.transactions.push({
        id: id(), date, type: r.type, amount: r.amount, categoryId: r.categoryId, accountId: r.accountId,
        scope: r.scope, memo: r.memo || r.name, debtId: null, principal: null, interest: null,
        recurringId: r.id, createdAt: nowIso(), updatedAt: nowIso(),
      });
      r.lastGeneratedMonth = m;
      created++;
    }
  }
  return created;
}

export function load(storage = globalThis.localStorage) {
  let raw = null;
  try { raw = storage.getItem(KEY); } catch { /* プライベートモード等 */ }
  if (!raw) return defaultState();
  let data;
  try { data = JSON.parse(raw); } catch { return defaultState(); }
  if (!data.schemaVersion) {
    try { if (!storage.getItem(V1_BACKUP_KEY)) storage.setItem(V1_BACKUP_KEY, raw); } catch { /* 退避できなくても移行は続ける */ }
  }
  const state = migrate(data);
  save(state, storage);
  return state;
}

export function save(state, storage = globalThis.localStorage) {
  storage.setItem(KEY, JSON.stringify(state));
}

// この端末のデータをすべて消す（PINを忘れたとき用）
export function resetAll(storage = globalThis.localStorage) {
  storage.removeItem(KEY);
  storage.removeItem(V1_BACKUP_KEY);
}
