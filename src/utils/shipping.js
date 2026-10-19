'use strict';

/**
 * 花漾生活 配送費用計算模組（Shipping）
 *
 * 集中處理配送方式、滿額免運、偏遠地區與當日急件等配送條件。
 * 純函數實作，不依賴資料庫、Express 或 HTTP，可獨立單元測試。
 *
 * 配送費率（單位：元，新台幣）：
 *  - 宅配基本運費：120 元
 *  - 超商取貨：60 元（這不是基本運費，不受滿額免基本運費影響）
 *  - 商品小計滿 1,500 元：免基本運費（僅豁免宅配的基本運費）
 *  - 偏遠地區：加收 200 元
 *  - 當日急件：加收 250 元
 *
 * 最終運費 = 基本運費（可能因滿額免運而為 0）＋ 附加費總額。
 * 附加費（偏遠地區、當日急件）可同時成立並疊加，不受滿額免運影響。
 */

// 配送費率常數
const BASIC_SHIPPING_FEE = 120; // 宅配基本運費
const CONVENIENCE_STORE_FEE = 60; // 超商取貨費用（不屬於基本運費）
const FREE_SHIPPING_THRESHOLD = 1500; // 商品小計滿此金額免基本運費
const REMOTE_AREA_SURCHARGE = 200; // 偏遠地區加收
const SAME_DAY_EXPRESS_SURCHARGE = 250; // 當日急件加收

// 配送方式
const DELIVERY_TYPE_HOME_DELIVERY = 'home_delivery'; // 宅配
const DELIVERY_TYPE_CONVENIENCE_STORE = 'convenience_store'; // 超商取貨

const VALID_DELIVERY_TYPES = Object.freeze([
  DELIVERY_TYPE_HOME_DELIVERY,
  DELIVERY_TYPE_CONVENIENCE_STORE,
]);

/**
 * 依配送方式取得基本運費。
 *
 * @param {string} deliveryType - 'home_delivery' 或 'convenience_store'。
 * @returns {number} 基本運費金額。
 * @throws {Error} 配送方式不支援時拋出。
 */
function getBasicShippingFee(deliveryType) {
  if (!VALID_DELIVERY_TYPES.includes(deliveryType)) {
    throw new Error(`不支援的配送方式：${deliveryType}`);
  }
  return deliveryType === DELIVERY_TYPE_CONVENIENCE_STORE
    ? CONVENIENCE_STORE_FEE
    : BASIC_SHIPPING_FEE;
}

/**
 * 商品小計是否已達到免基本運費門檻。
 *
 * @param {number} subtotal - 商品小計。
 * @returns {boolean} 達到門檻回 true，否則回 false。
 */
function isFreeBasicShippingThresholdReached(subtotal) {
  return Number(subtotal) >= FREE_SHIPPING_THRESHOLD;
}

/**
 * 計算訂單配送費用明細。
 *
 * @param {Object} options - 配送計算選項。
 * @param {string} [options.deliveryType='home_delivery'] - 配送方式。
 * @param {number} [options.subtotal=0] - 商品小計。
 * @param {boolean} [options.isRemoteArea=false] - 是否偏遠地區。
 * @param {boolean} [options.isSameDayExpress=false] - 是否當日急件。
 * @returns {Object} 配送費用明細，包含 basicFee、surcharge、shippingFee 等欄位。
 * @throws {Error} deliveryType 不支援時拋出。
 */
function calculateShipping({
  deliveryType = DELIVERY_TYPE_HOME_DELIVERY,
  subtotal = 0,
  isRemoteArea = false,
  isSameDayExpress = false,
} = {}) {
  const resolvedSubtotal = Number(subtotal) || 0;

  // 基本運費：宅配 120、超商取貨 60。
  // 超商取貨不是基本運費，不列入免基本運費的豁免範圍。
  let basicFee = getBasicShippingFee(deliveryType);

  // 商品小計滿 1,500 元免基本運費（僅豁免宅配基本運費）。
  const freeBasicShipping =
    deliveryType === DELIVERY_TYPE_HOME_DELIVERY &&
    isFreeBasicShippingThresholdReached(resolvedSubtotal);
  if (freeBasicShipping) {
    basicFee = 0;
  }

  // 附加費可疊加，不受滿額免運影響。
  const remoteSurcharge = isRemoteArea ? REMOTE_AREA_SURCHARGE : 0;
  const sameDaySurcharge = isSameDayExpress ? SAME_DAY_EXPRESS_SURCHARGE : 0;
  const surcharge = remoteSurcharge + sameDaySurcharge;

  const shippingFee = basicFee + surcharge;

  return {
    deliveryType,
    subtotal: resolvedSubtotal,
    basicFee,
    surcharge,
    remoteSurcharge,
    sameDaySurcharge,
    freeBasicShipping,
    shippingFee,
    isRemoteArea: Boolean(isRemoteArea),
    isSameDayExpress: Boolean(isSameDayExpress),
  };
}

module.exports = {
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
  VALID_DELIVERY_TYPES,
};
