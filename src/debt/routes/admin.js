const router = require('express').Router();
const accounts = require('../services/accounts');
const { asyncRoute } = require('../utils/http');
router.get(
  '/users',
  asyncRoute(async (req, res) =>
    res.json({ users: await accounts.listUsers() })
  )
);
router.patch(
  '/users/:userId',
  asyncRoute(async (req, res) =>
    res.json({
      user: await accounts.reviewUser(
        req.debtUser._id,
        req.params.userId,
        req.body
      )
    })
  )
);
module.exports = router;
