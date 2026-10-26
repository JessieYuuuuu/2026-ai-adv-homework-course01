const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { calculateShipping } = require('../utils/shipping');

class OrderCreationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OrderCreationError';
    this.code = code;
  }
}

function generateOrderNo() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = uuidv4().slice(0, 5).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

function createOrderFromCart({
  userId,
  recipientName,
  recipientEmail,
  recipientAddress,
  deliveryType = 'home_delivery',
  isRemoteArea = false,
  isSameDayExpress = false,
}) {
  return db.transaction(() => {
    const cartItems = db.prepare(
      `SELECT ci.product_id, ci.quantity,
              p.name as product_name, p.price as product_price, p.stock as product_stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ?`
    ).all(userId);

    if (cartItems.length === 0) {
      throw new OrderCreationError('CART_EMPTY', '購物車為空');
    }

    const insufficientItems = cartItems.filter(item => item.quantity > item.product_stock);
    if (insufficientItems.length > 0) {
      const names = insufficientItems.map(item => item.product_name).join(', ');
      throw new OrderCreationError('STOCK_INSUFFICIENT', `以下商品庫存不足：${names}`);
    }

    // 商品小計：以當下商品價格重算，不相信請求總額，不含稅、折扣或運費。
    const subtotal = cartItems.reduce(
      (sum, item) => sum + item.product_price * item.quantity, 0
    );

    // 配送費用：基本運費可能因滿額免運而為 0，附加費可疊加。
    const shipping = calculateShipping({
      deliveryType,
      subtotal,
      isRemoteArea,
      isSameDayExpress,
    });

    // 訂單總額 = 商品小計 + 運費；送往付款的金額同此總額。
    const totalAmount = subtotal + shipping.shippingFee;

    const orderId = uuidv4();
    const orderNo = generateOrderNo();

    db.prepare(
      `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address, subtotal, shipping_fee, delivery_type, is_remote_area, is_same_day_express, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderId,
      orderNo,
      userId,
      recipientName,
      recipientEmail,
      recipientAddress,
      subtotal,
      shipping.shippingFee,
      deliveryType,
      isRemoteArea ? 1 : 0,
      isSameDayExpress ? 1 : 0,
      totalAmount
    );

    const insertItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const updateStock = db.prepare(
      'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?'
    );

    for (const item of cartItems) {
      insertItem.run(uuidv4(), orderId, item.product_id, item.product_name, item.product_price, item.quantity);
      const result = updateStock.run(item.quantity, item.product_id, item.quantity);
      if (result.changes !== 1) {
        throw new OrderCreationError('STOCK_INSUFFICIENT', `商品「${item.product_name}」庫存不足`);
      }
    }

    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    const orderItems = db.prepare(
      'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
    ).all(orderId);

    return { order, orderItems, shipping };
  })();
}

module.exports = { OrderCreationError, createOrderFromCart };
