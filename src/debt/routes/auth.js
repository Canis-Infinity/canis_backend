const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const accounts = require('../services/accounts');
const sessions = require('../services/sessions');
const { requireSession } = require('../middleware');
const { asyncRoute } = require('../utils/http');
const { publicUser } = require('../utils/serializers');
const { getToken, cookieOptions } = require('../utils/cookies');
const {
  cookieName,
  sessionAge,
  authWindowMs,
  authLimit
} = require('../config');
const limiter = rateLimit({
  windowMs: authWindowMs,
  limit: authLimit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: '嘗試次數過多，請稍後再試' }
});
router.post(
  '/register',
  limiter,
  asyncRoute(async (req, res) =>
    res.status(201).json(await accounts.register(req.body))
  )
);
router.post(
  '/login',
  limiter,
  asyncRoute(async (req, res) => {
    const user = await accounts.login(req.body);
    const token = await sessions.create(user, getToken(req));
    res.cookie(cookieName, token, {
      ...cookieOptions(req),
      maxAge: sessionAge
    });
    res.json({ user: publicUser(user) });
  })
);
router.post(
  '/logout',
  asyncRoute(async (req, res) => {
    await sessions.revokeToken(getToken(req));
    res.clearCookie(cookieName, cookieOptions(req));
    res.json({ message: '已登出' });
  })
);
router.use(requireSession);
router.get('/me', (req, res) => res.json({ user: publicUser(req.debtUser) }));
router.patch(
  '/profile',
  asyncRoute(async (req, res) =>
    res.json({ user: await accounts.updateProfile(req.debtUser._id, req.body) })
  )
);
router.post(
  '/password',
  limiter,
  asyncRoute(async (req, res) => {
    await accounts.changePassword(req.debtUser._id, req.body);
    res.clearCookie(cookieName, cookieOptions(req));
    res.json({ message: '密碼已更新，請重新登入' });
  })
);
module.exports = router;
