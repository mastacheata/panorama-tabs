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
  return '';
}
