# Self 私人狀態紀錄 API

前端位於同層 `self`，完整部署與使用說明見 `../self/README.md`（由 workspace 根目錄計）。

- 路徑 `/api/self`，資料使用既有 MongoDB 的 `self_*` collections。
- `npm run create-self-user` 互動建立／重設帳號，不開放註冊。
- `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`。
- `GET /entries?page=1&limit=20&kind=mood&from=ISO&to=ISO&q=文字`：limit 1–100，回傳 entries/total/page/pages，刪除最後一頁後自動夾至有效頁碼。kind=journal 排除回診；stats=1 回傳完整篩選範圍的統計、最近 14 筆心情及下次回診，timezone 指定天數計算時區，today 指定下次回診的起始時間。
- `POST /entries`、`PUT /entries/:id`、`DELETE /entries/:id`；更新／刪除需傳 `version`。
- 支援 mood、sleep、body、medication、reflection、diet、appointment，欄位定義見 `src/self/validation.js`。
- `POST /images`：multipart 的 file 欄位，一次一張、5 MB 上限、JPEG/PNG/WebP；檢查 MIME 與檔頭。
- `GET /images/:id`：需要擁有者 session，不提供公開圖片連結。
- 寫入需 `X-Self-Request: 1`；JSON 或 multipart。瀏覽器透過 Next 同源代理。
- 登入 session 與持久 cookie 統一有效 7 天，與 debt／thrift 相同；「記住帳號」僅在瀏覽器保留電子郵件，不影響登入期限。以 token hash 儲存，HttpOnly / SameSite=Strict；HTTPS 透過代理轉送時設 Secure。
- 用藥資料為 `period`（morning/noon/evening/bedtime）、`status`（taken/skipped）、`reaction`。回診為 `session`（morning/afternoon/evening）、`number`、`questions`。舊藥名、用量與院所資訊可保留供既有紀錄相容，新增表單不使用。
- 索引在第一次請求及建立帳號時初始化，刪除 session 後立即失效。

Docker：`docker exec -it backend_canis_world npm run create-self-user`。

測試：`node node_modules/vitest/vitest.mjs run tests/self.test.js`，使用 MongoMemoryServer，不存取正式資料。

## PDF 列印引擎

`POST /api/self/report-pdf` 接收登入使用者的報表 HTML、CSS 與主題（總量最多 2 MB），以 Chromium print media 輸出 PDF。禁用 JavaScript 與所有外部網路，只透過資料庫讀取本人附件。每分鐘最多 5 次、最多兩個並行工作；結束後關閉瀏覽器，不保存報表。

部署：`docker compose up -d --build --force-recreate`。Dockerfile 安裝 Chromium 與 Noto CJK 字型；本機非 Docker 執行需以 `SELF_CHROMIUM_PATH` 指定 Chromium 路徑。

## 心情十分制與飲食紀錄

新心情資料使用 `data.scale=10`，`score` 必須是 1–10 整數。舊的無 scale 資料按五級解讀；執行 `node scripts/migrate-self-moods.js`（Docker：`docker exec backend_canis_world node scripts/migrate-self-moods.js`）將 1/2/3/4/5 轉為 1/3/6/8/10，保留 `legacyScore` 並遞增版本防止舊編輯覆蓋，可安全重跑。日期、文字及附件不變。

飲食使用 `meal`（breakfast/lunch/dinner/snack/drink）、`food`、`appetite`（1–10 整數）；飲料也是餐別，新表單使用 food 記錄內容；舊 drinks 欄位相容保留，支援備註和圖片。

stats=1 同時回傳 appetiteCount 與 appetiteAverage，依符合篩選的 diet 紀錄計算，無飲食紀錄時分別為 0 與 null。
