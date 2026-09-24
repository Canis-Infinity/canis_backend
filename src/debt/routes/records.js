const router = require('express').Router();
const debts = require('../services/debts');
const { asyncRoute } = require('../utils/http');
router.param(
  'debtId',
  asyncRoute(async (req, res, next) => {
    req.debt = await debts.findOwned(req.debtUser._id, req.params.debtId);
    next();
  })
);
router.get(
  '/',
  asyncRoute(async (req, res) =>
    res.json({ debts: await debts.list(req.debtUser._id) })
  )
);
router.post(
  '/',
  asyncRoute(async (req, res) =>
    res
      .status(201)
      .json({ debt: await debts.create(req.debtUser._id, req.body) })
  )
);
router.put(
  '/:debtId',
  asyncRoute(async (req, res) =>
    res.json({ debt: await debts.update(req.debt, req.body) })
  )
);
router.delete(
  '/:debtId',
  asyncRoute(async (req, res) =>
    res.json(await debts.remove(req.debt, req.debtUser._id, req.body))
  )
);
router.post(
  '/:debtId/repayments',
  asyncRoute(async (req, res) =>
    res
      .status(201)
      .json({ debt: await debts.addRepayments(req.debt, req.body) })
  )
);
router.put(
  '/:debtId/repayments/:repaymentId',
  asyncRoute(async (req, res) =>
    res.json({
      debt: await debts.updateRepayments(
        req.debt,
        req.body,
        req.params.repaymentId
      )
    })
  )
);
router.delete(
  '/:debtId/repayments/:repaymentId',
  asyncRoute(async (req, res) =>
    res.json({
      debt: await debts.removeRepayments(
        req.debt,
        req.body,
        req.params.repaymentId
      )
    })
  )
);
router.post(
  '/:debtId/borrowings',
  asyncRoute(async (req, res) =>
    res
      .status(201)
      .json({ debt: await debts.addBorrowings(req.debt, req.body) })
  )
);
router.put(
  '/:debtId/borrowings/:borrowingId',
  asyncRoute(async (req, res) =>
    res.json({
      debt: await debts.updateBorrowings(
        req.debt,
        req.body,
        req.params.borrowingId
      )
    })
  )
);
router.delete(
  '/:debtId/borrowings/:borrowingId',
  asyncRoute(async (req, res) =>
    res.json({
      debt: await debts.removeBorrowings(
        req.debt,
        req.body,
        req.params.borrowingId
      )
    })
  )
);
module.exports = router;
