const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Add 1 interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');
  await page.fill('#int-company', 'Progression Test');
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

    // Test Edit without Promoting (e.g. changing notes)
    // Should NOT reset stageCompleted
    await page.evaluate((id) => {
        app.openInterviewModal(id, false); // isPromoting = false
    }, id);
    await page.waitForTimeout(500);

    // Save with the SAME status
    await page.click('#modal-interview button:has-text("Save")');
    await page.waitForTimeout(500);

    // Check if it's still completed (has Promote button instead of Mark Done)
    const htmlAfterEdit = await page.innerHTML('#interviews-list');
    console.log('Still completed after simple edit:', htmlAfterEdit.includes('promoteStage'));

    // Promote to same stage (e.g., HR Screen Round 2)
    await page.evaluate((id) => {
        app.promoteStage(id); // isPromoting = true
    }, id);
    await page.waitForTimeout(500);

    // Save with the SAME status but it should reset stageCompleted and log history
    await page.click('#modal-interview button:has-text("Save")');
    await page.waitForTimeout(500);

    // Now it should have "Mark Done" again
    const htmlNext = await page.innerHTML('#interviews-list');
    console.log('Has Mark Done after promote stage with same status:', !!htmlNext.match(/markStageComplete/));

    // Open History Modal
    await page.evaluate((id) => {
        app.openHistoryModal(id);
    }, id);
    await page.waitForTimeout(500);

    const historyHtml = await page.innerHTML('#history-list-content');
    console.log('History HTML includes New Round: HR Screen:', historyHtml.includes('New Round: HR Screen'));
  }

  await browser.close();
})();
