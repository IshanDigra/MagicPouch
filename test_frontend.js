const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const indexPath = 'http://localhost:8096/src/index.html';
  console.log("Loading", indexPath);
  await page.goto(indexPath);
  await page.waitForTimeout(1000);

  // Set some mock data to render groups
  await page.evaluate(() => {
    if (window.app && window.STATE) {
        window.STATE.hasInitializedFolders = true;
        window.STATE.openFolders = new Set();
        window.STATE.data.notes = [
          { id: "1", title: "Job 1", created: Date.now(), status: "pending", category: "job", linkType: "job", content: "url" },
          { id: "2", title: "Job 2", created: Date.now() - 86400000, status: "pending", category: "job", linkType: "job", content: "url" },
        ];
        window.app.renderJobs();
    }
  });
  await page.waitForTimeout(500);

  // Check if job groups are rendered
  const groups = await page.locator('[data-list-id]').count();
  console.log("Found groups with data-list-id:", groups);

  if (groups > 0) {
    // Click the first one
    const firstGroup = page.locator('[data-list-id]').first();
    const listId = await firstGroup.getAttribute('data-list-id');
    console.log("First group list id:", listId);

    const isHiddenBefore = await page.locator('#' + listId).evaluate(el => el.classList.contains('hidden'));
    console.log("Is hidden before:", isHiddenBefore);

    await firstGroup.click();
    await page.waitForTimeout(500);

    const isHiddenAfter = await page.locator('#' + listId).evaluate(el => el.classList.contains('hidden'));
    console.log("Is hidden after click:", isHiddenAfter);
  }

  await browser.close();
})();
