// バックアップの催促とファイル名（純粋関数）。仕様: docs/spec-backup.md
import { localDate, daysBetween } from "../util.js";

export const BACKUP_INTERVAL_DAYS = 7;

/**
 * settings.lastBackupAt（ISO日時）・settings.backupSnoozeUntil（"YYYY-MM-DD"）と記録の件数から、
 * { last: "YYYY-MM-DD"|null, age: 日数|null, due: 7日以上たったか, prompt: 今日たずねるか } を返す
 */
export function backupStatus(settings, txCount, today = localDate()) {
  const last = settings.lastBackupAt ? localDate(new Date(settings.lastBackupAt)) : null;
  const age = last ? daysBetween(last, today) : null;
  const due = txCount > 0 && (age === null || age >= BACKUP_INTERVAL_DAYS);
  const snoozed = !!settings.backupSnoozeUntil && settings.backupSnoozeUntil > today;
  return { last, age, due, prompt: due && !snoozed };
}

export function backupFileName(today = localDate(), encrypted = false) {
  return `kurashi-shushi-${today}${encrypted ? ".encrypted" : ""}.backup.json`;
}

// 「あとで」を押したら翌日まで聞かない
export function snoozeUntil(today = localDate()) {
  const [y, m, d] = today.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + 1));
}
