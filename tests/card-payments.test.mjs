import test from "node:test";
import assert from "node:assert/strict";
import { nextCardPayments } from "../js/calc/accounts.js";
import { defaultState } from "../js/store.js";
import { renderHome } from "../js/ui/home.js";
import { renderAnalysis } from "../js/ui/analysis.js";
import { renderDebts } from "../js/ui/debts.js";

const card = (id, closingDay = 15, paymentDay = 10) => ({ id, name: `テスト${id}`, kind: "card", closingDay, paymentDay, archived: false });
const purchase = (date, amount, extra = {}) => ({ date, amount, type: "expense", accountId: "a", categoryId: "food", ...extra });
function state() {
  const s = defaultState();
  s.accounts.push(card("a"));
  return s;
}

test("締日の翌日から次の締日までを集計し、翌月の支払日を表示する", () => {
  const s = state();
  s.transactions = [purchase("2026-09-15", 900), purchase("2026-09-16", 1000), purchase("2026-10-15", 2000), purchase("2026-10-16", 800)];
  const r = nextCardPayments(s, "2026-10-12");
  assert.equal(r.total, 3000);
  assert.deepEqual([r.rows[0].date, r.rows[0].from, r.rows[0].through], ["2026-11-10", "2026-09-15", "2026-10-15"]);
});

test("月末の締日、2月の末日、年越しの支払日を扱う", () => {
  const s = state();
  s.accounts[1] = card("a", 31, 31);
  s.transactions = [purchase("2028-01-31", 900), purchase("2028-02-29", 4000), purchase("2028-03-01", 800)];
  const r = nextCardPayments(s, "2028-03-01");
  assert.equal(r.total, 4000);
  assert.equal(r.rows[0].date, "2028-03-31");
  s.transactions = [purchase("2026-12-31", 5000)];
  assert.equal(nextCardPayments(s, "2026-12-31").rows[0].date, "2026-12-31");
  assert.equal(nextCardPayments(s, "2027-01-01").total, 5000);
});

test("次回支払いに入る未記録の定期支出を加え、作成済みの記録と二重計上しない", () => {
  const s = state();
  s.recurring = [{ id: "r", accountId: "a", type: "expense", amount: 1500, day: 14, active: true, categoryId: "food", lastGeneratedMonth: "2026-09" }];
  const original = structuredClone(s);
  assert.equal(nextCardPayments(s, "2026-10-12").total, 1500);
  assert.deepEqual(s, original);
  assert.equal(nextCardPayments(s, "2026-10-12").rows[0].estimated, 1500);
  s.transactions = [purchase("2026-10-14", 1500, { recurringId: "r" })];
  assert.equal(nextCardPayments(s, "2026-10-12").total, 1500);
  assert.equal(nextCardPayments(s, "2026-10-12").rows[0].estimated, 0);
  s.recurring[0].lastGeneratedMonth = "2026-10";
  s.transactions = [];
  assert.equal(nextCardPayments(s, "2026-10-12").total, 0);
});

test("返済記録・現金・収入・停止済みの定期支出をカード一括払いに混ぜない", () => {
  const s = state();
  s.categories.push({ id: "repay", isRepayment: true });
  s.transactions = [purchase("2026-10-01", 1000), purchase("2026-10-01", 2000, { debtId: "d" }), purchase("2026-10-01", 3000, { categoryId: "repay" }), purchase("2026-10-01", 4000, { accountId: "cash" }), purchase("2026-10-01", 5000, { type: "income" })];
  s.recurring = [{ id: "r", accountId: "a", type: "expense", amount: 6000, day: 14, active: false }];
  assert.equal(nextCardPayments(s, "2026-10-12").total, 1000);
});

test("カード別に合計し、非表示のカードの請求も残す。日付未設定は別に表示する", () => {
  const s = state();
  s.accounts.push(card("b", 31, 27), card("c", null, 27));
  s.accounts[1].archived = true;
  s.transactions = [purchase("2026-10-01", 1000), purchase("2026-09-20", 2000, { accountId: "b" }), purchase("2026-10-01", 9000, { accountId: "c" })];
  const r = nextCardPayments(s, "2026-10-12");
  assert.equal(r.total, 3000);
  assert.deepEqual(r.rows.map(x => [x.accountId, x.date, x.amount]), [["b", "2026-10-27", 2000], ["a", "2026-11-10", 1000]]);
  assert.deepEqual(r.unconfigured.map(a => a.id), ["c"]);
});

test("返済専用の概要は返済タブだけに表示し、カード名をエスケープする", () => {
  const s = state();
  s.accounts[1].name = "<カード>";
  s.transactions = [purchase("2026-10-01", 12345)];
  const app = { state: s, ctx: { month: "2026-10", debtId: null } };
  assert.doesNotMatch(renderHome(app), /overviewChart|合計引き落とし額|完済の見通し/);
  assert.doesNotMatch(renderAnalysis(app), /overviewChart|返済のうち利息/);
  const html = renderDebts(app);
  assert.match(html, /overviewChart/);
  assert.match(html, /合計引き落とし額/);
  assert.match(html, /&lt;カード&gt;/);
  assert.doesNotMatch(html, /<カード>/);
});
