const express = require('express');
const path = require('path');
const env = require('./config/env');
const routes = require('../routes');
const requestContext = require('./middlewares/requestContext');
const requestLogger = require('./middlewares/requestLogger');
const { apiCors } = require('./middlewares/cors');
const { requireMongo, isMongoReady } = require('./config/database');
const { notFound, errorHandler } = require('./middlewares/errorHandlers');
const auditEvent = require('./middlewares/auditEvent');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(requestContext);
  app.use(requestLogger);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use(
    express.static(path.join(__dirname, '../public'), {
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    })
  );

  app.use('/api', apiCors);
  app.options('/api/*', apiCors);

  app.get('/healthz', (req, res) => {
    res.json({
      ok: true,
      mongoReady: isMongoReady(),
      uptimeSec: Math.floor(process.uptime()),
      allowList: env.corsOrigins.length ? env.corsOrigins : '(empty)',
    });
  });

  app.get('/readyz', (req, res) => {
    const mongoReady = isMongoReady();
    res.status(mongoReady ? 200 : 503).json({
      ok: mongoReady,
      mongoReady,
    });
  });

  app.use('/api/user', routes.auth);
  app.use('/api/profile', requireMongo, auditEvent('profile'), routes.profile);
  app.use('/api/canis-world', requireMongo, auditEvent('canis-world'), routes.canisWorld);
  app.use('/api/contact', requireMongo, auditEvent('contact'), routes.contact);
  app.use('/api/visit', requireMongo, auditEvent('visit'), routes.visit);
  app.use('/api/event-logs', requireMongo, routes.eventLogs);
  app.use('/api/dashboard', requireMongo, routes.dashboard);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
