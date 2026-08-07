const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');

  // Add 1 job with "Role @ Company" format
  await page.click('button[aria-label="Add New Job"]');
  await page.waitForSelector('#modal-job:not(.hidden)');
  await page.fill('#job-title', 'Frontend Engineer @ Awesome Inc');

  await page.evaluate(() => {
      app.saveJob('pending');
  });
  await page.waitForTimeout(500);

  // Promote to Interview
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

    // Check the values in the Interview Modal
    const companyVal = await page.inputValue('#int-company');
    const roleVal = await page.inputValue('#int-role');
    console.log('Company:', companyVal);
    console.log('Role:', roleVal);
  }

  await browser.close();
})();
