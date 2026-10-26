document.addEventListener('DOMContentLoaded', function () {
  const authNav = document.getElementById('auth-nav');
  const cartBadge = document.getElementById('cart-badge');
  const ordersLink = document.getElementById('orders-link');

  if (authNav) {
    if (Auth.isLoggedIn()) {
      const user = Auth.getUser();
      let html = '';
      if (Auth.isAdmin()) {
        html += '<a href="/admin/products" class="text-brand-gold hover:text-brand-gold-dark">後台管理</a>';
      }
      html += '<span class="text-text-secondary">' + (user?.name || '') + '</span>';
      html += '<button onclick="Auth.logout()" class="text-text-muted hover:text-brand-gold transition-colors">登出</button>';
      authNav.innerHTML = html;
    } else {
      authNav.innerHTML = '<a href="/login" class="bg-brand-gold text-white px-4 py-1.5 rounded-full hover:bg-brand-gold-dark transition-colors">登入</a>';
    }
  }

  if (ordersLink) {
    ordersLink.style.display = Auth.isLoggedIn() ? '' : 'none';
  }

  window.refreshCartBadge = function () {
    if (!cartBadge) return Promise.resolve();
    return apiFetch('/api/cart').then(function (res) {
      var count = res && res.data && Array.isArray(res.data.items) ? res.data.items.length : 0;
      cartBadge.textContent = count;
      cartBadge.style.display = count > 0 ? 'flex' : 'none';
      return count;
    }).catch(function () {});
  };

  window.refreshCartBadge();
});
