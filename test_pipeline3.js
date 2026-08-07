const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');

  // Wait a bit
  await page.waitForTimeout(500);

  // Click on "Active" filter tab
  await page.click('button[data-filter="active"]');
  await page.waitForTimeout(500);

  // Add a new interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');

  await page.fill('#int-company', 'Test Co 3');
  await page.fill('#int-role', 'Test Role 3');
  await page.selectOption('#int-status', 'Offer'); // Offer status
  await page.click('button:has-text("Save")');

  await page.waitForTimeout(500);

  const interviewHtml = await page.innerHTML('#interviews-list');
  console.log('Interviews List after adding an offer while on Active filter:', interviewHtml);

  await browser.close();
})();
