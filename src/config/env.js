const dotenv = require('dotenv');

dotenv.config();

const stripWrappingQuotes = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/^(['"])(.*)\1$/, '$2');
};

[
  'MONGODB_CONNECT',
  'PASSWORD_HASH',
].forEach((key) => {
  if (process.env[key]) {
    process.env[key] = stripWrappingQuotes(process.env[key]);
  }
});

const toList = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 7344),
  mongoUri: process.env.MONGODB_CONNECT,
  corsOrigins: toList(process.env.CORS_ORIGINS),
  allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
  resendApiKey: process.env.RESEND_API_KEY || '',
  contactFromEmail: process.env.CONTACT_FROM_EMAIL || '',
  contactToEmail: process.env.CONTACT_TO_EMAIL || '',
};

module.exports = env;
