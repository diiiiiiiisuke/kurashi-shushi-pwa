// アプリのロック画面（PIN）。仕様: docs/security.md「アプリ側の対策」
// ロック中は記録を画面（DOM）に出さない。PIN を5回間違えると30秒ずつ待ち時間が増える
import { verifyPin } from "../crypto.js";

const el = () => document.querySelector("#lockScreen");
const FAIL_KEY = "kurashi-lock-fails";
let hiddenAt = null;

function fails() { try { return JSON.parse(sessionStorage.getItem(FAIL_KEY)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } }
function setFails(v) { try { sessionStorage.setItem(FAIL_KEY, JSON.stringify(v)); } catch { /* 保存できなくても動く */ } }

export const lockEnabled = app => !!app.state.settings.lock;

export function lockNow(app) {
  if (!lockEnabled(app)) return;
  app.locked = true;
  document.querySelector("#sheet")?.open && document.querySelector("#sheet").close();
  document.querySelector("#view").innerHTML = "";
  document.body.classList.add("locked");
  el().hidden = false;
  const input = el().querySelector("input");
  input.value = "";
  el().querySelector("[data-lock-error]").textContent = "";
  setTimeout(() => input.focus(), 50);
}

async function tryUnlock(app) {
  const input = el().querySelector("input"), err = el().querySelector("[data-lock-error]");
  const f = fails();
  if (Date.now() < f.until) { err.textContent = `あと${Math.ceil((f.until - Date.now()) / 1000)}秒待ってください`; return; }
  if (await verifyPin(input.value, app.state.settings.lock)) {
    setFails({ n: 0, until: 0 });
    app.locked = false;
    el().hidden = true;
    document.body.classList.remove("locked");
    app.render();
    return;
  }
  const n = f.n + 1;
  setFails({ n, until: n >= 5 ? Date.now() + 30000 * (n - 4) : 0 });
  input.value = "";
  err.textContent = n >= 5 ? `PINが違います。${30 * (n - 4)}秒待ってからもう一度入力してください` : `PINが違います（${n}回目）`;
}

export function initLock(app, onReady) {
  const box = el();
  box.querySelector("form").addEventListener("submit", e => { e.preventDefault(); tryUnlock(app); });
  box.querySelector("[data-lock-reset]").addEventListener("click", () => app.resetAll());
  // アプリを離れてから設定の時間が過ぎたら、戻ったときにロックする
  document.addEventListener("visibilitychange", () => {
    if (!lockEnabled(app)) return;
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      if (app.state.settings.lockAfter === 0) lockNow(app);   // 「すぐ」はアプリ切り替えの画面にも中身を出さない
    } else if (!app.locked && hiddenAt && Date.now() - hiddenAt >= app.state.settings.lockAfter * 60000) lockNow(app);
  });
  if (lockEnabled(app)) lockNow(app); else onReady();
}
