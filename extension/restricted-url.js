document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const targetUrl = urlParams.get('url') || 'about:blank';
  
  const urlElement = document.getElementById('targetUrl');
  const copyBtn = document.getElementById('copyBtn');
  
  if (urlElement) {
    urlElement.textContent = targetUrl;
  }
  
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(targetUrl);
        copyBtn.textContent = '✓ Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy URL to Clipboard';
          copyBtn.classList.remove('copied');
        }, 2500);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    });
  }

  // Listen for storage changes to sync theme if changed in another window/tab
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.themePreference && window.applyTheme) {
        window.applyTheme(changes.themePreference.newValue || 'system');
      }
    });
  }
});

