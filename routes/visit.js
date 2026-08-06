const express = require('express');
const router = express.Router();
const VisitHistory = require('../models').visitHistory;

const VALID_VISIT_SITES = new Set(['canis-den', 'frontend']);

function normalizeVisitSite(site, host = '') {
  if (VALID_VISIT_SITES.has(site)) return site;
  const hostName = host.toLowerCase().split(',')[0].trim().split(':')[0];
  if (hostName === 'canis.world' || hostName === 'www.canis.world') return 'frontend';
  return 'canis-den';
}

function visitSiteFilter(site) {
  if (site === 'canis-den') {
    return {
      $or: [
        { site: 'canis-den' },
        { site: { $exists: false } },
        { site: null },
      ],
    };
  }

  return site ? { site } : {};
}

router.use((req, res, next) => {
  next();
});

// 新增訪客記錄
router.post('/', async (req, res) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip = req.body?.ip || forwardedIp?.split(',')[0]?.trim() || req.ip || '';
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host || '';
  const site = normalizeVisitSite(req.body?.site, host);
  const path = typeof req.body?.path === 'string' ? req.body.path.slice(0, 300) : '';

  try {
    await VisitHistory.create({ ipAddress: ip, site, path, time: new Date() });
    return res.send({
      message: '成功新增訪客記錄',
    });
  } catch (error) {
    return res.status(500).send(`無法新增訪客記錄：${error}`);
  }
});

// 獲取訪客記錄
router.get('/', async (req, res) => {
  const site = VALID_VISIT_SITES.has(req.query?.site) ? req.query.site : undefined;
  const filter = visitSiteFilter(site);

  try {
    const amount = await VisitHistory.countDocuments(filter);
    return res.send({
      message: '成功獲取訪客記錄',
      data: amount,
    });
  } catch (error) {
    return res.status(500).send(`無法獲取訪客記錄：${error}`);
  }
});

module.exports = router;
