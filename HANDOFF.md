# HANDOFF — クロムハーツ買付判断システム（Codex への引き継ぎ）

最終更新: 2026-11-19 / リポジトリ: https://github.com/88AUX88/chrom / 既定ブランチ: **chrome-hearts**
※ パスワード・秘密鍵・接続文字列はこの文書にもリポジトリにも含めていない（`.env.local` は Git 管理外）。

## 1. 何のシステムか
海外ブランド（初期: Chrome Hearts の小型ジュエリー）を撮影→商品と仕様を特定→海外正規価格・国内成約相場・輸入費用から
**根拠付きで BUY / HOLD / PASS** を判断する、単一利用者向け Web アプリ（PWA・日本語 UI）。利益を保証するものではない。
利用者はプログラミング初心者。説明は日本語・短く・1操作ずつ。

## 2. 技術構成
Next.js 15（App Router・Server Actions）/ TypeScript / Tailwind v4 / Drizzle ORM / Postgres（本番想定: Vercel + Neon、ローカル: PGlite 組込み）/
decimal.js / zod / Vitest / Playwright。画像からの商品候補は Anthropic API（任意・未設定）。

主なファイル:
- `src/lib/profit/` 利益計算（関税・輸入消費税・税区分・逆算）`src/lib/market/` 相場・流動性 `src/lib/decide/` 判定
- `src/lib/analysis.ts` DB→計算の結線 `src/lib/data.ts` クエリ `src/lib/import/` CSV 検証・取込
- `src/app/` 画面と `actions.ts`（全アクションで認証確認）`src/db/` スキーマ・初期データ・接続 `drizzle/` マイグレーション
- `scripts/` migrate（＋初期データ）・doctor（設定点検）・set-password（パスワード再設定）
- `.claude/agents/` 専門サブエージェント 10 体（Claude Code 用）
- 詳細仕様: `CLAUDE.md`（絶対ルール）、`docs/CALCULATIONS.md`、`docs/DATA_RULES.md`、`docs/BUILD_STATUS.md`、`docs/VERCEL_SETUP.md`、`docs/USAGE.md`
- 画面写真: `docs/screenshots/`（金額は自動テスト用の仮データ）

## 3. 絶対に守る仕様（コードとテストで担保済み）
- ASK（出品）と SOLD（成約）を混ぜない。出品価格を売却見込に使わない。成約日のない成約は使わない
- 素材・石・サイズが違う仕様のデータを混ぜない。海外の二次流通を国内判定に混ぜない
- 関税率・HS・手数料・経費・現地税率・仕入価格の根拠・為替の鮮度・成約件数が未確認なら BUY を出さない（HOLD）
- 根拠のない数値（価格・税率・手数料・型番）を作らない。不明は「未確認」表示
- 金額は Decimal。関税・輸入消費税は課税標準 1,000 円未満切捨／税額 100 円未満切捨／地方消費税＝国税×22/78
- 原則課税だけ輸入消費税を控除。簡易課税・免税は原価に含める。精算後の手残り＝税引前利益（テストで検証）
- 関税は原産国で決める（購入国と別）。EPA は原産国確定＋原産性証明＋税率確認時のみ
- データは削除せず「取り消し」＋変更履歴。外部の課金・公開・実購入はユーザー承認が必要

## 4. 完成している部分（テスト済み）
- ログイン（パスワード＋署名 Cookie、10回失敗で15分ロック、全画面・API を保護）
- 撮影画面（写真の縮小・表示。AI 候補は API キー設定時のみ）、手動検索
- 商品図鑑（検索・カテゴリー/素材/確認状態の絞り込み・追加・編集・変更履歴・重複検出）
- 商品詳細: 仕様の確定 → BUY/HOLD/PASS と3シナリオ利益・全内訳・確定/推定/未確認の表示・出典
- 買付計画（購入国・原産国・HS・現地価格・売却予定）、利益シミュレーター（経費の上書き・仮定関税率・シナリオ切替）
- 買付候補一覧、世界相場と売れやすさ（成約件数・販売日数・在庫月数・換金性、データ未取得と0件を区別）
- 学習（7日間・4択クイズ・写真クイズ・図鑑・苦手の再出題）、履歴（判定・購入・販売・予想との誤差）
- CSV 取込（検証・隔離・出典必須）、CSV/JSON 書き出し、設定（判定基準・経費・税前提・手数料・為替、版管理）
- 毎日の暗号化バックアップ（`.github/workflows/db-backup.yml`、非公開リポジトリでのみ実行）
- iPhone/iPad/PC 表示、ホーム画面用アイコン、画面・ボタン・教材・エラーは日本語
- テスト: 単体 91 件・画面テスト 27 件（iPhone/iPad/PC）合格。PGlite と本物の Postgres の両方で確認

## 5. 未完成の部分・要対応
| 項目 | 状態 / 必要な対応 |
|---|---|
| 実データ（米国定価・国内成約・買取価格） | **0 件**。Gemini 調査・旧版データが未提供（共有リンクはこの環境から取得不可） |
| 商品カタログ | 20 商品すべて「未検証」（AI の一般知識由来・型番なし）。公式情報で確認が必要 |
| 関税率・販売手数料・経費・課税区分 | 未確認（設定画面で本人が確認・入力） |
| 本番公開（Vercel） | 未実施。ユーザーは Pro プランで公開を選択済み。手順は `docs/VERCEL_SETUP.md`（契約・環境変数はユーザー操作） |
| リポジトリの公開設定 | 現在 **public**。非公開化はユーザー操作（バックアップは非公開でないと実行しない） |
| バックアップ用 Secrets | 未登録（`BACKUP_DATABASE_URL`、`BACKUP_PASSPHRASE`） |
| 実機 iPhone での確認 | 未実施（画面幅のエミュレーションのみ） |
| 画像認識 API | 未設定（費用承認待ち） |
| 関税額 1,000 円未満の扱い | 法令の一次資料で要確認（現状は原価を多めに見る安全側） |
| 添付 ZIP（profit-engine.ts） | 一度も受信できていない |
| 不要ブランチ `main` | 誤って作成。中身は chrome-hearts と同じ。削除はユーザー判断 |
| ユーザーの Windows でのログイン | 未解決。原因の可能性が高いのは PowerShell で作った `.env.local` が UTF-16 形式で読めないこと → `git pull` 後に `npm run set-password` で作り直し、アプリを再起動。`git pull` で失敗しており、エラー内容は未確認（ZIP でダウンロードした可能性あり） |

## 6. 起動方法
### Mac / Windows（初回）
1. Node.js 20 以上を入れる（https://nodejs.org の LTS）
2. ダウンロード: `git clone https://github.com/88AUX88/chrom.git`（Git がなければ GitHub の「Code → Download ZIP」）
3. フォルダで `npm ci`
4. `npm run set-password`（ログイン用パスワードと秘密鍵を作る。入力は表示されない。Windows でも可）
5. `npm run build` → `npm start`
6. ブラウザで http://localhost:3000 を開き、4 のパスワードでログイン
- 点検: `npm run doctor`（値は表示しない）。設定を変えたらアプリを再起動（Ctrl+C → `npm start`）
- データはフォルダ内 `.data/pglite` に保存（消さないこと）

### 本番（Vercel）
`docs/VERCEL_SETUP.md`。`vercel-build` スクリプトがマイグレーション＋初期データ投入→ビルドを行う。環境変数: `APP_PASSWORD`、`SESSION_SECRET`（32文字以上）、`DATABASE_URL`。

### テスト
`npm run check`（lint・型・単体・ビルド）→ `npm run test:e2e`（要ビルド。クラウド環境では `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` を付ける）。
本物の Postgres で試す場合: `E2E_DATABASE_URL=postgres://... npm run test:e2e`（空のデータベースで実行）。

## 7. 次にやるとよいこと（優先順）
1. ユーザーの Windows でログインを成功させる（上の表の最終行）
2. 実データの取込（Gemini 回答・旧版の価格データ → CSV テンプレートで取込）
3. 税・手数料・経費の確認入力、商品カタログの検証
4. Vercel 公開（ユーザーの契約後）、リポジトリ非公開化、バックアップ Secrets 登録、実機 iPhone で確認
