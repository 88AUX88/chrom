# 使い方（起動・確認）

## Mac での起動
必要: Node.js 20 以上（`node -v` で確認）、Git
```bash
git clone https://github.com/88AUX88/chrom.git
cd chrom
npm ci
cp .env.example .env.local
```
`.env.local` を編集:
- `APP_PASSWORD=` 長く推測しにくいパスワード
- `SESSION_SECRET=` 32文字以上のランダム文字列（`openssl rand -hex 32` の出力）

```bash
npm run build
npm start
```
ブラウザで http://localhost:3000 を開き、パスワードでログイン。
DB は `./.data/pglite` に自動作成（Mac 内のみ。バックアップは「履歴 → 全データ JSON」）。

## ログインできないとき
1. `npm run doctor` … 設定を点検（パスワードの中身は表示しません）
2. `npm run set-password` … パスワードを作り直す（入力は表示されません。元の設定は .env.local.bak に保存）
3. アプリを起動し直す（control+C → `npm start`）。設定ファイルは起動したときにだけ読み込まれます

## iPhone / iPad から確認する条件
- **同じ Wi-Fi** に Mac と iPhone がつながっていること
- Mac 側で `.env.local` に `COOKIE_SECURE=false` を追加し、`npm run build && npm start -- -H 0.0.0.0` で起動
- Mac の IP を確認（システム設定 → Wi-Fi → 詳細 → IP アドレス）→ iPhone の Safari で `http://<IP>:3000`
- macOS のファイアウォールが着信を拒否する場合は「node」への着信を許可
- 会社・ホテル等の Wi-Fi は端末間通信が遮断されていることがあり、その場合は開けません
- 外出先から使うには本番公開（HTTPS・要契約承認）が必要。その場合 `COOKIE_SECURE` は設定しない

## Claude Code クラウド版での確認
セッション内で起動し、アプリの「プレビュー」から確認（セッション終了で停止・データは消える）。

## コマンド
| 目的 | コマンド |
|---|---|
| 開発サーバー | `npm run dev` |
| 全チェック（lint・型・単体・ビルド） | `npm run check` |
| 画面テスト（要ビルド） | `npm run test:e2e`（クラウド環境では `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` を付ける） |
| 本番DBへのマイグレーション | `DATABASE_URL=... npm run db:migrate` |

## 外部サービス
- 必須なし（ローカルで完結）
- 任意: Anthropic API（撮影からの商品候補・従量課金・要承認）、本番公開用ホスティングと Postgres（要承認、docs/DEPLOY.md）
