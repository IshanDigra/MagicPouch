// Content Script for ApplicationPal Job Capture

console.log('ApplicationPal content script loaded');

// Helper to scrape basic job details from common platforms
function scrapeJobDetails() {
  let title = '';
  let company = '';
  const url = window.location.href;

  try {
    if (url.includes('linkedin.com/jobs')) {
      const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title');
      if (titleEl) title = titleEl.innerText.trim();
      const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name');
      if (companyEl) company = companyEl.innerText.trim();
    }
    else if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) {
      const titleEl = document.querySelector('.app-title');
      if (titleEl) title = titleEl.innerText.trim();
      const companyEl = document.querySelector('.company-name');
      if (companyEl) company = companyEl.innerText.trim().replace('at ', '');
    }
    else if (url.includes('jobs.lever.co')) {
      const titleEl = document.querySelector('.posting-headline h2');
      if (titleEl) title = titleEl.innerText.trim();
      // Lever usually puts company name in the page title
      company = document.title.split('-')[0].trim();
    }
    else if (url.includes('workdayjobs.com')) {
      const titleEl = document.querySelector('h2');
      if (titleEl) title = titleEl.innerText.trim();
      company = window.location.hostname.split('.')[0];
    }
    else {
      // Generic fallback
      title = document.title;
      company = window.location.hostname;
    }
  } catch (e) {
    console.error('ApplicationPal scraping error:', e);
  }

  return { title, company, url };
}

// Intercept form submissions or monitor for success messages
function setupAutoCapture() {
  // Let's create a subtle floating button to capture the job
  const btn = document.createElement('button');
  btn.innerHTML = '✨ Save to ApplicationPal';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '999999',
    padding: '10px 16px',
    backgroundColor: '#000000',
    color: '#ffffff',
    border: '1px solid #333',
    borderRadius: '20px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease'
  });

  btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
  btn.onmouseout = () => btn.style.transform = 'scale(1)';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const details = scrapeJobDetails();

    // Animate button
    btn.innerHTML = '✓ Saved!';
    btn.style.backgroundColor = '#10b981';

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'JOB_CAPTURED',
      payload: {
        title: details.title,
        company: details.company,
        url: details.url,
        timestamp: Date.now()
      }
    });

    setTimeout(() => {
      btn.innerHTML = '✨ Save to ApplicationPal';
      btn.style.backgroundColor = '#000000';
    }, 2000);
  });

  document.body.appendChild(btn);
}

// Magic Fill functionality
function performMagicFill() {
  chrome.storage.local.get(['magicProfile'], (result) => {
    if (!result.magicProfile) return;

    const profile = result.magicProfile;
    const inputs = document.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
      const name = (input.name || input.id || input.placeholder || '').toLowerCase();

      // Very basic heuristic matching
      if (name.includes('first') && name.includes('name')) input.value = profile.firstName || input.value;
      else if (name.includes('last') && name.includes('name')) input.value = profile.lastName || input.value;
      else if (name.includes('email')) input.value = profile.email || input.value;
      else if (name.includes('phone') || name.includes('mobile')) input.value = profile.phone || input.value;
      else if (name.includes('linkedin')) input.value = profile.linkedin || input.value;
      else if (name.includes('portfolio') || name.includes('website')) input.value = profile.portfolio || input.value;
    });
  });
}

// Add keyboard shortcut for Magic Fill (Ctrl/Cmd + Shift + F)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    performMagicFill();
  }
});

// Initialize
if (document.readyState === 'complete') {
  setupAutoCapture();
} else {
  window.addEventListener('load', setupAutoCapture);
}
