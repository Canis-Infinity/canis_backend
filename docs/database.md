# Canis World Database

這份 backend 已改成只需要 MongoDB。`canis-den` 前台與 `dashboard` 後台共用同一個 backend API，也共用同一個 MongoDB database。

## 建議設定

- 本機 database：`canis_world`
- Server database：`canis_world`
- 可以和 `iistw` 共用同一個 MongoDB 服務，但建議用不同 database name，避免資料混在一起。
- Backend 在 Linux Server 預設與參考專案相同使用 host network 與 `127.0.0.1`。
- 如果你不透過 Docker、直接在主機跑 `npm start`，可改用：`MONGODB_CONNECT="mongodb://127.0.0.1:27017/canis_world"`

## MongoDB Collections

MongoDB 不需要先手動建表，Mongoose 第一次寫入時會自動建立 collection 與 index。

這份 backend 會用到：

- `users`
- `contacts`
- `profiles`
- `visithistories`
- `eventlogs`

## 本機建立 MongoDB

如果本機已有 MongoDB：

```bash
mongosh
```

```javascript
use canis_world

db.createCollection("users")
db.createCollection("contacts")
db.createCollection("profiles")
db.createCollection("visithistories")
db.createCollection("eventlogs")

db.users.createIndex({ username: 1 })
db.contacts.createIndex({ status: 1, createdAt: -1 })
db.contacts.createIndex({ createdAt: -1 })
db.contacts.createIndex({ category: 1, createdAt: -1 })
db.profiles.createIndex({ key: 1 }, { unique: true })
db.visithistories.createIndex({ ipAddress: 1 })
db.visithistories.createIndex({ time: -1 })
db.eventlogs.createIndex({ createdAt: -1 })
```

如果本機沒有 MongoDB，也可以用 Docker 開一個：

```bash
docker run -d --name mongo_canis_world -p 27017:27017 -v mongo_canis_world:/data/db mongo:7
```

然後 backend `.env` 設：

```bash
MONGODB_CONNECT="mongodb://127.0.0.1:27017/canis_world"
CANIS_BACKEND_NETWORK_MODE=bridge
```

## Server 建立 MongoDB

在 Server 已安裝 MongoDB 的情況：

```bash
mongosh
```

```javascript
use canis_world

db.createCollection("users")
db.createCollection("contacts")
db.createCollection("profiles")
db.createCollection("visithistories")
db.createCollection("eventlogs")

db.users.createIndex({ username: 1 })
db.contacts.createIndex({ status: 1, createdAt: -1 })
db.contacts.createIndex({ createdAt: -1 })
db.contacts.createIndex({ category: 1, createdAt: -1 })
db.profiles.createIndex({ key: 1 }, { unique: true })
db.visithistories.createIndex({ ipAddress: 1 })
db.visithistories.createIndex({ time: -1 })
db.eventlogs.createIndex({ createdAt: -1 })
```

Server backend `.env`：

```bash
PORT=7344
MONGODB_CONNECT="mongodb://127.0.0.1:27017/canis_world"
PASSWORD_HASH="請換成正式 JWT secret"
ALLOW_REGISTRATION=false
CORS_ORIGINS=https://你的前台網域,https://你的後台網域,http://localhost:7342,http://localhost:7343
```

Linux Server 不設定 `CANIS_BACKEND_NETWORK_MODE`，Compose 便會使用與參考 backend 一致的 host network。舊的 `BACKEND_NETWORK_MODE` 與 `MONGODB_CONNECT_OVERRIDE` 即使仍在 `.env` 也不會生效。Docker Desktop 本機設定 `CANIS_BACKEND_NETWORK_MODE=bridge`，backend 會在 `127.0.0.1` 失敗後自動改試 `host.docker.internal`。

## 建第一個後台帳號

後台帳號密碼存在 MongoDB 的 `users` collection，密碼會以 bcrypt hash 儲存。

建議用 CLI 建立第一個管理員：

```bash
npm run create-admin
```

腳本從 Windows 主機執行時，會自動將 `.env` 裡的
`host.docker.internal` 改連 `127.0.0.1`。也可以在容器內執行：

```powershell
docker exec -it backend_canis_world npm run create-admin
```

也可以用參數建立或更新帳號，密碼會另外提示輸入：

```bash
npm run create-admin -- --username=canis22788 --email=admin@canis.world --lastName=Canis --firstName=Admin --mobile=0900000000
```

要連其他 MongoDB 時可傳入 `--mongo-uri=mongodb://...`；密碼請保留為互動輸入，不要寫在命令參數中。

如果你臨時打開 `.env` 的 `ALLOW_REGISTRATION=true`，才可用 `/api/user/register` 手動建立：

```bash
curl -X POST http://localhost:7344/api/user/register \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"canisadmin\",\"email\":\"admin@example.com\",\"password\":\"請換成強密碼\",\"lastName\":\"Canis\",\"firstName\":\"Admin\",\"mobile\":\"0900000000\"}"
```

之後用 dashboard `/login` 登入。

## MySQL

目前 canis-world backend 不需要 MySQL，也不需要建立任何 SQL table。
