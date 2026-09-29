const { passwordCost } = require('../src/thrift/config');
const readline = require('readline-sync');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');
const env = require('../src/config/env');
const { ThriftUser, ThriftSession, ensureThriftIndexes } = require('../src/thrift/models');
const { register } = require('../src/thrift/validation');

function resolveMongoUri(configuredUri, inDocker = fs.existsSync('/.dockerenv')) {
  if (!configuredUri || inDocker) return configuredUri;
  const uri = new URL(configuredUri);
  if (uri.hostname === 'host.docker.internal') {
    uri.hostname = '127.0.0.1';
    return uri.toString();
  }
  return configuredUri;
}

function askValidated(prompt, field, options = {}) {
  while (true) {
    const result = field.safeParse(readline.question(prompt, options));
    if (result.success) return result.data;
    for (const issue of result.error.issues) console.error(issue.message);
  }
}

async function main() {
  if (!env.mongoUri) throw new Error('請設定 MONGODB_CONNECT');
  const mongoUri = resolveMongoUri(env.mongoUri);
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  } catch {
    throw new Error('無法連線至 MongoDB。請確認 MongoDB 服務已啟動，以及 MONGODB_CONNECT 的位址與連接埠正確。');
  }
  await ensureThriftIndexes();
  console.log('MongoDB 連線成功，請輸入二手商店管理員資料。');
  const input = {
    name: askValidated('Name: ', register.shape.name),
    email: askValidated('Email: ', register.shape.email),
    phone: askValidated('Phone: ', register.shape.phone),
    password: askValidated('Password (12+ characters): ', register.shape.password, { hideEchoBack: true }),
  };
  const existing = await ThriftUser.findOne({ email: input.email });
  if (existing && !readline.keyInYNStrict('Promote/reset this existing thrift account?')) return;
  const user = existing || new ThriftUser({ email: input.email });
  Object.assign(user, { name: input.name, phone: input.phone, passwordHash: await bcrypt.hash(input.password, passwordCost), role: 'admin', status: 'active' });
  await user.save();
  await ThriftUser.updateOne({ _id: user._id }, { $inc: { credentialVersion: 1 } });
  await ThriftSession.deleteMany({ user: user._id });
  console.log('二手商店管理員已建立／更新。');
}
if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
}

module.exports = { resolveMongoUri };
