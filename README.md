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

Compose 預設 CORS 已包含 `link.canis.world` 與 `dashboard.canis.world`。只有網域不同時才設定 `CORS_ORIGINS_OVERRIDE`。

聯絡表單會先寫入 MongoDB，再透過 Resend API 寄送管理員通知。請在 backend 的 `.env` 設定：

```bash
RESEND_API_KEY=re_xxxxx
CONTACT_FROM_EMAIL="Canis Den <contact@canis.world>"
CONTACT_TO_EMAIL=admin@canis.world
```

`CONTACT_FROM_EMAIL` 的網域必須先在 Resend 驗證。Resend 金鑰只放 backend，不要放在 canis-den 的公開環境變數。未設定 Resend 時聯絡資料仍會保存，`emailDelivery.status` 會記為 `skipped`。

Dashboard 上傳的頭像會保存至 `public/uploads/profile`，Docker compose 已將整個 `public` 目錄掛載到主機，因此重建 container 不會遺失圖片。

MongoDB / 可選 MySQL 建置方式請看 [docs/database.md](./docs/database.md)。

Linux Server 預設與參考專案相同使用 host network：

```bash
MONGODB_CONNECT="mongodb://127.0.0.1:27017/canis_world"
```

Docker Desktop 本機需要在 `.env` 加上 `BACKEND_NETWORK_MODE=bridge` 與 `MONGODB_CONNECT_OVERRIDE="mongodb://host.docker.internal:27017/canis_world"`。兩個環境啟動指令相同；若 MongoDB 在另一台機器，也使用 `MONGODB_CONNECT_OVERRIDE` 指定。

## 後台帳號

後台帳號密碼存放在 MongoDB 的 `users` collection，密碼會用 bcrypt hash，不會以明文存在 `.env`。

第一次建立管理員請使用一次性 CLI：

```bash
npm run create-admin
```

從 Windows 主機直接執行時，腳本會把 `host.docker.internal` 轉為 `127.0.0.1`；在 container 內則使用 Compose 提供的連線位址。

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

`/healthz` 是程序存活檢查；`/readyz` 只有在 MongoDB 已連線時才回傳 200。初次連線失敗時 backend 會每 5 秒自動重試。

## 驗證

```bash
npm test
```
