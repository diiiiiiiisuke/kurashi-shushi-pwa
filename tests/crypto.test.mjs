import test from "node:test";
import assert from "node:assert/strict";
import { createPinLock, verifyPin, isValidPin, encryptBackup, decryptBackup, isEncryptedBackup } from "../js/crypto.js";

test("PIN: 正しいPINだけ通り、PINそのものは保存されない", async () => {
  const lock = await createPinLock("4821", 1000);
  assert.ok(!JSON.stringify(lock).includes("4821"));
  assert.equal(await verifyPin("4821", lock), true);
  assert.equal(await verifyPin("4822", lock), false);
  assert.equal(await verifyPin("4821", null), false);
  const other = await createPinLock("4821", 1000);
  assert.notEqual(other.hash, lock.hash);       // salt が毎回違う
});

test("PIN の形式は数字4〜8桁", () => {
  assert.ok(isValidPin("1234") && isValidPin("12345678"));
  assert.ok(!isValidPin("123") && !isValidPin("abcd") && !isValidPin("123456789"));
});

test("バックアップの暗号化: 正しいパスワードで元に戻り、中身は平文で見えない", async () => {
  const data = { transactions: [{ memo: "スーパー", amount: 1200 }] };
  const e = await encryptBackup(data, "correct horse 2026", 1000);
  assert.ok(isEncryptedBackup(e));
  assert.ok(!JSON.stringify(e).includes("スーパー"));
  assert.deepEqual(await decryptBackup(e, "correct horse 2026"), data);
  await assert.rejects(decryptBackup(e, "wrong password"));
  const tampered = { ...e, data: e.data.slice(0, -4) + (e.data.endsWith("AAAA") ? "BBBB" : "AAAA") };
  await assert.rejects(decryptBackup(tampered, "correct horse 2026"));
});
