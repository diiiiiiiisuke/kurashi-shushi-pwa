// 1タップバックアップ（iPhone の共有シート → 「ファイル」に保存 → iCloud Drive）。仕様: docs/spec-backup.md
// - 共有シートはボタンを押した直後にしか開けないため、ファイルの中身は同期的に作ってすぐ渡す
// - 共有シートが使えない環境では、ファイルとしてダウンロードする
// - データは外部に送らない（保存先はオーナーが共有シートで選ぶ）
import { localDate, nowIso } from "../util.js";
import { backupStatus, backupFileName, snoozeUntil } from "../calc/backup.js";

function download(text, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function markDone(app) {
  app.state.settings.lastBackupAt = nowIso();
  app.state.settings.backupSnoozeUntil = null;
  document.querySelector("#sheet")?.open && document.querySelector("#sheet").close();
  app.commit();
  app.toast("バックアップを保存しました");
}

// text: 保存する JSON 文字列。キャンセルされたら false
export async function deliverBackup(app, text, encrypted = false) {
  const name = backupFileName(localDate(), encrypted);
  const file = typeof File === "function" ? new File([text], name, { type: "application/json" }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "くらし収支のバックアップ" });
      markDone(app);
      return true;
    } catch (e) {
      if (e?.name === "AbortError") return false;   // 共有シートを閉じただけ
      // それ以外（共有できなかった）はダウンロードに切り替える
    }
  }
  download(text, name);
  markDone(app);
  return true;
}

// 1タップ（パスワードなし）。必ずボタンのクリックの中から呼ぶ
export function quickBackup(app) {
  return deliverBackup(app, JSON.stringify(app.exportable(), null, 2), false);
}

export function snoozeBackup(app) {
  app.state.settings.backupSnoozeUntil = snoozeUntil(localDate());
  document.querySelector("#sheet")?.open && document.querySelector("#sheet").close();
  app.commit();
  app.toast("明日また確認します");
}

export const status = app => backupStatus(app.state.settings, app.state.transactions.length);

export function ageText(s) {
  return s.last ? `${s.last}（${s.age === 0 ? "今日" : `${s.age}日前`}）` : "まだありません";
}

// ホームの上に出す案内
export function backupBanner(app) {
  const s = status(app);
  if (!s.due) return "";
  return `<div class="backup-banner" role="status">
    <div><strong>☁️ バックアップしましょう</strong><small>${s.last ? `最後の保存から${s.age}日たちました` : "まだ一度も保存していません"}。iPhoneの故障や機種変更に備えて、iCloudにコピーしておきます（約5秒）。</small></div>
    <div class="button-row"><button type="button" class="primary" data-action="backup-quick">iCloudに保存</button><button type="button" class="link" data-action="backup-snooze">あとで</button></div>
  </div>`;
}

// 保存領域を消えにくくする（iPhone の判断で消されにくくなる。結果は設定画面に表示）
export async function requestPersistence(app) {
  try {
    if (!navigator.storage?.persist) { app.storagePersisted = null; return; }
    app.storagePersisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch { app.storagePersisted = null; }
}
