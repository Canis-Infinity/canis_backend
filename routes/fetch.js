const express = require('express');
const router = express.Router();
const moment = require('moment');
const Contact = require('../models').contact;
const VisitHistory = require('../models').visitHistory;
const { requireNormalAuth } = require('../src/middlewares/auth');

async function countVisitsBetween(start, end) {
  return VisitHistory.countDocuments({
    time: {
      $gte: start.toDate(),
      $lt: end.toDate(),
    },
  });
}

async function countContactsBetween(start, end) {
  return Contact.countDocuments({
    createdAt: {
      $gte: start.toDate(),
      $lt: end.toDate(),
    },
  });
}

router.use((req, res, next) => {
  next();
});

// 獲取卡片資料
router.get('/card', requireNormalAuth, async (req, res) => {
  const todayStart = moment().startOf('day');
  const tomorrowStart = todayStart.clone().add(1, 'day');
  const yesterdayStart = todayStart.clone().subtract(1, 'day');
  const weekStart = moment().startOf('week');
  const nextWeekStart = weekStart.clone().add(1, 'week');
  const lastWeekStart = weekStart.clone().subtract(1, 'week');

  try {
    const [
      todayVisit,
      lastVist,
      thisWeekVisit,
      lastWeekVisit,
      todayContact,
      lastContact,
      thisWeekContact,
      lastWeekContact,
    ] = await Promise.all([
      countVisitsBetween(todayStart, tomorrowStart),
      countVisitsBetween(yesterdayStart, todayStart),
      countVisitsBetween(weekStart, nextWeekStart),
      countVisitsBetween(lastWeekStart, weekStart),
      countContactsBetween(todayStart, tomorrowStart),
      countContactsBetween(yesterdayStart, todayStart),
      countContactsBetween(weekStart, nextWeekStart),
      countContactsBetween(lastWeekStart, weekStart),
    ]);

    return res.send({
      message: '成功獲取卡片資料',
      data: {
        todayVisit,
        lastVist,
        thisWeekVisit,
        lastWeekVisit,
        todayContact,
        lastContact,
        thisWeekContact,
        lastWeekContact,
      },
    });
  } catch (error) {
    return res.status(500).send(`無法獲取卡片資料：${error}`);
  }
});

// 獲取圖表資料
router.get('/chart', requireNormalAuth, async (req, res) => {
  const rangeStart = moment().subtract(6, 'days').startOf('day');
  const rangeEnd = moment().add(1, 'day').startOf('day');

  try {
    const [visitRows, contactRows] = await Promise.all([
      VisitHistory.aggregate([
        {
          $match: {
            time: {
              $gte: rangeStart.toDate(),
              $lt: rangeEnd.toDate(),
            },
          },
        },
        {
          $project: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$time',
                timezone: 'Asia/Taipei',
              },
            },
          },
        },
        {
          $group: {
            _id: '$date',
            amount: { $sum: 1 },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]),
      Contact.aggregate([
        {
          $match: {
            createdAt: {
              $gte: rangeStart.toDate(),
              $lt: rangeEnd.toDate(),
            },
          },
        },
        {
          $project: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'Asia/Taipei',
              },
            },
          },
        },
        {
          $group: {
            _id: '$date',
            amount: { $sum: 1 },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]),
    ]);

    const visitMap = new Map(visitRows.map((row) => [row._id, row.amount]));
    const contactMap = new Map(contactRows.map((row) => [row._id, row.amount]));

    const thisWeekVisitByDay = [];
    const thisWeekContactByDay = [];
    for (let i = 0; i <= 6; i++) {
      const current = rangeStart.clone().add(i, 'days');
      const key = current.format('YYYY-MM-DD');
      const label = current.format('MM-DD');

      thisWeekVisitByDay.push({
        date: label,
        amount: visitMap.get(key) || 0,
      });
      thisWeekContactByDay.push({
        date: label,
        amount: contactMap.get(key) || 0,
      });
    }

    return res.send({
      message: '成功獲取圖表資料',
      data: {
        thisWeekVisitByDay,
        thisWeekContactByDay,
      },
    });
  } catch (error) {
    return res.status(500).send(`無法獲取圖表資料：${error}`);
  }
});

module.exports = router;
