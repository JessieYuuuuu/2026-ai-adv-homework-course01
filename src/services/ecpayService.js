const crypto = require('crypto');

const STAGING_ORIGIN = 'https://payment-stage.ecpay.com.tw';
const PAYMENT_ACTION = `${STAGING_ORIGIN}/Cashier/AioCheckOut/V5`;
const QUERY_ACTION = `${STAGING_ORIGIN}/Cashier/QueryTradeInfo/V5`;

function getConfig(env = process.env) {
  const { ECPAY_MERCHANT_ID: merchantId, ECPAY_HASH_KEY: hashKey, ECPAY_HASH_IV: hashIv } = env;
  if (env.ECPAY_ENV !== 'staging') throw new Error('ECPAY_ENV 必須明確設定為 staging');
  if (!merchantId || !hashKey || !hashIv) throw new Error('缺少 ECPAY_MERCHANT_ID、ECPAY_HASH_KEY 或 ECPAY_HASH_IV');
  return { merchantId, hashKey, hashIv, environment: 'staging', paymentAction: PAYMENT_ACTION, queryAction: QUERY_ACTION };
}

// ECPay's .NET-compatible form encoding: spaces are +, while -_.!*() stay literal.
function ecpayEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, '+')
    .replace(/%7E/g, '~');
}

function createCheckMacValue(fields, config) {
  const pairs = Object.entries(fields)
    .filter(([key]) => key !== 'CheckMacValue')
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, value]) => `${key}=${value}`);
  const raw = `HashKey=${config.hashKey}&${pairs.join('&')}&HashIV=${config.hashIv}`;
  return crypto.createHash('sha256').update(ecpayEncode(raw).toLowerCase(), 'utf8').digest('hex').toUpperCase();
}

function verifyCheckMacValue(fields, config) {
  if (!fields || typeof fields.CheckMacValue !== 'string' || fields.CheckMacValue.length !== 64) return false;
  const expected = createCheckMacValue(fields, config);
  const received = fields.CheckMacValue.toUpperCase();
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
}

function taipeiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function cleanItemName(items) {
  const value = items.map(item => `${item.product_name} x ${item.quantity}`)
    .join('#').replace(/[^\w\s\u4e00-\u9fff#-]/g, ' ').replace(/\s+/g, ' ').trim();
  return (value || 'Flower Life order').slice(0, 400);
}

function buildPaymentForm({ attempt, order, items, config }) {
  const fields = {
    MerchantID: config.merchantId,
    MerchantTradeNo: attempt.merchant_trade_no,
    MerchantTradeDate: taipeiDate(),
    PaymentType: 'aio',
    TotalAmount: String(order.total_amount),
    TradeDesc: 'Flower Life order',
    ItemName: attempt.item_name || cleanItemName(items),
    ReturnURL: 'http://localhost/ecpay/notify-unavailable',
    ChoosePayment: 'ALL',
    ClientBackURL: `${process.env.BASE_URL || 'http://localhost:3001'}/orders/${order.id}`,
    EncryptType: '1'
  };
  return { action: config.paymentAction, fields: { ...fields, CheckMacValue: createCheckMacValue(fields, config) } };
}

async function queryTrade(attempt, config, fetchImpl = fetch) {
  const fields = {
    MerchantID: config.merchantId,
    MerchantTradeNo: attempt.merchant_trade_no,
    TimeStamp: String(Math.floor(Date.now() / 1000))
  };
  const body = new URLSearchParams({ ...fields, CheckMacValue: createCheckMacValue(fields, config) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetchImpl(config.queryAction, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: controller.signal
    });
    if (response.status === 403) return { kind: 'forbidden' };
    if (!response.ok) return { kind: 'http_error', status: response.status };
    const text = await response.text();
    const data = Object.fromEntries(new URLSearchParams(text));
    return { kind: 'response', data };
  } catch (error) {
    return { kind: error.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getConfig, createCheckMacValue, verifyCheckMacValue, cleanItemName, buildPaymentForm, queryTrade };
