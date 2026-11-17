# アーキテクチャ

## 技術選定（単一利用者 MVP・低コスト・保守性）
| 論点 | 採用 | 比較した案 | 理由 |
|---|---|---|---|
| アプリ | Next.js 15 + TS（Server Components / Server Actions） | SPA + 別API, Remix | 1リポジトリで画面とサーバー処理。秘密情報をサーバーに閉じ込めやすい |
| DB | Postgres（Drizzle ORM）。ローカル/テストは PGlite | SQLite/Turso, Firestore | 指示書の第一候補（Supabase）と同じSQL。PGlite で外部DBなしに開発・テスト可 |
| 金額 | decimal.js | number | 浮動小数点誤差の排除 |
| 画像識別 | カタログ制約付き LLM（Anthropic）＋手動検索 | 画像埋め込み検索(CLIP), 自前学習 | 参照画像（権利のある実物写真）がまだ無く、埋め込み検索は機能しない。LLM はカタログ内 ID しか返せないよう検証 |
| 認証 | 単一パスワード + HMAC 署名 Cookie（middleware で全ページ保護） | Supabase Auth, OAuth | 利用者1名。外部依存なし。未設定時はログイン不可（フェイルクローズ） |
| UI | Tailwind v4・ダークの黒/白/シルバー・下部タブ | UIライブラリ | 依存最小。iPhone 縦・iPad 両対応 |
| PWA | manifest + apple-web-app メタ | Service Worker オフライン | MVP ではオフラインキャッシュ未実装（相場の鮮度保証を優先） |

## データフロー
SCAN（端末で 1024px に縮小）→ `/api/identify`（カタログ外 ID を破棄、最大3候補、ログ保存）→
PRODUCT（人間が素材・石・サイズを選択 → variant 作成）→ PROFIT（`analysis.ts` が DB から価格・成約・為替・前提を集め、
`market/stats` → `profit/engine` × 3 シナリオ → `decide/engine`）→ 保存 → HISTORY（購入・販売実績・誤差）

## テーブル
brands, products, product_variants, product_images, product_aliases, source_evidence, retail_prices,
market_observations, buyback_quotes, fx_rates, fee_rules(版管理), tax_assumptions(版管理), expense_profiles(版管理),
app_settings, buying_scenarios, scan_logs, purchases, sales, learning_cards, import_batches（隔離行を保持）

- product.id は内部 ID（型番ではない）。official_model_number は確認できない限り NULL。
- variant.id は `商品ID-素材-石-サイズ` の決定的 ID（例 `ch-paper-chain-necklace-silver925-nostone-20inch`）。
- retail_prices / market_observations / buyback_quotes の evidence_id は NOT NULL。

## ブランド追加
brands に行を追加し、products/variants を CSV 取込。素材は MATERIALS 列挙、カテゴリは PRODUCT_CATEGORIES を拡張。
関税の HS 区分マッピングは `analysis.ts#dutyKeyFor`（現在 銀→7113.11、その他貴金属→7113.19）を拡張する。
