const { v4: uuidv4 } = require('uuid');
const db = require('../database');

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

function createOrderFromCart({ userId, recipientName, recipientEmail, recipientAddress }) {
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

    const totalAmount = cartItems.reduce(
      (sum, item) => sum + item.product_price * item.quantity, 0
    );
    const orderId = uuidv4();
    const orderNo = generateOrderNo();

    db.prepare(
      `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(orderId, orderNo, userId, recipientName, recipientEmail, recipientAddress, totalAmount);

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

    return { order, orderItems };
  })();
}

module.exports = { OrderCreationError, createOrderFromCart };
