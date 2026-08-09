const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Click on "Active" filter tab
  await page.click('button[data-filter="active"]');
  await page.waitForTimeout(500);

  // Add a new interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');

  await page.fill('#int-company', 'Test Active Pipeline Bug');
  await page.fill('#int-role', 'Test Active Pipeline Bug Role');
  await page.selectOption('#int-status', 'Test Received');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  const interviewHtml = await page.innerHTML('#interviews-list');
  console.log('Interviews List Initial (Active Filter):', !!interviewHtml.match(/Test Active Pipeline/));

  const markDoneMatch = interviewHtml.match(/markStageComplete\('([^']+)'\)/);
  if (markDoneMatch) {
    const interviewId = markDoneMatch[1];
    console.log('Found interview ID:', interviewId);

    // Mark Done
    await page.evaluate((id) => {
        app.markStageComplete(id);
    }, interviewId);

    await page.waitForTimeout(500);
    const html2 = await page.innerHTML('#interviews-list');
    console.log('Interviews List after Mark Done (Active Filter):', !!html2.match(/Test Active Pipeline/));

    // Promote Stage
    await page.evaluate((id) => {
        app.promoteStage(id);
    }, interviewId);
    await page.waitForTimeout(500);

    // See if the modal is open with the right stage?
    await page.selectOption('#int-status', 'Offer');
    await page.click('#modal-interview button:has-text("Save")');
    await page.waitForTimeout(500);

    const html3 = await page.innerHTML('#interviews-list');
    console.log('Interviews List after Promote Stage to Offer (Active Filter):', !!html3.match(/Test Active Pipeline/));
  } else {
    console.log('Could not find interview ID.');
  }

  await browser.close();
})();
