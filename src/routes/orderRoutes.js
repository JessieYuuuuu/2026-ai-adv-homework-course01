const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const { getConfig, cleanItemName, buildPaymentForm } = require('../services/ecpayService');
const { verifyAttempt, verifyReturnedAttempt, paymentSummary, QUERY_INTERVAL_MS } = require('../services/paymentScheduler');

const router = express.Router();

router.use(authMiddleware);

function generateOrderNo() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = uuidv4().slice(0, 5).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

function generateMerchantTradeNo() {
  return `FL${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(5).toString('hex').toUpperCase()}`.slice(0, 20);
}

function getOwnedOrder(id, userId) {
  return db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, userId);
}

function getLatestPayment(orderId) {
  return db.prepare('SELECT * FROM payment_attempts WHERE order_id = ? ORDER BY created_at DESC LIMIT 1').get(orderId);
}

/**
 * @openapi
 * /api/orders:
 *   post:
 *     summary: 從購物車建立訂單
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientName, recipientEmail, recipientAddress]
 *             properties:
 *               recipientName:
 *                 type: string
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *               recipientAddress:
 *                 type: string
 *     responses:
 *       201:
 *         description: 訂單建立成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order_no:
 *                       type: string
 *                     total_amount:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           product_name:
 *                             type: string
 *                           product_price:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                     created_at:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 購物車為空或庫存不足或收件資訊缺失
 */
router.post('/', (req, res) => {
  const { recipientName, recipientEmail, recipientAddress } = req.body;
  const userId = req.user.userId;

  if (!recipientName || !recipientEmail || !recipientAddress) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '收件人姓名、Email 和地址為必填欄位'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'Email 格式不正確'
    });
  }

  // Get cart items with product info
  const cartItems = db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name as product_name, p.price as product_price, p.stock as product_stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`
  ).all(userId);

  if (cartItems.length === 0) {
    return res.status(400).json({
      data: null,
      error: 'CART_EMPTY',
      message: '購物車為空'
    });
  }

  // Check stock
  const insufficientItems = cartItems.filter(item => item.quantity > item.product_stock);
  if (insufficientItems.length > 0) {
    const names = insufficientItems.map(i => i.product_name).join(', ');
    return res.status(400).json({
      data: null,
      error: 'STOCK_INSUFFICIENT',
      message: `以下商品庫存不足：${names}`
    });
  }

  // Calculate total
  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.product_price * item.quantity, 0
  );

  const orderId = uuidv4();
  const orderNo = generateOrderNo();

  // Transaction: create order, order items, deduct stock, clear cart
  const createOrder = db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(orderId, orderNo, userId, recipientName, recipientEmail, recipientAddress, totalAmount);

    const insertItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of cartItems) {
      insertItem.run(uuidv4(), orderId, item.product_id, item.product_name, item.product_price, item.quantity);
      updateStock.run(item.quantity, item.product_id);
    }

    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  });

  createOrder();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
  ).all(orderId);

  res.status(201).json({
    data: {
      id: order.id,
      order_no: order.order_no,
      total_amount: order.total_amount,
      status: order.status,
      items: orderItems,
      created_at: order.created_at
    },
    error: null,
    message: '訂單建立成功'
  });
});

/**
 * @openapi
 * /api/orders:
 *   get:
 *     summary: 自己的訂單列表
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           order_no:
 *                             type: string
 *                           total_amount:
 *                             type: integer
 *                           status:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 */
router.get('/', (req, res) => {
  const orders = db.prepare(
    'SELECT id, order_no, total_amount, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.userId);

  res.json({
    data: { orders },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: 訂單詳情
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order_no:
 *                       type: string
 *                     recipient_name:
 *                       type: string
 *                     recipient_email:
 *                       type: string
 *                     recipient_address:
 *                       type: string
 *                     total_amount:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           product_id:
 *                             type: string
 *                           product_name:
 *                             type: string
 *                           product_price:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       404:
 *         description: 訂單不存在
 */
router.get('/:id', (req, res) => {
  const order = getOwnedOrder(req.params.id, req.user.userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  res.json({
    data: { ...order, items, payment: paymentSummary(getLatestPayment(order.id)) },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/orders/{id}/payment:
 *   post:
 *     summary: 建立綠界測試付款表單（顯示可用付款方式）
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 回傳 action 與表單欄位 }
 */
router.post('/:id/payment', (req, res) => {
  let config;
  try { config = getConfig(); } catch (error) {
    return res.status(503).json({ data: null, error: 'PAYMENT_NOT_CONFIGURED', message: error.message });
  }
  const order = getOwnedOrder(req.params.id, req.user.userId);
  if (!order) return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  if (order.status === 'paid') return res.status(400).json({ data: null, error: 'INVALID_STATUS', message: '訂單已付款' });

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  let attempt;
  try {
    db.transaction(() => {
      const pending = db.prepare("SELECT id FROM payment_attempts WHERE order_id = ? AND status = 'pending'").get(order.id);
      if (pending) throw new Error('PAYMENT_PENDING');
      const latest = getLatestPayment(order.id);
      if (order.status === 'failed' && (!latest || latest.status !== 'failed')) throw new Error('UNVERIFIED_FAILED_ORDER');
      const now = new Date();
      const id = uuidv4();
      db.prepare(`INSERT INTO payment_attempts
        (id, order_id, merchant_id, environment, merchant_trade_no, amount, item_name, next_query_at, auto_query_until)
        VALUES (?, ?, ?, 'staging', ?, ?, ?, ?, ?)`).run(
        id, order.id, config.merchantId, generateMerchantTradeNo(), order.total_amount, cleanItemName(items),
        new Date(now.getTime() + QUERY_INTERVAL_MS).toISOString(), new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      );
      if (order.status === 'failed') db.prepare("UPDATE orders SET status = 'pending' WHERE id = ?").run(order.id);
      attempt = db.prepare('SELECT * FROM payment_attempts WHERE id = ?').get(id);
    })();
  } catch (error) {
    if (error.message === 'UNVERIFIED_FAILED_ORDER') return res.status(400).json({ data: null, error: 'INVALID_STATUS', message: '此舊付款失敗訂單不能建立新的綠界交易' });
    if (error.message === 'PAYMENT_PENDING') return res.status(409).json({ data: null, error: 'PAYMENT_PENDING', message: '已有付款等待綠界確認，請勿重複付款' });
    return res.status(409).json({ data: null, error: 'PAYMENT_CONFLICT', message: '付款交易建立衝突，請重新整理後再試' });
  }
  res.json({ data: { ...buildPaymentForm({ attempt, order, items, config }), payment: paymentSummary(attempt) }, error: null, message: '請前往付款' });
});

/**
 * @openapi
 * /api/orders/{id}/payment/verify:
 *   post:
 *     summary: 依排程主動查詢綠界付款結果
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 目前付款狀態或下次可查時間 }
 */
router.post('/:id/payment/verify', async (req, res) => {
  const order = getOwnedOrder(req.params.id, req.user.userId);
  if (!order) return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  const attempt = getLatestPayment(order.id);
  if (!attempt) return res.status(400).json({ data: null, error: 'PAYMENT_NOT_STARTED', message: '尚未建立付款交易' });
  const result = await verifyAttempt(attempt.id);
  const updated = getLatestPayment(order.id);
  res.json({ data: { payment: paymentSummary(updated), result: result.skipped || result.status || result.error || 'queried' }, error: null, message: '付款狀態已更新或尚未到查詢時間' });
});

/**
 * @openapi
 * /api/orders/{id}/payment/returned:
 *   post:
 *     summary: 付款流程返回後立即由後端查詢一次綠界結果
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 查詢結果；返回本身不會更新付款狀態 }
 */
router.post('/:id/payment/returned', async (req, res) => {
  const order = getOwnedOrder(req.params.id, req.user.userId);
  if (!order) return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  const attempt = getLatestPayment(order.id);
  if (!attempt) return res.status(400).json({ data: null, error: 'PAYMENT_NOT_STARTED', message: '尚未建立付款交易' });
  const result = await verifyReturnedAttempt(attempt.id);
  const updated = getLatestPayment(order.id);
  res.json({ data: { payment: paymentSummary(updated), result: result.skipped || result.status || result.error || 'queried' }, error: null, message: '付款狀態已更新' });
});

module.exports = router;
