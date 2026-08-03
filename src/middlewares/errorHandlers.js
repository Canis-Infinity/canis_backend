const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({
    requestId: req.id,
    message: 'Not Found',
    path: req.originalUrl,
  });
}

function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;

  logger.error({
    requestId: req.id,
    err,
    status,
  }, 'request failed');

  res.status(status).json({
    requestId: req.id,
    message: status === 500 ? 'Internal Server Error' : err.message,
  });
}

module.exports = {
  notFound,
  errorHandler,
};
