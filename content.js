// ===== Flow Auto Generator V2 - Content Script =====

(function () {
  'use strict';

  console.log('🎨 Flow Auto Generator V2 - Content Script Loaded');
  console.log('📍 Current URL:', window.location.href);

  // State
  let isProcessing = false;
  let processedUrls = new Set();
  let observer = null;
  let downloadQueue = [];

  // Check if extension context is still valid
  function isExtensionValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Check if extension is still valid
    if (!isExtensionValid()) {
      console.log('⚠️ Extension context invalidated, reloading page may be required');
      return;
    }

    console.log('📨 Content received:', message.type);

    switch (message.type) {
      case 'PING':
        sendResponse({ status: 'OK', url: window.location.href });
        break;

      case 'GENERATE':
        handleGenerate(message.prompts, message.settings);
        sendResponse({ status: 'OK' });
        break;

      case 'STOP':
        isProcessing = false;
        sendResponse({ status: 'OK' });
        break;
    }
    return true;
  });

  // Find prompt input - the textarea at bottom
  function findPromptInput() {
    // Direct selector for Flow's prompt textarea
    const promptTextarea = document.querySelector('textarea#PINHOLE_TEXT_AREA_ELEMENT_ID');
    if (promptTextarea) {
      console.log('✓ Found prompt input by ID');
      return promptTextarea;
    }

    // Fallback: any visible textarea
    const allTextareas = document.querySelectorAll('textarea');
    for (const ta of allTextareas) {
      if (ta.offsetParent !== null && !ta.disabled) {
        console.log('✓ Found prompt input (fallback)');
        return ta;
      }
    }

    return null;
  }

  // Find the generate/submit button (the arrow button →)
  function findGenerateButton() {
    // Try multiple class combinations found in Flow
    const classSelectors = [
      'button.gdArnN.gdXWm',      // Found in browser test
      'button.kmBnUa.gqBwOs',     // Alternative
      'button[class*="gdArnN"]',
      'button[class*="kmBnUa"]'
    ];

    for (const selector of classSelectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null && !btn.disabled) {
        console.log('✓ Found generate button by class:', selector);
        return btn;
      }
    }

    // Try finding button containing arrow_forward text (icon text)
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      if (btn.offsetParent === null || btn.disabled) continue;

      const text = btn.textContent;
      // Look for arrow_forward icon text or Create text
      if (text.includes('arrow_forward') || text.includes('Create')) {
        // Make sure it's in the prompt area (bottom of page)
        const rect = btn.getBoundingClientRect();
        if (rect.bottom > window.innerHeight * 0.5) {
          console.log('✓ Found generate button by text:', text.substring(0, 30));
          return btn;
        }
      }
    }

    // Fallback: circular button near textarea
    const promptArea = document.querySelector('textarea#PINHOLE_TEXT_AREA_ELEMENT_ID');
    if (promptArea) {
      // Get parent container and look for button with svg or arrow
      let parent = promptArea.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const buttons = parent.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.offsetParent !== null && !btn.disabled) {
            // Check if it looks like a submit button (has svg or is right of textarea)
            const hasIcon = btn.querySelector('svg, i, span[class*="icon"]');
            if (hasIcon) {
              console.log('✓ Found generate button near prompt (icon)');
              return btn;
            }
          }
        }
        parent = parent.parentElement;
      }
    }

    return null;
  }

  // Set number of images to generate (click dropdown and select 4)
  async function setImageCount(count = 4) {
    console.log(`🔢 Setting image count to ${count}`);

    // Find the dropdown trigger - look for elements with numbers or count indicators
    const allButtons = document.querySelectorAll('button, [role="button"], [role="listbox"]');

    for (const el of allButtons) {
      const text = el.textContent.trim();
      // Look for button that shows current count (1, 2, 3, or 4)
      if (/^[1-4]$/.test(text) || text.includes('image') || el.ariaLabel?.includes('count')) {
        console.log('Found count selector:', text);
        el.click();
        await sleep(300);

        // Now look for the dropdown option with "4"
        const options = document.querySelectorAll('[role="option"], [role="menuitem"], li, div');
        for (const opt of options) {
          if (opt.textContent.trim() === String(count)) {
            console.log(`Selecting ${count} images`);
            opt.click();
            await sleep(300);
            return true;
          }
        }
      }
    }

    // Try clicking on visible number elements
    const numberElements = document.querySelectorAll('span, div, button');
    for (const el of numberElements) {
      if (el.textContent.trim() === '1' || el.textContent.trim() === '2') {
        const parent = el.closest('button, [role="button"], [tabindex="0"]');
        if (parent && parent.offsetParent !== null) {
          parent.click();
          await sleep(500);

          // Find and click "4"
          const allElements = document.querySelectorAll('*');
          for (const opt of allElements) {
            if (opt.textContent.trim() === '4' && opt.offsetParent !== null) {
              const rect = opt.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && rect.width < 100) {
                opt.click();
                await sleep(300);
                return true;
              }
            }
          }
        }
      }
    }

    console.log('⚠️ Could not find image count selector');
    return false;
  }

  // Set prompt text
  function setPromptText(element, text) {
    if (!element) return false;

    element.focus();

    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.contentEditable === 'true') {
      element.textContent = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    console.log('📝 Set prompt:', text.substring(0, 50));
    return true;
  }

  // Click button
  function clickButton(button) {
    if (!button) return false;
    button.focus();
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    console.log('🖱️ Clicked button');
    return true;
  }

  // Check if still generating (loading state)
  function isGenerating() {
    // Check for loading indicators
    const loadingIndicators = document.querySelectorAll(
      '[aria-busy="true"], .loading, .spinner, [class*="loading"], [class*="spinner"], progress'
    );
    for (const el of loadingIndicators) {
      if (el.offsetParent !== null) return true;
    }

    // Check for skeleton/placeholder images
    const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="placeholder"]');
    if (skeletons.length > 0) return true;

    return false;
  }

  // Find all downloadable images in gallery
  function findGalleryImages() {
    const images = [];

    // Find image elements in the gallery area
    const imgElements = document.querySelectorAll('img');

    for (const img of imgElements) {
      const src = img.src;
      if (!src) continue;

      // Skip small images (icons, avatars)
      const rect = img.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 100) continue;

      // Skip already processed
      if (processedUrls.has(src)) continue;

      // Check if it's a generated image (blob, data, or Google storage)
      if (isGeneratedMedia(src)) {
        images.push({
          url: src,
          element: img,
          type: 'image'
        });
      }
    }

    return images;
  }

  // Check if URL is generated media
  function isGeneratedMedia(url) {
    if (!url) return false;

    // Skip data URLs that are too small (icons)
    if (url.startsWith('data:') && url.length < 5000) return false;

    // Skip known UI patterns
    const skipPatterns = ['icon', 'logo', 'avatar', 'favicon', 'sprite', 'placeholder', 'profile'];
    const lowerUrl = url.toLowerCase();
    for (const pattern of skipPatterns) {
      if (lowerUrl.includes(pattern)) return false;
    }

    // Accept these sources
    if (url.startsWith('blob:')) return true;
    if (url.includes('googleusercontent.com')) return true;
    if (url.includes('storage.googleapis.com')) return true;
    if (url.includes('lh3.google')) return true;
    if (url.startsWith('data:image') && url.length > 5000) return true;

    return false;
  }

  // Download media using anchor tag (direct to Downloads folder)
  async function downloadMedia(url, type = 'image') {
    if (processedUrls.has(url)) return;
    processedUrls.add(url);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const ext = type === 'video' ? 'mp4' : 'jpg';
    const filename = `flow_${dateStr}_${timeStr}_${String(processedUrls.size).padStart(3, '0')}.${ext}`;

    console.log('📥 Downloading:', filename);

    try {
      // Fetch the image and convert to blob
      console.log('🔄 Fetching image...');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Create anchor and trigger download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 100);

      console.log('✅ Download triggered:', filename);

    } catch (error) {
      console.error('Download error:', error);

      // Fallback: try canvas method
      try {
        console.log('🔄 Trying canvas method...');
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();

          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          }, 100);

          console.log('✅ Canvas download triggered:', filename);
        }, 'image/jpeg', 0.95);

      } catch (canvasError) {
        console.error('Canvas download also failed:', canvasError);
      }
    }
  }

  // Download all images in gallery
  function downloadAllNewImages() {
    const images = findGalleryImages();
    console.log(`📸 Found ${images.length} new images to download`);

    for (const img of images) {
      downloadMedia(img.url, img.type);
    }

    return images.length;
  }

  // Setup media observer for auto-download
  function setupMediaObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check if it's an image
          if (node.tagName === 'IMG') {
            const src = node.src;
            if (isGeneratedMedia(src)) {
              // Wait a bit for high-res version to load
              setTimeout(() => {
                if (node.src && isGeneratedMedia(node.src)) {
                  downloadMedia(node.src, 'image');
                }
              }, 2000);
            }
          }

          // Check child images
          if (node.querySelectorAll) {
            const imgs = node.querySelectorAll('img');
            imgs.forEach(img => {
              if (isGeneratedMedia(img.src)) {
                setTimeout(() => {
                  if (img.src && isGeneratedMedia(img.src)) {
                    downloadMedia(img.src, 'image');
                  }
                }, 2000);
              }
            });
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('👁️ Media observer started');
  }

  // Handle generate request from popup
  async function handleGenerate(prompts, settings) {
    if (isProcessing) {
      console.log('⚠️ Already processing');
      return;
    }

    isProcessing = true;
    console.log(`🚀 Starting generation: ${prompts.length} prompts`);

    // Setup observer for auto-download
    setupMediaObserver();

    for (let i = 0; i < prompts.length && isProcessing; i++) {
      const prompt = prompts[i];
      console.log(`\n📝 Processing ${i + 1}/${prompts.length}: ${prompt.substring(0, 30)}...`);

      try {
        // Find prompt input
        const promptInput = findPromptInput();
        if (!promptInput) {
          console.error('❌ Prompt input not found');
          continue;
        }

        // Set prompt text
        setPromptText(promptInput, prompt);
        await sleep(500);

        // Try to set image count to 4
        await setImageCount(4);
        await sleep(300);

        // Find and click generate button
        const generateBtn = findGenerateButton();
        if (!generateBtn) {
          console.error('❌ Generate button not found');
          continue;
        }

        // Record images before generation
        const beforeImages = new Set(
          Array.from(document.querySelectorAll('img'))
            .map(img => img.src)
            .filter(src => isGeneratedMedia(src))
        );

        // Click generate
        clickButton(generateBtn);
        console.log('⏳ Waiting for generation...');

        // Wait for generation to start
        await sleep(2000);

        // Wait for generation to complete
        await waitForGeneration(120000);

        // Extra wait for images to fully load
        await sleep(3000);

        // Find and download new images
        const currentImages = Array.from(document.querySelectorAll('img'))
          .map(img => img.src)
          .filter(src => isGeneratedMedia(src));

        let downloadCount = 0;
        for (const src of currentImages) {
          if (!beforeImages.has(src) && !processedUrls.has(src)) {
            downloadMedia(src, 'image');
            downloadCount++;
          }
        }

        console.log(`✅ Downloaded ${downloadCount} new images`);

        // Delay before next prompt
        if (i < prompts.length - 1 && isProcessing) {
          const delay = settings?.delay || 5000;
          console.log(`⏳ Waiting ${delay / 1000}s before next...`);
          await sleep(delay);
        }

      } catch (error) {
        console.error('Error processing prompt:', error);
      }
    }

    isProcessing = false;
    console.log('🎉 Generation complete!');

    // Notify popup (only if extension is still valid)
    if (isExtensionValid()) {
      try {
        chrome.runtime.sendMessage({ type: 'GENERATION_COMPLETE' });
      } catch (e) {
        console.log('⚠️ Could not notify popup (extension context may be invalidated)');
      }
    }
  }

  // Wait for generation to complete
  function waitForGeneration(timeout = 120000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const check = () => {
        if (!isProcessing) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          console.log('⏰ Generation timeout');
          resolve();
          return;
        }

        if (!isGenerating()) {
          console.log('✓ Generation finished');
          resolve();
          return;
        }

        setTimeout(check, 1000);
      };

      setTimeout(check, 2000);
    });
  }

  // Sleep utility
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Create download button on hover
  function createHoverDownloadButton() {
    // Create style for download button
    const style = document.createElement('style');
    style.textContent = `
      .flow-download-btn {
        position: absolute;
        bottom: 10px;
        right: 10px;
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.2s ease;
        z-index: 99999;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
      }
      .flow-download-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.7);
      }
      .flow-download-btn svg {
        width: 20px;
        height: 20px;
        fill: white;
      }
      .flow-img-wrapper {
        position: relative;
        display: inline-block;
      }
      .flow-img-wrapper:hover .flow-download-btn {
        opacity: 1;
        transform: scale(1);
      }
    `;
    document.head.appendChild(style);

    // Download arrow SVG
    const downloadArrowSVG = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 16L7 11H10V4H14V11H17L12 16Z"/>
        <path d="M20 18H4V20H20V18Z"/>
      </svg>
    `;

    // Function to wrap image with download button
    function wrapImageWithButton(img) {
      // Skip if already wrapped or not a valid image
      if (img.dataset.flowWrapped || !isGeneratedMedia(img.src)) return;
      if (img.offsetWidth < 100 || img.offsetHeight < 100) return;

      // Mark as wrapped
      img.dataset.flowWrapped = 'true';

      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'flow-img-wrapper';

      // Get parent and insert wrapper
      const parent = img.parentNode;
      if (!parent) return;

      // Get computed style from img
      const imgStyle = window.getComputedStyle(img);
      wrapper.style.width = imgStyle.width;
      wrapper.style.height = imgStyle.height;

      // Insert wrapper
      parent.insertBefore(wrapper, img);
      wrapper.appendChild(img);

      // Create download button
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'flow-download-btn';
      downloadBtn.innerHTML = downloadArrowSVG;
      downloadBtn.title = 'Download Image';

      // Handle click
      downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        downloadMedia(img.src, 'image');

        // Show feedback
        downloadBtn.style.background = '#10b981';
        downloadBtn.innerHTML = `
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        `;
        setTimeout(() => {
          downloadBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
          downloadBtn.innerHTML = downloadArrowSVG;
        }, 1500);
      });

      wrapper.appendChild(downloadBtn);
    }

    // Process all existing images
    function processAllImages() {
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        if (img.complete && img.naturalWidth > 0) {
          wrapImageWithButton(img);
        } else {
          img.addEventListener('load', () => wrapImageWithButton(img), { once: true });
        }
      });
    }

    // Initial process
    setTimeout(processAllImages, 1000);

    // Observe for new images
    const imgObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          if (node.tagName === 'IMG') {
            if (node.complete && node.naturalWidth > 0) {
              wrapImageWithButton(node);
            } else {
              node.addEventListener('load', () => wrapImageWithButton(node), { once: true });
            }
          }

          if (node.querySelectorAll) {
            const imgs = node.querySelectorAll('img');
            imgs.forEach(img => {
              if (img.complete && img.naturalWidth > 0) {
                wrapImageWithButton(img);
              } else {
                img.addEventListener('load', () => wrapImageWithButton(img), { once: true });
              }
            });
          }
        }
      }
    });

    imgObserver.observe(document.body, { childList: true, subtree: true });
    console.log('🔘 Hover download buttons enabled');
  }

  // Create status indicator
  function createStatusIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'flow-auto-status';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 25px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 99999;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    indicator.innerHTML = '🎨 Flow Auto V2 Ready';
    document.body.appendChild(indicator);

    setTimeout(() => {
      indicator.style.opacity = '0';
      indicator.style.transition = 'opacity 0.5s';
      setTimeout(() => indicator.remove(), 500);
    }, 3000);
  }

  // Initialize
  setTimeout(() => {
    createStatusIndicator();
    setupMediaObserver();
    createHoverDownloadButton();
  }, 2000);

})();
