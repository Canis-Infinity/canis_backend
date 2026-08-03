const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      origin: req.headers.origin || null,
      ip: req.ip,
    }, 'request completed');
  });

  next();
}

module.exports = requestLogger;
