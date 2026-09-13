const { app, db, request, registerUser } = require('./setup');
const { createCheckMacValue } = require('../src/services/ecpayService');
const { verifyAttempt } = require('../src/services/paymentScheduler');

const config = {
  merchantId: process.env.ECPAY_MERCHANT_ID,
  hashKey: process.env.ECPAY_HASH_KEY,
  hashIv: process.env.ECPAY_HASH_IV
};

function queryResponse(attempt, fields) {
  const data = {
    MerchantID: attempt.merchant_id,
    MerchantTradeNo: attempt.merchant_trade_no,
    TradeAmt: String(attempt.amount),
    TradeStatus: '1',
    ...fields
  };
  data.CheckMacValue = createCheckMacValue(data, config);
  return {
    ok: true,
    status: 200,
    text: async () => new URLSearchParams(data).toString()
  };
}

async function createPendingPayment() {
  const { token } = await registerUser();
  const productRes = await request(app).get('/api/products');
  const productId = productRes.body.data.products[0].id;
  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity: 1 });
  const orderRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      recipientName: '付款測試收件人',
      recipientEmail: 'payment-test@example.com',
      recipientAddress: '台北市測試路 1 號'
    });
  const orderId = orderRes.body.data.id;
  const paymentRes = await request(app)
    .post(`/api/orders/${orderId}/payment`)
    .set('Authorization', `Bearer ${token}`);
  const attempt = db.prepare('SELECT * FROM payment_attempts WHERE order_id = ?').get(orderId);
  return { token, orderId, paymentRes, attempt };
}

describe('ECPay payment API and scheduler', () => {
  beforeEach(() => {
    db.prepare('UPDATE payment_scheduler_state SET paused_until = NULL, last_outbound_at = NULL WHERE id = 1').run();
  });

  it('creates one staging payment form and rejects a duplicate pending payment', async () => {
    const { token, orderId, paymentRes } = await createPendingPayment();

    expect(paymentRes.status).toBe(200);
    expect(paymentRes.body.data.action).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
    expect(paymentRes.body.data.fields.ChoosePayment).toBe('Credit');
    expect(paymentRes.body.data.fields.CheckMacValue).toHaveLength(64);

    const duplicateRes = await request(app)
      .post(`/api/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${token}`);
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.error).toBe('PAYMENT_PENDING');
  });

  it('marks an order paid only after a signed matching query response', async () => {
    const { orderId, attempt } = await createPendingPayment();
    const result = await verifyAttempt(attempt.id, {
      force: true,
      fetchImpl: async () => queryResponse(attempt, { TradeNo: 'ECPAY-PAID', PaymentDate: '2026/09/13 12:00:00' })
    });

    expect(result.status).toBe('1');
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('paid');
    expect(db.prepare('SELECT status, trade_no FROM payment_attempts WHERE id = ?').get(attempt.id))
      .toMatchObject({ status: 'paid', trade_no: 'ECPAY-PAID' });
  });

  it('keeps the order pending when a signed response has a mismatched amount', async () => {
    const { orderId, attempt } = await createPendingPayment();
    const result = await verifyAttempt(attempt.id, {
      force: true,
      fetchImpl: async () => queryResponse(attempt, { TradeAmt: String(attempt.amount + 1) })
    });

    expect(result.error).toBe('AMOUNT_MISMATCH');
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('pending');
    expect(db.prepare('SELECT error_code FROM payment_attempts WHERE id = ?').get(attempt.id).error_code)
      .toBe('AMOUNT_MISMATCH');
  });

  it('persists a 403 pause without updating the payment result', async () => {
    const { orderId, attempt } = await createPendingPayment();
    const result = await verifyAttempt(attempt.id, {
      force: true,
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => '' })
    });

    expect(result.skipped).toBe('PAUSED');
    expect(new Date(result.pausedUntil).getTime()).toBeGreaterThan(Date.now());
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('pending');
    expect(db.prepare('SELECT error_code FROM payment_attempts WHERE id = ?').get(attempt.id).error_code)
      .toBe('HTTP_403_PAUSED');
  });

  it('does not call ECPay while the shared outbound throttle is active', async () => {
    const { attempt } = await createPendingPayment();
    db.prepare('UPDATE payment_scheduler_state SET last_outbound_at = ? WHERE id = 1')
      .run(new Date().toISOString());
    let called = false;

    const result = await verifyAttempt(attempt.id, {
      force: true,
      fetchImpl: async () => {
        called = true;
        return queryResponse(attempt, {});
      }
    });

    expect(result.skipped).toBe('THROTTLED');
    expect(called).toBe(false);
  });
});
