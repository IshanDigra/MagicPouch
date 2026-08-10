const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Expose console logs from the page
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  await page.goto('http://localhost:8080/chrome-extension/src/index.html');

  await page.waitForTimeout(1000);

  // Need to make sure interview tab is active
  await page.evaluate(() => {
    window.app.switchView('interviews');
  });
  await page.waitForTimeout(1000);

  console.log("HTML:", await page.evaluate(() => document.getElementById('interview-timeline').outerHTML));

  await page.evaluate(() => {
    document.querySelector('#interview-timeline > div').click();
  });

  await page.waitForTimeout(500);

  const modalVisible = await page.isVisible('#modal-day-summary:not(.hidden)');
  console.log('Day Summary Modal visible:', modalVisible);

  await browser.close();
})();
