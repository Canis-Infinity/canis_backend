const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('bufferCommands', false);

let mongoReady = false;

mongoose.connection.on('connected', () => {
  mongoReady = true;
  logger.info('mongodb connected');
});

mongoose.connection.on('disconnected', () => {
  mongoReady = false;
  logger.error('mongodb disconnected');
});

mongoose.connection.on('error', (err) => {
  mongoReady = false;
  logger.error({ err }, 'mongodb error');
});

async function connectMongo() {
  if (!env.mongoUri) {
    logger.warn('MONGODB_CONNECT is empty; database routes will return 503');
    return;
  }

  while (!mongoReady) {
    try {
      await mongoose.connect(env.mongoUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      logger.info({ mongoHost: new URL(env.mongoUri).host }, 'mongodb connection successful');
      return;
    } catch (err) {
      logger.warn({
        err,
        mongoHost: new URL(env.mongoUri).host,
      }, 'mongodb connection attempt failed');
    }

    logger.error('mongodb connection failed; retrying in 5 seconds');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

function requireMongo(req, res, next) {
  if (!mongoReady) {
    return res.status(503).json({
      requestId: req.id,
      message: 'Database not ready',
    });
  }
  next();
}

function isMongoReady() {
  return mongoReady;
}

module.exports = {
  connectMongo,
  requireMongo,
  isMongoReady,
};
