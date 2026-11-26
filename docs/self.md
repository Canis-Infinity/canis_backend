# Self 私人狀態紀錄 API

前端位於同層 `self`，完整部署與使用說明見 `../self/README.md`（由 workspace 根目錄計）。

- 路徑 `/api/self`，資料使用既有 MongoDB 的 `self_*` collections。
- `npm run create-self-user` 互動建立／重設帳號，不開放註冊。
- `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`。
- `GET /entries?page=1&kind=mood&from=ISO&to=ISO`：每頁 100 筆、回傳 total/pages。
- `POST /entries`、`PUT /entries/:id`、`DELETE /entries/:id`；更新／刪除需傳 `version`。
- 支援 mood、sleep、body、medication、reflection、appointment，欄位定義見 `src/self/validation.js`。
- `POST /images`：multipart 的 file 欄位，一次一張、5 MB 上限、JPEG/PNG/WebP；檢查 MIME 與檔頭。
- `GET /images/:id`：需要擁有者 session，不提供公開圖片連結。
- 寫入需 `X-Self-Request: 1`；JSON 或 multipart。瀏覽器透過 Next 同源代理。
- 登入 session 與持久 cookie 統一有效 7 天，與 debt／thrift 相同；「記住帳號」僅在瀏覽器保留電子郵件，不影響登入期限。以 token hash 儲存，HttpOnly / SameSite=Strict；HTTPS 透過代理轉送時設 Secure。
- 用藥資料為 `period`（morning/noon/evening/bedtime）、`status`（taken/skipped）、`reaction`。回診為 `session`（morning/afternoon/evening）、`number`、`questions`。舊藥名、用量與院所資訊可保留供既有紀錄相容，新增表單不使用。
- 索引在第一次請求及建立帳號時初始化，刪除 session 後立即失效。

Docker：`docker exec -it backend_canis_world npm run create-self-user`。

測試：`node node_modules/vitest/vitest.mjs run tests/self.test.js`，使用 MongoMemoryServer，不存取正式資料。
