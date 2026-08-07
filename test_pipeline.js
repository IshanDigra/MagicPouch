const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');

  // Wait a bit
  await page.waitForTimeout(500);

  // Add a new interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');

  await page.fill('#int-company', 'Test Co');
  await page.fill('#int-role', 'Test Role');
  await page.selectOption('#int-status', 'HR Screen');
  await page.click('button:has-text("Save")');

  await page.waitForTimeout(500);

  const activeCount = await page.textContent('#stats-int-active');
  console.log('Active Count:', activeCount);

  const interviewHtml = await page.innerHTML('#interviews-list');
  console.log('Interviews List:', interviewHtml);

  await browser.close();
})();
