const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    async function startPayment() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/payment', { method: 'POST' });
        sessionStorage.setItem('ecpay-return:' + order.value.id, '1');
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = res.data.action;
        Object.entries(res.data.fields).forEach(function ([name, value]) {
          const input = document.createElement('input');
          input.type = 'hidden'; input.name = name; input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
      } catch (e) {
        Notification.show(e?.data?.message || '暫時無法開始付款，請稍後再試', 'error');
      } finally {
        paying.value = false;
      }
    }

    async function verifyPayment() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/payment/verify', { method: 'POST' });
        const detail = await apiFetch('/api/orders/' + order.value.id);
        order.value = detail.data;
        if (res.data.result === 'TOO_EARLY') Notification.show('付款狀態確認中，請稍候', 'info');
      } catch (e) {
        Notification.show(e?.data?.message || '暫時無法確認付款狀態，請稍後再試', 'error');
      } finally { paying.value = false; }
    }

    async function verifyReturnedPayment() {
      if (!order.value || sessionStorage.getItem('ecpay-return:' + order.value.id) !== '1') return;
      sessionStorage.removeItem('ecpay-return:' + order.value.id);
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/payment/returned', { method: 'POST' });
        const detail = await apiFetch('/api/orders/' + order.value.id);
        order.value = detail.data;
        if (res.data.result === '0') Notification.show('付款狀態確認中，請稍候', 'info');
      } catch (e) {
        // The normal scheduled query remains active if this best-effort return query fails.
        Notification.show('付款狀態確認中，請稍候', 'info');
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;
        await verifyReturnedPayment();
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return { order, loading, paying, statusMap, startPayment, verifyPayment };
  }
}).mount('#app');
