# LUXURY MARKET INTELLIGENCE

海外ブランド買付の判断支援 Web アプリ（iPhone / iPad 向け PWA）。詳細は `CLAUDE.md` と `docs/`。

```bash
npm install
cp .env.example .env.local   # APP_PASSWORD と SESSION_SECRET を設定
npm run dev                  # http://localhost:3000
```

DB 未設定時は `./.data/pglite` に組込み Postgres を作成し、マイグレーションと初期カタログ（価格なし・未検証）を自動投入します。
