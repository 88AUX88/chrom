import { test, expect } from "@playwright/test";
import { V, login, noHorizontalOverflow } from "./helpers";

const PAGES = [
  ["/", "dashboard"],
  ["/products", "products"],
  [`/products/ch-paper-chain-necklace?variant=${V}`, "product"],
  [`/profit?variant=${V}&country=US&currency=USD&price=500&taxRate=0.08875`, "profit"],
  [`/market?variant=${V}`, "market"],
  ["/candidates", "candidates"],
  ["/learn?day=1", "learn"],
  ["/settings", "settings"],
  ["/import", "import"],
  ["/history", "history"],
] as const;

test("主要画面の表示・横スクロールなし・主要リンク", async ({ page }, info) => {
  await login(page);
  for (const [path, name] of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/${info.project.name}-${name}.png`, fullPage: true });
  }
  // 下部ナビの遷移
  for (const label of ["商品", "履歴", "メニュー", "撮影", "ホーム"]) {
    await page.getByRole("navigation").getByRole("link", { name: label }).click();
    await expect(page.locator("main h1").first()).toBeVisible();
  }
});
