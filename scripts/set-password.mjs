// ログイン用パスワードを作り直す（入力した文字は画面に表示しません）
// 使い方: npm run set-password
// .env.local のほかの設定は残します。元のファイルは .env.local.bak に保存します。
import fs from "node:fs";
import crypto from "node:crypto";
import readline from "node:readline";

// 1つの入力受付で2回たずねる（入力文字は表示しない）
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let currentPrompt = "";
rl._writeToOutput = (s) => {
  if (currentPrompt && s.includes(currentPrompt)) rl.output.write(s);
};
const lineQueue = [];
const waiters = [];
rl.on("line", (l) => (waiters.length ? waiters.shift()(l) : lineQueue.push(l)));
function askHidden(question) {
  currentPrompt = question;
  rl.output.write(question);
  return new Promise((resolve) => {
    const done = (l) => { process.stdout.write("\n"); resolve(l.trim()); };
    if (lineQueue.length) done(lineQueue.shift());
    else waiters.push(done);
  });
}

const p1 = await askHidden("新しいパスワードを入力して Enter（文字は表示されません）: ");
if (p1.length < 8) { console.log("❌ 8文字以上にしてください。もう一度 npm run set-password を実行してください。"); process.exit(1); }
if (/[\s#"'`$\\=]/.test(p1)) { console.log("❌ 空白や # \" ' ` $ \\ = は使えません。英数字と - _ ! @ % などで作ってください。"); process.exit(1); }
const p2 = await askHidden("確認のため、もう一度入力して Enter: ");
rl.close();
if (p1 !== p2) { console.log("❌ 2回の入力が一致しませんでした。もう一度 npm run set-password を実行してください。"); process.exit(1); }

const existing = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
if (existing) fs.writeFileSync(".env.local.bak", existing, { mode: 0o600 });
const kept = existing.split(/\r?\n/).filter((l) => l.trim() && !/^\s*APP_PASSWORD\s*=/.test(l));
const secretLine = kept.find((l) => /^\s*SESSION_SECRET\s*=/.test(l));
const secretOk = secretLine && secretLine.split("=").slice(1).join("=").trim().replace(/^(['"])(.*)\1$/, "$2").length >= 32;
const out = kept.filter((l) => secretOk || !/^\s*SESSION_SECRET\s*=/.test(l));
if (!secretOk) out.push(`SESSION_SECRET=${crypto.randomBytes(32).toString("hex")}`);
out.push(`APP_PASSWORD=${p1}`);
fs.writeFileSync(".env.local", out.join("\n") + "\n", { mode: 0o600 });

console.log("✅ パスワードを保存しました" + (secretOk ? "" : "（秘密鍵も新しく作りました）") + "。");
console.log("👉 アプリを起動し直してください: 動いているターミナルで control+C → npm start");
