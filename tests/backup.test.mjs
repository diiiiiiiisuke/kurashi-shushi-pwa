import test from "node:test";
import assert from "node:assert/strict";
import { backupStatus, backupFileName, snoozeUntil } from "../js/calc/backup.js";

const at = date => new Date(`${date}T12:00:00`).toISOString();

test("記録がなければ催促しない", () => {
  assert.equal(backupStatus({ lastBackupAt: null }, 0, "2026-10-12").prompt, false);
});

test("一度もバックアップしていなければ催促する", () => {
  const s = backupStatus({ lastBackupAt: null }, 3, "2026-10-12");
  assert.deepEqual([s.last, s.age, s.due, s.prompt], [null, null, true, true]);
});

test("7日たったら催促、6日なら催促しない", () => {
  assert.equal(backupStatus({ lastBackupAt: at("2026-10-05") }, 5, "2026-10-12").prompt, true);
  assert.equal(backupStatus({ lastBackupAt: at("2026-10-06") }, 5, "2026-10-12").prompt, false);
  assert.equal(backupStatus({ lastBackupAt: at("2026-10-06") }, 5, "2026-10-12").age, 6);
});

test("「あとで」は翌日まで聞かない", () => {
  const until = snoozeUntil("2026-10-12");
  assert.equal(until, "2026-10-13");
  assert.equal(backupStatus({ lastBackupAt: null, backupSnoozeUntil: until }, 5, "2026-10-12").prompt, false);
  assert.equal(backupStatus({ lastBackupAt: null, backupSnoozeUntil: until }, 5, "2026-10-13").prompt, true);
  assert.equal(snoozeUntil("2026-12-31"), "2027-01-01");
});

test("ファイル名", () => {
  assert.equal(backupFileName("2026-10-12"), "kurashi-shushi-2026-10-12.backup.json");
  assert.equal(backupFileName("2026-10-12", true), "kurashi-shushi-2026-10-12.encrypted.backup.json");
});
