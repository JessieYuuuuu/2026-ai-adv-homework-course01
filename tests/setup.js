const request = require('supertest');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

// Set this before app/database is required so Vitest never writes to the
// development database.sqlite. The file is unique to this test process.
if (!process.env.TEST_DATABASE_PATH) {
  process.env.TEST_DATABASE_PATH = path.join(
    os.tmpdir(),
    `flower-life-vitest-${process.pid}-${crypto.randomUUID()}.sqlite`
  );
}
process.env.DATABASE_PATH = process.env.TEST_DATABASE_PATH;
process.env.ECPAY_ENV = 'staging';
process.env.ECPAY_MERCHANT_ID = '3002607';
process.env.ECPAY_HASH_KEY = 'pwFHCqoQZGmho4w6';
process.env.ECPAY_HASH_IV = 'EkRm7iFT261dpevs';
process.env.BASE_URL = 'http://localhost:3001';

const app = require('../app');
const db = require('../src/database');

/**
 * Login with the seed admin account and return the JWT token.
 */
async function getAdminToken() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@hexschool.com', password: '12345678' });
  return res.body.data.token;
}

/**
 * Register a new user and return { token, user }.
 */
async function registerUser(overrides = {}) {
  const email = overrides.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      password: overrides.password || 'password123',
      name: overrides.name || '測試使用者',
    });
  return { token: res.body.data.token, user: res.body.data.user };
}

module.exports = { app, db, request, getAdminToken, registerUser };
