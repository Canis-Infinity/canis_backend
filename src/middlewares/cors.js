const cors = require('cors');
const env = require('../config/env');
const logger = require('../utils/logger');

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (env.corsOrigins.length === 0) return false;
  return env.corsOrigins.includes(origin);
}

const apiCors = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (isAllowedOrigin(origin)) return cb(null, true);

    logger.warn({ origin }, 'cors origin blocked');
    return cb(null, false);
  },
  credentials: true,
});

module.exports = {
  apiCors,
  isAllowedOrigin,
};
