import { describe, it, expect, beforeEach } from "vitest";
import { createSessionValue, verifySessionValue, checkPassword } from "@/lib/auth/session";

describe("セッション", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = "correct horse";
    process.env.SESSION_SECRET = "x".repeat(40);
  });
  it("正しい署名を受理、改ざん・期限切れを拒否", async () => {
    const v = await createSessionValue(1000);
    expect(await verifySessionValue(v, 1001)).toBe(true);
    expect(await verifySessionValue(v.replace(/.$/, (c) => (c === "0" ? "1" : "0")), 1001)).toBe(false);
    expect(await verifySessionValue(v, 1000 + 60 * 60 * 24 * 31)).toBe(false);
    expect(await verifySessionValue(undefined)).toBe(false);
  });
  it("パスワード照合、未設定ならすべて拒否（フェイルクローズ）", async () => {
    expect(checkPassword("correct horse")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
    delete process.env.APP_PASSWORD;
    expect(checkPassword("")).toBe(false);
    const v = await createSessionValue();
    expect(await verifySessionValue(v)).toBe(false);
  });
  it("SESSION_SECRET が短いと無効", async () => {
    process.env.SESSION_SECRET = "short";
    expect(checkPassword("correct horse")).toBe(false);
  });
});
