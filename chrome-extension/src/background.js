// Chrome Extension Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  // Allow the side panel to open on clicking the extension icon
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'JOB_CAPTURED') {
    // We broadcast this to any open side panels
    chrome.runtime.sendMessage({
      type: 'SYNC_JOB_TO_POUCH',
      payload: message.payload
    });
    sendResponse({ success: true });
  }
  return true;
});
