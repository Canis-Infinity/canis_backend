const express = require('express');
const { listEventLogs } = require('../services/eventLogService');
const { requireNormalAuth } = require('../middlewares/auth');

const router = express.Router();

router.get(
  '/',
  requireNormalAuth,
  async (req, res, next) => {
    try {
      const result = await listEventLogs(req.query);
      return res.status(200).send({
        message: '成功取得事件紀錄',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
