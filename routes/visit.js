const express = require('express');
const router = express.Router();
const VisitHistory = require('../models').visitHistory;

router.use((req, res, next) => {
  next();
});

// 新增訪客記錄
router.post('/', async (req, res) => {
  let { ip } = req.body;

  try {
    await VisitHistory.create({ ipAddress: ip || '', time: new Date() });
    return res.send({
      message: '成功新增訪客記錄',
    });
  } catch (error) {
    return res.status(500).send(`無法新增訪客記錄：${error}`);
  }
});

// 獲取訪客記錄
router.get('/', async (req, res) => {
  try {
    const amount = await VisitHistory.countDocuments();
    return res.send({
      message: '成功獲取訪客記錄',
      data: amount,
    });
  } catch (error) {
    return res.status(500).send(`無法獲取訪客記錄：${error}`);
  }
});

module.exports = router;
