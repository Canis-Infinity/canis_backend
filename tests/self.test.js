const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');
const createApp = require('../src/app');
const {
  SelfUser: User,
  SelfSession: Session,
  SelfEntry: Entry,
  SelfImage: Image,
  ensureIndexes,
} = require('../src/self/models');
describe('Self private journal', () => {
  let mongo, app, owner, other;
  const now = '2026-11-26T10:30:00+08:00';
  const samples = [
    { kind: 'mood', data: { score: 3, emotions: '平靜', trigger: '散步' } },
    {
      kind: 'sleep',
      data: {
        bedtime: '2026-11-25T23:00:00+08:00',
        wakeAt: '2026-11-26T07:00:00+08:00',
        quality: 4,
      },
    },
    { kind: 'body', data: { metric: 'weight', value: 60.2, unit: 'kg' } },
    {
      kind: 'medication',
      data: {
        period: 'morning',
        status: 'taken',
        reaction: '有些頭暈',
      },
    },
    {
      kind: 'reflection',
      data: { content: '想到一件事' },
    },
    {
      kind: 'appointment',
      data: {
        session: 'afternoon',
        number: '25',
        questions: '睡眠狀況',
      },
    },
  ].map((r) => ({
    ...r,
    occurredAt: now,
    title: r.kind,
    note: '備註',
    images: [],
  }));
  const call = (identity, method, path, body) => {
    const req = request(app)
      [method](`/api/self${path}`)
      .set('X-Self-Request', '1');
    if (identity) req.set('Cookie', identity.cookie);
    return body === undefined ? req : req.send(body);
  };
  async function identity(email) {
    const user = await User.create({
      name: '測試',
      email,
      passwordHash: await bcrypt.hash('self-test-password', 4),
    });
    const token = crypto.randomBytes(32).toString('hex');
    await Session.create({
      user: user._id,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 600000),
    });
    return { user, cookie: `self_session=${token}` };
  }
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: 'self_test' });
    await ensureIndexes();
    app = createApp();
  }, 180000);
  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Session.deleteMany({}),
      Entry.deleteMany({}),
      Image.deleteMany({}),
    ]);
    owner = await identity('owner@self.test');
    other = await identity('other@self.test');
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });
  it.skipIf(!process.env.SELF_CHROMIUM_PATH)('renders a PDF with owned images and rejects other users images', async () => {
    const image = await Image.create({owner:owner.user._id,mime:'image/png',name:'test.png',data:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NmcAAAAASUVORK5CYII=','base64')});
    const input = {theme:'light',css:'@page{size:A4;margin:15mm}',html:`<h1>回診摘要</h1><img src="https://self-pdf.invalid/api/self/images/${image._id}">`};
    const result = await call(owner,'post','/report-pdf',input);
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('application/pdf');
    expect(result.body.subarray(0,4).toString()).toBe('%PDF');
    expect((await call(other,'post','/report-pdf',input)).status).toBeGreaterThanOrEqual(400);
  }, 60000);
  it('protects PDF export and validates the print snapshot', async () => {
    expect((await call(null, 'post', '/report-pdf', {})).status).toBe(401);
    expect(
      (
        await call(owner, 'post', '/report-pdf', {
          html: '',
          css: '',
          theme: 'dark',
        })
      ).status,
    ).toBe(422);
  });
  it('requires login, supports login/logout and has no public registration', async () => {
    expect((await call(null, 'get', '/entries')).status).toBe(401);
    expect(
      (await call(null, 'post', '/auth/register', { email: 'x@y.test' }))
        .status,
    ).not.toBe(201);
    const login = await call(null, 'post', '/auth/login', {
      email: 'owner@self.test',
      password: 'self-test-password',
    });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    const session = { cookie: login.headers['set-cookie'][0].split(';')[0] };
    expect((await call(session, 'get', '/auth/me')).body.user.name).toBe(
      '測試',
    );
    await call(session, 'post', '/auth/logout', {});
    expect((await call(session, 'get', '/entries')).status).toBe(401);
    expect(
      (
        await call(null, 'post', '/auth/login', {
          email: 'owner@self.test',
          password: 'wrong',
        })
      ).status,
    ).toBe(401);
  });
  it('uses the same seven-day session regardless of remembered email preference', async () => {
    for (const remember of [false, true]) {
      const response = await call(null, 'post', '/auth/login', {
        email: 'owner@self.test',
        password: 'self-test-password',
        remember,
      });
      expect(response.status).toBe(200);
      const cookie = response.headers['set-cookie'][0];
      expect(cookie).toContain('Max-Age=604800');
      const token = cookie.split(';')[0].slice('self_session='.length);
      const stored = await Session.findOne({
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      });
      const remaining = stored.expiresAt.getTime() - Date.now();
      expect(remaining).toBeGreaterThan(7 * 86400000 - 10000);
      expect(remaining).toBeLessThanOrEqual(7 * 86400000);
    }
  });
  it('validates the new medication and appointment fields with readable messages', async () => {
    const missingMood = await call(owner, 'post', '/entries', {
      ...samples[0],
      data: { emotions: '', trigger: '' },
    });
    expect(missingMood.body.message).toBe('請選擇此刻心情');
    const missingPeriod = await call(owner, 'post', '/entries', {
      ...samples[3],
      data: { status: 'taken', reaction: '' },
    });
    expect(missingPeriod.body.message).toBe('請選擇用藥時段');
    const missingSession = await call(owner, 'post', '/entries', {
      ...samples[5],
      data: { number: '25', questions: '' },
    });
    expect(missingSession.body.message).toBe('請選擇看診時段');
    for (const period of ['morning', 'noon', 'evening', 'bedtime'])
      expect(
        (
          await call(owner, 'post', '/entries', {
            ...samples[3],
            data: { period, status: 'skipped', reaction: '' },
          })
        ).status,
      ).toBe(201);
  });
  it('keeps legacy fields when older records are edited with the new fields', async () => {
    const data = {
      medicine: '舊藥品',
      dose: '1 顆',
      status: 'taken',
      reaction: '',
    };
    const old = await Entry.create({
      ...samples[3],
      data,
      owner: owner.user._id,
    });
    const result = await call(owner, 'put', `/entries/${old._id}`, {
      ...samples[3],
      data: { ...data, period: 'evening' },
      version: 0,
    });
    expect(result.status).toBe(200);
    expect(result.body.entry.data).toMatchObject({
      ...data,
      period: 'evening',
    });
  });
  it.each(samples)(
    'creates, edits and deletes $kind with ownership and version checks',
    async (input) => {
      const created = await call(owner, 'post', '/entries', input);
      expect(created.status).toBe(201);
      const record = created.body.entry;
      expect((await call(other, 'get', '/entries')).body.entries).toHaveLength(
        0,
      );
      expect(
        (
          await call(other, 'put', `/entries/${record.id}`, {
            ...input,
            version: 0,
          })
        ).status,
      ).toBe(409);
      const update = await call(owner, 'put', `/entries/${record.id}`, {
        ...input,
        title: '已更新',
        version: 0,
      });
      expect(update.body.entry.version).toBe(1);
      expect(
        (
          await call(owner, 'put', `/entries/${record.id}`, {
            ...input,
            version: 0,
          })
        ).status,
      ).toBe(409);
      expect(
        (await call(other, 'delete', `/entries/${record.id}`, { version: 1 }))
          .status,
      ).toBe(409);
      expect(
        (await call(owner, 'delete', `/entries/${record.id}`, { version: 1 }))
          .status,
      ).toBe(200);
      expect((await call(owner, 'get', '/entries')).body.total).toBe(0);
    },
  );
  it('rejects invalid dates, sleep ranges, scores and removed scales', async () => {
    for (const input of [
      { ...samples[0], occurredAt: 'bad' },
      { ...samples[0], data: { ...samples[0].data, score: 6 } },
      {
        ...samples[1],
        data: { ...samples[1].data, wakeAt: '2026-11-25T20:00:00+08:00' },
      },
      { ...samples[0], kind: 'scale' },
    ])
      expect((await call(owner, 'post', '/entries', input)).status).toBe(422);
    expect(
      (
        await request(app)
          .post('/api/self/entries')
          .set('Cookie', owner.cookie)
          .send(samples[0])
      ).status,
    ).toBe(403);
  });
  it('filters by dates and type, paginates without dropping entries', async () => {
    await Entry.insertMany(
      Array.from({ length: 105 }, (_, i) => ({
        ...samples[0],
        title: String(i),
        owner: owner.user._id,
      })),
    );
    expect(
      (await call(owner, 'get', '/entries?page=1')).body.entries,
    ).toHaveLength(100);
    expect(
      (await call(owner, 'get', '/entries?page=2')).body.entries,
    ).toHaveLength(5);
    expect((await call(owner, 'get', '/entries?kind=sleep')).body.total).toBe(
      0,
    );
    expect(
      (await call(owner, 'get', '/entries?from=2026-11-27T00:00:00Z')).body
        .total,
    ).toBe(0);
  });
  it('allows private image attachments and rejects SVG, spoofing and other users images', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6OHsAAAAASUVORK5CYII=',
      'base64',
    );
    const upload = await request(app)
      .post('/api/self/images')
      .set('Cookie', owner.cookie)
      .set('X-Self-Request', '1')
      .attach('file', png, { filename: 'test.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    const id = upload.body.id;
    expect(
      (await call(owner, 'get', `/images/${id}`)).headers['cache-control'],
    ).toBe('no-store');
    expect((await call(other, 'get', `/images/${id}`)).status).toBe(404);
    expect((await call(null, 'get', `/images/${id}`)).status).toBe(401);
    expect(
      (await call(other, 'post', '/entries', { ...samples[0], images: [id] }))
        .status,
    ).toBe(422);
    expect(
      (await call(owner, 'post', '/entries', { ...samples[0], images: [id] }))
        .status,
    ).toBe(201);
    for (const mime of ['image/svg+xml', 'image/png'])
      expect(
        (
          await request(app)
            .post('/api/self/images')
            .set('Cookie', owner.cookie)
            .set('X-Self-Request', '1')
            .attach('file', Buffer.from('<svg></svg>'), {
              filename: 'fake.png',
              contentType: mime,
            })
        ).status,
      ).toBe(422);
  });
});
