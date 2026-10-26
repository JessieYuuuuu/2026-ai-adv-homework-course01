const { createApp, ref, computed, onMounted } = Vue;

// 與後端 src/utils/shipping.js 保持一致的費率（單位：元）
const BASIC_SHIPPING_FEE = 120;
const CONVENIENCE_STORE_FEE = 60;
const FREE_SHIPPING_THRESHOLD = 1500;
const REMOTE_AREA_SURCHARGE = 200;
const SAME_DAY_EXPRESS_SURCHARGE = 250;

function calculateShipping({ deliveryType, subtotal, isRemoteArea, isSameDayExpress }) {
  // 基本運費：宅配 120、超商取貨 60（超商取貨不屬於基本運費）
  const basicFee = deliveryType === 'convenience_store' ? CONVENIENCE_STORE_FEE : BASIC_SHIPPING_FEE;

  // 商品小計滿 1,500 元免基本運費（僅豁免宅配基本運費）
  const freeBasicShipping =
    deliveryType === 'home_delivery' && subtotal >= FREE_SHIPPING_THRESHOLD;
  const waivedBasicFee = freeBasicShipping ? 0 : basicFee;

  // 附加費可疊加，不受滿額免運影響
  const remoteSurcharge = isRemoteArea ? REMOTE_AREA_SURCHARGE : 0;
  const sameDaySurcharge = isSameDayExpress ? SAME_DAY_EXPRESS_SURCHARGE : 0;
  const shippingFee = waivedBasicFee + remoteSurcharge + sameDaySurcharge;

  return {
    basicFee: waivedBasicFee,
    freeBasicShipping,
    remoteSurcharge,
    sameDaySurcharge,
    shippingFee,
  };
}

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const loading = ref(true);
    const submitting = ref(false);
    const cartItems = ref([]);
    const form = ref({ recipientName: '', recipientEmail: '', recipientAddress: '' });
    const errors = ref({});

    // 配送選項（預設宅配、非偏遠、非當日急件）
    const deliveryType = ref('home_delivery');
    const isRemoteArea = ref(false);
    const isSameDayExpress = ref(false);

    const cartTotal = computed(function () {
      return cartItems.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    const shipping = computed(function () {
      return calculateShipping({
        deliveryType: deliveryType.value,
        subtotal: cartTotal.value,
        isRemoteArea: isRemoteArea.value,
        isSameDayExpress: isSameDayExpress.value,
      });
    });

    const shippingFee = computed(function () {
      return shipping.value.shippingFee;
    });

    const orderTotal = computed(function () {
      return cartTotal.value + shippingFee.value;
    });

    const basicFee = computed(function () {
      return shipping.value.basicFee;
    });

    const convenienceStoreFee = computed(function () {
      return CONVENIENCE_STORE_FEE;
    });

    const remoteSurcharge = computed(function () {
      return shipping.value.remoteSurcharge;
    });

    const sameDaySurcharge = computed(function () {
      return shipping.value.sameDaySurcharge;
    });

    const freeBasicShipping = computed(function () {
      return shipping.value.freeBasicShipping;
    });

    const freeShippingRemaining = computed(function () {
      return Math.max(FREE_SHIPPING_THRESHOLD - cartTotal.value, 0);
    });

    const shippingProgress = computed(function () {
      return Math.min((cartTotal.value / FREE_SHIPPING_THRESHOLD) * 100, 100);
    });

    function validate() {
      errors.value = {};
      if (!form.value.recipientName.trim()) errors.value.recipientName = '請輸入收件人姓名';
      if (!form.value.recipientEmail.trim()) {
        errors.value.recipientEmail = '請輸入 Email';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.recipientEmail)) {
        errors.value.recipientEmail = 'Email 格式不正確';
      }
      if (!form.value.recipientAddress.trim()) errors.value.recipientAddress = '請輸入收件地址';
      return Object.keys(errors.value).length === 0;
    }

    async function submitOrder() {
      if (!validate() || submitting.value) return;
      submitting.value = true;
      try {
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            ...form.value,
            deliveryType: deliveryType.value,
            isRemoteArea: isRemoteArea.value,
            isSameDayExpress: isSameDayExpress.value,
          })
        });
        Notification.show('訂單已建立', 'success');
        window.location.href = '/orders/' + res.data.id;
      } catch (err) {
        Notification.show(err?.data?.message || '訂單建立失敗', 'error');
      } finally {
        submitting.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/cart');
        cartItems.value = res.data.items;
        if (cartItems.value.length === 0) {
          window.location.href = '/cart';
          return;
        }
      } catch (e) {
        window.location.href = '/cart';
        return;
      }
      loading.value = false;
    });

    return {
      loading,
      submitting,
      cartItems,
      form,
      errors,
      cartTotal,
      deliveryType,
      isRemoteArea,
      isSameDayExpress,
      shippingFee,
      orderTotal,
      basicFee,
      convenienceStoreFee,
      remoteSurcharge,
      sameDaySurcharge,
      freeBasicShipping,
      homeDeliveryFee: BASIC_SHIPPING_FEE,
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
      freeShippingRemaining,
      shippingProgress,
      remoteAreaSurcharge: REMOTE_AREA_SURCHARGE,
      sameDayExpressSurcharge: SAME_DAY_EXPRESS_SURCHARGE,
      submitOrder,
    };
  }
}).mount('#app');
