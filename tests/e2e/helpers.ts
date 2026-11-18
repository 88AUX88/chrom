import { expect, type Page } from "@playwright/test";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("パスワード").fill("e2e-password");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByText("撮影する", { exact: true }).first()).toBeVisible();
}

export async function noHorizontalOverflow(page: Page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, `横スクロール発生 scrollWidth=${sw} innerWidth=${iw}`).toBeLessThanOrEqual(iw + 1);
}

const d = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
export const V = "ch-paper-chain-necklace-silver925-nostone-20inch";
export const V_OTHER = "ch-paper-chain-necklace-silver925-nostone-22inch";

/** テスト専用データ（実データではない。URL は予約済み .invalid ドメイン） */
export const CSV = {
  variants: `id,product_id,material,has_stones,catalog_status,size_label\n${V_OTHER},ch-paper-chain-necklace,SILVER_925,false,UNVERIFIED,22inch\n`,
  fx: `currency,jpy_per_unit,as_of,source\nUSD,150,${new Date(Date.now() - 3600000).toISOString()},E2Eテスト用\n`,
  retail: `variant_id,country,currency,amount,price_kind,tax_inclusion,source_url,source_name,source_type,reliability,observed_at\n${V},US,USD,500,OFFICIAL,EXCLUDED,https://store.test.invalid/p,E2Eテスト,OFFICIAL_SITE,VERIFIED,${d(2)}\n`,
  market:
    "variant_id,platform,kind,price_jpy,condition,source_url,source_name,source_type,reliability,observed_at,sold_at,external_ref\n" +
    [140000, 145000, 150000, 155000, 160000].map((p, i) => `${V},SNKRDUNK,REPORTED_SOLD,${p},NEW,https://m.test.invalid/${i},E2E,MARKETPLACE,REPORTED,${d(1)},${d(i + 1)},e2e-${i}`).join("\n") +
    `\n${V},SNKRDUNK,ASK,400000,NEW,https://m.test.invalid/ask,E2E,MARKETPLACE,REPORTED,${d(1)},,` +
    `\n${V_OTHER},SNKRDUNK,REPORTED_SOLD,999999,NEW,https://m.test.invalid/x,E2E,MARKETPLACE,REPORTED,${d(1)},${d(1)},` +
    `\n${V},SNKRDUNK,REPORTED_SOLD,150000,NEW,https://m.test.invalid/y,E2E,MARKETPLACE,REPORTED,${d(1)},,\n`,
};
