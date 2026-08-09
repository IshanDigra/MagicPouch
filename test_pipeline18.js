const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Get active stats before
  let activeStatsText = await page.textContent('#stats-int-active');
  console.log('Active Count before anything:', activeStatsText);

  // Add 1 interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');
  await page.fill('#int-company', 'Stats Test Active');
  await page.selectOption('#int-status', 'HR Screen');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  activeStatsText = await page.textContent('#stats-int-active');
  console.log('Active Count after adding HR Screen:', activeStatsText);

  // Add 1 interview offer
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');
  await page.fill('#int-company', 'Stats Test Offer');
  await page.selectOption('#int-status', 'Offer');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  activeStatsText = await page.textContent('#stats-int-active');
  const offerStatsText = await page.textContent('#stats-int-offers');
  console.log('Active Count after adding Offer:', activeStatsText);
  console.log('Offer Count after adding Offer:', offerStatsText);

  // Add 1 interview ghosted
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');
  await page.fill('#int-company', 'Stats Test Ghosted');
  await page.selectOption('#int-status', 'Ghosted');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  activeStatsText = await page.textContent('#stats-int-active');
  console.log('Active Count after adding Ghosted:', activeStatsText);

  // Change HR Screen to Offer
  await page.click('button[data-filter="active"]');
  await page.waitForTimeout(500);

  const htmlAll = await page.innerHTML('#interviews-list');
  const openModalMatch = htmlAll.match(/app\.openInterviewModal\('([^']+)'\)/);
  if (openModalMatch) {
      const id = openModalMatch[1];
      await page.evaluate((id) => {
          app.openInterviewModal(id);
      }, id);
      await page.waitForTimeout(500);

      await page.selectOption('#int-status', 'Offer');
      await page.click('#modal-interview button:has-text("Save")');
      await page.waitForTimeout(500);
  }

  activeStatsText = await page.textContent('#stats-int-active');
  const offerStatsText2 = await page.textContent('#stats-int-offers');
  console.log('Active Count after changing HR Screen to Offer:', activeStatsText);
  console.log('Offer Count after changing HR Screen to Offer:', offerStatsText2);

  await browser.close();
})();
