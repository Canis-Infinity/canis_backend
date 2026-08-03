const readline = require('readline');
const readlineSync = require('readline-sync');
const fs = require('fs');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../models').user;

function getArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function isRunningInDocker() {
  return fs.existsSync('/.dockerenv');
}

function resolveMongoUri() {
  const configuredUri = getArg('mongo-uri') || env.mongoUri;

  if (!configuredUri || isRunningInDocker()) {
    return configuredUri;
  }

  try {
    const uri = new URL(configuredUri);
    if (uri.hostname === 'host.docker.internal') {
      uri.hostname = '127.0.0.1';
      return uri.toString();
    }
  } catch {
    // Let Mongoose report malformed connection strings with its normal error.
  }

  return configuredUri;
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askPassword() {
  return readlineSync.question('Password: ', {
    hideEchoBack: true,
    mask: '*',
  });
}

async function main() {
  const mongoUri = resolveMongoUri();

  if (!mongoUri) {
    throw new Error('MONGODB_CONNECT is required');
  }

  const username = getArg('username') || await ask('Username: ');
  const email = getArg('email') || await ask('Email: ');
  const lastName = getArg('lastName') || await ask('Last name: ');
  const firstName = getArg('firstName') || await ask('First name: ');
  const mobile = getArg('mobile') || await ask('Mobile: ');
  const password = getArg('password') || askPassword();

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  const existing = await User.findOne({ username });
  if (existing) {
    existing.email = email;
    existing.lastName = lastName;
    existing.firstName = firstName;
    existing.mobile = mobile;
    existing.password = password;
    await existing.save();
    console.log(`Updated admin user: ${username}`);
  } else {
    await new User({ username, email, password, lastName, firstName, mobile }).save();
    console.log(`Created admin user: ${username}`);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message || error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
