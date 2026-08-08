const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');

  // Add a new job
  await page.click('button[aria-label="Add New Job"]');
  await page.waitForSelector('#modal-job:not(.hidden)');

  await page.fill('#job-title', 'Job for Pipeline');
  await page.fill('#job-content', 'http://example.com');
  // Need to use class/text match since button just has text "Applied" or "Direct Apply"
  // Let's use app.saveJob('pending') which is the Save button
  await page.click('button:has-text("Save")');

  await page.waitForTimeout(500);

  // Click status button
  await page.click('.fa-ellipsis-h');

  await page.waitForTimeout(500);

  // Click Move to Interview / Test
  await page.click('button:has-text("Move to Interview / Test")');

  await page.waitForTimeout(500);

  const intHtml = await page.innerHTML('#interviews-list');
  console.log('Interviews List after promoteToInterview:', intHtml);

  // Close modal if open
  // const modalOpen = await page.isVisible('#modal-interview:not(.hidden)');
  // console.log('Interview Modal open:', modalOpen);

  // Let's see what values are populated in the interview modal
  const companyVal = await page.inputValue('#int-company');
  const roleVal = await page.inputValue('#int-role');
  console.log('Interview Modal Company:', companyVal);
  console.log('Interview Modal Role:', roleVal);

  await browser.close();
})();
