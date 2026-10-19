const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseUrl = (process.env.E2E_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const email = process.env.E2E_EMAIL || 'admin@hexschool.com';
const password = process.env.E2E_PASSWORD || '12345678';
const evidenceDir = path.resolve(__dirname, '../../docs/e2e');
const successScreenshot = path.join(evidenceDir, 'payment-success.png');
const failureScreenshot = path.join(evidenceDir, 'payment-failure.png');

async function assertExistingServer() {
  try {
    const response = await fetch(`${baseUrl}/api/products`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.ok, true, `商品 API 回傳 HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      `無法連線至 ${baseUrl}。test:e2e 只使用已啟動的專案，請先執行 npm start。原始錯誤：${error.message}`
    );
  }
}

async function launchInstalledBrowser() {
  const launchOptions = { headless: process.env.E2E_HEADLESS !== 'false' };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
    return chromium.launch({
      ...launchOptions,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    });
  }

  const installedBrowsers = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const executablePath of installedBrowsers) {
    if (fs.existsSync(executablePath)) {
      return chromium.launch({ ...launchOptions, executablePath });
    }
  }

  try {
    return await chromium.launch({ ...launchOptions, channel: 'chrome' });
  } catch (_error) {
    return chromium.launch(launchOptions);
  }
}

async function clickVisible(locator, description) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }
  throw new Error(`找不到可操作的「${description}」`);
}

async function chooseExternalOption(page, pattern, description) {
  const label = page.locator('label').filter({ hasText: pattern });
  if (await label.count()) {
    await clickVisible(label, description);
    return;
  }
  await clickVisible(page.getByText(pattern), description);
}

async function chooseLandBank(page) {
  const selects = page.locator('select');
  const count = await selects.count();
  for (let index = 0; index < count; index += 1) {
    const select = selects.nth(index);
    const options = await select.locator('option').evaluateAll(items => (
      items.map(option => ({ value: option.value, text: option.textContent.trim() }))
    ));
    const landBank = options.find(option => /台灣土地銀行|土地銀行/.test(option.text));
    if (landBank) {
      await select.selectOption(landBank.value);
      return;
    }
  }
  throw new Error('找不到「台灣土地銀行」選項');
}

async function waitForSaveControl(context, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const candidatePage of context.pages()) {
      for (const frame of candidatePage.frames()) {
        const control = frame.locator(
          'input[value="Save"], input[value="SAVE"], button:has-text("Save"), a:has-text("Save")'
        );
        if (await control.count()) {
          const first = control.first();
          if (await first.isVisible()) return { page: candidatePage, control: first };
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const urls = context.pages().map(candidate => candidate.url()).join(', ');
  throw new Error(`找不到可操作的「Save」；目前頁面：${urls}`);
}

async function run() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await assertExistingServer();

  const browser = await launchInstalledBrowser();
  const context = await browser.newContext({ locale: 'zh-TW' });
  let page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('dialog', dialog => dialog.accept());

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('form').getByRole('button', { name: '登入' }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    const addButton = page.getByRole('button', { name: '加入購物車' }).first();
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();

    await page.goto(`${baseUrl}/cart`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '前往結帳' }).click();
    await page.waitForURL(`${baseUrl}/checkout`);

    await page.getByPlaceholder('請輸入收件人姓名').fill('E2E 測試收件人');
    await page.getByPlaceholder('name@example.com').fill('e2e-recipient@example.com');
    await page.getByPlaceholder('請輸入完整配送地址').fill('台北市信義區測試路 100 號');
    await page.locator('input[name="deliveryType"][value="home_delivery"]').check();
    await page.getByText('偏遠地區配送', { exact: true }).click();
    await page.getByText('當日急件', { exact: true }).click();
    await page.getByRole('button', { name: '建立訂單並繼續付款' }).click();
    await page.waitForURL(/\/orders\/[^/]+$/);

    const orderId = new URL(page.url()).pathname.split('/').pop();
    assert.ok(orderId, '建立訂單後應取得訂單 ID');
    await page.getByRole('heading', { name: '訂單已建立' }).waitFor();
    await page.getByRole('button', { name: '前往綠界付款' }).click();
    await page.waitForURL(/payment-stage\.ecpay\.com\.tw/i, { timeout: 30000 });

    await chooseExternalOption(page, /網路\s*ATM/i, '網路 ATM');
    await chooseLandBank(page);
    await clickVisible(
      page.locator('button, a, input[type="button"], input[type="submit"]').filter({ hasText: /前往付款|確認付款|下一步/i })
        .or(page.locator('input[value*="前往付款"], input[value*="確認付款"], input[value*="下一步"]')),
      '前往付款'
    );

    const closeNotice = page.getByRole('button', { name: /關閉|確定/i })
      .or(page.locator('button, a').filter({ hasText: /關閉|確定/i }));
    await closeNotice.first().waitFor({ state: 'visible' });
    await closeNotice.first().click();
    const saveTarget = await waitForSaveControl(context);
    page = saveTarget.page;
    page.setDefaultTimeout(20000);
    page.on('dialog', dialog => dialog.accept());
    await saveTarget.control.click();

    await page.getByText(/付款成功|交易成功/i).first().waitFor({ timeout: 60000 });
    await clickVisible(page.getByText(/返回商店|回到商店/i), '返回商店');
    await page.waitForURL(url => url.origin === new URL(baseUrl).origin, { timeout: 30000 });

    await page.getByRole('heading', { name: '付款完成' }).waitFor({ timeout: 60000 });

    const order = await page.evaluate(async id => {
      const token = localStorage.getItem('flower_token');
      const response = await fetch(`/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
      return body.data;
    }, orderId);
    assert.equal(order.status, 'paid');

    await page.screenshot({ path: successScreenshot, fullPage: true });

    await page.getByRole('link', { name: '查看訂單' }).click();
    await page.waitForURL(`${baseUrl}/orders`, { timeout: 30000 });
    const paidOrderCard = page.locator(`a[href="/orders/${orderId}"]`);
    await paidOrderCard.waitFor({ state: 'visible' });
    await paidOrderCard.getByText('已付款', { exact: true }).waitFor();

    console.log(`E2E 付款流程通過，成功截圖：${successScreenshot}`);
  } catch (error) {
    await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
