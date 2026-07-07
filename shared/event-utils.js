/**
 * Shared event & sorting helpers for Tab Collections Manager
 */

/**
 * Comparator for sorting collection IDs by their position / creation time.
 * @param {Record<string, {position?: number, created?: number}>} collections
 * @returns {(a: string, b: string) => number}
 */
function makeCollectionSortComparator(collections) {
  return (a, b) => {
    const posA = collections[a].position !== undefined ? collections[a].position : (collections[a].created || 0);
    const posB = collections[b].position !== undefined ? collections[b].position : (collections[b].created || 0);
    return posA - posB;
  };
}

/**
 * Build a debounced handler that calls `callback` after `wait` ms.
 * Used to rate-limit browser tab/group event listeners.
 * @param {() => void} callback
 * @param {number} [wait=200]
 * @returns {() => void}
 */
function makeDebouncedTabChangeHandler(callback, wait = 200) {
  let timeout = null;
  return function handleBrowserTabOrGroupChange() {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(callback, wait);
  };
}

/**
 * Register the debounced handler against all relevant browser tab and group events.
 * @param {() => void} handler
 */
function registerTabAndGroupListeners(handler) {
  if (typeof browser === 'undefined') return;
  if (browser.tabs) {
    browser.tabs.onUpdated.addListener(handler);
    browser.tabs.onCreated.addListener(handler);
    browser.tabs.onRemoved.addListener(handler);
    browser.tabs.onMoved.addListener(handler);
    browser.tabs.onAttached.addListener(handler);
    browser.tabs.onDetached.addListener(handler);
  }
  if (browser.tabGroups) {
    browser.tabGroups.onCreated.addListener(handler);
    browser.tabGroups.onUpdated.addListener(handler);
    browser.tabGroups.onRemoved.addListener(handler);
  }
}
