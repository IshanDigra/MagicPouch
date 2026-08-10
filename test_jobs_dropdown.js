const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  await page.goto('http://localhost:8080/chrome-extension/src/index.html');
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    // Inject through the encapsulated method if possible, or just mock app execution inside module context
    console.log("Keys on window: ", Object.keys(window).filter(k => !k.startsWith('webkit')));
  });

  await browser.close();
})();
