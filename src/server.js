process.env.TZ = 'Asia/Taipei';

const env = require('./config/env');
const createApp = require('./app');
const { connectMongo } = require('./config/database');
const logger = require('./utils/logger');

const app = createApp();

app.listen(env.port, () => {
  logger.info({
    port: env.port,
    node: process.version,
    cwd: process.cwd(),
    corsOrigins: env.corsOrigins.length ? env.corsOrigins : '(empty -> block by default)',
  }, 'server started');
});

connectMongo();

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception');
});
