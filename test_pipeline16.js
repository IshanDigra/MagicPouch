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
  await page.fill('#int-company', 'Interview to Promote and Mark Done');
  await page.selectOption('#int-status', 'HR Screen');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  const htmlActive = await page.innerHTML('#interviews-list');
  const match = htmlActive.match(/markStageComplete\('([^']+)'\)/);
  if (match) {
    const id = match[1];

    // Mark Done
    await page.evaluate((id) => {
        app.markStageComplete(id);
    }, id);
    await page.waitForTimeout(500);

    const afterMarkDoneHtml = await page.innerHTML('#interviews-list');
    console.log('After mark done, is it line-through or anything?:', afterMarkDoneHtml.includes('fas fa-check-circle'));

    // Check if it's considered "completed" correctly
    // And if we can promote it
    await page.evaluate((id) => {
        app.promoteStage(id);
    }, id);
    await page.waitForTimeout(500);

    await page.selectOption('#int-status', 'Offer');
    await page.click('#modal-interview button:has-text("Save")');
    await page.waitForTimeout(500);

    const htmlAll = await page.innerHTML('#interviews-list');
    console.log('Offer present after promote stage:', htmlAll.includes('fas fa-gift'));
  }

  await browser.close();
})();
