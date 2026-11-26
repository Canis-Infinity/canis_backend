const readline = require('readline-sync');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const env = require('../src/config/env');
const { SelfUser, SelfSession, ensureIndexes } = require('../src/self/models');
const { resolveMongoUri } = require('./create-thrift-admin');
async function main() {
  if (!env.mongoUri) throw new Error('請設定 MONGODB_CONNECT');
  const name = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .parse(readline.question('Name: '));
  const email = z
    .email()
    .trim()
    .toLowerCase()
    .parse(readline.question('Email: '));
  const password = z
    .string()
    .min(12)
    .refine((p) => Buffer.byteLength(p) <= 72, '密碼不得超過 72 bytes')
    .parse(
      readline.question('Password (12+ characters): ', { hideEchoBack: true }),
    );
  if (
    password !== readline.question('Confirm password: ', { hideEchoBack: true })
  )
    throw new Error('密碼不一致');
  await mongoose.connect(resolveMongoUri(env.mongoUri), {
    serverSelectionTimeoutMS: 5000,
  });
  await ensureIndexes();
  const existing = await SelfUser.findOne({ email });
  if (
    existing &&
    !readline.keyInYNStrict('Reset existing self account password?')
  )
    return;
  const user = existing || new SelfUser({ email });
  user.name = name;
  user.passwordHash = await bcrypt.hash(password, 12);
  await user.save();
  await SelfSession.deleteMany({ user: user._id });
  console.log('Self 帳號已建立／更新，舊登入階段已失效。');
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
