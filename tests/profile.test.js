const request = require('supertest');
const createApp = require('../src/app');

describe('profile api', () => {
  const app = createApp();

  it('returns 503 when database is not ready', async () => {
    const res = await request(app).get('/api/profile');

    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Database not ready');
  });
});
