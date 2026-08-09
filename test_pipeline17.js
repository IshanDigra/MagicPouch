const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto('http://localhost:8080');

  // Add 1 job
  await page.click('button[aria-label="Add New Job"]');
  await page.waitForSelector('#modal-job:not(.hidden)');
  await page.fill('#job-title', 'Job for Pipeline to Interview');

  await page.evaluate(() => {
      app.saveJob('pending');
  });
  await page.waitForTimeout(500);

  // We have to parse the DOM to find the job ID
  const jobListHtml = await page.innerHTML('#jobs-list');
  // It should be the first one
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

    // See if modal is open
    const modalVisible = await page.evaluate(() => {
        return !document.getElementById('modal-interview').classList.contains('hidden');
    });
    console.log('Modal visible after promote:', modalVisible);

    // Try to save the interview
    if (modalVisible) {
        // In the modal, you'd typically select a stage and save
        await page.selectOption('#int-status', 'HR Screen');
        await page.click('#modal-interview button:has-text("Save")');
        await page.waitForTimeout(500);

        const intHtml = await page.innerHTML('#interviews-list');
        console.log('Interviews List contains promoted job:', intHtml.includes('Job for Pipeline to Interview'));

        // Check if it's still in the jobs view
        await page.click('button[onclick="app.switchView(\'jobs\')"]');
        await page.waitForTimeout(500);

        const jobHtml = await page.innerHTML('#jobs-list');
        console.log('Jobs List contains promoted job (should be false, as it moved to interviews):', jobHtml.includes('Job for Pipeline to Interview'));
    }
  }

  await browser.close();
})();
