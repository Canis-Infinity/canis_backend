const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const { DebtUser, DebtSession, Debt, ensureDebtIndexes } = require('./models');
const schema = require('./validation');
const logger = require('../utils/logger');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message, fields) => Object.assign(new Error(message), { status, fields });
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const cookieName = 'debt_session';
const sessionAge = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = (req) => ({ httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' });
const getToken = (req) => (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
const publicUser = (user) => ({ id: String(user._id), name: user.name, email: user.email, role: user.role, status: user.status, version: user.__v, createdAt: user.createdAt, updatedAt: user.updatedAt, reviewedAt: user.reviewedAt });
const serializeDebt = (doc) => {
  const obj = doc.toObject();
  const paid = obj.repayments.reduce((sum, item) => sum + item.amount, 0);
  const borrowings = (obj.borrowings || []).map((item) => ({ ...item, id: String(item._id) }));
  const initialAmount = obj.amount - borrowings.reduce((sum, item) => sum + item.amount, 0);
  return { ...obj, id: String(obj._id), version: obj.__v, paid, remaining: obj.amount - paid, initialAmount, borrowings, repayments: obj.repayments.map((item) => ({ ...item, id: String(item._id) })) };
};

router.use(asyncRoute(async (req, res, next) => { await ensureDebtIndexes(); next(); }));

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Custom header plus JSON rejects cross-site form submissions. The frontend also checks Origin.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.get('X-Debt-Request') !== '1' || !req.is('application/json'))) {
    return next(fail(403, '請由債務網站提交操作'));
  }
  next();
});
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: '嘗試次數過多，請稍後再試' } });
router.post('/auth/register', authLimiter, asyncRoute(async (req, res) => {
  const input = schema.register.parse(req.body);
  await DebtUser.create({ name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 12) });
  res.status(201).json({ message: '註冊成功，請等待管理員核准後再登入' });
}));
// A fixed dummy hash keeps missing-account logins on the password verification path.
const dummyHash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 12);
router.post('/auth/login', authLimiter, asyncRoute(async (req, res) => {
  const input = schema.login.parse(req.body);
  const user = await DebtUser.findOne({ email: input.email }).select('+passwordHash');
  const valid = await bcrypt.compare(input.password, user?.passwordHash || dummyHash);
  if (!user || !valid) throw fail(401, '電子郵件或密碼不正確');
  if (user.status !== 'approved') {
    const messages = { pending: '帳號正在等待管理員核准', rejected: '註冊申請未通過，請聯絡管理員', suspended: '帳號已停用，請聯絡管理員' };
    throw fail(403, messages[user.status]);
  }
  const oldToken = getToken(req);
  if (oldToken) await DebtSession.deleteOne({ tokenHash: hash(oldToken) });
  const token = crypto.randomBytes(32).toString('hex');
  await DebtSession.create({ tokenHash: hash(token), user: user._id, credentialVersion: user.credentialVersion, expiresAt: new Date(Date.now() + sessionAge) });
  res.cookie(cookieName, token, { ...cookieOptions(req), maxAge: sessionAge });
  res.json({ user: publicUser(user) });
}));
router.post('/auth/logout', asyncRoute(async (req, res) => {
  const token = getToken(req);
  if (token) await DebtSession.deleteOne({ tokenHash: hash(token) });
  res.clearCookie(cookieName, cookieOptions(req));
  res.json({ message: '已登出' });
}));

router.use(asyncRoute(async (req, res, next) => {
  const token = getToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw fail(401, '請先登入');
  const session = await DebtSession.findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } });
  const user = session && await DebtUser.findById(session.user);
  if (!user || user.status !== 'approved' || session.credentialVersion !== user.credentialVersion) {
    res.clearCookie(cookieName, cookieOptions(req));
    throw fail(401, '登入已失效或帳號尚未核准，請重新登入');
  }
  req.debtUser = user;
  next();
}));
router.post('/auth/password', authLimiter, asyncRoute(async (req, res) => {
  const input = schema.changePassword.parse(req.body);
  const user = await DebtUser.findById(req.debtUser._id).select('+passwordHash');
  if (!user || !await bcrypt.compare(input.currentPassword, user.passwordHash)) throw fail(422, '目前密碼不正確', { currentPassword: ['目前密碼不正確'] });
  const result = await DebtUser.updateOne({ _id: user._id, passwordHash: user.passwordHash, status: 'approved' }, { $set: { passwordHash: await bcrypt.hash(input.newPassword, 12) }, $inc: { __v: 1, credentialVersion: 1 } });
  if (!result.modifiedCount) throw fail(409, '帳號已變更，請重新登入後再試');
  await DebtSession.deleteMany({ user: user._id });
  res.clearCookie(cookieName, cookieOptions(req));
  res.json({ message: '密碼已更新，請重新登入' });
}));
router.patch('/auth/profile', asyncRoute(async (req, res) => {
  const input = schema.profile.parse(req.body);
  const user = await DebtUser.findOneAndUpdate({ _id: req.debtUser._id, status: 'approved' }, { $set: { name: input.name }, $inc: { __v: 1 } }, { new: true, runValidators: true });
  if (!user) throw fail(401, '帳號已失效，請重新登入');
  res.json({ user: publicUser(user) });
}));
router.get('/auth/me', (req, res) => res.json({ user: publicUser(req.debtUser) }));
router.get('/debts', asyncRoute(async (req, res) => {
  const debts = await Debt.find({ owner: req.debtUser._id }).sort({ date: -1, _id: -1 });
  res.json({ debts: debts.map(serializeDebt) });
}));
router.post('/debts', asyncRoute(async (req, res) => {
  const input = schema.debt.parse(req.body);
  const debt = await Debt.create({ ...input, owner: req.debtUser._id });
  res.status(201).json({ debt: serializeDebt(debt) });
}));
router.param('debtId', asyncRoute(async (req, res, next) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.debtId)) throw fail(404, '找不到債務');
  const debt = await Debt.findOne({ _id: req.params.debtId, owner: req.debtUser._id });
  if (!debt) throw fail(404, '找不到債務');
  req.debt = debt;
  next();
}));
const checkVersion = (debt, version) => { if (debt.__v !== version) throw fail(409, '紀錄已變更，請重新整理後再試'); };
const checkBalance = (debt) => {
  if (!Number.isSafeInteger(debt.amount) || debt.amount > 999999999999) throw fail(422, '累計借款超出可記錄範圍', { amount: ['累計借款最多 999,999,999,999 元'] });
  const paid = debt.repayments.reduce((sum, item) => sum + BigInt(item.amount), 0n);
  if (paid > BigInt(debt.amount)) throw fail(422, '累計還款不可超過借款金額', { amount: ['累計還款不可超過借款金額'] });
};
router.put('/debts/:debtId', asyncRoute(async (req, res) => {
  const { version, ...input } = schema.debt.extend(schema.version.shape).parse(req.body);
  checkVersion(req.debt, version);
  Object.assign(req.debt, input);
  checkBalance(req.debt);
  await req.debt.save();
  res.json({ debt: serializeDebt(req.debt) });
}));
router.delete('/debts/:debtId', asyncRoute(async (req, res) => {
  const { version } = schema.version.parse(req.body);
  const result = await Debt.deleteOne({ _id: req.debt._id, owner: req.debtUser._id, __v: version });
  if (!result.deletedCount) throw fail(409, '紀錄已變更，請重新整理後再試');
  res.json({ message: '債務及全部還款紀錄已刪除' });
}));
router.post('/debts/:debtId/repayments', asyncRoute(async (req, res) => {
  const { version, ...input } = schema.repayment.extend(schema.version.shape).parse(req.body);
  checkVersion(req.debt, version);
  if (req.debt.repayments.length >= 5000) throw fail(422, '單筆債務已達 5,000 筆還款紀錄上限');
  req.debt.repayments.push(input);
  checkBalance(req.debt);
  await req.debt.save();
  res.status(201).json({ debt: serializeDebt(req.debt) });
}));
router.put('/debts/:debtId/repayments/:repaymentId', asyncRoute(async (req, res) => {
  const { version, ...input } = schema.repayment.extend(schema.version.shape).parse(req.body);
  checkVersion(req.debt, version);
  const repayment = req.debt.repayments.id(req.params.repaymentId);
  if (!repayment) throw fail(404, '找不到還款紀錄');
  Object.assign(repayment, input);
  checkBalance(req.debt);
  await req.debt.save();
  res.json({ debt: serializeDebt(req.debt) });
}));
router.delete('/debts/:debtId/repayments/:repaymentId', asyncRoute(async (req, res) => {
  const { version } = schema.version.parse(req.body);
  checkVersion(req.debt, version);
  const repayment = req.debt.repayments.id(req.params.repaymentId);
  if (!repayment) throw fail(404, '找不到還款紀錄');
  repayment.deleteOne();
  await req.debt.save();
  res.json({ debt: serializeDebt(req.debt) });
}));
router.post('/debts/:debtId/borrowings', asyncRoute(async (req, res) => {
  const { version, ...input } = schema.borrowing.extend(schema.version.shape).parse(req.body);
  checkVersion(req.debt, version);
  if (req.debt.borrowings.length >= 4999) throw fail(422, '單筆債務已達 5,000 筆借款紀錄上限');
  req.debt.borrowings.push(input);
  req.debt.amount += input.amount;
  checkBalance(req.debt);
  await req.debt.save();
  res.status(201).json({ debt: serializeDebt(req.debt) });
}));
router.put('/debts/:debtId/borrowings/:borrowingId', asyncRoute(async (req, res) => {
  const { version, ...input } = schema.borrowing.extend(schema.version.shape).parse(req.body);
  checkVersion(req.debt, version);
  const borrowing = req.debt.borrowings.id(req.params.borrowingId);
  if (!borrowing) throw fail(404, '找不到借款紀錄');
  req.debt.amount += input.amount - borrowing.amount;
  Object.assign(borrowing, input);
  checkBalance(req.debt);
  await req.debt.save();
  res.json({ debt: serializeDebt(req.debt) });
}));
router.delete('/debts/:debtId/borrowings/:borrowingId', asyncRoute(async (req, res) => {
  const { version } = schema.version.parse(req.body);
  checkVersion(req.debt, version);
  const borrowing = req.debt.borrowings.id(req.params.borrowingId);
  if (!borrowing) throw fail(404, '找不到借款紀錄');
  req.debt.amount -= borrowing.amount;
  borrowing.deleteOne();
  checkBalance(req.debt);
  await req.debt.save();
  res.json({ debt: serializeDebt(req.debt) });
}));
router.use('/admin', (req, res, next) => req.debtUser.role === 'admin' ? next() : next(fail(403, '僅管理員可操作')));
router.get('/admin/users', asyncRoute(async (req, res) => {
  const users = await DebtUser.find().sort({ createdAt: -1 });
  res.json({ users: users.map(publicUser) });
}));
router.patch('/admin/users/:userId', asyncRoute(async (req, res) => {
  const { status, version } = schema.accountStatus.parse(req.body);
  if (!/^[a-f0-9]{24}$/i.test(req.params.userId)) throw fail(404, '找不到帳號');
  const user = await DebtUser.findById(req.params.userId);
  if (!user) throw fail(404, '找不到帳號');
  if (user.role === 'admin') throw fail(403, '管理員帳號需透過伺服器管理');
  checkVersion(user, version);
  const allowed = { pending: ['approved', 'rejected'], approved: ['suspended'], rejected: ['approved'], suspended: ['approved'] };
  if (!allowed[user.status].includes(status)) throw fail(422, '無效的帳號狀態變更');
  user.status = status;
  user.reviewedBy = req.debtUser._id;
  user.reviewedAt = new Date();
  await user.save();
  if (status !== 'approved') await DebtSession.deleteMany({ user: user._id });
  res.json({ user: publicUser(user) });
}));
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError) return res.status(422).json({ message: '請檢查欄位內容', fields: z.flattenError(error).fieldErrors });
  if (error.code === 11000) return res.status(409).json({ message: '此電子郵件已註冊', fields: { email: ['此電子郵件已註冊'] } });
  if (error.name === 'VersionError' || error.name === 'DocumentNotFoundError') return res.status(409).json({ message: '紀錄已變更，請重新整理後再試' });
  if (error.name === 'CastError') return res.status(404).json({ message: '找不到紀錄' });
  if (error.name === 'ValidationError') return res.status(422).json({ message: '資料驗證未通過，請檢查金額及欄位內容' });
  if (!error.status) logger.error({ err: error, requestId: req.id }, 'debt request failed');
  res.status(error.status || 500).json({ message: error.status ? error.message : '服務暫時無法使用，請稍後再試', fields: error.fields });
});
module.exports = router;
