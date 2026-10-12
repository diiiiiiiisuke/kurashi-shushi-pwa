// セキュリティの自動チェック（CI とコミット前に実行）。仕様: docs/security.md
// 家計データが外部に送られる・外部のコードが読み込まれる変更を、マージ前に止める。
// このファイル・CSP・.github/workflows を変える変更は、オーナーの明示的な許可が必要（AGENTS.md）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const EXPECTED_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";

// アプリのコードで使ってはいけないもの（外部通信・動的なコード実行）
const FORBIDDEN = [
  [/\bfetch\s*\(/, "fetch()（通信）"],
  [/XMLHttpRequest/, "XMLHttpRequest（通信）"],
  [/\bWebSocket\b/, "WebSocket（通信）"],
  [/\bEventSource\b/, "EventSource（通信）"],
  [/sendBeacon/, "sendBeacon（通信）"],
  [/RTCPeerConnection/, "WebRTC（通信）"],
  [/\beval\s*\(/, "eval()（動的なコード実行）"],
  [/new\s+Function\s*\(/, "new Function()（動的なコード実行）"],
  [/import\s*\(\s*[^"'`.]/, "変数での動的 import"],
  [/https?:\/\//, "外部URL"],
  [/document\.cookie/, "cookie"],
  [/\.(?:src|href)\s*=\s*[^;]*\+/, "組み立てたURLの読み込み"],
];

function walk(dir) {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

// files: { path: 中身 }。問題の一覧（文字列）を返す
export function scan(files) {
  const problems = [];
  const html = files["index.html"] ?? "";
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)?.[1];
  if (csp !== EXPECTED_CSP) problems.push(`index.html: Content-Security-Policy が変更・削除されています（期待値: ${EXPECTED_CSP}）`);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\bsrc="js\/main\.js"/.test(m[1]) || m[2].trim()) problems.push(`index.html: 許可されていない <script> があります: ${m[0].slice(0, 80)}`);
  }
  if (/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, ""))) problems.push("index.html: 外部URLがあります");
  if (/\son[a-z]+\s*=/.test(html)) problems.push("index.html: インラインのイベント属性（onclick など）があります");
  if (/https?:\/\//.test(files["manifest.webmanifest"] ?? "")) problems.push("manifest.webmanifest: 外部URLがあります");

  // Cloudflare Pages のヘッダー（_headers）: index.html と同じ CSP ＋ 埋め込み禁止
  const headers = files["_headers"] ?? "";
  if (!headers.includes(`Content-Security-Policy: ${EXPECTED_CSP}; frame-ancestors 'none'`)) problems.push("_headers: Content-Security-Policy が変更・削除されています");
  for (const h of ["X-Content-Type-Options: nosniff", "X-Frame-Options: DENY", "Referrer-Policy: no-referrer"]) if (!headers.includes(h)) problems.push(`_headers: ${h} がありません`);
  if (/Access-Control-Allow-Origin/i.test(headers)) problems.push("_headers: Access-Control-Allow-Origin（他サイトからの読み取り許可）は使えません");

  // Cloudflare Workers の設定（wrangler.jsonc）: 静的ファイルを配るだけで、サーバー側のコード・外部サービスとの接続を持たない
  const wr = (files["wrangler.jsonc"] ?? "").replace(/^\s*\/\/.*$/gm, "");
  if (!/"directory"\s*:\s*"\.\/dist"/.test(wr)) problems.push("wrangler.jsonc: assets.directory は ./dist にしてください");
  for (const key of ["main", "routes", "route", "kv_namespaces", "d1_databases", "r2_buckets", "services", "durable_objects", "queues", "vars", "ai", "analytics_engine_datasets", "tail_consumers"]) {
    if (new RegExp(`"${key}"\\s*:`).test(wr)) problems.push(`wrangler.jsonc: "${key}" は使えません（サーバー側のコードや外部サービスとの接続を追加しない）`);
  }

  for (const [path, src] of Object.entries(files)) {
    if (!/^js\/.*\.js$/.test(path) && path !== "sw.js") continue;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    for (const [re, label] of FORBIDDEN) {
      if (path === "sw.js" && label.startsWith("fetch")) continue;  // sw.js は同じサイト内の取得だけ許可（下で確認）
      if (re.test(code)) problems.push(`${path}: ${label} は使えません`);
    }
    if (path !== "js/store.js" && /\blocalStorage\b/.test(code)) problems.push(`${path}: localStorage は js/store.js 以外で使わないでください`);
  }
  const sw = files["sw.js"] ?? "";
  if (!/origin\s*!==\s*location\.origin\)\s*return/.test(sw)) problems.push("sw.js: 同じサイト以外へのリクエストを無視する行がありません");

  for (const [path, src] of Object.entries(files)) {
    if (!path.startsWith(".github/workflows/")) continue;
    if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(src)) problems.push(`${path}: permissions: contents: read（読み取り専用）が必要です`);
    for (const m of src.matchAll(/uses:\s*([^\s#]+)/g)) if (!/@[0-9a-f]{40}$/.test(m[1])) problems.push(`${path}: ${m[1]} はコミットSHAで固定してください`);
    if (/pull_request_target|secrets\./.test(src)) problems.push(`${path}: pull_request_target / secrets は使わないでください`);
  }
  return problems;
}

export function readRepo(root = ".") {
  const files = {};
  for (const p of ["index.html", "sw.js", "manifest.webmanifest", "_headers", "wrangler.jsonc"]) files[p] = readFileSync(join(root, p), "utf8");
  for (const p of walk(join(root, "js"))) files[p.slice(root === "." ? 0 : root.length + 1)] = readFileSync(p, "utf8");
  for (const p of walk(join(root, ".github/workflows"))) files[p.slice(root === "." ? 0 : root.length + 1)] = readFileSync(p, "utf8");
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = scan(readRepo("."));
  if (problems.length) { console.error("セキュリティチェックで問題が見つかりました:\n- " + problems.join("\n- ")); process.exit(1); }
  console.log("security: OK");
}
