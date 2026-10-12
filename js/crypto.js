// アプリのロック（PIN）とバックアップの暗号化。Web Crypto だけを使い、外部ライブラリは使わない
// 仕様: docs/security.md「アプリ側の対策」
// - PIN は PBKDF2-SHA256 でハッシュ化して保存（PIN そのものは保存しない）
// - バックアップは パスワード → PBKDF2-SHA256 → AES-GCM(256bit) で暗号化

const enc = new TextEncoder(), dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;
export const ENCRYPTED_FORMAT = "kurashi-shushi-encrypted-v1";
export const PIN_ITERATIONS = 200000;
export const BACKUP_ITERATIONS = 600000;

export function toB64(bytes) { let s = ""; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); }
export function fromB64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
export function randomBytes(n) { return globalThis.crypto.getRandomValues(new Uint8Array(n)); }

async function pbkdf2Bits(secret, salt, iterations) {
  const key = await subtle().importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  return subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

// ── PIN ──
export function isValidPin(pin) { return /^\d{4,8}$/.test(String(pin)); }

export async function createPinLock(pin, iterations = PIN_ITERATIONS) {
  const salt = randomBytes(16);
  return { salt: toB64(salt), hash: toB64(await pbkdf2Bits(pin, salt, iterations)), iterations };
}

export async function verifyPin(pin, lock) {
  if (!lock?.hash) return false;
  const bits = new Uint8Array(await pbkdf2Bits(String(pin), fromB64(lock.salt), lock.iterations || PIN_ITERATIONS));
  const want = fromB64(lock.hash);
  if (bits.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ want[i];
  return diff === 0;
}

// ── バックアップの暗号化 ──
async function aesKey(password, salt, iterations) {
  const bits = await pbkdf2Bits(password, salt, iterations);
  return subtle().importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptBackup(data, password, iterations = BACKUP_ITERATIONS) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = await subtle().encrypt({ name: "AES-GCM", iv }, await aesKey(password, salt, iterations), enc.encode(JSON.stringify(data)));
  return { format: ENCRYPTED_FORMAT, kdf: "PBKDF2-SHA256", iterations, cipher: "AES-GCM", salt: toB64(salt), iv: toB64(iv), data: toB64(cipher) };
}

export const isEncryptedBackup = obj => obj?.format === ENCRYPTED_FORMAT;

// パスワードが違う・改ざんされている場合は例外になる
export async function decryptBackup(obj, password) {
  if (!isEncryptedBackup(obj)) throw new Error("暗号化されたバックアップではありません");
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(obj.iv) }, await aesKey(password, fromB64(obj.salt), obj.iterations), fromB64(obj.data));
  return JSON.parse(dec.decode(plain));
}
