const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Check the initial conversion rate for a blank slate.
  // Click on "Weekly Insights" button (the one with mini-weekly)
  await page.click('button[onclick="app.openWeeklyModal()"]');
  await page.waitForTimeout(500);

  let convAppInt = await page.textContent('#conv-app-int');
  let convIntOff = await page.textContent('#conv-int-off');

  console.log('Initial App->Int:', convAppInt);
  console.log('Initial Int->Offer:', convIntOff);

  await page.evaluate(() => {
    document.getElementById('modal-weekly').classList.add('hidden');
  });
  await page.waitForTimeout(500);

  // Switch to Jobs view to apply to a job
  await page.click('button[onclick="app.switchView(\'jobs\')"]');
  await page.waitForTimeout(500);

  // Add a new job
  await page.click('button[aria-label="Add New Job"]');
  await page.waitForSelector('#modal-job:not(.hidden)');
  await page.fill('#job-title', 'Job for Pipeline');

  // Use evaluate to save job as pending to avoid locator issue
  await page.evaluate(() => {
      app.saveJob('pending');
  });
  await page.waitForTimeout(500);

  // Apply via Direct
  // Actually, let's just evaluate
  await page.evaluate(() => {
      const notes = STATE.data.notes;
      const job = notes.find(n => n.title === 'Job for Pipeline');
      if (job) {
          app.openStatusModal(job.id);
      }
  });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
      app.updateStatus('direct-apply');
  });
  await page.waitForTimeout(500);

  await page.click('button[onclick="app.openWeeklyModal()"]');
  await page.waitForTimeout(500);

  convAppInt = await page.textContent('#conv-app-int');
  convIntOff = await page.textContent('#conv-int-off');

  console.log('After 1 Apply, App->Int:', convAppInt);
  console.log('After 1 Apply, Int->Offer:', convIntOff);

  await page.evaluate(() => {
    document.getElementById('modal-weekly').classList.add('hidden');
  });
  await page.waitForTimeout(500);

  // Go to Interviews
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Add 1 interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');
  await page.fill('#int-company', 'Interview 1');
  await page.selectOption('#int-status', 'HR Screen');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  await page.click('button[onclick="app.openWeeklyModal()"]');
  await page.waitForTimeout(500);

  convAppInt = await page.textContent('#conv-app-int');
  convIntOff = await page.textContent('#conv-int-off');

  // We have 1 job applied + 1 interview applied. Total applied = 2.
  // Interviews = 1.
  // Rate should be 50%. Let's see
  console.log('After 1 Interview, App->Int:', convAppInt);
  console.log('After 1 Interview, Int->Offer:', convIntOff);

  await page.evaluate(() => {
    document.getElementById('modal-weekly').classList.add('hidden');
  });
  await page.waitForTimeout(500);

  // Mark interview to Offer
  const htmlAll = await page.innerHTML('#interviews-list');
  const openModalMatch = htmlAll.match(/app\.openInterviewModal\('([^']+)'\)/);
  if (openModalMatch) {
      const id = openModalMatch[1];
      await page.evaluate((id) => {
          app.openInterviewModal(id);
      }, id);
      await page.waitForTimeout(500);

      await page.selectOption('#int-status', 'Offer');
      await page.click('#modal-interview button:has-text("Save")');
      await page.waitForTimeout(500);
  }

  await page.click('button[onclick="app.openWeeklyModal()"]');
  await page.waitForTimeout(500);

  convAppInt = await page.textContent('#conv-app-int');
  convIntOff = await page.textContent('#conv-int-off');

  console.log('After Offer, App->Int:', convAppInt);
  console.log('After Offer, Int->Offer:', convIntOff);


  await browser.close();
})();
