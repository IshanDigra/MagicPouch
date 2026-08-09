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

    const item = await page.evaluate((id) => {
        return STATE.data.notes.find(n => n.id === id);
    }, id);

    console.log('Item history:', item.history);
    console.log('Item stageCompleted:', item.stageCompleted);

    // Try changing status
    await page.evaluate((id) => {
        app.promoteStage(id);
    }, id);
    await page.waitForTimeout(500);

    await page.selectOption('#int-status', 'Technical');
    await page.click('#modal-interview button:has-text("Save")');
    await page.waitForTimeout(500);

    const item2 = await page.evaluate((id) => {
        return STATE.data.notes.find(n => n.id === id);
    }, id);
    console.log('Item2 history:', item2.history);
    console.log('Item2 stageCompleted:', item2.stageCompleted);

    // Now Mark Done on Technical
    await page.evaluate((id) => {
        app.markStageComplete(id);
    }, id);
    await page.waitForTimeout(500);

    // Try to click "Next Stage" and then "Offer"
    await page.evaluate((id) => {
        app.promoteStage(id);
    }, id);
    await page.waitForTimeout(500);

    await page.selectOption('#int-status', 'Offer');
    await page.click('#modal-interview button:has-text("Save")');
    await page.waitForTimeout(500);

    const item3 = await page.evaluate((id) => {
        return STATE.data.notes.find(n => n.id === id);
    }, id);
    console.log('Item3 history:', item3.history);
    console.log('Item3 stageCompleted:', item3.stageCompleted);
  }

  await browser.close();
})();
