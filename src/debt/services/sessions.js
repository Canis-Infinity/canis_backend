const crypto = require('crypto');
const { DebtSession, DebtUser } = require('../models');
const { sessionAge } = require('../config');
const { fail } = require('../utils/http');
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
async function revokeToken(token) {
  if (token) await DebtSession.deleteOne({ tokenHash: hash(token) });
}
async function revokeUser(user) {
  await DebtSession.deleteMany({ user });
}
async function create(user, oldToken) {
  await revokeToken(oldToken);
  const token = crypto.randomBytes(32).toString('hex');
  await DebtSession.create({
    tokenHash: hash(token),
    user: user._id,
    credentialVersion: user.credentialVersion,
    expiresAt: new Date(Date.now() + sessionAge)
  });
  return token;
}
async function authenticate(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw fail(401, '請先登入');
  const session = await DebtSession.findOne({
    tokenHash: hash(token),
    expiresAt: { $gt: new Date() }
  });
  const user = session && (await DebtUser.findById(session.user));
  if (
    !user ||
    user.status !== 'approved' ||
    session.credentialVersion !== user.credentialVersion
  )
    throw fail(401, '登入已失效或帳號尚未核准，請重新登入');
  return user;
}
module.exports = { create, revokeToken, revokeUser, authenticate };
