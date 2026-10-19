const {
  calculateShipping,
  getBasicShippingFee,
  isFreeBasicShippingThresholdReached,
  BASIC_SHIPPING_FEE,
  CONVENIENCE_STORE_FEE,
  FREE_SHIPPING_THRESHOLD,
  REMOTE_AREA_SURCHARGE,
  SAME_DAY_EXPRESS_SURCHARGE,
  DELIVERY_TYPE_HOME_DELIVERY,
  DELIVERY_TYPE_CONVENIENCE_STORE,
} = require('../src/utils/shipping');

describe('Shipping 配送費用計算模組', () => {
  describe('費率常數', () => {
    it('宅配基本運費為 120 元', () => {
      expect(BASIC_SHIPPING_FEE).toBe(120);
    });

    it('超商取貨費用為 60 元', () => {
      expect(CONVENIENCE_STORE_FEE).toBe(60);
    });

    it('免基本運費門檻為 1,500 元', () => {
      expect(FREE_SHIPPING_THRESHOLD).toBe(1500);
    });

    it('偏遠地區加收 200 元，當日急件加收 250 元', () => {
      expect(REMOTE_AREA_SURCHARGE).toBe(200);
      expect(SAME_DAY_EXPRESS_SURCHARGE).toBe(250);
    });
  });

  describe('getBasicShippingFee', () => {
    it('宅配回傳基本運費 120 元', () => {
      expect(getBasicShippingFee(DELIVERY_TYPE_HOME_DELIVERY)).toBe(120);
    });

    it('超商取貨回傳 60 元', () => {
      expect(getBasicShippingFee(DELIVERY_TYPE_CONVENIENCE_STORE)).toBe(60);
    });

    it('不支援的配送方式拋出錯誤', () => {
      expect(() => getBasicShippingFee('pickup_point')).toThrow('不支援的配送方式');
    });
  });

  describe('isFreeBasicShippingThresholdReached', () => {
    it('小計 1,499 元未達免運門檻', () => {
      expect(isFreeBasicShippingThresholdReached(1499)).toBe(false);
    });

    it('小計 1,500 元達到免運門檻', () => {
      expect(isFreeBasicShippingThresholdReached(1500)).toBe(true);
    });

    it('小計大於 1,500 元達到免運門檻', () => {
      expect(isFreeBasicShippingThresholdReached(2000)).toBe(true);
    });
  });

  describe('calculateShipping', () => {
    it('宅配基本運費：小計未滿 1,500 元收取 120 元', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_HOME_DELIVERY,
        subtotal: 1000,
      });
      expect(result.deliveryType).toBe(DELIVERY_TYPE_HOME_DELIVERY);
      expect(result.subtotal).toBe(1000);
      expect(result.basicFee).toBe(120);
      expect(result.freeBasicShipping).toBe(false);
      expect(result.surcharge).toBe(0);
      expect(result.shippingFee).toBe(120);
    });

    it('超商取貨費用：固定收取 60 元', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_CONVENIENCE_STORE,
        subtotal: 1000,
      });
      expect(result.deliveryType).toBe(DELIVERY_TYPE_CONVENIENCE_STORE);
      expect(result.basicFee).toBe(60);
      expect(result.freeBasicShipping).toBe(false);
      expect(result.shippingFee).toBe(60);
    });

    it('商品小計 1,499 元不免運，宅配仍收 120 元', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_HOME_DELIVERY,
        subtotal: 1499,
      });
      expect(result.freeBasicShipping).toBe(false);
      expect(result.basicFee).toBe(120);
      expect(result.shippingFee).toBe(120);
    });

    it('商品小計 1,500 元免基本運費，宅配運費為 0 元', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_HOME_DELIVERY,
        subtotal: 1500,
      });
      expect(result.freeBasicShipping).toBe(true);
      expect(result.basicFee).toBe(0);
      expect(result.shippingFee).toBe(0);
    });

    it('偏遠地區加收 200 元', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_HOME_DELIVERY,
        subtotal: 1000,
        isRemoteArea: true,
      });
      expect(result.remoteSurcharge).toBe(200);
      expect(result.surcharge).toBe(200);
      expect(result.shippingFee).toBe(320);
    });

    it('當日急件加收 250 元', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_HOME_DELIVERY,
        subtotal: 1000,
        isSameDayExpress: true,
      });
      expect(result.sameDaySurcharge).toBe(250);
      expect(result.surcharge).toBe(250);
      expect(result.shippingFee).toBe(370);
    });

    it('多項附加費同時成立，偏遠＋當日急件加收 450 元', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_HOME_DELIVERY,
        subtotal: 1000,
        isRemoteArea: true,
        isSameDayExpress: true,
      });
      expect(result.remoteSurcharge).toBe(200);
      expect(result.sameDaySurcharge).toBe(250);
      expect(result.surcharge).toBe(450);
      expect(result.basicFee).toBe(120);
      expect(result.shippingFee).toBe(570);
    });

    it('滿額免運與附加費同時成立，運費僅含附加費', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_HOME_DELIVERY,
        subtotal: 1500,
        isRemoteArea: true,
        isSameDayExpress: true,
      });
      expect(result.freeBasicShipping).toBe(true);
      expect(result.basicFee).toBe(0);
      expect(result.surcharge).toBe(450);
      expect(result.shippingFee).toBe(450);
    });

    it('超商取貨不受滿額免基本運費影響，小計 1,500 元仍收 60 元', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_CONVENIENCE_STORE,
        subtotal: 1500,
      });
      expect(result.freeBasicShipping).toBe(false);
      expect(result.basicFee).toBe(60);
      expect(result.shippingFee).toBe(60);
    });

    it('超商取貨與偏遠地區、當日急件附加費疊加', () => {
      const result = calculateShipping({
        deliveryType: DELIVERY_TYPE_CONVENIENCE_STORE,
        subtotal: 2000,
        isRemoteArea: true,
        isSameDayExpress: true,
      });
      expect(result.basicFee).toBe(60);
      expect(result.freeBasicShipping).toBe(false);
      expect(result.surcharge).toBe(450);
      expect(result.shippingFee).toBe(510);
    });

    it('未傳入選項時預設宅配、小計 0、無附加費，運費為 120 元', () => {
      const result = calculateShipping();
      expect(result.deliveryType).toBe(DELIVERY_TYPE_HOME_DELIVERY);
      expect(result.subtotal).toBe(0);
      expect(result.shippingFee).toBe(120);
    });
  });
});
