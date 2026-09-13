const db = require('../database');
const { getConfig, queryTrade, verifyCheckMacValue } = require('./ecpayService');

const QUERY_INTERVAL_MS = 10 * 60 * 1000;
const OUTBOUND_GAP_MS = 5000;
const PAUSE_MS = 30 * 60 * 1000;
const activeAttempts = new Set();

function isoAfter(ms) { return new Date(Date.now() + ms).toISOString(); }

function getState() {
  return db.prepare('SELECT paused_until, last_outbound_at FROM payment_scheduler_state WHERE id = 1').get();
}

function paymentSummary(attempt) {
  if (!attempt) return null;
  return {
    status: attempt.status,
    merchantTradeNo: attempt.merchant_trade_no,
    tradeStatus: attempt.trade_status,
    lastQueriedAt: attempt.last_queried_at,
    nextQueryAt: attempt.next_query_at,
    canRetry: attempt.status === 'failed',
    canVerify: attempt.status === 'pending' && new Date(attempt.next_query_at).getTime() <= Date.now(),
    error: attempt.error_code || null
  };
}

function validateResponse(attempt, data, config) {
  if (!verifyCheckMacValue(data, config)) return 'INVALID_SIGNATURE';
  if (data.MerchantID !== attempt.merchant_id) return 'MERCHANT_MISMATCH';
  if (data.MerchantTradeNo !== attempt.merchant_trade_no) return 'TRADE_NO_MISMATCH';
  if (Number(data.TradeAmt) !== attempt.amount || !Number.isInteger(Number(data.TradeAmt))) return 'AMOUNT_MISMATCH';
  return null;
}

async function verifyAttempt(attemptId, { force = false, fetchImpl } = {}) {
  const attempt = db.prepare('SELECT * FROM payment_attempts WHERE id = ?').get(attemptId);
  if (!attempt || attempt.status !== 'pending') return { skipped: 'NOT_PENDING', attempt };
  if (activeAttempts.has(attempt.id)) return { skipped: 'IN_FLIGHT', attempt };
  const now = Date.now();
  if (!force && new Date(attempt.next_query_at).getTime() > now) return { skipped: 'TOO_EARLY', attempt };
  const state = getState();
  if (state.paused_until && new Date(state.paused_until).getTime() > now) return { skipped: 'PAUSED', attempt, pausedUntil: state.paused_until };
  if (state.last_outbound_at && now - new Date(state.last_outbound_at).getTime() < OUTBOUND_GAP_MS) return { skipped: 'THROTTLED', attempt };

  activeAttempts.add(attempt.id);
  db.prepare('UPDATE payment_scheduler_state SET last_outbound_at = ? WHERE id = 1').run(new Date(now).toISOString());
  try {
    const config = getConfig();
    const result = await queryTrade(attempt, config, fetchImpl);
    const queriedAt = new Date().toISOString();
    if (result.kind === 'forbidden') {
      const pausedUntil = isoAfter(PAUSE_MS);
      db.transaction(() => {
        db.prepare('UPDATE payment_scheduler_state SET paused_until = ? WHERE id = 1').run(pausedUntil);
        db.prepare('UPDATE payment_attempts SET last_queried_at = ?, next_query_at = ?, error_code = ?, updated_at = ? WHERE id = ?')
          .run(queriedAt, pausedUntil, 'HTTP_403_PAUSED', queriedAt, attempt.id);
      })();
      return { skipped: 'PAUSED', pausedUntil };
    }
    if (result.kind !== 'response') {
      db.prepare('UPDATE payment_attempts SET last_queried_at = ?, next_query_at = ?, error_code = ?, updated_at = ? WHERE id = ?')
        .run(queriedAt, isoAfter(QUERY_INTERVAL_MS), result.kind.toUpperCase(), queriedAt, attempt.id);
      return { error: result.kind };
    }
    const invalid = validateResponse(attempt, result.data, config);
    if (invalid) {
      db.prepare('UPDATE payment_attempts SET last_queried_at = ?, next_query_at = ?, error_code = ?, updated_at = ? WHERE id = ?')
        .run(queriedAt, isoAfter(QUERY_INTERVAL_MS), invalid, queriedAt, attempt.id);
      return { error: invalid };
    }
    const status = String(result.data.TradeStatus);
    db.transaction(() => {
      const current = db.prepare('SELECT status FROM payment_attempts WHERE id = ?').get(attempt.id);
      if (!current || current.status === 'paid') return;
      const values = [queriedAt, status, result.data.TradeNo || null, result.data.PaymentDate || null, queriedAt, attempt.id];
      if (status === '1') {
        db.prepare('UPDATE payment_attempts SET status = \'paid\', trade_status = ?, trade_no = ?, payment_date = ?, last_queried_at = ?, next_query_at = ?, error_code = NULL, updated_at = ? WHERE id = ?')
          .run(status, result.data.TradeNo || null, result.data.PaymentDate || null, queriedAt, queriedAt, queriedAt, attempt.id);
        db.prepare("UPDATE orders SET status = 'paid' WHERE id = ? AND status != 'paid'").run(attempt.order_id);
      } else if (status === '10200095') {
        db.prepare('UPDATE payment_attempts SET status = \'failed\', trade_status = ?, trade_no = ?, payment_date = ?, last_queried_at = ?, next_query_at = ?, error_code = NULL, updated_at = ? WHERE id = ?')
          .run(status, result.data.TradeNo || null, result.data.PaymentDate || null, queriedAt, queriedAt, queriedAt, attempt.id);
        db.prepare("UPDATE orders SET status = 'failed' WHERE id = ? AND status = 'pending'").run(attempt.order_id);
      } else if (status === '0') {
        db.prepare('UPDATE payment_attempts SET trade_status = ?, trade_no = ?, payment_date = ?, last_queried_at = ?, next_query_at = ?, error_code = NULL, updated_at = ? WHERE id = ?')
          .run(status, result.data.TradeNo || null, result.data.PaymentDate || null, queriedAt, isoAfter(QUERY_INTERVAL_MS), queriedAt, attempt.id);
      } else {
        db.prepare('UPDATE payment_attempts SET trade_status = ?, last_queried_at = ?, next_query_at = ?, error_code = ?, updated_at = ? WHERE id = ?')
          .run(status, queriedAt, isoAfter(QUERY_INTERVAL_MS), 'UNKNOWN_TRADE_STATUS', queriedAt, attempt.id);
      }
    })();
    return { status };
  } finally {
    activeAttempts.delete(attempt.id);
  }
}

// A browser return only authorizes an earlier server-to-server query; it never
// changes payment status on its own. The usual pause and outbound rate limit
// remain in force.
async function verifyReturnedAttempt(attemptId, options = {}) {
  const attempt = db.prepare('SELECT * FROM payment_attempts WHERE id = ?').get(attemptId);
  if (!attempt || attempt.status !== 'pending') return { skipped: 'NOT_PENDING', attempt };
  const now = new Date().toISOString();
  db.prepare(`UPDATE payment_attempts
    SET returned_at = COALESCE(returned_at, ?), next_query_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'`).run(now, now, now, attempt.id);
  return verifyAttempt(attempt.id, { ...options, force: true });
}

async function runDueAttempts() {
  const now = new Date().toISOString();
  const attempts = db.prepare("SELECT id FROM payment_attempts WHERE status = 'pending' AND next_query_at <= ? AND auto_query_until >= ? ORDER BY next_query_at ASC").all(now, now);
  for (const attempt of attempts) await verifyAttempt(attempt.id);
}

function startPaymentScheduler() {
  const timer = setInterval(() => { runDueAttempts().catch(error => console.error('Payment scheduler error:', error.message)); }, 30000);
  timer.unref();
  runDueAttempts().catch(error => console.error('Payment scheduler error:', error.message));
  return () => clearInterval(timer);
}

module.exports = { verifyAttempt, verifyReturnedAttempt, runDueAttempts, startPaymentScheduler, paymentSummary, QUERY_INTERVAL_MS };
