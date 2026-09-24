const readline = require('readline-sync');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');
const env = require('../src/config/env');
const { DebtUser, DebtSession, ensureDebtIndexes } = require('../src/debt/models');
const { register } = require('../src/debt/validation');

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
  await ensureDebtIndexes();
  console.log('MongoDB 連線成功，請輸入債務管理員資料。');
  const input = {
    name: askValidated('Name: ', register.shape.name),
    email: askValidated('Email: ', register.shape.email),
    password: askValidated('Password (12+ characters): ', register.shape.password, { hideEchoBack: true }),
  };
  const existing = await DebtUser.findOne({ email: input.email });
  if (existing && !readline.keyInYNStrict('Promote/reset this existing debt account?')) return;
  const user = existing || new DebtUser({ email: input.email });
  Object.assign(user, { name: input.name, passwordHash: await bcrypt.hash(input.password, 12), role: 'admin', status: 'approved' });
  await user.save();
  await DebtSession.deleteMany({ user: user._id });
  console.log('債務管理員已建立／更新。');
}
if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
}

module.exports = { resolveMongoUri };
