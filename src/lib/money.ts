import Decimal from "decimal.js";

/** 金額計算はすべて Decimal で行う。number は表示直前のみ。 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Dec = Decimal;
export const D = (v: Decimal.Value): Decimal => new Decimal(v);
export const ZERO = new Decimal(0);

/** 円未満四捨五入（表示・集計用） */
export const yen = (v: Decimal): Decimal => v.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
/** 指定単位未満切捨て（例: 1000円未満切捨て → floorTo(v, 1000)） */
export const floorTo = (v: Decimal, unit: number): Decimal =>
  v.dividedBy(unit).floor().times(unit);

export function formatJpy(v: Decimal | string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const d = D(v as Decimal.Value);
  const n = yen(d);
  const sign = n.isNegative() ? "-" : "";
  return `${sign}¥${n.abs().toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function formatMoney(v: Decimal | string | number, currency: string): string {
  const d = D(v as Decimal.Value);
  const digits = currency === "JPY" ? 0 : 2;
  const s = d.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${s}`;
}

export function formatPct(v: Decimal | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${v.times(100).toFixed(digits)}%`;
}

/** 文字列の数値を厳密に解析（"1,200" のような桁区切りは許容、通貨記号や全角は拒否） */
export function parseStrictDecimal(raw: string): Decimal | null {
  const s = raw.trim();
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return null;
  return D(s.replace(/,/g, ""));
}
