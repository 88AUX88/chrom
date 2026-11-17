import { test, expect } from "@playwright/test";
import { CSV, V, login, noHorizontalOverflow } from "./helpers";

test.describe.serial("iPhone: 主要操作の通し確認", () => {
  test("未認証はログインへ。APIは401", async ({ page, request }) => {
    await page.goto("/products");
    await expect(page).toHaveURL(/\/login$/);
    expect((await request.get("/api/export?table=products")).status()).toBe(401);
    expect((await request.post("/api/identify", { data: {} })).status()).toBe(401);
  });

  test("誤ったパスワードは拒否", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("パスワード").fill("wrong");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page.getByText("パスワードが違う")).toBeVisible();
  });

  test("ダッシュボード: 撮影ボタンとデータ不足の警告", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("link", { name: /SCAN 撮影して商品を特定/ })).toBeVisible();
    await expect(page.getByText("海外正規価格のデータがありません")).toBeVisible();
    await expect(page.getByText("関税率が未確認です")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: "test-results/iphone-dashboard.png", fullPage: true });
  });

  test("SCAN: API未設定でも写真を表示し、手動検索へ誘導", async ({ page }) => {
    await login(page);
    await page.goto("/scan");
    await expect(page.getByText("画像認識APIが未設定")).toBeVisible();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await page.getByTestId("album-input").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: png });
    await expect(page.getByAltText("撮影した商品")).toBeVisible();
    await page.getByLabel("手動検索").fill("ペーパーチェーン");
    await page.getByLabel("手動検索").press("Enter");
    await expect(page.getByText("Paper Chain Necklace")).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test("商品: 仕様（素材・サイズ）を人間が確定", async ({ page }) => {
    await login(page);
    await page.goto("/products?q=paper chain necklace");
    await page.getByText("Paper Chain Necklace").click();
    await expect(page.getByText("名称・仕様は未検証")).toBeVisible();
    await page.getByLabel("シルバー925").check();
    await page.getByRole("combobox").selectOption("20inch");
    await page.getByRole("button", { name: "この仕様で確定" }).click();
    await expect(page).toHaveURL(new RegExp(`variant=${V}`));
    await expect(page.getByText("この仕様の海外価格データがありません")).toBeVisible();
    const sum = page.getByTestId("profit-summary");
    await expect(sum).toBeVisible();
    await expect(sum.getByText("HOLD", { exact: true })).toBeVisible();
    await expect(sum).toContainText("価格未登録");
    await expect(sum).toContainText("HS 7113.11");
    await noHorizontalOverflow(page);
    await page.screenshot({ path: "test-results/iphone-product.png", fullPage: true });
  });

  test("取込: 為替・海外価格・市場データ（不正行は隔離）", async ({ page }) => {
    await login(page);
    const up = async (kind: string, body: string) => {
      await page.goto("/import");
      await page.getByLabel("種類").selectOption(kind);
      await page.getByLabel("CSVファイル").setInputFiles({ name: `${kind}.csv`, mimeType: "text/csv", buffer: Buffer.from(body) });
      await page.getByRole("button", { name: "検証して取込" }).click();
      return page.getByTestId("import-result");
    };
    await expect(await up("variants", CSV.variants)).toContainText("受理 1 行");
    await expect(await up("fx_rates", CSV.fx)).toContainText("受理 1 行");
    await expect(await up("retail_prices", CSV.retail)).toContainText("受理 1 行");
    const r = await up("market_observations", CSV.market);
    await expect(r).toContainText("受理 7 行");
    await expect(r).toContainText("隔離 1 行");
    await expect(r).toContainText("sold_at（成約日）が必要");
    await page.screenshot({ path: "test-results/iphone-import.png", fullPage: true });
  });

  test("市場表示: ASKとSOLDを分離し、別サイズを除外", async ({ page }) => {
    await login(page);
    await page.goto(`/products/ch-paper-chain-necklace?variant=${V}`);
    const card90 = page.locator(".card", { hasText: "成約 90日" });
    await expect(card90).toContainText("5件");
    await expect(card90).toContainText("中央値 ¥150,000");
    await expect(card90).toContainText("出品(参考) 1件");
    await expect(page.getByText("別仕様のデータ 1件は除外")).toBeVisible();
  });

  test("判定: 前提未確認なら HOLD（BUYを出さない）", async ({ page }) => {
    await login(page);
    await page.goto(`/profit?variant=${V}&country=US&currency=USD&price=500&src=STORE_OBSERVED&taxRate=0.08875&taxOk=1&platform=SNKRDUNK`);
    await expect(page.getByText("HOLD", { exact: true })).toBeVisible();
    await expect(page.getByText("関税率が未確認です")).toBeVisible();
    await expect(page.getByText("販売手数料率が未確認です")).toBeVisible();
    await expect(page.getByText("経費プロファイル").first()).toBeVisible();
  });

  test("簡易課税で、みなし仕入率が未確認なら HOLD（輸入消費税を控除扱いしない）", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    const dec = page.locator("form", { has: page.locator('select[name="businessTaxStatus"]') });
    await dec.locator('select[name="businessTaxStatus"]').selectOption("SIMPLIFIED");
    await dec.getByRole("button").click();
    await page.goto(`/profit?variant=${V}&country=US&currency=USD&price=500&src=STORE_OBSERVED&taxRate=0.08875&taxOk=1&platform=SNKRDUNK`);
    await expect(page.getByText("簡易課税のみなし仕入率が未確認です")).toBeVisible();
  });

  test("設定: 関税率(テスト値)・手数料・経費・課税区分を確定", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    const tax = page.locator("form", { has: page.locator('input[name="key"]') });
    await tax.locator('input[name="key"]').fill("CUSTOMS_DUTY_RATE:7113.11");
    await tax.locator('input[name="value"]').fill("0.05");
    await tax.locator('input[name="evidenceUrl"]').fill("https://tariff.test.invalid/71");
    await tax.getByRole("button").click();
    await expect(page.locator("tr", { hasText: "CUSTOMS_DUTY_RATE:7113.11" }).first()).toContainText("0.05");

    const fee = page.locator("form", { has: page.locator('input[name="feeRate"]') });
    await fee.locator('input[name="feeRate"]').fill("0.1");
    await fee.locator('input[name="evidenceUrl"]').fill("https://fee.test.invalid/");
    await fee.getByRole("button").click();
    await expect(page.locator("tr", { hasText: "SNKRDUNK" })).toContainText("v2");

    const exp = page.locator("form", { has: page.locator('input[name="cardFeeRate"]') });
    await exp.locator('input[name="cardFeeRate"]').fill("0.02");
    await exp.locator('input[name="confirmed"]').check();
    await exp.getByRole("button").click();
    await expect(page.getByText("本人確認済").first()).toBeVisible();

    const dec = page.locator("form", { has: page.locator('select[name="businessTaxStatus"]') });
    await dec.locator('select[name="businessTaxStatus"]').selectOption("EXEMPT");
    await dec.getByRole("button").click();
    await noHorizontalOverflow(page);
  });

  test("撮影後の商品詳細: 推定HSのままでは HOLD（関税率を確定扱いしない）", async ({ page }) => {
    await login(page);
    await page.goto(`/products/ch-paper-chain-necklace?variant=${V}`);
    const sum = page.getByTestId("profit-summary");
    await expect(sum.getByText("HOLD", { exact: true })).toBeVisible();
    // 米国の正規価格が自動で使われる
    await expect(sum).toContainText("USD 500.00");
    await expect(sum).toContainText("登録済みの海外正規価格");
    await expect(sum).toContainText("関税率が未確認です");
  });

  test("買付計画: 購入国と原産国を区別し、HSを根拠付きで確定 → 商品詳細で BUY と概算利益", async ({ page }) => {
    await login(page);
    await page.goto(`/products/ch-paper-chain-necklace?variant=${V}`);
    const f = page.getByTestId("plan-form");
    await f.locator('input[name="localPrice"]').fill("500");
    await f.locator('select[name="priceSource"]').selectOption("STORE_OBSERVED");
    await f.locator('input[name="localTaxRate"]').fill("0.08875");
    await f.locator('input[name="originCountry"]').fill("IT");
    await f.locator('select[name="originCertainty"]').selectOption("ESTIMATED");
    await f.locator('input[name="hsCode"]').fill("7113.11");
    await f.locator('select[name="hsCertainty"]').selectOption("CONFIRMED");
    await f.locator('input[name="hsEvidenceUrl"]').fill("https://tariff.test.invalid/7113");
    await f.getByRole("button", { name: "買付条件を保存" }).click();
    const sum = page.getByTestId("profit-summary");
    await expect(sum.getByText("BUY", { exact: true })).toBeVisible();
    await expect(sum).toContainText("US / IT");
    await expect(sum).toContainText("購入国（US）と原産国（IT）は異なります");
    await expect(sum).toContainText("一般税率");
    await expect(sum).toContainText("5.00%");
    await expect(sum).toContainText("手残り（消費税精算後）");
    await expect(sum).toContainText("最大仕入許容価格");
    await expect(sum.getByText("確定").first()).toBeVisible();
    await expect(sum.getByText("推定").first()).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: "test-results/iphone-product-summary.png", fullPage: false });
    await page.screenshot({ path: "test-results/iphone-product-summary-full.png", fullPage: true });
  });

  test("判定: 条件充足で BUY、高値仕入で PASS", async ({ page }) => {
    await login(page);
    await page.goto(`/profit?variant=${V}&country=US&currency=USD&price=500&src=STORE_OBSERVED&taxRate=0.08875&taxOk=1&platform=SNKRDUNK`);
    await expect(page.getByText("BUY", { exact: true })).toBeVisible();
    await expect(page.getByText("最大仕入許容価格")).toBeVisible();
    // 出品価格 400,000 円は売却見込に使われない（楽観 = P75 = 155,000）
    await expect(page.locator(".card", { hasText: "楽観" })).toContainText("¥155,000");
    await noHorizontalOverflow(page);
    await page.screenshot({ path: "test-results/iphone-profit-buy.png", fullPage: true });

    await page.goto(`/profit?variant=${V}&country=US&currency=USD&price=1500&src=STORE_OBSERVED&taxRate=0.08875&taxOk=1&platform=SNKRDUNK`);
    await expect(page.getByText("PASS", { exact: true })).toBeVisible();
    await expect(page.getByText("確認できた最高成約価格で売れても赤字です")).toBeVisible();

    await page.goto(`/profit?variant=${V}&country=US&currency=USD&price=500&src=STORE_OBSERVED&taxRate=0.08875&taxOk=1&platform=SNKRDUNK`);
    await page.getByRole("button", { name: "この判定を履歴に保存" }).click();
    await expect(page.getByText("判定を保存しました")).toBeVisible();
  });

  test("比較・学習・エクスポート", async ({ page }) => {
    await login(page);
    await page.goto(`/compare?variant=${V}`);
    await expect(page.getByText("仕入国の比較")).toBeVisible();
    await expect(page.locator("tr", { hasText: "US" }).first()).toBeVisible();
    await noHorizontalOverflow(page);

    await page.goto("/learn?day=1");
    await page.locator("ul li button").first().click();
    await expect(page.getByRole("button", { name: "次へ" })).toBeVisible();

    const res = await page.request.get("/api/export?table=all");
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.tables.market_observations.length).toBe(7);
    expect(j.tables.retail_prices[0].evidence_id).toBeTruthy();
    expect(j.tables.buying_scenarios.length).toBe(1);
  });
});
