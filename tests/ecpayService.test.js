const { createCheckMacValue, verifyCheckMacValue, buildPaymentForm } = require('../src/services/ecpayService');

const config = {
  merchantId: '3002607',
  hashKey: 'pwFHCqoQZGmho4w6',
  hashIv: 'EkRm7iFT261dpevs',
  environment: 'staging',
  paymentAction: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
};

describe('ECPay CheckMacValue', () => {
  it('matches the official SHA256 example vector', () => {
    const fields = {
      TradeDesc: '促銷方案', PaymentType: 'aio', MerchantTradeDate: '2023/03/12 15:30:23',
      MerchantTradeNo: 'ecpay20230312153023', MerchantID: '3002607',
      ReturnURL: 'https://www.ecpay.com.tw/receive.php', ItemName: 'Apple iphone 15',
      TotalAmount: '30000', ChoosePayment: 'ALL', EncryptType: '1'
    };
    expect(createCheckMacValue(fields, config)).toBe('6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840');
  });

  it('uses a timing-safe verification result and rejects a changed amount', () => {
    const fields = { MerchantID: '3002607', MerchantTradeNo: 'ABC123', TradeAmt: '1000', TradeStatus: '1' };
    fields.CheckMacValue = createCheckMacValue(fields, config);
    expect(verifyCheckMacValue(fields, config)).toBe(true);
    expect(verifyCheckMacValue({ ...fields, TradeAmt: '999' }, config)).toBe(false);
  });

  it('builds a staging credit-card payment form', () => {
    const form = buildPaymentForm({
      attempt: { merchant_trade_no: 'FLTEST123', item_name: '測試花束 x 1' },
      order: { id: 'order-id', total_amount: 1000 }, items: [], config
    });
    expect(form.action).toBe(config.paymentAction);
    expect(form.fields.ChoosePayment).toBe('Credit');
    expect(form.fields.TotalAmount).toBe('1000');
    expect(form.fields.CheckMacValue).toHaveLength(64);
    expect(form.fields.ReturnURL).toBe('http://localhost/ecpay/notify-unavailable');
  });
});
