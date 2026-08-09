const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');

  // Wait a bit
  await page.waitForTimeout(500);

  // Add a new interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');

  await page.fill('#int-company', 'Test Co 2');
  await page.fill('#int-role', 'Test Role 2');
  await page.selectOption('#int-status', 'Offer'); // Offer status
  await page.click('button:has-text("Save")');

  await page.waitForTimeout(500);

  // Click on "Offers" filter tab
  await page.click('button[data-filter="offers"]');
  await page.waitForTimeout(500);

  const offerCount = await page.textContent('#stats-int-offers');
  console.log('Offer Count:', offerCount);

  const interviewHtml = await page.innerHTML('#interviews-list');
  console.log('Interviews List after Offer Filter:', interviewHtml);

  await browser.close();
})();
