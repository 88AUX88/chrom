# デプロイ・運用・バックアップ

> 外部サービスの契約・有料プランは **ユーザー承認後** に行う。本 MVP はまだどこにも公開していない。

## 推奨構成（要承認・料金は契約前に公式ページで再確認）
| 案 | 構成 | 目安 | 注意 |
|---|---|---|---|
| A（推奨） | Vercel Pro + Supabase Free（Postgres） | 約 $20/月 | Vercel Hobby は非商用条件のため事業利用は Pro。Supabase Free は無操作で一時停止あり |
| B（最安） | 小型 VPS/コンテナ 1台（Render/Fly 等）+ PGlite を永続ディスクに | 約 $5〜10/月 | バックアップを自分で取る必要。単一インスタンス |
いずれも初期1万円の暫定上限内。料金は開発時点でネットワーク制限により公式ページ未確認。

## 手順（案A）
1. GitHub に push（このセッションでは GitHub 未連携のため未実施）
2. Supabase でプロジェクト作成 → Connection string（Transaction pooler）を取得
3. ローカルで `DATABASE_URL=... npm run db:migrate`（初回シードはアプリ初回アクセス時に自動）
4. Vercel にインポート → 環境変数 `APP_PASSWORD` `SESSION_SECRET`（`openssl rand -hex 32`）`DATABASE_URL`（任意で `ANTHROPIC_API_KEY` `IDENTIFY_DAILY_LIMIT`）
5. iPhone の Safari で開き「共有 → ホーム画面に追加」（PWA）

## スキーマ変更
`src/db/schema.ts` 編集 → `npm run db:generate` → コミット → 本番で `npm run db:migrate`。

## バックアップ
- アプリ: 履歴画面「全データ JSON」（/api/export?table=all）を定期保存。各表は CSV でも出力可（数式インジェクション対策済み）
- Supabase: 管理画面のバックアップ / `pg_dump "$DATABASE_URL" > backup.sql`
- PGlite（案B）: `.data/pglite` ディレクトリをサーバー停止中にコピー
- 復元: CSV テンプレート形式で再取込、または pg_restore

## 価格データの更新（安全な方法）
新しい観測を CSV で追加取込（上書きしない）。古いデータは自動で STALE 表示。為替は設定画面または fx_rates CSV。

## 監視
MVP ではサーバーログ（Vercel Logs）のみ。エラー監視サービスは未導入（Phase 4）。

## iPhone（Claude Code クラウド版）からの開発継続
- リポジトリ: https://github.com/88AUX88/chrom（ブランチ chrome-hearts）
- クラウド環境「chrom」: セッション開始時に `npm ci` を自動実行（setup script）。新しいセッションはこの環境を選んで開始する
- 動作確認: セッション内で `.env.local` に APP_PASSWORD / SESSION_SECRET を作成（コミットしない）→ `npm run build && npm start` → アプリのプレビューで確認
- セッション内の DB（PGlite, `.data/`）はコンテナと共に消える。残すべきデータは /api/export で保存するか本番 DB を使う
- Vercel 等の本番環境では PGlite のファイルは永続化されないため、DATABASE_URL（Supabase 等）が必須
