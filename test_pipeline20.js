const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');

  // We are on the Jobs view by default
  // Add a direct apply
  await page.click('button[aria-label="Add New Job"]');
  await page.waitForSelector('#modal-job:not(.hidden)');
  await page.fill('#job-title', 'Direct Apply Job');

  await page.click('#modal-job button:has-text("Direct Apply")');
  await page.waitForTimeout(500);

  // Add an Applied
  await page.click('button[aria-label="Add New Job"]');
  await page.waitForSelector('#modal-job:not(.hidden)');
  await page.fill('#job-title', 'Applied Job');

  // Need to click "Applied"
  await page.click('#modal-job button:has-text("Applied")');
  await page.waitForTimeout(500);

  // This opens the status modal.
  await page.evaluate(() => {
      app.updateStatus('applied', 'cold-email');
  });
  await page.waitForTimeout(500);

  // See if jobs are correctly classified as Applied and Direct Apply
  const jobListHtml = await page.innerHTML('#jobs-list');
  console.log('Jobs List contains Direct Apply label:', jobListHtml.includes('DIRECT APPLY'));
  console.log('Jobs List contains Applied label:', jobListHtml.includes('COLD EMAIL') || jobListHtml.includes('Cold Email'));

  // Go to Interviews
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Get pipeline stats
  const activeStatsText = await page.textContent('#stats-int-active');
  console.log('Active Pipeline Count:', activeStatsText);

  // Check the pipeline funnel again
  await page.click('button[onclick="app.openWeeklyModal()"]');
  await page.waitForTimeout(500);

  const convAppInt = await page.textContent('#conv-app-int');
  const convIntOff = await page.textContent('#conv-int-off');

  // We applied to 2 jobs total just now (Direct Apply + Cold Email)
  // We have 0 interviews in this script (it runs fresh?). Actually localStorage might be persisting across these playwright runs unless we use a new context.
  console.log('App->Int:', convAppInt);
  console.log('Int->Offer:', convIntOff);

  await browser.close();
})();
