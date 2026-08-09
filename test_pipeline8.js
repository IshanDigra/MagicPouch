const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto('http://localhost:8080');

  // Add a new job
  await page.click('button[aria-label="Add New Job"]');
  await page.waitForSelector('#modal-job:not(.hidden)');

  await page.fill('#job-title', 'Promote Test Job');
  await page.fill('#job-content', 'http://example.com');

  // Save Job to Pending
  await page.evaluate(() => {
    app.saveJob('pending');
  });

  await page.waitForTimeout(500);

  // The job list should now have "Promote Test Job"
  const jobListHtml = await page.innerHTML('#jobs-list');
  const match = jobListHtml.match(/app\.openStatusModal\('([^']+)'\)/);
  if (match) {
    const jobId = match[1];
    console.log('Found Job ID:', jobId);

    // Open Status Modal
    await page.evaluate((id) => {
        app.openStatusModal(id);
    }, jobId);

    await page.waitForTimeout(500);

    // Promote to Interview
    await page.evaluate(() => {
        app.promoteToInterview();
    });

    await page.waitForTimeout(1000);

    // We should be redirected to Interviews View
    const intHtml = await page.innerHTML('#interviews-list');
    console.log('Interviews List after promote:', intHtml.includes('Promote Test Job'));

    // Interview Modal should be open
    const modalVisible = await page.evaluate(() => {
        return !document.getElementById('modal-interview').classList.contains('hidden');
    });
    console.log('Interview Modal Visible:', modalVisible);

    if (modalVisible) {
        const companyVal = await page.inputValue('#int-company');
        const roleVal = await page.inputValue('#int-role');
        console.log('Interview Modal Company:', companyVal);
        console.log('Interview Modal Role:', roleVal);

        await page.click('#modal-interview button:has-text("Save")');
        await page.waitForTimeout(500);

        const finalIntHtml = await page.innerHTML('#interviews-list');
        console.log('Interviews List after modal save:', finalIntHtml.includes('Promote Test Job'));
    }

  } else {
    console.log('Could not find Job ID');
  }

  await browser.close();
})();
