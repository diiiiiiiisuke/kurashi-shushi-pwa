// 画面にもテストにも使う小さな共通関数（DOM・localStorage に触らない）

export const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
export const fmt = n => yen.format(Math.round(Number(n) || 0));
export const signed = n => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n))}`;

export function id() { return crypto.randomUUID(); }
export function nowIso() { return new Date().toISOString(); }

const pad = n => String(n).padStart(2, "0");

// toISOString() は UTC のため、日本時間の0〜9時に前日になる。端末のローカル日付を使う
export function localDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function monthOf(date) { return String(date).slice(0, 7); }
export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(ym) { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); }
// その月の day 日。月末を超える場合は末日
export function dateInMonth(ym, day) { return `${ym}-${pad(Math.min(Math.max(1, day), daysInMonth(ym)))}`; }
export function monthLabel(ym) { const [y, m] = ym.split("-").map(Number); return `${y}年${m}月`; }
export function shortMonth(ym) { const [y, m] = ym.split("-").map(Number); return `${String(y).slice(2)}/${m}`; }
export function dayLabel(date) {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${"日月火水木金土"[new Date(y, m - 1, d).getDay()]}）`;
}
export function daysBetween(a, b) { return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000); }

export function sumBy(items, fn) { return items.reduce((n, x) => n + (Number(fn(x)) || 0), 0); }

export function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
