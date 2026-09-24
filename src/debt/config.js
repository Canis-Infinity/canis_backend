module.exports = {
  cookieName: 'debt_session',
  sessionAge: 7 * 24 * 60 * 60 * 1000,
  passwordCost: 12,
  authWindowMs: 15 * 60 * 1000,
  authLimit: 30,
  maxAmount: 999999999999,
  maxRecords: 5000
};
