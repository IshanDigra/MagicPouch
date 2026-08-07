const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Add a new interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');

  await page.fill('#int-company', 'Re-evaluation Test');
  await page.fill('#int-role', 'Re-evaluation Role');
  await page.selectOption('#int-status', 'Offer');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  const filterBtns = await page.$$('.int-filter-btn');
  for (const btn of filterBtns) {
      const cls = await btn.getAttribute('class');
      const txt = await btn.textContent();
      console.log(`Filter: ${txt} - Classes: ${cls}`);
  }

  // Check the pipeline if "Re-evaluation Test" shows up in All
  const htmlAll = await page.innerHTML('#interviews-list');
  console.log('Interviews List Initial (All Filter):', !!htmlAll.match(/Re-evaluation Test/));

  // Switch filter to active
  await page.click('button[data-filter="active"]');
  await page.waitForTimeout(500);

  const htmlActive = await page.innerHTML('#interviews-list');
  console.log('Interviews List after active filter:', !!htmlActive.match(/Re-evaluation Test/));

  // Edit existing interview back to HR Screen
  // Let's add a test for it first so we can find it
  await page.click('button[data-filter="offers"]');
  await page.waitForTimeout(500);

  const htmlOffers = await page.innerHTML('#interviews-list');
  console.log('Interviews List Offers:', !!htmlOffers.match(/Re-evaluation Test/));

  const openModalMatch = htmlOffers.match(/app\.openInterviewModal\('([^']+)'\)/);
  if (openModalMatch) {
      const id = openModalMatch[1];
      console.log('Found Interview ID:', id);

      // Open Interview modal
      await page.evaluate((id) => {
          app.openInterviewModal(id);
      }, id);
      await page.waitForTimeout(500);

      // Change status to HR Screen
      await page.selectOption('#int-status', 'HR Screen');
      await page.click('#modal-interview button:has-text("Save")');
      await page.waitForTimeout(500);

      const htmlOffers2 = await page.innerHTML('#interviews-list');
      console.log('Interviews List Offers after change to HR Screen:', !!htmlOffers2.match(/Re-evaluation Test/));

      await page.click('button[data-filter="active"]');
      await page.waitForTimeout(500);
      const htmlActive2 = await page.innerHTML('#interviews-list');
      console.log('Interviews List Active after change to HR Screen:', !!htmlActive2.match(/Re-evaluation Test/));

  }

  await browser.close();
})();
