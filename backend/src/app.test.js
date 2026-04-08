const request = require('supertest');
const app = require('./app');

describe('Health Check', () => {
  it('GET /health should return status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth Protection', () => {
  it('GET /me without token should return 401', async () => {
    const res = await request(app).get('/me');
    expect(res.statusCode).toBe(401);
  });

  it('GET /admin without token should return 401', async () => {
    const res = await request(app).get('/admin');
    expect(res.statusCode).toBe(401);
  });
});