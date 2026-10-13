// アプリのファイルを変更したら CACHE の番号を必ず上げる（古いキャッシュが残るのを防ぐ）
const CACHE = "kurashi-shushi-v15";
// js/ にファイルを追加・削除したらここも更新する（scripts/check.sh が確認する）
const ASSETS = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest", "./icon.svg",
  "./js/main.js", "./js/util.js", "./js/store.js", "./js/crypto.js",
  "./js/calc/debt.js", "./js/calc/simulation.js", "./js/calc/summary.js", "./js/calc/projection.js", "./js/calc/accounts.js", "./js/calc/backup.js",
  "./js/ui/common.js", "./js/ui/chart.js", "./js/ui/forms.js", "./js/ui/breakdown.js", "./js/ui/overview.js", "./js/ui/lock.js", "./js/ui/backup.js",
  "./js/ui/home.js", "./js/ui/records.js", "./js/ui/analysis.js", "./js/ui/debts.js", "./js/ui/settings.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先: オンラインなら最新版を取得してキャッシュを更新、オフライン時はキャッシュを使う
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
