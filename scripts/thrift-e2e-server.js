// Test-only server. The database is always ephemeral; never uses application data.
if (process.env.THRIFT_E2E !== '1') throw new Error('THRIFT_E2E=1 is required');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_CONNECT = mongo.getUri('thrift_e2e');
  process.env.LOG_LEVEL = 'error';
  process.env.PASSWORD_HASH = 'isolated-e2e-unused-secret';
  const createApp = require('../src/app');
  const { ThriftUser, ensureThriftIndexes } = require('../src/thrift/models');
  await mongoose.connect(process.env.MONGODB_CONNECT);
  await ensureThriftIndexes();
  await ThriftUser.create({ name: '測試管理員', email: 'admin@thrift.test', passwordHash: await bcrypt.hash('thrift-e2e-only-password', 12), role: 'admin', phone: '0912345678', contact: { platform: 'LINE', account: 'thrift-qa' } });
  const server = createApp().listen(17446, '0.0.0.0', () => console.log('Disposable thrift QA API listening on 17446'));
  async function stop() { server.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(0); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch(e => { console.error(e); process.exit(1); });
