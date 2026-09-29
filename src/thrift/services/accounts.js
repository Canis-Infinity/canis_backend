const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { ThriftUser } = require('../models');
const schema = require('../validation');
const { fail } = require('../utils/http');
const { publicUser } = require('../utils/serializers');
const sessions = require('./sessions');
const { passwordCost } = require('../config');
const dummyHash = bcrypt.hashSync(
  crypto.randomBytes(24).toString('hex'),
  passwordCost
);

async function register(body) {
  const input = schema.register.parse(body);
  await ThriftUser.create({
    name: input.name,
    email: input.email, phone: input.phone, contact: input.contact,
    passwordHash: await bcrypt.hash(input.password, passwordCost)
  });
  return { message: '註冊成功，現在可以登入' };
}

async function login(body) {
  const input = schema.login.parse(body);
  const user = await ThriftUser.findOne({ email: input.email }).select(
    '+passwordHash'
  );
  const valid = await bcrypt.compare(
    input.password,
    user?.passwordHash || dummyHash
  );
  if (!user || !valid) throw fail(401, '電子郵件或密碼不正確');
  if (user.status !== 'active') {
    throw fail(403, '帳號已停用，請聯絡管理員');
  }
  return user;
}

async function changePassword(userId, body) {
  const input = schema.changePassword.parse(body);
  const user = await ThriftUser.findById(userId).select('+passwordHash');
  if (
    !user ||
    !(await bcrypt.compare(input.currentPassword, user.passwordHash))
  )
    throw fail(422, '目前密碼不正確', { currentPassword: ['目前密碼不正確'] });
  const result = await ThriftUser.updateOne(
    { _id: user._id, passwordHash: user.passwordHash, status: 'active' },
    {
      $set: {
        passwordHash: await bcrypt.hash(input.newPassword, passwordCost)
      },
      $inc: { __v: 1, credentialVersion: 1 }
    }
  );
  if (!result.modifiedCount) throw fail(409, '帳號已變更，請重新登入後再試');
  await sessions.revokeUser(user._id);
}

async function updateProfile(userId, body) {
  const input = schema.profile.parse(body);
  const user = await ThriftUser.findOneAndUpdate(
    { _id: userId, status: 'active' },
    { $set: { name: input.name }, $inc: { __v: 1 } },
    { new: true, runValidators: true }
  );
  if (!user) throw fail(401, '帳號已失效，請重新登入');
  return publicUser(user);
}

module.exports = { register, login, changePassword, updateProfile };
