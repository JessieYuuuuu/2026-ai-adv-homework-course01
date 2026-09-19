const express = require('express');

const router = express.Router();

/**
 * @openapi
 * /api/ecpay/notify:
 *   post:
 *     summary: 本機 ECPay ReturnURL 占位回覆
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: 固定回覆 1|OK；不驗簽或更新訂單
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: 1|OK
 */
// Local ReturnURL placeholder. Payment status is updated only by signed backend queries.
router.post('/notify', (req, res) => {
  res.type('text/plain').send('1|OK');
});

module.exports = router;
