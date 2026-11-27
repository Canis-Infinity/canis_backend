// Run before enabling public registration. Existing server-created accounts remain approved.
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { SelfUser } = require('../src/self/models');
const { resolveMongoUri } = require('./create-thrift-admin');
async function main() {
  await mongoose.connect(resolveMongoUri(env.mongoUri));
  const legacy = { status: { $exists: false } };
  if (!(await SelfUser.exists({ role: 'admin' }))) {
    const owner = await SelfUser.collection.findOne(legacy, {
      sort: { createdAt: 1, _id: 1 },
    });
    if (!owner)
      throw new Error('沒有既有帳號可設為管理員，請先建立伺服器帳號');
    await SelfUser.collection.updateOne(
      { _id: owner._id, ...legacy },
      { $set: { role: 'admin' } },
    );
  }
  await SelfUser.collection.updateMany(legacy, {
    $set: { status: 'approved' },
  });
  await SelfUser.collection.updateMany(
    { role: { $exists: false } },
    { $set: { role: 'user' } },
  );
  console.log('既有帳號與管理員遷移完成');
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
