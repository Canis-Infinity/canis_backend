const express = require('express');
const router = express.Router();
const moment = require('moment');
const Contact = require('../models').contact;
const VisitHistory = require('../models').visitHistory;
const { requireNormalAuth } = require('../src/middlewares/auth');

const VISIT_SITES = {
  canisDen: 'canis-den',
  frontend: 'frontend',
};

function siteVisitFilter(site) {
  if (site === VISIT_SITES.canisDen) {
    return {
      $or: [
        { site: VISIT_SITES.canisDen },
        { site: { $exists: false } },
        { site: null },
      ],
    };
  }

  return { site };
}

function visitDateFilter(start, end, site) {
  return {
    time: {
      $gte: start.toDate(),
      $lt: end.toDate(),
    },
    ...siteVisitFilter(site),
  };
}

async function countVisitsBetween(start, end, site = VISIT_SITES.canisDen) {
  return VisitHistory.countDocuments(visitDateFilter(start, end, site));
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
      todayCanisDenVisit,
      lastCanisDenVisit,
      thisWeekCanisDenVisit,
      lastWeekCanisDenVisit,
      todayFrontendVisit,
      lastFrontendVisit,
      thisWeekFrontendVisit,
      lastWeekFrontendVisit,
      todayContact,
      lastContact,
      thisWeekContact,
      lastWeekContact,
    ] = await Promise.all([
      countVisitsBetween(todayStart, tomorrowStart, VISIT_SITES.canisDen),
      countVisitsBetween(yesterdayStart, todayStart, VISIT_SITES.canisDen),
      countVisitsBetween(weekStart, nextWeekStart, VISIT_SITES.canisDen),
      countVisitsBetween(lastWeekStart, weekStart, VISIT_SITES.canisDen),
      countVisitsBetween(todayStart, tomorrowStart, VISIT_SITES.frontend),
      countVisitsBetween(yesterdayStart, todayStart, VISIT_SITES.frontend),
      countVisitsBetween(weekStart, nextWeekStart, VISIT_SITES.frontend),
      countVisitsBetween(lastWeekStart, weekStart, VISIT_SITES.frontend),
      countContactsBetween(todayStart, tomorrowStart),
      countContactsBetween(yesterdayStart, todayStart),
      countContactsBetween(weekStart, nextWeekStart),
      countContactsBetween(lastWeekStart, weekStart),
    ]);

    return res.send({
      message: '成功獲取卡片資料',
      data: {
        todayVisit: todayCanisDenVisit,
        lastVist: lastCanisDenVisit,
        thisWeekVisit: thisWeekCanisDenVisit,
        lastWeekVisit: lastWeekCanisDenVisit,
        todayCanisDenVisit,
        lastCanisDenVisit,
        thisWeekCanisDenVisit,
        lastWeekCanisDenVisit,
        todayFrontendVisit,
        lastFrontendVisit,
        thisWeekFrontendVisit,
        lastWeekFrontendVisit,
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
    const [canisDenVisitRows, frontendVisitRows, contactRows] = await Promise.all([
      VisitHistory.aggregate([
        {
          $match: visitDateFilter(rangeStart, rangeEnd, VISIT_SITES.canisDen),
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
      VisitHistory.aggregate([
        {
          $match: visitDateFilter(rangeStart, rangeEnd, VISIT_SITES.frontend),
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

    const canisDenVisitMap = new Map(canisDenVisitRows.map((row) => [row._id, row.amount]));
    const frontendVisitMap = new Map(frontendVisitRows.map((row) => [row._id, row.amount]));
    const contactMap = new Map(contactRows.map((row) => [row._id, row.amount]));

    const thisWeekCanisDenVisitByDay = [];
    const thisWeekFrontendVisitByDay = [];
    const thisWeekContactByDay = [];
    for (let i = 0; i <= 6; i++) {
      const current = rangeStart.clone().add(i, 'days');
      const key = current.format('YYYY-MM-DD');
      const label = current.format('MM-DD');

      thisWeekCanisDenVisitByDay.push({
        date: label,
        amount: canisDenVisitMap.get(key) || 0,
      });
      thisWeekFrontendVisitByDay.push({
        date: label,
        amount: frontendVisitMap.get(key) || 0,
      });
      thisWeekContactByDay.push({
        date: label,
        amount: contactMap.get(key) || 0,
      });
    }

    return res.send({
      message: '成功獲取圖表資料',
      data: {
        thisWeekVisitByDay: thisWeekCanisDenVisitByDay,
        thisWeekCanisDenVisitByDay,
        thisWeekFrontendVisitByDay,
        thisWeekContactByDay,
      },
    });
  } catch (error) {
    return res.status(500).send(`無法獲取圖表資料：${error}`);
  }
});

module.exports = router;
