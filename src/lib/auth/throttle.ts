/** ログイン失敗の回数制限（純関数）: 15分間に10回失敗したら15分ロック */
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface AttemptRecord {
  failures: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

export function lockedMinutes(rec: AttemptRecord | undefined, now: Date): number {
  if (!rec?.lockedUntil || rec.lockedUntil <= now) return 0;
  return Math.ceil((rec.lockedUntil.getTime() - now.getTime()) / 60000);
}

export function afterFailure(rec: AttemptRecord | undefined, now: Date): AttemptRecord {
  const fresh = !rec || now.getTime() - rec.windowStart.getTime() > LOGIN_WINDOW_MS;
  const failures = fresh ? 1 : rec.failures + 1;
  return {
    failures,
    windowStart: fresh ? now : rec.windowStart,
    lockedUntil: failures >= LOGIN_MAX_FAILURES ? new Date(now.getTime() + LOGIN_WINDOW_MS) : null,
  };
}
