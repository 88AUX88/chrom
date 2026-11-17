# データ取込・信頼性ルール

## 信頼性区分（source_evidence.reliability）
VERIFIED（一次資料で確認）/ REPORTED（本人・第三者・プラットフォームの報告）/ ESTIMATED（推定）/ UNVERIFIED。
STALE は保存せず、表示時に観測日と設定の有効日数から判定。

## 種類の分離
| データ | テーブル | 区分 |
|---|---|---|
| 正規店価格 | retail_prices | OFFICIAL / RECEIPT / BUYER_REPORT / ESTIMATE / UNKNOWN |
| 国内二次流通 | market_observations | ASK / VERIFIED_SOLD / REPORTED_SOLD / ESTIMATE |
| 買取査定 | buyback_quotes | — |
- 中古店・BUYMA の価格（source_type MARKETPLACE / BUYBACK_SITE）は retail_prices に入れられない。
- 「売り切れ表示」は成約ではない（SOLD_OUT 区分は存在せず、*_SOLD は sold_at 必須）。
- VERIFIED_SOLD は reliability=VERIFIED のときのみ。
- 過去の購入報告は観測日付きで BUYER_REPORT として保存し、現在の定価として扱わない。
- YouTube 出典は video_published_at と video_timestamp 必須。
- 売却率は出品母数のデータがないため「算出不能」と表示。

## CSV 検証（不正行は隔離・推測で補完しない）
UTF-8 厳密復号（Shift_JIS 等はファイルごと拒否）、文字化け検出、必須列・不明列、数値形式（通貨記号不可・桁区切りは可）、
正の数、ISO 日付・未来日、通貨コード、参照整合性（商品/仕様 ID）、ファイル内・既存データとの重複、
出典 URL 必須（店頭確認・本人メモ以外）、example.com 拒否、区分と出典・信頼性の整合、桁誤り疑い（1,000円未満）。

## 取込順
products → variants → retail_prices / market_observations / buyback_quotes / fx_rates。テンプレートは /import。

## データ収集の方法
公式 API・許可されたデータ提供・本人の手動記録・CSV を優先。利用規約で禁止された自動収集、ログイン・アクセス制御の回避は行わない。
自動取得は未実装（各サービスの規約確認後に検討）。

## 画像
自分で撮影した画像のみ保存（OWN_PHOTO）。権利不明の画像はリンクのみ（link_url）とし再配布しない。
