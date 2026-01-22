// ===== Flow Auto Generator V2 - Background Service Worker =====

let downloadCount = 0;

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Background received:', message.type);

  switch (message.type) {
    case 'DOWNLOAD':
      handleDownload(message);
      sendResponse({ status: 'OK' });
      break;

    case 'GET_TAB_ID':
      sendResponse({ tabId: sender.tab?.id });
      break;
  }
  return true;
});

// Handle download request
async function handleDownload(message) {
  const { url, filename } = message;

  if (!url) {
    console.error('No URL provided for download');
    return;
  }

  try {
    downloadCount++;

    // Use provided filename or generate one
    let finalFilename = filename;
    if (!finalFilename) {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
      const index = String(downloadCount).padStart(3, '0');
      finalFilename = `flow-downloads/flow_${dateStr}_${timeStr}_${index}.png`;
    }

    console.log(`📥 Downloading: ${finalFilename}`);

    // Download the file directly - content.js already converted to data URL if needed
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: finalFilename,
      conflictAction: 'uniquify',
      saveAs: false
    });

    if (downloadId) {
      console.log(`✅ Download started: ${finalFilename} (ID: ${downloadId})`);
    }

  } catch (error) {
    console.error('Download error:', error);
  }
}

// Handle extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('🎨 Flow Auto Generator V2 installed!');
    chrome.storage.local.set({
      settings: {
        autoDownload: true,
        downloadFolder: 'flow-downloads'
      }
    });
  }
});

console.log('🎨 Flow Auto Generator V2 - Background Started');
