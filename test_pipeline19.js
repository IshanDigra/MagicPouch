const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Add 1 interview - test the Promote To Interview logic with stage reset and history tracking again
  await page.click('button[onclick="app.switchView(\'jobs\')"]');
  await page.waitForTimeout(500);

  await page.click('button[aria-label="Add New Job"]');
  await page.waitForSelector('#modal-job:not(.hidden)');
  await page.fill('#job-title', 'Stage Testing Job');

  await page.evaluate(() => {
      app.saveJob('pending');
  });
  await page.waitForTimeout(500);

  const jobListHtml = await page.innerHTML('#jobs-list');
  const match = jobListHtml.match(/app\.openStatusModal\('([^']+)'\)/);
  if (match) {
    const jobId = match[1];

    await page.evaluate((id) => {
        app.openStatusModal(id);
    }, jobId);
    await page.waitForTimeout(500);

    // Promote to Interview
    await page.evaluate(() => {
        app.promoteToInterview();
    });
    await page.waitForTimeout(1000);

    // Save as HR screen
    await page.selectOption('#int-status', 'HR Screen');
    await page.click('#modal-interview button:has-text("Save")');
    await page.waitForTimeout(500);

    // See if the item has history and stageCompleted = false
    const item = await page.evaluate((id) => {
        // Need to parse from DOM or inject window hook
        return document.querySelector('#interviews-list').innerHTML;
    }, jobId);

    // Test Mark complete
    await page.evaluate((id) => {
        app.markStageComplete(id);
    }, jobId);
    await page.waitForTimeout(500);

    // Check if the timeline UI handles it
    const timelineHtml = await page.innerHTML('#interview-timeline');
    console.log('Timeline present:', !!timelineHtml.match(/flex-shrink-0/));

  }

  await browser.close();
})();
