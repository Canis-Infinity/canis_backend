# 債務服務

債務 API 掛載於 `/api/debt`，沿用 Express 與 MongoDB 連線，帳號、session、權限及資料均獨立於既有專案。舊 `/api/user` JWT 不能用來存取債務。

## 管理員

執行 `npm run create-debt-admin`，互動輸入名稱、email、密碼。或執行 `docker exec -it backend_canis_world npm run create-debt-admin`。僅寫入 `debt_users`，不建立其他專案帳號。

公開註冊產生 `pending` 一般使用者；管理員可在 debt 前端 `/admin` 核准、拒絕、停用、恢復一般帳號。管理員也只能存取自己的債務。

## API

所有 mutation 必須為 JSON 並包含 `X-Debt-Request: 1`。前端同源 proxy 另驗證 Origin，僅代理債務路徑和債務 cookie，不傳送其他專案的身份資訊。

| 方法 | 路徑（前綴 `/api/debt`） | 用途 |
| --- | --- | --- |
| POST | `/auth/register` | 註冊待核准帳號 |
| POST | `/auth/login` | 核准帳號登入，設定獨立 HttpOnly cookie |
| POST | `/auth/logout` | 撤銷 session |
| GET | `/auth/me` | 目前使用者 |
| GET / POST | `/debts` | 自己的債務列表／新增 |
| PUT / DELETE | `/debts/:id` | 編輯／連同還款刪除 |
| POST | `/debts/:id/repayments` | 新增還款 |
| PUT / DELETE | `/debts/:id/repayments/:repaymentId` | 編輯／刪除還款 |
| GET | `/admin/users` | 管理員檢視帳號 |
| PATCH | `/admin/users/:id` | 管理員修改一般帳號狀態 |

借款欄位：`date`、`amount`、`lender`、`payment`、`note`；還款欄位不含 `lender`。`payment.method` 支援 `bank`、`line_pay_money`、`ipass_money`、`cash`。`bank` 必須含 3 碼 `bankCode` 與 5–20 碼 `bankAccount`，以字串保留前導零。

修改或刪除既有債務／還款須附 `version`，以 API 回傳版本為準。遇到 `409` 重新讀取後再操作；`422` 代表欄位錯誤，可使用回傳 `fields` 顯示。不可透過修改主金額或還款規避餘額檢查。

## 儲存與部署

- 集合：`debt_users`、`debt_sessions`、`debt_records`；還款嵌入債務文件，保證單文件原子性和連帶刪除，不需要 replica set。
- 日期為 `YYYY-MM-DD`，借款和還款都有完整 `createdAt`、`updatedAt` 時間戳。
- 金額為 1–999999999999 的新臺幣整數；單債務上限 5,000 筆還款。
- 獨立 session 為 7 天，僅儲存 token 摘要；登出、帳號停用及管理員重設會撤銷。
- 首次債務請求會建立 email unique、token unique、session TTL、owner/date 索引；失敗回傳錯誤並於下次重試，不影響既有 API。
- 沿用既有 `MONGODB_CONNECT`，不增加 JWT secret。前端 Compose 預設由內網呼叫後端 `7344`，對外網域只需暴露前端。
- 更新 backend 後執行原有 `docker compose up -d --force-recreate` 即可載入新路由。

## 驗證

`npm test` 包含臨時 MongoDB 整合測試：待核准登入、核准／停用、session 撤銷／過期、跨帳號與管理員隔離、zod 驗證、超額還款、並行修改、連帶刪除。第一次會下载測試用 mongod。`scripts/debt-e2e-server.js` 只允許在 `DEBT_E2E=1` 下運行，使用臨時資料庫，提供前端 Playwright 測試。

## 修改密碼

`POST /api/debt/auth/password` 需登入，JSON 欄位為 `currentPassword`、`newPassword`、`confirmPassword`。驗證舊密碼、新密碼長度與確認欄位；成功後增加 credentialVersion 並撤銷全部 session，舊密碼的並行登入也無法重建有效 session。

## 修改帳號名稱

PATCH /api/debt/auth/profile 需登入，以 JSON 的 name 欄位更新自己的名稱；名稱去除前後空白後需為 1 至 80 個字元，其他欄位不接受修改。


## 程式分工

- `src/debt/routes.js`：組裝路由、索引初始化及 middleware。
- `src/debt/routes/`：帳號、債務、管理員 HTTP 路由；負責讀取請求與回傳狀態碼。
- `src/debt/services/`：帳號審核、密碼更新、session 生命週期、債務與借還款規則及資料庫操作。
- `src/debt/middleware.js`：請求檢查、登入與管理員權限、統一錯誤回應。
- `src/debt/config.js`：金額與紀錄上限、密碼成本、session 與登入限流設定。
- `src/debt/utils/`：HTTP 錯誤、版本檢查、cookie 與回應序列化。

調整業務規則應放在 service；路由保留權限 middleware。API 路徑、回應格式、資料集合與樂觀鎖定版本均維持原有契約。
