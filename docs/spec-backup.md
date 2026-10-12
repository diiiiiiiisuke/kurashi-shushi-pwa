# 指示書: 1タップバックアップ（案A）

- 作成・実装: 2026-10-12（Claude Code）
- オーナーの依頼: 「毎回バックアップするのは面倒。もっといい方法はないか」→ 案A（1タップ）を採用

## 方針

- ホーム画面の Web アプリは、iPhone のルール上 iCloud へ**自動では**保存できない。そこで「週1回、出てきたボタンを1回押すだけ」にする
- データは外部（サーバー）に送らない。保存先はオーナーが iPhone の共有シートで選ぶ（iCloud Drive）
- パスワードは**任意**。iCloud 自体が Apple ID で守られているため、初期はパスワードなし。付けたい場合は「パスワードを付けて保存」

## 仕様

| 項目 | 内容 |
| --- | --- |
| 催促 | 記録が1件以上あり、最後のバックアップから **7日以上**（または未実施）なら、アプリを開いたとき（ロック解除後・ホーム画面）に「☁️ バックアップ」シートを1回だけ表示。ホームの上部にも案内を出す |
| あとで | `settings.backupSnoozeUntil` を翌日にし、それまでシートは出さない（ホームの案内は出る） |
| 1タップ保存 | 「iCloudに保存」→ `navigator.share({ files })` で共有シート →「"ファイル"に保存」→ iCloud Drive。共有シートが使えない環境ではファイルをダウンロード |
| 完了の判定 | 共有・ダウンロードが終わったら `settings.lastBackupAt` を更新。共有シートを閉じた（AbortError）ときは未完了のまま |
| パスワード付き | 暗号化（AES-GCM）に時間がかかり、共有シートを開ける時間を過ぎるため、①暗号化 →②「iCloudに保存」ボタン の2段階 |
| 消えにくくする | 起動時に `navigator.storage.persist()` を要求。結果を設定画面に表示 |
| 元に戻す | 設定 →「読み込む（元に戻す）」→ iCloud Drive のファイル（従来どおり） |

## 実装

- `js/calc/backup.js`: `backupStatus()`（催促の判定）・`backupFileName()`・`snoozeUntil()`（テスト: `tests/backup.test.mjs`）
- `js/ui/backup.js`: `quickBackup()`・`deliverBackup()`（共有シート／ダウンロード）・`backupBanner()`・`requestPersistence()`
- `js/ui/forms.js`: `quickBackup`・`exportBackup`（パスワード付き）・`encryptedReady` のシート
- `js/main.js`: `data-action` の `backup`・`backup-quick`・`backup-encrypted`・`backup-snooze`、起動時の催促
