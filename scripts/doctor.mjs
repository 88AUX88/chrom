// ログイン設定の点検（パスワードや秘密鍵の中身は表示しません）
// 使い方: npm run doctor
import fs from "node:fs";

const ok = (m) => console.log("✅ " + m);
const ng = (m) => console.log("❌ " + m);
const warn = (m) => console.log("⚠️  " + m);
let problems = 0;

const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) ok(`Node.js のバージョン ${process.versions.node}`);
else { ng(`Node.js が古いです（${process.versions.node}）。nodejs.org から LTS を入れ直してください`); problems++; }

if (!fs.existsSync(".env.local")) {
  ng("設定ファイル .env.local がありません。`npm run set-password` で作れます");
  process.exit(1);
}
const lines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
const values = {};
const counts = {};
for (const line of lines) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
  if (!m) continue;
  counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  values[m[1]] = m[2];
}
const clean = (v) => v.trim().replace(/^(['"])(.*)\1$/, "$2");

for (const key of ["APP_PASSWORD", "SESSION_SECRET"]) {
  if (!(key in values)) { ng(`${key} が書かれていません`); problems++; continue; }
  if (counts[key] > 1) { warn(`${key} が ${counts[key]} 回書かれています（最後の行が使われます）`); }
  const raw = values[key];
  const v = clean(raw);
  if (raw !== raw.trim()) warn(`${key} の前後に空白があります（アプリ側で取り除くので通常は問題なし）`);
  if (!v) { ng(`${key} が空です`); problems++; continue; }
  if (key === "SESSION_SECRET" && v.length < 32) { ng(`SESSION_SECRET が短すぎます（${v.length}文字。32文字以上が必要）`); problems++; continue; }
  ok(`${key} は設定済み（${v.length}文字）`);
}

if (fs.existsSync(".next/BUILD_ID")) ok("アプリの準備（npm run build）は済んでいます");
else { warn("まだ npm run build をしていません"); }

console.log(problems === 0
  ? "\n点検結果: 設定に問題はありません。ログインできない場合は、アプリを起動し直してから（control+C → npm start）もう一度試してください。"
  : "\n点検結果: 上の ❌ を直す必要があります。`npm run set-password` で作り直せます。");
process.exit(problems === 0 ? 0 : 1);
