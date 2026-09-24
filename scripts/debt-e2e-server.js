// Disposable integration environment. Never connects to the configured application DB.
if (process.env.DEBT_E2E !== '1') throw new Error('DEBT_E2E=1 is required');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_CONNECT = mongo.getUri('debt_e2e');
  process.env.LOG_LEVEL = 'error';
  process.env.PASSWORD_HASH = 'isolated-e2e-unused-legacy-secret';
  const createApp = require('../src/app');
  const { DebtUser, ensureDebtIndexes } = require('../src/debt/models');
  await mongoose.connect(process.env.MONGODB_CONNECT);
  await ensureDebtIndexes();
  const passwordHash = await bcrypt.hash('debt-e2e-only-password', 12);
  await DebtUser.create([
    { name: '測試管理員', email: 'admin@debt.test', passwordHash, role: 'admin', status: 'approved' },
    { name: '測試使用者', email: 'user@debt.test', passwordHash, status: 'approved' },
  ]);
  const server = createApp().listen(17444, '0.0.0.0', () => console.log('Disposable debt QA API listening on 17444'));
  async function stop() { server.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(0); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch((error) => { console.error(error); process.exit(1); });
