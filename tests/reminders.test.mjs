import test from "node:test";
import assert from "node:assert/strict";
import { defaultState, migrate, load, save, KEY, SCHEMA_VERSION } from "../js/store.js";
import { renderHome } from "../js/ui/home.js";

test("v2からv3への移行で空のリマインドを追加し、既存データを保持する", () => {
  const old = defaultState();
  old.schemaVersion = 2;
  delete old.reminders;
  old.transactions = [{ id: "tx", date: "2026-10-13", type: "expense", amount: 1000, categoryId: old.categories[0].id, accountId: "cash" }];
  const updated = migrate(structuredClone(old));
  assert.equal(updated.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(updated.reminders, []);
  for (const key of ["transactions", "categories", "accounts", "debts", "recurring", "budgets", "settings"]) {
    assert.deepEqual(updated[key], old[key]);
  }
  assert.deepEqual(migrate(structuredClone(updated)), updated);
});

test("リマインドの保存・再読み込み・バックアップの移行で内容を保持する", () => {
  const s = defaultState();
  const reminder = { id: "r", name: "テスト用品", memo: "あとで買う", categoryId: s.categories[0].id, createdAt: "2026-10-13T00:00:00Z" };
  s.reminders.push(reminder);
  const items = new Map();
  const storage = { setItem: (k, v) => items.set(k, v), getItem: k => items.get(k) ?? null };
  save(s, storage);
  assert.deepEqual(load(storage).reminders, [reminder]);
  const backup = JSON.parse(items.get(KEY));
  assert.deepEqual(migrate(backup).reminders, [reminder]);
});

test("細工したリマインドの空項目・不正なカテゴリ・重複IDを整える", () => {
  const s = defaultState();
  s.reminders = [null, "invalid", { id: "same", name: " A ", memo: 123, categoryId: "missing" }, { id: "same", name: "B", memo: "" }, { name: "  " }];
  const updated = migrate(s);
  assert.equal(updated.reminders.length, 2);
  assert.equal(updated.reminders[0].name, "A");
  assert.equal(updated.reminders[0].memo, "123");
  assert.equal(updated.reminders[0].categoryId, null);
  assert.notEqual(updated.reminders[0].id, updated.reminders[1].id);
  assert.deepEqual(migrate(structuredClone(updated)), updated);
});

test("最近の記録を外し、リマインドを表示して名前・メモ・IDをエスケープする", () => {
  const s = defaultState();
  s.transactions = [{ id: "tx", date: "2026-10-13", type: "expense", amount: 1000, categoryId: s.categories[0].id, accountId: "cash" }];
  s.reminders = [{ id: '" onclick="alert(1)', name: "<script>name</script>", memo: "<img src=x>", categoryId: null }];
  const html = renderHome({ state: s, ctx: { month: "2026-10" } });
  assert.doesNotMatch(html, /RECENT|最近の記録|購入済み/);
  assert.match(html, /リマインド/);
  assert.match(html, /data-reminder-complete/);
  assert.match(html, /&lt;script&gt;name&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<script>|<img|data-id="" onclick=/);
});

test("リマインドが空でも追加ボタンと案内がある", () => {
  const html = renderHome({ state: defaultState(), ctx: { month: "2026-10" } });
  assert.match(html, /data-action="add-reminder"/);
  assert.match(html, /あとで買うものを追加しましょう/);
  assert.doesNotMatch(html, /購入済み/);
});
