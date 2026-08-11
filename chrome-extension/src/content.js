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
  const container = document.createElement('div');
  container.id = 'applicationpal-widget-container';

  // Set initial position or load from storage
  let currentX = window.innerWidth - 80; // default near right edge
  let currentY = window.innerHeight - 80;  // default near bottom edge

  Object.assign(container.style, {
    position: 'fixed',
    left: `${currentX}px`,
    top: `${currentY}px`,
    zIndex: '999999',
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px'
  });

  // Restore position if saved
  chrome.storage.local.get(['palBtnPos'], (result) => {
    if (result.palBtnPos) {
      currentX = result.palBtnPos.x;
      currentY = result.palBtnPos.y;
      container.style.left = `${currentX}px`;
      container.style.top = `${currentY}px`;
    }
  });

  const iconBtn = document.createElement('div');
  // minimalist icon for application pal
  iconBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  `;

  Object.assign(iconBtn.style, {
    width: '40px',
    height: '40px',
    backgroundColor: '#000000',
    color: '#ffffff',
    borderRadius: '50%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'grab',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'transform 0.2s ease, background-color 0.2s ease'
  });

  iconBtn.onmouseover = () => iconBtn.style.transform = 'scale(1.05)';
  iconBtn.onmouseout = () => iconBtn.style.transform = 'scale(1)';

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    display: 'none',
    position: 'absolute',
    right: '0',
    bottom: '50px',
    backgroundColor: '#ffffff',
    border: '1px solid #e4e4e7',
    borderRadius: '12px',
    padding: '12px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    width: '240px',
    color: '#18181b',
    fontSize: '13px'
  });

  panel.innerHTML = `
    <div style="margin-bottom: 8px; font-weight: 600; color: #18181b;">Save Job to ApplicationPal</div>
    <input id="app-pal-custom-url" type="text" placeholder="Paste copied link (optional)" style="width: 100%; padding: 6px 8px; border: 1px solid #d4d4d8; border-radius: 6px; margin-bottom: 10px; font-size: 12px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#18181b'" onblur="this.style.borderColor='#d4d4d8'" />
    <div style="display: flex; gap: 8px; flex-direction: column;">
      <button id="app-pal-save-submitted" style="background: #18181b; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 500; text-align: center; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">Mark as Submitted</button>
      <button id="app-pal-save-active" style="background: #f4f4f5; color: #18181b; border: 1px solid #e4e4e7; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 500; text-align: center; transition: background 0.2s;" onmouseover="this.style.background='#e4e4e7'" onmouseout="this.style.background='#f4f4f5'">Mark as Active Job</button>
    </div>
  `;

  // Dragging logic
  let isDragging = false;
  let startX, startY;
  let hasDragged = false;

  iconBtn.addEventListener('mousedown', (e) => {
    isDragging = true;
    hasDragged = false;
    startX = e.clientX - currentX;
    startY = e.clientY - currentY;
    iconBtn.style.cursor = 'grabbing';
    e.preventDefault(); // Prevent text selection
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    hasDragged = true;

    currentX = e.clientX - startX;
    currentY = e.clientY - startY;

    // Keep within bounds
    const rect = container.getBoundingClientRect();
    if (currentX < 0) currentX = 0;
    if (currentY < 0) currentY = 0;
    if (currentX + rect.width > window.innerWidth) currentX = window.innerWidth - rect.width;
    if (currentY + rect.height > window.innerHeight) currentY = window.innerHeight - rect.height;

    container.style.left = `${currentX}px`;
    container.style.top = `${currentY}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      iconBtn.style.cursor = 'grab';
      if (hasDragged) {
         chrome.storage.local.set({ palBtnPos: { x: currentX, y: currentY } });
      }
    }
  });

  iconBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (hasDragged) {
      hasDragged = false;
      return;
    }

    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  const saveJob = (status) => {
    const details = scrapeJobDetails();
    const customUrlInput = document.getElementById('app-pal-custom-url');
    const customUrl = customUrlInput ? customUrlInput.value.trim() : '';
    const finalUrl = customUrl || details.url;

    iconBtn.innerHTML = '✓';
    iconBtn.style.backgroundColor = '#10b981';
    panel.style.display = 'none';

    chrome.runtime.sendMessage({
      type: 'JOB_CAPTURED',
      payload: {
        title: details.title,
        company: details.company,
        url: finalUrl,
        status: status,
        timestamp: Date.now()
      }
    });

    setTimeout(() => {
      iconBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      `;
      iconBtn.style.backgroundColor = '#000000';
      if (customUrlInput) customUrlInput.value = '';
    }, 2000);
  };

  panel.querySelector('#app-pal-save-submitted').addEventListener('click', () => saveJob('applied'));
  panel.querySelector('#app-pal-save-active').addEventListener('click', () => saveJob('pending'));

  // Close panel if clicking outside
  document.addEventListener('click', (e) => {
    if (panel.style.display === 'block' && !container.contains(e.target)) {
      panel.style.display = 'none';
    }
  });

  container.appendChild(panel);
  container.appendChild(iconBtn);
  document.body.appendChild(container);
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
