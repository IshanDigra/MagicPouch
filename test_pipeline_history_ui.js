const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');

  // Go to Interviews view
  await page.click('button[onclick="app.switchView(\'interviews\')"]');
  await page.waitForTimeout(500);

  // Add 1 interview
  await page.click('button[aria-label="Add New Interview"]');
  await page.waitForSelector('#modal-interview:not(.hidden)');
  await page.fill('#int-company', 'History UI Test');
  await page.selectOption('#int-status', 'HR Screen');
  await page.click('#modal-interview button:has-text("Save")');
  await page.waitForTimeout(500);

  const htmlActive = await page.innerHTML('#interviews-list');
  const match = htmlActive.match(/markStageComplete\('([^']+)'\)/);
  if (match) {
    const id = match[1];

    // Promote to same stage (e.g., HR Screen Round 2)
    await page.evaluate((id) => {
        app.promoteStage(id); // isPromoting = true
    }, id);
    await page.waitForTimeout(500);

    // Save with the SAME status but it should reset stageCompleted and log history
    await page.click('#modal-interview button:has-text("Save")');
    await page.waitForTimeout(500);

    // Open History Modal
    await page.evaluate((id) => {
        app.openHistoryModal(id);
    }, id);
    await page.waitForTimeout(500);

    const historyHtml = await page.innerHTML('#history-list-content');

    // Look for the element with text "New Round: HR Screen" and check its classes
    const isStyledCorrectly = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('#history-list-content .font-bold.text-sm'));
        const newRoundEl = els.find(e => e.textContent.includes('New Round: HR Screen'));
        if (newRoundEl) {
            return newRoundEl.classList.contains('text-indigo-700');
        }
        return false;
    });

    console.log('History UI New Round correctly styled:', isStyledCorrectly);
  }

  await browser.close();
})();
