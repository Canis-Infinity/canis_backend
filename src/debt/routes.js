const router = require('express').Router();
const { ensureDebtIndexes } = require('./models');
const { asyncRoute } = require('./utils/http');
const {
  requestGuard,
  requireSession,
  requireAdmin,
  errorHandler
} = require('./middleware');
router.use(
  asyncRoute(async (req, res, next) => {
    await ensureDebtIndexes();
    next();
  })
);
router.use(requestGuard);
router.use('/auth', require('./routes/auth'));
router.use(requireSession);
router.use('/debts', require('./routes/records'));
router.use('/admin', requireAdmin, require('./routes/admin'));
router.use(errorHandler);
module.exports = router;
