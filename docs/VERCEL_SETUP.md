# iPhone からいつでも使えるようにする手順（Vercel 公開）

このアプリをインターネット上に置き、iPhone の Safari から開けるようにする手順です。
**あなたが行う操作** には ★ を付けています。それ以外は Claude が行います。

## 使うサービス
| サービス | 役割 | 料金の目安（契約前に公式ページで確認） |
|---|---|---|
| GitHub（非公開リポジトリ） | プログラムの保管・毎日のバックアップ | 無料 |
| Vercel | アプリをインターネットに公開（https の URL を発行） | 事業での利用は Pro プラン（1人 月20ドル程度）。無料の Hobby は「個人・非商用」限定 |
| Neon（Vercel から追加できる Postgres データベース） | 価格・購入履歴などのデータを保存 | 無料プランあり（容量 1GB 程度） |

## 手順
### 1. ★ GitHub のリポジトリを非公開にする
1. https://github.com/88AUX88/chrom を開く
2. 上の「Settings」→ いちばん下の「Danger Zone」→「Change repository visibility」→「Make private」
3. 確認画面でリポジトリ名を入力して確定

### 2. ★ Vercel にログインしてプロジェクトを作る
1. https://vercel.com を開き「Continue with GitHub」でログイン
2. （事業で使うため）Pro プランを選ぶ ※料金がかかります
3. 「Add New…」→「Project」→ `88AUX88/chrom` の「Import」
4. まだ「Deploy」は押さない（次の手順で設定を入れてから）

### 3. ★ データベースをつなぐ
1. Vercel のプロジェクト画面 →「Storage」→「Create Database」→「Neon（Postgres）」
2. 地域（Region）は日本に近い場所を選ぶ
3. 作成後「Connect Project」で chrom を選ぶ（`DATABASE_URL` が自動で設定されます）

### 4. ★ ログイン用の設定を入れる
Vercel のプロジェクト →「Settings」→「Environment Variables」で次の2つを追加（Environment は Production にチェック）:
| Name | Value |
|---|---|
| `APP_PASSWORD` | ログイン用のパスワード（長く、他で使っていないもの。iPhone の「パスワードを提案」を使うと安全） |
| `SESSION_SECRET` | 32文字以上の、ランダムな英数字（例: iPhone のパスワード提案を2回つなげたもの） |

この値は **チャットに貼らないでください**（Vercel の画面にだけ入力）。

### 5. ★ 公開する
「Deployments」→「Redeploy」（または最初の「Deploy」）を押す。
数分で `https://〜.vercel.app` の URL が表示されます。この URL を Claude に送ってください（動作確認します）。

### 6. ★ 毎日のバックアップを有効にする
1. GitHub のリポジトリ →「Settings」→「Secrets and variables」→「Actions」→「New repository secret」
2. `BACKUP_DATABASE_URL` … Vercel の Settings → Environment Variables にある `DATABASE_URL` の値をコピー
3. `BACKUP_PASSPHRASE` … バックアップを暗号化する長いパスワード（**別の場所にも必ず控える**。なくすと復元できません）
4. 「Actions」タブ →「daily-db-backup」→「Run workflow」で1回試す（緑のチェックが付けば成功）

以後、毎日 午前3時ごろに自動で保存され、90日間残ります。

## iPhone のホーム画面に追加する
1. iPhone の **Safari** で公開 URL を開いてログイン
2. 画面下の「共有」ボタン（四角から上向き矢印）を押す
3. 「ホーム画面に追加」→ 名前を確認して「追加」
4. ホーム画面のアイコンから、アプリのように開けます（ログインは30日間保持）

## 安全のしくみ（Claude が実装済み）
- すべての画面・データはログインしないと見られない（パスワードを10回まちがえると15分ロック）
- 通信は常に暗号化（https）、検索エンジンには載らない設定
- パスワードや接続文字列はプログラムに書かず、Vercel の設定にだけ保存
- バックアップは暗号化。リポジトリが公開状態だと自動で中止

## データの復元（必要になったとき）
1. GitHub「Actions」→ 実行結果 → 「Artifacts」から `.dump.gpg` をダウンロード
2. `gpg -d lmi-日付.dump.gpg > db.dump`（BACKUP_PASSPHRASE を入力）
3. `pg_restore --no-owner --no-privileges -d "<復元先のDATABASE_URL>" db.dump`
（作業は Claude に依頼できます。アプリの「履歴 → 全データ JSON」でも手動で保存できます）
