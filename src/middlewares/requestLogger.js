const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.replace(/(\/api\/thrift\/order-link\/)[a-f0-9]+/i, '$1[private]'),
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      origin: req.headers.origin || null,
      ip: req.ip,
    }, 'request completed');
  });

  next();
}

module.exports = requestLogger;
