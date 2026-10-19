const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testDatabasePath = path.join(
  os.tmpdir(),
  `flower-life-integration-${process.pid}-${crypto.randomUUID()}.sqlite`
);

process.env.TEST_DATABASE_PATH = testDatabasePath;
process.env.DATABASE_PATH = testDatabasePath;
process.env.JWT_SECRET = 'flower-life-integration-secret';
process.env.NODE_ENV = 'test';
process.env.ECPAY_ENV = 'staging';
process.env.ECPAY_MERCHANT_ID = '3002607';
process.env.ECPAY_HASH_KEY = 'pwFHCqoQZGmho4w6';
process.env.ECPAY_HASH_IV = 'EkRm7iFT261dpevs';

const request = require('supertest');
const app = require('../../app');
const db = require('../../src/database');

function cleanupDatabaseFiles() {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${testDatabasePath}${suffix}`, { force: true });
  }
}

async function registerMember(label) {
  const email = `integration-${label}-${crypto.randomUUID()}@example.com`;
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: `整合測試會員 ${label}`, email, password: 'password123' });

  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({ error: null, message: '註冊成功' });
  expect(response.body.data.token).toEqual(expect.any(String));
  return response.body.data;
}

afterAll(() => {
  db.close();
  cleanupDatabaseFiles();
});

describe('訂單完整 Integration Test', () => {
  it('由會員、商品、購物車建立含配送資料的訂單，並正確寫入與扣庫存', async () => {
    const member = await registerMember('success');
    const auth = { Authorization: `Bearer ${member.token}` };

    const productsResponse = await request(app).get('/api/products?limit=100');
    expect(productsResponse.status).toBe(200);
    expect(productsResponse.body).toMatchObject({ error: null, message: '成功' });
    const product = productsResponse.body.data.products.find(item => item.stock >= 2);
    expect(product).toBeTruthy();
    const stockBefore = product.stock;

    const cartResponse = await request(app)
      .post('/api/cart')
      .set(auth)
      .send({ productId: product.id, quantity: 2 });
    expect(cartResponse.status).toBe(200);
    expect(cartResponse.body).toMatchObject({
      data: { product_id: product.id, quantity: 2 },
      error: null,
      message: '已加入購物車',
    });

    const orderResponse = await request(app)
      .post('/api/orders')
      .set(auth)
      .send({
        recipientName: '整合測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 100 號',
        deliveryType: 'convenience_store',
        isRemoteArea: true,
        isSameDayExpress: true,
      });

    const expectedSubtotal = product.price * 2;
    const expectedShippingFee = 60 + 200 + 250;
    expect(orderResponse.status).toBe(201);
    expect(orderResponse.body).toMatchObject({
      data: {
        subtotal: expectedSubtotal,
        shipping_fee: expectedShippingFee,
        delivery_type: 'convenience_store',
        is_remote_area: 1,
        is_same_day_express: 1,
        total_amount: expectedSubtotal + expectedShippingFee,
        status: 'pending',
      },
      error: null,
      message: '訂單建立成功',
    });
    expect(orderResponse.body.data.items).toEqual([
      expect.objectContaining({
        product_name: product.name,
        product_price: product.price,
        quantity: 2,
      }),
    ]);

    const savedOrder = db.prepare('SELECT * FROM orders WHERE id = ?')
      .get(orderResponse.body.data.id);
    expect(savedOrder).toMatchObject({
      user_id: member.user.id,
      subtotal: expectedSubtotal,
      shipping_fee: expectedShippingFee,
      total_amount: expectedSubtotal + expectedShippingFee,
      delivery_type: 'convenience_store',
      is_remote_area: 1,
      is_same_day_express: 1,
    });

    const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(savedOrder.id);
    expect(savedItems).toHaveLength(1);
    expect(savedItems[0]).toMatchObject({
      product_id: product.id,
      product_name: product.name,
      product_price: product.price,
      quantity: 2,
    });

    const stockAfter = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock;
    expect(stockAfter).toBe(stockBefore - 2);

    const cartAfter = await request(app).get('/api/cart').set(auth);
    expect(cartAfter.status).toBe(200);
    expect(cartAfter.body.data).toEqual({ items: [], total: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM cart_items WHERE user_id = ?')
      .get(member.user.id).count).toBe(0);
  });

  it('建單交易失敗時不留下訂單、明細或錯誤庫存扣除，並保留購物車', async () => {
    const member = await registerMember('rollback');
    const auth = { Authorization: `Bearer ${member.token}` };
    const productsResponse = await request(app).get('/api/products?limit=100');
    const product = productsResponse.body.data.products.find(item => item.stock >= 1);
    expect(product).toBeTruthy();

    const addResponse = await request(app)
      .post('/api/cart')
      .set(auth)
      .send({ productId: product.id, quantity: 1 });
    expect(addResponse.status).toBe(200);

    const stockBefore = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock;
    const orderCountBefore = db.prepare('SELECT COUNT(*) AS count FROM orders WHERE user_id = ?')
      .get(member.user.id).count;
    const itemCountBefore = db.prepare('SELECT COUNT(*) AS count FROM order_items').get().count;

    db.exec(`
      CREATE TRIGGER integration_abort_order_item
      BEFORE INSERT ON order_items
      BEGIN
        SELECT RAISE(ABORT, 'integration forced failure');
      END;
    `);

    let failedResponse;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      failedResponse = await request(app)
        .post('/api/orders')
        .set(auth)
        .send({
          recipientName: '交易回滾測試',
          recipientEmail: 'rollback@example.com',
          recipientAddress: '台北市回滾路 1 號',
          deliveryType: 'home_delivery',
          isRemoteArea: false,
          isSameDayExpress: false,
        });
    } finally {
      db.exec('DROP TRIGGER IF EXISTS integration_abort_order_item');
      errorLog.mockRestore();
    }

    expect(failedResponse.status).toBe(500);
    expect(failedResponse.body).toEqual({
      data: null,
      error: 'INTERNAL_ERROR',
      message: '伺服器內部錯誤',
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM orders WHERE user_id = ?')
      .get(member.user.id).count).toBe(orderCountBefore);
    expect(db.prepare('SELECT COUNT(*) AS count FROM order_items').get().count).toBe(itemCountBefore);
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock).toBe(stockBefore);
    expect(db.prepare('SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?')
      .get(member.user.id, product.id).quantity).toBe(1);
  });
});
