const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { DebtUser } = require('../models');
const schema = require('../validation');
const { fail, checkVersion } = require('../utils/http');
const { publicUser } = require('../utils/serializers');
const sessions = require('./sessions');
const { passwordCost } = require('../config');
const dummyHash = bcrypt.hashSync(
  crypto.randomBytes(24).toString('hex'),
  passwordCost
);

async function register(body) {
  const input = schema.register.parse(body);
  await DebtUser.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, passwordCost)
  });
  return { message: '註冊成功，請等待管理員核准後再登入' };
}

async function login(body) {
  const input = schema.login.parse(body);
  const user = await DebtUser.findOne({ email: input.email }).select(
    '+passwordHash'
  );
  const valid = await bcrypt.compare(
    input.password,
    user?.passwordHash || dummyHash
  );
  if (!user || !valid) throw fail(401, '電子郵件或密碼不正確');
  if (user.status !== 'approved') {
    const messages = {
      pending: '帳號正在等待管理員核准',
      rejected: '註冊申請未通過，請聯絡管理員',
      suspended: '帳號已停用，請聯絡管理員'
    };
    throw fail(403, messages[user.status]);
  }
  return user;
}

async function changePassword(userId, body) {
  const input = schema.changePassword.parse(body);
  const user = await DebtUser.findById(userId).select('+passwordHash');
  if (
    !user ||
    !(await bcrypt.compare(input.currentPassword, user.passwordHash))
  )
    throw fail(422, '目前密碼不正確', { currentPassword: ['目前密碼不正確'] });
  const result = await DebtUser.updateOne(
    { _id: user._id, passwordHash: user.passwordHash, status: 'approved' },
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
  const user = await DebtUser.findOneAndUpdate(
    { _id: userId, status: 'approved' },
    { $set: { name: input.name }, $inc: { __v: 1 } },
    { new: true, runValidators: true }
  );
  if (!user) throw fail(401, '帳號已失效，請重新登入');
  return publicUser(user);
}

async function listUsers() {
  const users = await DebtUser.find().sort({ createdAt: -1 });
  return users.map(publicUser);
}

async function reviewUser(reviewerId, userId, body) {
  const { status, version } = schema.accountStatus.parse(body);
  if (!/^[a-f0-9]{24}$/i.test(userId)) throw fail(404, '找不到帳號');
  const user = await DebtUser.findById(userId);
  if (!user) throw fail(404, '找不到帳號');
  if (user.role === 'admin') throw fail(403, '管理員帳號需透過伺服器管理');
  checkVersion(user, version);
  const allowed = {
    pending: ['approved', 'rejected'],
    approved: ['suspended'],
    rejected: ['approved'],
    suspended: ['approved']
  };
  if (!allowed[user.status].includes(status))
    throw fail(422, '無效的帳號狀態變更');
  user.status = status;
  user.reviewedBy = reviewerId;
  user.reviewedAt = new Date();
  await user.save();
  if (status !== 'approved') await sessions.revokeUser(user._id);
  return publicUser(user);
}

module.exports = {
  register,
  login,
  changePassword,
  updateProfile,
  listUsers,
  reviewUser
};
