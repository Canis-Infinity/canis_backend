const request = require('supertest');
const createApp = require('../src/app');

describe('backend app', () => {
  const app = createApp();

  it('returns health status', async () => {
    const res = await request(app).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('mongoReady');
  });

  it('returns a structured 404 payload', async () => {
    const res = await request(app).get('/missing-route');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not Found');
    expect(res.body).toHaveProperty('requestId');
  });

  it('does not expose legacy iistw content APIs', async () => {
    const res = await request(app).get('/api/works');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not Found');
  });
});
