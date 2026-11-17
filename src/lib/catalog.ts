/** カタログの正規化と重複検出（純関数） */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-_・･()（）'’"]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export interface CatalogItem {
  id: string;
  nameEn: string;
  nameJaReading: string;
  aliases?: string[];
}

export interface DuplicateGroup {
  key: string;
  ids: string[];
  reason: string;
}

/** 英名・読み・別名の正規化キーが衝突する商品をまとめる */
export function findDuplicates(items: CatalogItem[]): DuplicateGroup[] {
  const map = new Map<string, { ids: Set<string>; reason: string }>();
  const add = (k: string, id: string, reason: string) => {
    if (!k) return;
    const e = map.get(k) ?? { ids: new Set<string>(), reason };
    e.ids.add(id);
    map.set(k, e);
  };
  for (const it of items) {
    add("en:" + normalizeName(it.nameEn), it.id, "英語名が同じ");
    add("ja:" + normalizeName(it.nameJaReading), it.id, "読みが同じ");
    for (const a of it.aliases ?? []) add("alias:" + normalizeName(a), it.id, "別名が同じ");
  }
  return [...map.entries()].filter(([, v]) => v.ids.size > 1).map(([k, v]) => ({ key: k, ids: [...v.ids].sort(), reason: v.reason }));
}

/** 新規名が既存商品と衝突するか */
export function conflictsWith(name: string, reading: string, items: CatalogItem[]): CatalogItem[] {
  const n = normalizeName(name);
  const r = normalizeName(reading);
  return items.filter((i) => normalizeName(i.nameEn) === n || (r && normalizeName(i.nameJaReading) === r));
}
