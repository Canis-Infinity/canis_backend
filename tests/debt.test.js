const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { MongoMemoryServer } = require('mongodb-memory-server');
const createApp = require('../src/app');
const { DebtUser, DebtSession, Debt, ensureDebtIndexes } = require('../src/debt/models');

describe('independent debt accounts and records', () => {
  let mongo, app, owner, other, admin;
  const input = { date: '2026-09-24', amount: 1000, lender: '測試親友', payment: { method: 'bank', bankCode: '004', bankAccount: '001234567890' }, note: '測試' };
  const repayment = { date: '2026-09-24', amount: 400, payment: { method: 'cash' }, note: '' };
  async function account(role = 'user', status = 'approved') {
    const user = await DebtUser.create({ name: '測試使用者', email: `${crypto.randomUUID()}@example.test`, passwordHash: 'not-used-in-session-tests', role, status });
    const token = crypto.randomBytes(32).toString('hex');
    await DebtSession.create({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), user: user._id, expiresAt: new Date(Date.now() + 60000) });
    return { user, cookie: `debt_session=${token}` };
  }
  const call = (identity, method, path, body) => {
    const req = request(app)[method](`/api/debt${path}`).set('X-Debt-Request', '1');
    if (identity) req.set('Cookie', identity.cookie);
    return body === undefined ? req : req.send(body);
  };
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: 'debt_test' });
    await ensureDebtIndexes();
    app = createApp();
  }, 180000);
  beforeEach(async () => {
    await Promise.all([Debt.deleteMany({}), DebtSession.deleteMany({}), DebtUser.deleteMany({})]);
    [owner, other, admin] = await Promise.all([account(), account(), account('admin')]);
  });
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  it('validates and persists custom payment methods for debts and repayments', async () => {
    for (const description of [undefined, '', '   ', '字'.repeat(101)]) {
      const result = await call(owner, 'post', '/debts', { ...input, payment: { method: 'other', description } });
      expect(result.status).toBe(422);
    }
    const payment = { method: 'other', description: '  郵政劃撥  ' };
    const created = await call(owner, 'post', '/debts', { ...input, payment });
    expect(created.status).toBe(201);
    let debt = created.body.debt;
    expect(debt.payment).toEqual({ method: 'other', description: '郵政劃撥' });
    expect((await call(owner, 'post', `/debts/${debt.id}/repayments`, { ...repayment, payment: { method: 'other', description: '' }, version: debt.version })).status).toBe(422);
    debt = (await call(owner, 'post', `/debts/${debt.id}/repayments`, { ...repayment, payment, version: debt.version })).body.debt;
    expect(debt.repayments[0].payment).toEqual(debt.payment);
    debt = (await call(owner, 'put', `/debts/${debt.id}`, { ...input, payment: { method: 'cash' }, version: debt.version })).body.debt;
    expect(debt.payment).toEqual({ method: 'cash' });
    const stored = (await call(owner, 'get', '/debts')).body.debts[0];
    expect(stored.repayments[0].payment.description).toBe('郵政劃撥');
  });
  it('changes only the authenticated password and invalidates every session', async () => {
    const currentPassword = 'old-password-for-test';
    await DebtUser.updateOne({ _id: owner.user._id }, { passwordHash: await bcrypt.hash(currentPassword, 4) });
    const input = { currentPassword, newPassword: 'new-password-for-test', confirmPassword: 'new-password-for-test' };
    expect((await call(null, 'post', '/auth/password', input)).status).toBe(401);
    expect((await call(owner, 'post', '/auth/password', { ...input, currentPassword: 'incorrect' })).status).toBe(422);
    expect((await call(owner, 'post', '/auth/password', { ...input, confirmPassword: 'mismatch' })).status).toBe(422);
    expect((await call(owner, 'post', '/auth/password', { ...input, newPassword: 'short', confirmPassword: 'short' })).status).toBe(422);
    const secondLogin = await call(null, 'post', '/auth/login', { email: owner.user.email, password: currentPassword });
    const second = { cookie: secondLogin.headers['set-cookie'][0].split(';')[0] };
    expect((await call(owner, 'post', '/auth/password', input)).status).toBe(200);
    expect((await call(owner, 'get', '/auth/me')).status).toBe(401);
    expect((await call(second, 'get', '/auth/me')).status).toBe(401);
    expect((await call(other, 'get', '/auth/me')).status).toBe(200);
    // A login that verified the old password before the change cannot revive access.
    const staleToken = crypto.randomBytes(32).toString('hex');
    await DebtSession.create({ user: owner.user._id, tokenHash: crypto.createHash('sha256').update(staleToken).digest('hex'), credentialVersion: 0, expiresAt: new Date(Date.now() + 60000) });
    expect((await call({ cookie: `debt_session=${staleToken}` }, 'get', '/auth/me')).status).toBe(401);
    expect((await call(null, 'post', '/auth/login', { email: owner.user.email, password: currentPassword })).status).toBe(401);
    expect((await call(null, 'post', '/auth/login', { email: owner.user.email, password: input.newPassword })).status).toBe(200);
  }, 15000);
  it('updates only your own name and rejects empty names and privilege changes', async () => {
    expect((await call(null, 'patch', '/auth/profile', { name: 'New' })).status).toBe(401);
    for (const input of [{ name: '  ' }, { name: 'x'.repeat(81) }, { name: 'New', role: 'admin' }, { name: 'New', userId: other.user.id }]) {
      expect((await call(owner, 'patch', '/auth/profile', input)).status).toBe(422);
    }
    const changed = await call(owner, 'patch', '/auth/profile', { name: '  新名稱  ' });
    expect(changed.status).toBe(200);
    expect(changed.body.user.name).toBe('新名稱');
    expect(changed.body.user.role).toBe('user');
    expect(changed.body.user.passwordHash).toBeUndefined();
    expect((await call(owner, 'get', '/auth/me')).body.user.name).toBe('新名稱');
    expect((await call(other, 'get', '/auth/me')).body.user.name).toBe(other.user.name);
    expect((await call(admin, 'patch', '/auth/profile', { name: '管理員新名稱' })).status).toBe(200);
  });
  it('requires independent sessions and rejects the other project JWT', async () => {
    expect((await call(null, 'get', '/debts')).status).toBe(401);
    expect((await request(app).get('/api/debt/debts').set('Authorization', 'Bearer other-project-token')).status).toBe(401);
  });
  it('registers pending accounts, denies login before approval, allows approval and revokes suspended sessions', async () => {
    const signup = { name: '新使用者', email: 'NewUser@example.test', password: 'secure-test-password-2026' };
    expect((await call(null, 'post', '/auth/register', signup)).status).toBe(201);
    let user = await DebtUser.findOne({ email: signup.email.toLowerCase() });
    expect(user.status).toBe('pending'); expect(user.role).toBe('user');
    const credentials = { email: signup.email, password: signup.password };
    expect((await call(null, 'post', '/auth/login', credentials)).status).toBe(403);
    expect((await call(owner, 'patch', `/admin/users/${user.id}`, { status: 'approved', version: 0 })).status).toBe(403);
    const approved = await call(admin, 'patch', `/admin/users/${user.id}`, { status: 'approved', version: 0 });
    expect(approved.status).toBe(200);
    const login = await call(null, 'post', '/auth/login', credentials);
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).not.toContain('Domain=');
    const identity = { cookie: cookie.split(';')[0] };
    expect((await call(identity, 'get', '/auth/me')).status).toBe(200);
    expect((await call(admin, 'patch', `/admin/users/${user.id}`, { status: 'suspended', version: approved.body.user.version })).status).toBe(200);
    expect((await call(identity, 'get', '/debts')).status).toBe(401);
  }, 15000);
  it('rejects duplicate registration and privilege injection', async () => {
    const data = { name: '測試', email: owner.user.email, password: 'secure-test-password-2026' };
    expect((await call(null, 'post', '/auth/register', data)).status).toBe(409);
    expect((await call(null, 'post', '/auth/register', { ...data, email: 'evil@example.test', role: 'admin' })).status).toBe(422);
  });
  it('keeps even administrators out of other people’s debts', async () => {
    const created = await call(owner, 'post', '/debts', input);
    const id = created.body.debt.id;
    for (const identity of [other, admin]) {
      expect((await call(identity, 'get', '/debts')).body.debts).toHaveLength(0);
      expect((await call(identity, 'put', `/debts/${id}`, { ...input, version: 0 })).status).toBe(404);
      expect((await call(identity, 'delete', `/debts/${id}`, { version: 0 })).status).toBe(404);
      expect((await call(identity, 'post', `/debts/${id}/repayments`, { ...repayment, version: 0 })).status).toBe(404);
    }
  });
  it('validates integer money, real dates, and bank accounts', async () => {
    for (const bad of [{ amount: 1.5 }, { amount: 0 }, { amount: -1 }, { amount: '100' }, { date: '2026-02-30' }, { payment: { method: 'bank', bankCode: '4', bankAccount: '' } }]) {
      expect((await call(owner, 'post', '/debts', { ...input, ...bad })).status).toBe(422);
    }
  });
  it('keeps date-only values and full creation/update timestamps', async () => {
    const created = await call(owner, 'post', '/debts', input);
    expect(created.status).toBe(201);
    expect(created.body.debt.date).toBe('2026-09-24');
    expect(created.body.debt.createdAt).toMatch(/T.*Z$/);
    const added = await call(owner, 'post', `/debts/${created.body.debt.id}/repayments`, { ...repayment, version: 0 });
    expect(added.body.debt.remaining).toBe(600);
    expect(added.body.debt.repayments[0].createdAt).toMatch(/T.*Z$/);
  });
  it('prevents overpayment and lowering principal below paid amount; edits and deletes repayments', async () => {
    let debt = (await call(owner, 'post', '/debts', input)).body.debt;
    debt = (await call(owner, 'post', `/debts/${debt.id}/repayments`, { ...repayment, version: debt.version })).body.debt;
    expect((await call(owner, 'post', `/debts/${debt.id}/repayments`, { ...repayment, amount: 601, version: debt.version })).status).toBe(422);
    expect((await call(owner, 'put', `/debts/${debt.id}`, { ...input, amount: 399, version: debt.version })).status).toBe(422);
    const repaymentId = debt.repayments[0].id;
    expect((await call(owner, 'put', `/debts/${debt.id}/repayments/${repaymentId}`, { ...repayment, amount: 1001, version: debt.version })).status).toBe(422);
    debt = (await call(owner, 'put', `/debts/${debt.id}/repayments/${repaymentId}`, { ...repayment, amount: 1000, version: debt.version })).body.debt;
    expect(debt.remaining).toBe(0);
    debt = (await call(owner, 'delete', `/debts/${debt.id}/repayments/${repaymentId}`, { version: debt.version })).body.debt;
    expect(debt.remaining).toBe(1000); expect(debt.repayments).toHaveLength(0);
  });
  it('rejects stale writes and concurrent repayments atomically', async () => {
    const debt = (await call(owner, 'post', '/debts', input)).body.debt;
    const responses = await Promise.all([1, 2].map(() => call(owner, 'post', `/debts/${debt.id}/repayments`, { ...repayment, amount: 700, version: 0 })));
    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
    expect((await call(owner, 'delete', `/debts/${debt.id}`, { version: 0 })).status).toBe(409);
    const stored = await Debt.findById(debt.id);
    expect(stored.repayments).toHaveLength(1);
  });
  it('deletes debt and all embedded repayments together', async () => {
    let debt = (await call(owner, 'post', '/debts', input)).body.debt;
    debt = (await call(owner, 'post', `/debts/${debt.id}/repayments`, { ...repayment, version: 0 })).body.debt;
    expect((await call(owner, 'delete', `/debts/${debt.id}`, { version: debt.version })).status).toBe(200);
    expect(await Debt.findById(debt.id)).toBeNull();
  });
  it('rejects expired sessions and logout invalidates server-side tokens', async () => {
    await DebtSession.updateMany({ user: owner.user._id }, { expiresAt: new Date(0) });
    expect((await call(owner, 'get', '/auth/me')).status).toBe(401);
    expect((await call(other, 'post', '/auth/logout', {})).status).toBe(200);
    expect((await call(other, 'get', '/auth/me')).status).toBe(401);
  });
  it('protects administrator accounts and returns no password hashes', async () => {
    expect((await call(owner, 'get', '/admin/users')).status).toBe(403);
    const list = await call(admin, 'get', '/admin/users');
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');
    expect((await call(admin, 'patch', `/admin/users/${admin.user.id}`, { status: 'suspended', version: 0 })).status).toBe(403);
  });
  it('rejects cross-site form writes and disables API caching', async () => {
    const response = await request(app).post('/api/debt/debts').set('Cookie', owner.cookie).send(input);
    expect(response.status).toBe(403);
    expect((await call(owner, 'get', '/debts')).headers['cache-control']).toBe('no-store');
  });
  it('issues secure cookies for HTTPS requests', async () => {
    owner.user.passwordHash = await bcrypt.hash('secure-test-password-2026', 12); await owner.user.save();
    const response = await request(app).post('/api/debt/auth/login').set('X-Debt-Request', '1').set('X-Forwarded-Proto', 'https').send({ email: owner.user.email, password: 'secure-test-password-2026' });
    expect(response.headers['set-cookie'][0]).toContain('Secure');
  });
  it('adds, edits and removes borrowings while preserving the original amount and timestamps', async () => {
    let debt = (await call(owner, 'post', '/debts', input)).body.debt;
    const id = debt.id;
    const added = await call(owner, 'post', `/debts/${id}/borrowings`, { date: '2026-09-25', amount: 500, note: '再次借款', version: debt.version });
    expect(added.status).toBe(201);
    debt = added.body.debt;
    expect(debt.amount).toBe(1500); expect(debt.initialAmount).toBe(1000); expect(debt.remaining).toBe(1500);
    expect(debt.borrowings[0].createdAt).toMatch(/T.*Z$/);
    const borrowingId = debt.borrowings[0].id;
    debt = (await call(owner, 'put', `/debts/${id}/borrowings/${borrowingId}`, { date: '2026-09-26', amount: 600, note: '更正', version: debt.version })).body.debt;
    expect(debt.amount).toBe(1600); expect(debt.initialAmount).toBe(1000);
    debt = (await call(owner, 'put', `/debts/${id}`, { ...input, amount: 1800, version: debt.version })).body.debt;
    expect(debt.amount).toBe(1800); expect(debt.initialAmount).toBe(1200); expect(debt.borrowings[0].amount).toBe(600);
    debt = (await call(owner, 'delete', `/debts/${id}/borrowings/${borrowingId}`, { version: debt.version })).body.debt;
    expect(debt.amount).toBe(1200); expect(debt.borrowings).toHaveLength(0);
  });
  it('protects borrowing mutations by owner, version, integer limits and paid balance', async () => {
    let debt = (await call(owner, 'post', '/debts', input)).body.debt;
    const id = debt.id;
    const data = { date: '2026-09-25', amount: 500, note: '', version: debt.version };
    expect((await call(other, 'post', `/debts/${id}/borrowings`, data)).status).toBe(404);
    expect((await call(owner, 'post', `/debts/${id}/borrowings`, { ...data, amount: 0.5 })).status).toBe(422);
    expect((await call(owner, 'post', `/debts/${id}/borrowings`, { ...data, amount: 999999999999 })).status).toBe(422);
    debt = (await call(owner, 'post', `/debts/${id}/borrowings`, data)).body.debt;
    expect((await call(owner, 'post', `/debts/${id}/borrowings`, data)).status).toBe(409);
    const bid = debt.borrowings[0].id;
    debt = (await call(owner, 'post', `/debts/${id}/repayments`, { ...repayment, amount: 1400, version: debt.version })).body.debt;
    expect((await call(owner, 'delete', `/debts/${id}/borrowings/${bid}`, { version: debt.version })).status).toBe(422);
    expect((await call(owner, 'put', `/debts/${id}/borrowings/${bid}`, { ...data, amount: 300, version: debt.version })).status).toBe(422);
    const stored = await Debt.findById(id);
    expect(stored.amount).toBe(1500); expect(stored.borrowings[0].amount).toBe(500);
    expect((await call(owner, 'delete', `/debts/${id}`, { version: debt.version })).status).toBe(200);
    expect(await Debt.findById(id)).toBeNull();
  });
  it('reads legacy debts without migration and permits only one concurrent borrowing mutation', async () => {
    const legacy = await Debt.collection.insertOne({ owner: owner.user._id, ...input, repayments: [], __v: 0, createdAt: new Date(), updatedAt: new Date() });
    const listed = (await call(owner, 'get', '/debts')).body.debts[0];
    expect(listed.initialAmount).toBe(1000); expect(listed.borrowings).toEqual([]);
    const data = { date: '2026-09-25', amount: 500, note: '', version: 0 };
    const responses = await Promise.all([call(owner, 'post', `/debts/${legacy.insertedId}/borrowings`, data), call(owner, 'post', `/debts/${legacy.insertedId}/borrowings`, data)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const debt = await Debt.findById(legacy.insertedId);
    expect(debt.amount).toBe(1500); expect(debt.borrowings).toHaveLength(1);
  });

});
