// ===== Flow Auto Generator V2 - Popup Script =====

// Default settings
const DEFAULT_SETTINGS = {
  delay: 20,
  repeat: 1,
  prompts: ''
};

// State
let state = {
  isConnected: false,
  isProcessing: false,
  generated: 0,
  downloaded: 0
};

// DOM Elements
const elements = {};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initElements();
  await loadSavedState();
  await checkConnection();
  setupEventListeners();
});

// Initialize DOM elements
function initElements() {
  elements.connectionStatus = document.getElementById('connectionStatus');
  elements.promptsInput = document.getElementById('promptsInput');
  elements.promptCount = document.getElementById('promptCount');
  elements.delayInput = document.getElementById('delayInput');
  elements.repeatInput = document.getElementById('repeatInput');
  elements.btnGenerate = document.getElementById('btnGenerate');
  elements.btnStop = document.getElementById('btnStop');
  elements.progressSection = document.getElementById('progressSection');
  elements.progressText = document.getElementById('progressText');
  elements.progressPercent = document.getElementById('progressPercent');
  elements.progressFill = document.getElementById('progressFill');
  elements.statGenerated = document.getElementById('statGenerated');
  elements.statDownloaded = document.getElementById('statDownloaded');
  elements.fileInput = document.getElementById('fileInput');
  elements.btnLoadFile = document.getElementById('btnLoadFile');
  elements.btnClearPrompts = document.getElementById('btnClearPrompts');
}

// Check connection to Flow page
function checkConnection() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    if (!tab || !tab.url) {
      setConnectionStatus('error');
      return;
    }

    if (!tab.url.includes('labs.google')) {
      setConnectionStatus('not-flow');
      return;
    }

    // Store tab ID for later use
    state.currentTabId = tab.id;

    // Try to ping content script with callback
    chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Content script not responding, injecting...');
        // Try to inject content script programmatically
        injectContentScript(tab.id);
        return;
      }

      if (response && response.status === 'OK') {
        console.log('Connected to content script!');
        setConnectionStatus('connected');
      } else {
        console.log('Invalid response, injecting script...');
        injectContentScript(tab.id);
      }
    });
  });
}

// Inject content script programmatically
function injectContentScript(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }).then(() => {
    console.log('Content script injected successfully');
    // Wait a bit then check connection again
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
        if (response && response.status === 'OK') {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('disconnected');
        }
      });
    }, 500);
  }).catch((error) => {
    console.error('Failed to inject content script:', error);
    setConnectionStatus('disconnected');
  });
}

// Set connection status
function setConnectionStatus(status) {
  const badge = elements.connectionStatus;
  const statusText = badge.querySelector('.status-text');

  badge.className = 'status-badge';
  state.isConnected = false;

  switch (status) {
    case 'connected':
      badge.classList.add('connected');
      statusText.textContent = 'เชื่อมต่อแล้ว ✓';
      state.isConnected = true;
      elements.btnGenerate.disabled = false;
      break;
    case 'disconnected':
      statusText.textContent = 'รอเชื่อมต่อ...';
      elements.btnGenerate.disabled = true;
      break;
    case 'not-flow':
      badge.classList.add('error');
      statusText.textContent = 'ไม่ใช่หน้า Flow';
      elements.btnGenerate.disabled = true;
      break;
    case 'error':
      badge.classList.add('error');
      statusText.textContent = 'เกิดข้อผิดพลาด';
      elements.btnGenerate.disabled = true;
      break;
  }
}

// Setup event listeners
function setupEventListeners() {
  // Update prompt count and save state on input
  elements.promptsInput.addEventListener('input', () => {
    updatePromptCount();
    saveState();
  });

  // Save state when delay or repeat changes
  elements.delayInput.addEventListener('input', saveState);
  elements.repeatInput.addEventListener('input', () => {
    updatePromptCount();
    saveState();
  });

  // Generate button
  elements.btnGenerate.addEventListener('click', handleGenerate);

  // Stop button
  elements.btnStop.addEventListener('click', handleStop);

  // Load file button
  elements.btnLoadFile.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', handleFileLoad);

  // Clear prompts button
  elements.btnClearPrompts.addEventListener('click', handleClearPrompts);

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(handleMessage);

  // Retry connection every 2 seconds if not connected
  setInterval(() => {
    if (!state.isConnected && !state.isProcessing) {
      checkConnection();
    }
  }, 2000);
}

// Update prompt count display
function updatePromptCount() {
  if (!elements.promptsInput || !elements.repeatInput || !elements.promptCount) return;

  const text = elements.promptsInput.value.trim();
  const prompts = text ? text.split('\n').filter(p => p.trim()) : [];
  const repeat = parseInt(elements.repeatInput.value) || 1;
  const total = prompts.length * repeat;
  elements.promptCount.textContent = `${prompts.length} prompts × ${repeat} = ${total} งาน`;
}

// Handle generate button click
async function handleGenerate() {
  if (!state.isConnected) {
    showToast('กรุณาเปิดหน้า Google Flow ก่อน', 'warning');
    return;
  }

  const text = elements.promptsInput.value.trim();
  if (!text) {
    showToast('กรุณาใส่ prompt', 'warning');
    return;
  }

  const basePrompts = text.split('\n').filter(p => p.trim());
  const repeat = parseInt(elements.repeatInput.value) || 1;
  const delay = (parseInt(elements.delayInput.value) || 5) * 1000;

  // Create full prompt list with repeats
  const prompts = [];
  for (let r = 0; r < repeat; r++) {
    for (const prompt of basePrompts) {
      prompts.push(prompt.trim());
    }
  }

  console.log(`Starting generation: ${prompts.length} prompts`);

  // Update UI
  state.isProcessing = true;
  state.generated = 0;
  elements.btnGenerate.disabled = true;
  elements.btnStop.disabled = false;
  elements.progressSection.style.display = 'block';
  updateProgress(0, prompts.length);

  // Send to content script
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, {
      type: 'GENERATE',
      prompts: prompts,
      settings: { delay }
    });
    showToast(`เริ่มสร้าง ${prompts.length} ภาพ`, 'success');
  } catch (error) {
    console.error('Error starting generation:', error);
    showToast('เกิดข้อผิดพลาด', 'error');
    resetUI();
  }
}

// Handle stop button click
async function handleStop() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'STOP' });
    showToast('หยุดการสร้างแล้ว', 'warning');
    resetUI();
  } catch (error) {
    console.error('Error stopping:', error);
  }
}

// Handle messages from content/background
function handleMessage(message, sender, sendResponse) {
  console.log('Popup received:', message.type);

  switch (message.type) {
    case 'PROGRESS':
      state.generated = message.current;
      updateProgress(message.current, message.total);
      elements.statGenerated.textContent = message.current;
      break;

    case 'DOWNLOAD_COMPLETE':
      state.downloaded++;
      elements.statDownloaded.textContent = state.downloaded;
      break;

    case 'GENERATION_COMPLETE':
      showToast('สร้างภาพเสร็จทั้งหมดแล้ว! 🎉', 'success');
      resetUI();
      break;

    case 'ERROR':
      showToast(message.error || 'เกิดข้อผิดพลาด', 'error');
      break;
  }
}

// Update progress bar
function updateProgress(current, total) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  elements.progressText.textContent = `กำลังสร้าง ${current}/${total}`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;
}

// Reset UI after completion
function resetUI() {
  state.isProcessing = false;
  elements.btnGenerate.disabled = !state.isConnected;
  elements.btnStop.disabled = true;
  elements.progressSection.style.display = 'none';
}

// Show toast notification
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// Handle file load
function handleFileLoad(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')); // Ignore empty lines and comments

    if (lines.length > 0) {
      // Append to existing prompts or replace
      const existingPrompts = elements.promptsInput.value.trim();
      if (existingPrompts) {
        elements.promptsInput.value = existingPrompts + '\n' + lines.join('\n');
      } else {
        elements.promptsInput.value = lines.join('\n');
      }

      updatePromptCount();
      saveState();
      showToast(`โหลด ${lines.length} prompts จากไฟล์`, 'success');
    } else {
      showToast('ไฟล์ว่างเปล่า', 'warning');
    }
  };

  reader.onerror = () => {
    showToast('ไม่สามารถอ่านไฟล์ได้', 'error');
  };

  reader.readAsText(file);

  // Reset file input so same file can be selected again
  event.target.value = '';
}

// Handle clear prompts
function handleClearPrompts() {
  elements.promptsInput.value = '';
  updatePromptCount();
  saveState();
  showToast('ล้าง prompts แล้ว', 'info');
}

// Save state to chrome.storage.local
function saveState() {
  const data = {
    prompts: elements.promptsInput.value,
    delay: parseInt(elements.delayInput.value) || DEFAULT_SETTINGS.delay,
    repeat: parseInt(elements.repeatInput.value) || DEFAULT_SETTINGS.repeat,
    generated: state.generated,
    downloaded: state.downloaded
  };

  chrome.storage.local.set({ flowAutoState: data }, () => {
    console.log('State saved:', data);
  });
}

// Load saved state from chrome.storage.local
async function loadSavedState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['flowAutoState'], (result) => {
      if (result.flowAutoState) {
        const data = result.flowAutoState;
        console.log('Loaded state:', data);

        // Restore prompts
        if (data.prompts) {
          elements.promptsInput.value = data.prompts;
        }

        // Restore delay (with default fallback)
        elements.delayInput.value = data.delay || DEFAULT_SETTINGS.delay;

        // Restore repeat (with default fallback)
        elements.repeatInput.value = data.repeat || DEFAULT_SETTINGS.repeat;

        // Restore stats
        if (data.generated !== undefined) {
          state.generated = data.generated;
          elements.statGenerated.textContent = data.generated;
        }
        if (data.downloaded !== undefined) {
          state.downloaded = data.downloaded;
          elements.statDownloaded.textContent = data.downloaded;
        }

        updatePromptCount();
      } else {
        // Set default values if no saved state
        elements.delayInput.value = DEFAULT_SETTINGS.delay;
        elements.repeatInput.value = DEFAULT_SETTINGS.repeat;
      }
      resolve();
    });
  });
}
