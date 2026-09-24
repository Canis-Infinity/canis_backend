const { z } = require('zod');
const logger = require('../utils/logger');
const { asyncRoute, fail } = require('./utils/http');
const { cookieName } = require('./config');
const { cookieOptions, getToken } = require('./utils/cookies');
const sessions = require('./services/sessions');
const requireSession = asyncRoute(async (req, res, next) => {
  try {
    req.debtUser = await sessions.authenticate(getToken(req));
  } catch (error) {
    if (
      error.status === 401 &&
      getToken(req) &&
      /^[a-f0-9]{64}$/.test(getToken(req))
    )
      res.clearCookie(cookieName, cookieOptions(req));
    throw error;
  }
  next();
});
function requireAdmin(req, res, next) {
  return req.debtUser.role === 'admin'
    ? next()
    : next(fail(403, '僅管理員可操作'));
}
function requestGuard(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    (req.get('X-Debt-Request') !== '1' || !req.is('application/json'))
  )
    return next(fail(403, '請由債務網站提交操作'));
  next();
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError)
    return res
      .status(422)
      .json({
        message: '請檢查欄位內容',
        fields: z.flattenError(error).fieldErrors
      });
  if (error.code === 11000)
    return res
      .status(409)
      .json({
        message: '此電子郵件已註冊',
        fields: { email: ['此電子郵件已註冊'] }
      });
  if (error.name === 'VersionError' || error.name === 'DocumentNotFoundError')
    return res.status(409).json({ message: '紀錄已變更，請重新整理後再試' });
  if (error.name === 'CastError')
    return res.status(404).json({ message: '找不到紀錄' });
  if (error.name === 'ValidationError')
    return res
      .status(422)
      .json({ message: '資料驗證未通過，請檢查金額及欄位內容' });
  if (!error.status)
    logger.error({ err: error, requestId: req.id }, 'debt request failed');
  res
    .status(error.status || 500)
    .json({
      message: error.status ? error.message : '服務暫時無法使用，請稍後再試',
      fields: error.fields
    });
}
module.exports = { requireSession, requireAdmin, requestGuard, errorHandler };
