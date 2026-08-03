const { createEventLog } = require('../services/eventLogService');
const logger = require('../utils/logger');

function auditEvent(resource) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (req.method === 'GET' || res.statusCode === 404) return;

      const user = req.user || {};
      createEventLog({
        actor: {
          id: user._id ? String(user._id) : '',
          username: user.username || '',
        },
        action: req.method,
        resource,
        resourceId: req.params?._id || req.body?.id || '',
        status: res.statusCode >= 400 ? 'failed' : 'success',
        message: `${req.method} ${req.originalUrl}`,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '',
        requestId: req.id,
      }).catch((err) => {
        logger.error({ err, requestId: req.id }, 'failed to write event log');
      });
    });

    next();
  };
}

module.exports = auditEvent;
