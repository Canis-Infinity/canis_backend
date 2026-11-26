// Disposable UI testing database. Never reads or changes the deployed database.
if (process.env.SELF_E2E !== '1') throw new Error('SELF_E2E=1 is required');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_CONNECT = mongo.getUri('self_e2e');
  process.env.LOG_LEVEL = 'error';
  process.env.PASSWORD_HASH = 'isolated-self-e2e';
  const createApp = require('../src/app');
  const { SelfUser, ensureIndexes } = require('../src/self/models');
  await mongoose.connect(process.env.MONGODB_CONNECT);
  await ensureIndexes();
  await SelfUser.create({
    name: '測試使用者',
    email: 'self@example.test',
    passwordHash: await bcrypt.hash('self-e2e-password', 12),
  });
  const server = createApp().listen(17447, '127.0.0.1', () =>
    console.log('Disposable Self QA API listening on 17447'),
  );
  async function stop() {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
