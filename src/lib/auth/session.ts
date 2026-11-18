/**
 * 単一利用者向けセッション（Edge/Node 両対応の Web Crypto HMAC）。
 * Cookie 値: "<expiryEpochSec>.<hex(HMAC-SHA256(SESSION_SECRET, 'v1:'+expiry))>"
 * APP_PASSWORD / SESSION_SECRET が未設定の場合はログイン不可（フェイルクローズ）。
 */
export const SESSION_COOKIE = "lmi_session";
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

const enc = new TextEncoder();

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 長さに依存しない比較 */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** 設定ファイルの値（前後の空白・改行は取り除く。貼り付け時の混入対策） */
const appPassword = () => (process.env.APP_PASSWORD ?? "").trim();
const sessionSecret = () => (process.env.SESSION_SECRET ?? "").trim();

/** 認証設定の状態（値そのものは返さない） */
export function authConfigStatus(): "OK" | "NO_PASSWORD" | "NO_SECRET" | "SHORT_SECRET" {
  if (!appPassword()) return "NO_PASSWORD";
  if (!sessionSecret()) return "NO_SECRET";
  if (sessionSecret().length < 32) return "SHORT_SECRET";
  return "OK";
}

export function authConfigured(): boolean {
  return authConfigStatus() === "OK";
}

export async function createSessionValue(nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const exp = nowSec + SESSION_TTL_SEC;
  return `${exp}.${await hmacHex(sessionSecret(), `v1:${exp}`)}`;
}

export async function verifySessionValue(v: string | undefined, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!v || !authConfigured()) return false;
  const [expStr, sig] = v.split(".");
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp < nowSec || !sig) return false;
  return safeEqual(sig, await hmacHex(sessionSecret(), `v1:${exp}`));
}

export function checkPassword(input: string): boolean {
  if (!authConfigured()) return false;
  return safeEqual(input.trim(), appPassword());
}
