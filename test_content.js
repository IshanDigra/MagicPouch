const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const contentScript = fs.readFileSync('chrome-extension/src/content.js', 'utf8');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: 'dangerously'
});

dom.window.chrome = {
  storage: { local: { get: (k, cb) => cb({}), set: () => {} } },
  runtime: { sendMessage: () => {} }
};

const script = dom.window.document.createElement('script');
script.textContent = contentScript;
dom.window.document.body.appendChild(script);

setTimeout(() => {
  const container = dom.window.document.querySelector('#applicationpal-widget-container');
  if (!container) {
    console.error('Test failed: No container found');
    process.exit(1);
  }

  const customUrl = dom.window.document.querySelector('#app-pal-custom-url');
  if (!customUrl) {
      console.error('Test failed: custom url input not found');
      process.exit(1);
  }

  const saveAppliedBtn = dom.window.document.querySelector('#app-pal-save-submitted');
  if (!saveAppliedBtn) {
      console.error('Test failed: save submitted btn not found');
      process.exit(1);
  }

  const saveActiveBtn = dom.window.document.querySelector('#app-pal-save-active');
  if (!saveActiveBtn) {
      console.error('Test failed: save active btn not found');
      process.exit(1);
  }

  console.log('Tests passed');
  process.exit(0);
}, 500);
