# Canis Den Backend

Canis Den / Dashboard 共用 API，沿用 `iistw.com/backend` 的 Express、Mongo/Mongoose、JWT、Vitest 技術棧。這份 canis-world backend 已改成只需要 MongoDB。

## Port

- Backend API: `7344`
- Container: `backend_canis_world`
- Frontend: `7342`
- Dashboard: `7343`

## 環境變數

先複製範例後填入正式 MongoDB 與 JWT secret：

```bash
cp .env.example .env
```

`CORS_ORIGINS` 需要包含 canis-den 前台與 dashboard 後台的公開網址。

聯絡表單會先寫入 MongoDB，再透過 Resend API 寄送管理員通知。請在 backend 的 `.env` 設定：

```bash
RESEND_API_KEY=re_xxxxx
CONTACT_FROM_EMAIL="Canis Den <contact@canis.world>"
CONTACT_TO_EMAIL=admin@canis.world
```

`CONTACT_FROM_EMAIL` 的網域必須先在 Resend 驗證。Resend 金鑰只放 backend，不要放在 canis-den 的公開環境變數。未設定 Resend 時聯絡資料仍會保存，`emailDelivery.status` 會記為 `skipped`。

Dashboard 上傳的頭像會保存至 `public/uploads/profile`，Docker compose 已將整個 `public` 目錄掛載到主機，因此重建 container 不會遺失圖片。

MongoDB / 可選 MySQL 建置方式請看 [docs/database.md](./docs/database.md)。

Docker container 內的 `127.0.0.1` 是 container 自己。這份 compose 會把 `host.docker.internal` 指到目前執行 Docker 的主機，所以 `.env` 預設使用：

```bash
MONGODB_CONNECT="mongodb://host.docker.internal:27017/canis_world"
```

本機跑就連本機 MongoDB，Server 跑就連 Server 的 MongoDB。若 MongoDB 在另一台機器，改成那台機器的連線字串即可。

## 後台帳號

後台帳號密碼存放在 MongoDB 的 `users` collection，密碼會用 bcrypt hash，不會以明文存在 `.env`。

第一次建立管理員請使用一次性 CLI：

```bash
npm run create-admin
```

從 Windows 主機執行時，腳本會自動把 `.env` 中容器專用的
`host.docker.internal` 轉為 `127.0.0.1`；在 Docker 容器內執行時則維持原值。

也可以直接在已啟動的 backend container 內建立：

```powershell
docker exec -it backend_canis_world npm run create-admin
```

也可以用參數建立或更新帳號：

```bash
npm run create-admin -- --username=canis22788 --email=admin@canis.world --lastName=Canis --firstName=Admin --mobile=0900000000
```

若需指定其他 MongoDB，可加上 `--mongo-uri=mongodb://...`。密碼不要放在參數中，讓腳本互動提示輸入，避免留在 shell history。

不建議把 `--password=...` 放在指令中，避免留下 shell history；省略 password 時 script 會提示輸入。

`/api/user/register` 預設關閉。若臨時需要開放 API 註冊，才把 `.env` 設成 `ALLOW_REGISTRATION=true`。

## Docker

```bash
docker compose up -d
```

## 驗證

```bash
npm test
```
