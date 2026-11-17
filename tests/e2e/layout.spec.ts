import { test, expect } from "@playwright/test";
import { V, login, noHorizontalOverflow } from "./helpers";

test("iPad: 主要画面の表示と横スクロールなし", async ({ page }) => {
  await login(page);
  for (const [path, name] of [["/", "dashboard"], [`/products/ch-paper-chain-necklace?variant=${V}`, "product"], [`/profit?variant=${V}&country=US&currency=USD&price=500&taxRate=0.08875`, "profit"], ["/settings", "settings"]] as const) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/ipad-${name}.png`, fullPage: true });
  }
});
