# 二手商店 API

路徑 `/api/thrift`，前端透過 Next 同源代理存取。沿用 backend 的 `MONGODB_CONNECT`，不需要 replica set。

## 集合及隔離

- `thrift_users`：姓名、信箱、手機、聯繫方式、bcrypt 密碼雜湊、權限、啟停用狀態。
- `thrift_sessions`：雜湊 token、憑證版本、7 天 TTL；cookie 為 `thrift_session`，HttpOnly、SameSite=Strict、HTTPS Secure。
- `thrift_store`：商品、分類、訂單及重複送單紀錄。以版本比較交換進行整筆原子更新，支援單機 MongoDB，失敗不會部分扣庫存。
- `thrift_images`：JPEG／PNG／WebP binary 圖片，每張最多 12MB；與交易文件分離。

交易文件有 12MiB 安全上限，避免接近 MongoDB 16MiB 限制後產生不可預期錯誤。適用個人二手商店；容量增長時須安排封存或遷移，不宣稱為無上限商城架構。圖片、帳號及 session 不占交易文件容量。

## 帳號

```sh
npm run create-thrift-admin
# 容器內
docker compose exec backend npm run create-thrift-admin
```

一般會員註冊立即啟用。管理員可停用、重新啟用或刪除一般會員；管理員本身只能透過伺服器 CLI 管理。修改密碼或管理員重設後既有 session 失效。

## API

- `GET /catalog`：公開上架商品及分類。
- `GET /images/:id`：商品圖片。
- `POST /auth/register|login|logout`、`GET /auth/me`、`PATCH /auth/profile`、`POST /auth/password`。
- `POST /checkout`：訪客／會員下單，body 為 customer、items、note、UUID key。
- `GET /orders`：僅本人會員訂單。
- `GET /order-link/:token`：256-bit 私密連結查詢，僅回傳品項／金額／狀態／時間。
- `GET /admin/data`：管理資料。
- `POST /admin/products|categories|orders`；`PUT|DELETE /admin/products|categories|orders/:id`。
- `PATCH|DELETE /admin/users/:id`。
- `POST /admin/images`：multipart 的 file 欄位，逐張上傳。

所有寫入都需 `X-Thrift-Request: 1`。Next 代理同時驗證 Origin／Host 與 Sec-Fetch-Site。後端可放在內網，不需對外直接暴露。私密訂單 token 在請求紀錄中遮蔽。

## 訂單與庫存

成立扣庫存，取消補回；重新啟用訂單時重新預留。修改既有品項保留原始單價，新加入品項使用目前單價。管理員編輯庫存、分類或訂單均帶 version，避免覆蓋併發操作。

商品軟刪除，訂單保留快照。刪除訂單前須先取消，刪除後保留送單 key 的防重紀錄。會員刪除不刪歷史訂單。沒有自動逾期取消，因保留期限未定。

## 驗證與備份

`npm test` 包含獨立帳號、權限、圖片驗證、併發下單、防重、庫存回復、訂單私密查詢、三層分類及既有專案迴歸測試。

備份既有 MongoDB 時包含上述四個集合即可。正式上線前備份資料。未引用圖片不會立即刪除，需定期依商品 images 引用清理；不要在使用者上傳尚未儲存期間直接清除新圖片。
