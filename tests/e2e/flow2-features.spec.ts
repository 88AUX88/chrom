import { test, expect } from "@playwright/test";
import { V, login, noHorizontalOverflow } from "./helpers";

const d = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

test.describe.serial("iPhone: 追加機能（図鑑・管理・世界相場・シミュレーター・教材）", () => {
  test("図鑑: カテゴリー・素材フィルターと別名検索", async ({ page }) => {
    await login(page);
    await page.goto("/products?category=CHAIN");
    await expect(page.getByText("Paper Chain Necklace")).toBeVisible();
    await expect(page.getByText("Keeper Ring")).toHaveCount(0);
    await page.goto("/products?material=K18_WG&category=RING");
    await expect(page.getByText("Keeper Ring")).toBeVisible();
    await expect(page.getByText("Paper Chain Necklace")).toHaveCount(0); // チェーンは K18WG の選択肢なし
    await page.goto("/products?q=ベビーファット");
    await expect(page.getByText("Baby Fat Cross Charm")).toBeVisible();
    await expect(page.getByText("ID ch-baby-fat-cross-charm").first()).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test("商品追加: 重複を検出して止め、別名の新商品は追加できる（デニム）", async ({ page }) => {
    await login(page);
    await page.goto("/products/new");
    const f = page.getByTestId("product-form");
    await f.locator('input[name="id"]').fill("ch-dup-test");
    await f.locator('input[name="nameEn"]').fill("paper chain NECKLACE");
    await f.locator('input[name="nameJaReading"]').fill("テスト");
    await f.getByRole("button", { name: "商品を追加" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("重複");
    await expect(f.getByRole("link", { name: "ch-paper-chain-necklace" })).toBeVisible();

    await page.goto("/products/new");
    await f.locator('input[name="id"]').fill("ch-e2e-denim");
    await f.locator('input[name="nameEn"]').fill("E2E Test Denim");
    await f.locator('input[name="nameJaReading"]').fill("イーツーイー テスト デニム");
    await f.locator('select[name="category"]').selectOption("DENIM");
    await f.locator('input[name="materials"][value="SILVER_925"]').uncheck();
    await f.locator('input[name="materials"][value="DENIM"]').check();
    await f.locator('input[name="sizes"]').fill("W30, W32");
    // 型番は出典なしでは登録できない
    await f.locator('input[name="officialModelNumber"]').fill("FAKE-123");
    await f.getByRole("button", { name: "商品を追加" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("出典URLが必要");
    await f.locator('input[name="officialModelNumber"]').fill("");
    await f.getByRole("button", { name: "商品を追加" }).click();
    await expect(page).toHaveURL(/\/products\/ch-e2e-denim$/);
    await expect(page.getByRole("heading", { name: "E2E Test Denim" })).toBeVisible();
    await expect(page.getByText("型番未確認").or(page.getByText("未確認（架空の型番は作成しません）"))).toBeVisible();
  });

  test("商品編集: 変更履歴に記録", async ({ page }) => {
    await login(page);
    await page.goto("/products/ch-e2e-denim/edit");
    const f = page.getByTestId("product-form");
    await f.locator('input[name="nameJaReading"]').fill("イーツーイー デニム");
    await f.locator('input[name="reason"]').fill("読みの修正");
    await f.getByRole("button", { name: "変更を保存" }).click();
    await expect(page.getByText("保存しました（変更履歴に記録）")).toBeVisible();
    await page.goto("/products/ch-e2e-denim/edit");
    await expect(page.getByText("読みの修正")).toBeVisible();
    await expect(page.getByText(/nameJaReading: "イーツーイー テスト デニム" → "イーツーイー デニム"/)).toBeVisible();
    const upd = page.locator("li", { hasText: "UPDATE" }).first();
    await expect(upd).toContainText("nameJaReading");
    await expect(upd).not.toContainText("variantOptions"); // 変更していない項目は記録しない
  });

  test("世界相場: 米国eBayの成約を取込→国別に表示、国内判定には混ぜない", async ({ page }) => {
    await login(page);
    await page.goto("/import");
    await page.getByLabel("種類").selectOption("market_observations");
    const csv =
      "variant_id,platform,kind,condition,source_url,source_name,source_type,reliability,observed_at,sold_at,country,currency,price_local,fx_jpy_per_unit\n" +
      `${V},EBAY,REPORTED_SOLD,NEW,https://ebay.test.invalid/1,eBay,MARKETPLACE,REPORTED,${d(1)},${d(2)},US,USD,2000,150\n`;
    await page.getByLabel("CSVファイル").setInputFiles({ name: "us.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "検証して取込" }).click();
    await expect(page.getByTestId("import-result")).toContainText("受理 1 行");

    await page.goto(`/market?variant=${V}`);
    await expect(page.locator("tr", { hasText: "US / EBAY" })).toContainText("¥300,000");
    await expect(page.locator("tr", { hasText: "US / EBAY" })).toContainText("USD 2,000.00");
    await expect(page.locator(".card", { hasText: "成約 30日 / 90日" })).toContainText("5 / 5"); // 日本のみ
    await expect(page.getByText("販売までの日数", { exact: true })).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: "test-results/iphone-market.png", fullPage: true });
    // 国内の成約中央値は変わらない（米国の 300,000 円を混ぜない）
    await page.goto(`/products/ch-paper-chain-necklace?variant=${V}`);
    await expect(page.locator(".card", { hasText: "成約 90日" })).toContainText("中央値 ¥150,000");
  });

  test("買付候補一覧: BUY を上位に表示", async ({ page }) => {
    await login(page);
    await page.goto("/candidates");
    const first = page.locator("main ul > li").first();
    await expect(first).toContainText("Paper Chain Necklace");
    await expect(first.getByText("BUY", { exact: true })).toBeVisible();
    await expect(first).toContainText("流動性");
    await noHorizontalOverflow(page);
    await page.screenshot({ path: "test-results/iphone-candidates.png", fullPage: true });
  });

  test("利益シミュレーター: 経費の上書き・シナリオ切替・仮定関税率", async ({ page }) => {
    await login(page);
    const base = `/profit?variant=${V}&country=US&currency=USD&price=500&src=STORE_OBSERVED&taxRate=0.08875&platform=SNKRDUNK`;
    await page.goto(base);
    const std = async () => (await page.locator(".card", { hasText: "標準" }).locator("p.text-2xl").first().innerText());
    const before = await std();
    await page.goto(`${base}&ov_travelAllocationJpy=20000&ovc=1`);
    const after = await std();
    const num = (s: string) => Number(s.replace(/[^\d-]/g, ""));
    expect(num(before) - num(after)).toBe(20000);
    await expect(page.getByText("売却後受取額（手数料控除後）")).toBeVisible();
    await expect(page.getByText("輸入後原価 = 資金拘束額")).toBeVisible();
    await page.getByRole("tab", { name: "保守" }).click();
    await expect(page.getByText("内訳（保守シナリオ）")).toBeVisible();

    // 22K（HS 7113.19, 税率未入力）: 仮定関税率で計算はできるが HOLD
    await page.goto(`/products/ch-paper-chain-necklace`);
    await page.getByLabel("22K イエローゴールド").check();
    await page.getByRole("combobox").selectOption("20inch");
    await page.getByRole("button", { name: "この仕様で確定" }).click();
    await expect(page).toHaveURL(/variant=ch-paper-chain-necklace-k22yg-nostone-20inch/);
    await page.goto(`/profit?variant=ch-paper-chain-necklace-k22yg-nostone-20inch&country=US&currency=USD&price=5000&src=STORE_OBSERVED&manual=1500000&dutyAssume=0.05`);
    await expect(page.getByText("（仮定値）")).toBeVisible();
    await expect(page.getByText("HOLD", { exact: true })).toBeVisible();
    await expect(page.getByText("関税率は仮定値 0.05 で計算（未確認）")).toBeVisible();
  });

  test("入力エラーは画面に理由を表示（本番ビルド）", async ({ page }) => {
    await login(page);
    await page.goto(`/products/ch-paper-chain-necklace?variant=${V}`);
    const f = page.getByTestId("plan-form");
    // 形式エラーはブラウザ側で送信前に止まる
    await f.locator('input[name="hsCode"]').fill("abc");
    await f.getByRole("button", { name: "買付条件を保存" }).click();
    expect(await f.locator('input[name="hsCode"]').evaluate((el: HTMLInputElement) => el.validity.patternMismatch)).toBe(true);
    // 組合せの規則（確定には根拠が必要）はサーバーで検証し、理由を表示
    await f.locator('input[name="hsCode"]').fill("7113.11");
    await f.locator('select[name="hsCertainty"]').selectOption("CONFIRMED");
    await f.locator('input[name="hsEvidenceUrl"]').fill("");
    await f.getByRole("button", { name: "買付条件を保存" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("根拠URLが必要");
  });

  test("教材: 図鑑で答えを表示、自分で撮影した写真から写真クイズが作られる", async ({ page }) => {
    await login(page);
    await page.goto("/learn/zukan?category=CHAIN");
    await page.getByText("答えを見る").first().click();
    await expect(page.locator("details[open]").first()).toContainText("Chain");

    await page.goto("/products/ch-roll-chain-necklace");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await page.locator('input[type="file"]').last().setInputFiles({ name: "own.png", mimeType: "image/png", buffer: png });
    await page.getByLabel("自分で撮影した画像です（権利不明な画像は登録しない）").check();
    await page.getByRole("button", { name: "参照画像を登録" }).click();
    await expect(page.getByAltText("Roll Chain Necklace").first()).toBeVisible();

    await page.goto("/learn?day=7");
    const img = page.getByAltText("出題の商品写真（自分で撮影）");
    await expect(img).toBeVisible();
    const box = page.locator(".card", { has: img });
    await box.getByRole("button", { name: "ロールチェーン ネックレス" }).click();
    await expect(box.getByText("Roll Chain Necklace（ロールチェーン ネックレス）")).toBeVisible();
    await page.screenshot({ path: "test-results/iphone-photo-quiz.png" });
  });

  test("誤データの取り消し: 成約が集計から外れ、履歴に残る", async ({ page }) => {
    await login(page);
    await page.goto(`/products/ch-paper-chain-necklace?variant=${V}`);
    const row = page.locator("tr", { hasText: "¥160,000" }).first();
    await row.getByText("取り消し").click();
    await row.getByLabel("取り消し理由").fill("別仕様の誤登録");
    await row.getByRole("button", { name: "確定" }).click();
    await expect(page.locator(".card", { hasText: "成約 90日" })).toContainText("4件");
    const res = await page.request.get("/api/export?table=market_observations&format=json");
    const rows = (await res.json()) as { retract_reason: string | null }[];
    expect(rows.filter((r) => r.retract_reason === "別仕様の誤登録")).toHaveLength(1);
  });
});
