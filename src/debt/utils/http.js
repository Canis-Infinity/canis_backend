const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message, fields) =>
  Object.assign(new Error(message), { status, fields });
const checkVersion = (doc, version) => {
  if (doc.__v !== version) throw fail(409, '紀錄已變更，請重新整理後再試');
};
module.exports = { asyncRoute, fail, checkVersion };
