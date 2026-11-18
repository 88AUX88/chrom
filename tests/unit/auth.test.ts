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

import { afterFailure, lockedMinutes, LOGIN_MAX_FAILURES } from "@/lib/auth/throttle";
describe("ログインの回数制限", () => {
  it("10回失敗で15分ロック、時間がたてば解除、期間外の失敗は数え直し", () => {
    const t0 = new Date("2026-11-18T00:00:00Z");
    let rec = undefined as ReturnType<typeof afterFailure> | undefined;
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) rec = afterFailure(rec, new Date(t0.getTime() + i * 1000));
    expect(lockedMinutes(rec, new Date(t0.getTime() + 20000))).toBe(0);
    rec = afterFailure(rec, new Date(t0.getTime() + 20000));
    expect(lockedMinutes(rec, new Date(t0.getTime() + 21000))).toBe(15);
    expect(lockedMinutes(rec, new Date(t0.getTime() + 16 * 60000))).toBe(0);
    const later = afterFailure({ failures: 5, windowStart: t0, lockedUntil: null }, new Date(t0.getTime() + 20 * 60000));
    expect(later.failures).toBe(1);
  });
});
