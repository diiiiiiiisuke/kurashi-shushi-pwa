import test from "node:test";
import assert from "node:assert/strict";
import { scan, readRepo } from "../scripts/security-check.mjs";

const repo = readRepo(".");

test("今のリポジトリは問題なし", () => {
  assert.deepEqual(scan(repo), []);
});

const withFile = (path, src) => scan({ ...repo, [path]: src });

test("外部への通信を入れると止まる", () => {
  assert.ok(withFile("js/ui/home.js", repo["js/ui/home.js"] + '\nfetch("/x");').some(p => p.includes("fetch")));
  assert.ok(withFile("js/x.js", 'navigator.sendBeacon("/a", d)').some(p => p.includes("sendBeacon")));
  assert.ok(withFile("js/x.js", 'const u = "https://evil.example/c";').some(p => p.includes("外部URL")));
  assert.ok(withFile("js/x.js", "img.src = base + data;").some(p => p.includes("組み立てたURL")));
});

test("CSP の変更・外部スクリプトの追加を止める", () => {
  const html = repo["index.html"];
  assert.ok(withFile("index.html", html.replace("connect-src 'self'", "connect-src *")).some(p => p.includes("Content-Security-Policy")));
  assert.ok(withFile("index.html", html.replace("</body>", '<script src="https://cdn.example/a.js"></script></body>')).some(p => p.includes("<script>")));
  assert.ok(withFile("index.html", html.replace("<body>", '<body onload="x()">')).some(p => p.includes("イベント属性")));
});

test("ワークフローの権限・固定されていないアクションを止める", () => {
  const wf = repo[".github/workflows/check.yml"];
  assert.ok(withFile(".github/workflows/check.yml", wf.replace(/@[0-9a-f]{40}/, "@v4")).some(p => p.includes("SHA")));
  assert.ok(withFile(".github/workflows/check.yml", wf.replace("contents: read", "contents: write")).some(p => p.includes("読み取り専用")));
});

test("コメント内の URL は問題にしない", () => {
  assert.deepEqual(withFile("js/x.js", "// 参考: https://example.com\nconst a = 1;"), []);
});
