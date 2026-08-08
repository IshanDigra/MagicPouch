const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Add 1 interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');
  await page.fill('#int-company', 'Interview To Reject');
  await page.selectOption('#int-status', 'HR Screen');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  // Look at the UI of active filter
  await page.click('button[data-filter="active"]');
  await page.waitForTimeout(500);
  let htmlActive = await page.innerHTML('#interviews-list');
  console.log('Is HR Screen present in Active view:', !!htmlActive.match(/Interview To Reject/));

  // Update to rejected
  const htmlAll = await page.innerHTML('#interviews-list');
  const openModalMatch = htmlAll.match(/app\.openInterviewModal\('([^']+)'\)/);
  if (openModalMatch) {
      const id = openModalMatch[1];
      await page.evaluate((id) => {
          app.openInterviewModal(id);
      }, id);
      await page.waitForTimeout(500);

      await page.selectOption('#int-status', 'Rejected');
      await page.click('#modal-interview button:has-text("Save")');
      await page.waitForTimeout(500);
  }

  // Active view shouldn't have Rejected
  htmlActive = await page.innerHTML('#interviews-list');
  console.log('Is Rejected present in Active view:', !!htmlActive.match(/Interview To Reject/));

  // Edit back to HR screen while in Active view (this is what bug is mostly about - if you are in Active view and save back to an active state, it didn't show up in one of the tests earlier)
  await page.click('button[data-filter="archived"]');
  await page.waitForTimeout(500);
  let htmlArchived = await page.innerHTML('#interviews-list');
  console.log('Is Rejected present in Archived view:', !!htmlArchived.match(/Interview To Reject/));

  const archMatch = htmlArchived.match(/app\.openInterviewModal\('([^']+)'\)/);
  if (archMatch) {
      const id = archMatch[1];
      await page.evaluate((id) => {
          app.openInterviewModal(id);
      }, id);
      await page.waitForTimeout(500);

      await page.selectOption('#int-status', 'HR Screen');
      await page.click('#modal-interview button:has-text("Save")');
      await page.waitForTimeout(500);
  }

  await page.click('button[data-filter="active"]');
  await page.waitForTimeout(500);
  htmlActive = await page.innerHTML('#interviews-list');
  console.log('Is HR Screen present in Active view after restoring from Rejected:', !!htmlActive.match(/Interview To Reject/));

  await browser.close();
})();
