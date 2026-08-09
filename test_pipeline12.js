const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto('http://localhost:8080');

  // Wait a bit
  await page.waitForTimeout(500);

  // Go to pipeline (interviews) view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Add an interview with status "Rejected"
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');
  await page.fill('#int-company', 'Rejected Company');
  await page.selectOption('#int-status', 'Rejected');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  let htmlAll = await page.innerHTML('#interviews-list');
  console.log('Is Rejected present in All view:', !!htmlAll.match(/Rejected Company/));

  await page.click('button[data-filter="active"]');
  await page.waitForTimeout(500);

  let htmlActive = await page.innerHTML('#interviews-list');
  console.log('Is Rejected present in Active view:', !!htmlActive.match(/Rejected Company/));

  await page.click('button[data-filter="archived"]');
  await page.waitForTimeout(500);

  let htmlArchived = await page.innerHTML('#interviews-list');
  console.log('Is Rejected present in Archived view:', !!htmlArchived.match(/Rejected Company/));

  // Add an interview with status Ghosted
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');
  await page.fill('#int-company', 'Ghosted Company');
  await page.selectOption('#int-status', 'Ghosted');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  htmlArchived = await page.innerHTML('#interviews-list');
  console.log('Is Ghosted present in Archived view:', !!htmlArchived.match(/Ghosted Company/));

  await page.click('button[data-filter="active"]');
  await page.waitForTimeout(500);

  htmlActive = await page.innerHTML('#interviews-list');
  console.log('Is Ghosted present in Active view:', !!htmlActive.match(/Ghosted Company/));

  await browser.close();
})();
