const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Add a new interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');

  await page.fill('#int-company', 'Test Mark Done Twice');
  await page.fill('#int-role', 'Re-evaluation Role');
  await page.selectOption('#int-status', 'HR Screen');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  const htmlAll = await page.innerHTML('#interviews-list');
  const match = htmlAll.match(/markStageComplete\('([^']+)'\)/);
  if (match) {
    const id = match[1];

    await page.evaluate((id) => {
        app.markStageComplete(id);
    }, id);
    await page.waitForTimeout(500);

    // Attempting to mark done twice? No, the button changes to "Next Stage"
    // Let's test the "Promote Stage" flow
    await page.evaluate((id) => {
        app.promoteStage(id);
    }, id);
    await page.waitForTimeout(500);

    const isModalOpen = await page.evaluate(() => {
        return !document.getElementById('modal-interview').classList.contains('hidden');
    });
    console.log('Promote stage opens modal:', isModalOpen);

    // Save with the SAME status but it should reset stageCompleted
    await page.click('#modal-interview button:has-text("Save")');
    await page.waitForTimeout(500);

    // Now it should have "Mark Done" again
    const htmlNext = await page.innerHTML('#interviews-list');
    console.log('Has Mark Done after promote stage with same status:', !!htmlNext.match(/markStageComplete/));

    await page.evaluate((id) => {
        app.markStageComplete(id);
    }, id);
    await page.waitForTimeout(500);

    // Open History Modal
    await page.evaluate((id) => {
        app.openHistoryModal(id);
    }, id);
    await page.waitForTimeout(500);

    const historyHtml = await page.innerHTML('#history-list-content');
    console.log('History HTML includes HR Call Completed:', historyHtml.includes('HR Call Completed'));

    // It should have two HR Call Completed entries.
    const hrCallCount = (historyHtml.match(/HR Call Completed/g) || []).length;
    console.log('History HR Call Completed Count:', hrCallCount);
  }

  await browser.close();
})();
