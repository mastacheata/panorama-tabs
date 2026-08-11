/**
 * Shared tab display helpers for Tab Collections Manager
 */

/**
 * Get display title for a tab, falling back to its hostname or 'New Tab'.
 * @param {{ title?: string, url?: string }} tab
 * @returns {string}
 */
function getTabTitle(tab) {
  if (tab.title && tab.title !== 'New Tab') return tab.title;
  try {
    const hostname = new URL(tab.url).hostname;
    return hostname.replace('www.', '') || 'New Tab';
  } catch (e) {
    return tab.title || 'New Tab';
  }
}

/**
 * Get favicon URL for a tab, falling back to the Google Favicon service.
 * @param {{ favIconUrl?: string, url?: string }} tab
 * @returns {string}
 */
function getTabFavIcon(tab) {
  if (tab.favIconUrl) return tab.favIconUrl;
  try {
    const hostname = new URL(tab.url).hostname;
    if (hostname) {
      return `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
    }
  } catch (e) {}
}

/**
 * Check if a URL is restricted by browser security policy (e.g. privileged about: or chrome: URLs).
 * WebExtensions cannot create or navigate tabs directly to these URLs.
 * @param {string} url
 * @returns {boolean}
 */
function isRestrictedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lowerUrl = url.trim().toLowerCase();
  return lowerUrl.startsWith('about:') || lowerUrl.startsWith('chrome:');
}

/**
 * Returns the extension fallback warning page URL for a restricted URL.
 * @param {string} url
 * @returns {string}
 */
function getRestrictedFallbackUrl(url) {
  const extensionBaseUrl = typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL ? browser.runtime.getURL('') : '';
  const fallbackPath = 'extension/restricted-url.html?url=' + encodeURIComponent(url || '');
  return extensionBaseUrl ? extensionBaseUrl + fallbackPath : fallbackPath;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getTabTitle,
    getTabFavIcon,
    isRestrictedUrl,
    getRestrictedFallbackUrl
  };
}



