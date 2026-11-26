const mongoose = require('mongoose');
const env = require('../src/config/env');
const { resolveMongoUri } = require('./create-thrift-admin');
const migrateMoods = require('../src/self/migrate-moods');
const { SelfEntry } = require('../src/self/models');
async function main() {
  if (!env.mongoUri) throw new Error('請設定 MONGODB_CONNECT');
  await mongoose.connect(resolveMongoUri(env.mongoUri), {
    serverSelectionTimeoutMS: 5000,
  });
  const result = await migrateMoods();
  console.log(`已將 ${result.modifiedCount} 筆舊心情紀錄轉為十分制。`);
  const remaining = await SelfEntry.countDocuments({
    kind: 'mood',
    'data.scale': { $ne: 10 },
  });
  console.log(`剩餘未轉換心情紀錄：${remaining} 筆。`);
  if (remaining) throw new Error('尚有非標準舊分數，請檢查後再處理。');
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
