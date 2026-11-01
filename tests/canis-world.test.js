const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const createApp = require('../src/app');
const { user: User, canisWorld: CanisWorld } = require('../models');

describe('精選日常上限', () => {
  let mongo, app, token;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: 'featured_test' });
    const user = await User.create({ username: 'tester', email: 'test@example.test', password: 'test-password', firstName: '測試', lastName: '者', mobile: '0912345678' });
    token = jwt.sign({ _id: user._id }, process.env.PASSWORD_HASH);
    app = createApp();
  }, 180000);
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    await CanisWorld.deleteMany({});
    await CanisWorld.create({ key: 'default', schemaVersion: 3, entries: Array.from({ length: 4 }, (_, i) => ({ title: `精選 ${i}`, featured: true })) });
  });
  const call = (method, path, body) => request(app)[method](`/api/canis-world/entries${path}`).set('Authorization', `JWT ${token}`).send(body);

  it('允許新增第五篇，拒絕第六篇，但可新增一般日常', async () => {
    expect((await call('post', '', { title: '第五篇', featured: true })).status).toBe(201);
    const rejected = await call('post', '', { title: '第六篇', featured: true });
    expect(rejected.status).toBe(409);
    expect(rejected.text).toContain('5');
    expect((await call('post', '', { title: '一般日常', featured: false })).status).toBe(201);
  });

  it('切換精選也遵守五篇上限，且滿額仍可編輯或取消精選', async () => {
    const fifth = (await call('post', '', { title: '第五篇', featured: false })).body.data;
    expect((await call('patch', `/${fifth._id}`, { featured: true })).status).toBe(200);
    const sixth = (await call('post', '', { title: '第六篇', featured: false })).body.data;
    expect((await call('patch', `/${sixth._id}`, { featured: true })).status).toBe(409);
    expect((await call('patch', `/${fifth._id}`, { featured: true, title: '編輯第五篇' })).status).toBe(200);
    expect((await call('patch', `/${fifth._id}`, { featured: false })).status).toBe(200);
    expect((await call('patch', `/${sixth._id}`, { featured: true })).status).toBe(200);
  });
});
