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

  await page.fill('#int-company', 'Test Pipeline Bug');
  await page.fill('#int-role', 'Test Pipeline Bug Role');
  await page.selectOption('#int-status', 'Test Received');
  await page.click('#modal-interview button:has-text("Save")');

  await page.waitForTimeout(500);

  const interviewHtml = await page.innerHTML('#interviews-list');
  console.log('Interviews List Initial:', interviewHtml);

  // Get the ID of the newly added interview
  // It has button onclick="app.markStageComplete('ID')"
  const markDoneMatch = interviewHtml.match(/markStageComplete\('([^']+)'\)/);
  if (markDoneMatch) {
    const interviewId = markDoneMatch[1];
    console.log('Found interview ID:', interviewId);

    // Mark Done
    await page.evaluate((id) => {
        app.markStageComplete(id);
    }, interviewId);

    await page.waitForTimeout(500);

    const interviewHtml2 = await page.innerHTML('#interviews-list');
    console.log('Interviews List after Mark Done:', interviewHtml2);

    // Promote Stage
    await page.evaluate((id) => {
        app.promoteStage(id);
    }, interviewId);

    await page.waitForTimeout(500);

    // See if the modal is open with the right stage?
    await page.selectOption('#int-status', 'Offer');
    await page.click('#modal-interview button:has-text("Save")');

    await page.waitForTimeout(500);

    const interviewHtml3 = await page.innerHTML('#interviews-list');
    console.log('Interviews List after Promote Stage to Offer:', interviewHtml3);
  } else {
    console.log('Could not find interview ID.');
  }

  await browser.close();
})();
