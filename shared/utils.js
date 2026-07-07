/**
 * Shared utilities for Tab Collections Manager
 * Included by both extension/extension.html and popup/popup.html
 */

// ============================================================================
// Constants
// ============================================================================

const TAB_GROUP_COLORS = {
  grey: '#7a7a7a',
  blue: '#007aff',
  red: '#ff3b30',
  yellow: '#ffcc00',
  green: '#34c759',
  pink: '#ff2d55',
  purple: '#af52de',
  cyan: '#5ac8fa',
  orange: '#ff9500'
};

const CONTAINER_COLORS = {
  blue: '#37adff',
  turquoise: '#00c7fc',
  green: '#51cd00',
  yellow: '#ffcb00',
  orange: '#ff9f00',
  red: '#ff613d',
  pink: '#ff4bda',
  purple: '#af70ff',
  toolbar: '#7c7c7d'
};

// ============================================================================
// Tab Display Helpers
// ============================================================================

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

// ============================================================================
// HTML Helpers
// ============================================================================

/**
 * Escape a string so it is safe to embed in HTML.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Collection Sorting
// ============================================================================

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

// ============================================================================
// Status Messages
// ============================================================================

/**
 * Show a transient status bar message that auto-hides after 4 seconds.
 * @param {HTMLElement} statusEl  — the #statusMessage element
 * @param {string} message
 * @param {boolean} [isError=false]
 */
function showStatusMessage(statusEl, message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = `status-message${isError ? ' error' : ''}`;
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 4000);
}

// ============================================================================
// Debounced Tab/Group Change Handler
// ============================================================================

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

// ============================================================================
// Container Border Painting
// ============================================================================

/**
 * Query all contextual identities and return a cookieStoreId → identity map.
 * Returns an empty object if the API is unavailable.
 * @returns {Promise<Record<string, browser.contextualIdentities.ContextualIdentity>>}
 */
async function queryIdentityMap() {
  try {
    const identities = await browser.contextualIdentities.query({});
    const map = {};
    identities.forEach(id => { map[id.cookieStoreId] = id; });
    return map;
  } catch (err) {
    console.warn('[CONTAINER] Failed to query contextual identities:', err);
    return {};
  }
}

/**
 * Resolve the container info (name + colour) for a single tab.
 * Returns null if the tab is not in a named container.
 * @param {{ cookieStoreId?: string }} cookieStoreId
 * @param {Record<string, browser.contextualIdentities.ContextualIdentity>} identityMap
 * @returns {{ cookieStoreId: string, name: string, color: string } | null}
 */
function resolveContainerInfo(cookieStoreId, identityMap) {
  if (!cookieStoreId || cookieStoreId === 'firefox-default' || cookieStoreId === 'firefox-private') {
    return null;
  }
  const identity = identityMap[cookieStoreId];
  if (!identity) return null;
  return {
    cookieStoreId,
    name: identity.name,
    color: identity.colorCode || CONTAINER_COLORS[identity.color] || '#7c7c7d'
  };
}

/**
 * Apply Multi-Account Container border styling to a list of `.tab-item` DOM elements.
 *
 * @param {HTMLElement[]} tabEls       — ordered list of .tab-item elements
 * @param {Array<{cookieStoreId?: string, id?: number}>} tabs — saved tab objects in the same order
 * @param {Record<number, browser.tabs.Tab>} openTabsById
 * @param {Record<string, browser.contextualIdentities.ContextualIdentity>} identityMap
 * @param {Record<number, browser.tabGroups.TabGroup>} groupMap
 */
function applyContainerBordersToDOMElements(tabEls, tabs, openTabsById, identityMap, groupMap) {
  // Precompute container info for each tab
  const containerInfos = tabs.map(savedTab => {
    const currentTab = openTabsById[savedTab.id];
    const cookieStoreId = currentTab ? currentTab.cookieStoreId : savedTab.cookieStoreId;
    return resolveContainerInfo(cookieStoreId, identityMap);
  });

  for (let i = 0; i < Math.min(tabs.length, tabEls.length); i++) {
    const tabEl = tabEls[i];
    const savedTab = tabs[i];
    const currentTab = openTabsById[savedTab.id];
    const containerInfo = containerInfos[i];
    const prevInfo = i > 0 ? containerInfos[i - 1] : null;
    const nextInfo = i < tabs.length - 1 ? containerInfos[i + 1] : null;

    const prevTabOpen = i > 0 ? openTabsById[tabs[i - 1].id] : null;
    const nextTabOpen = i < tabs.length - 1 ? openTabsById[tabs[i + 1].id] : null;

    const currentGroupId = currentTab ? currentTab.groupId : null;
    const prevGroupId = prevTabOpen ? prevTabOpen.groupId : null;
    const nextGroupId = nextTabOpen ? nextTabOpen.groupId : null;

    const isPrevSameGroup = currentGroupId === prevGroupId;
    const isNextSameGroup = currentGroupId === nextGroupId;

    const isPrevSame = !!(prevInfo && containerInfo &&
      prevInfo.cookieStoreId === containerInfo.cookieStoreId && isPrevSameGroup);
    const isNextSame = !!(nextInfo && containerInfo &&
      nextInfo.cookieStoreId === containerInfo.cookieStoreId && isNextSameGroup);

    // Reset all inline border styles
    tabEl.style.border = '';
    tabEl.style.borderTop = '';
    tabEl.style.borderBottom = '';
    tabEl.style.borderLeft = '';
    tabEl.style.borderRight = '';
    tabEl.style.borderRadius = '';
    tabEl.style.marginTop = '';
    tabEl.style.outline = '';
    tabEl.style.outlineOffset = '';

    if (containerInfo) {
      const color = containerInfo.color;
      tabEl.style.borderLeft = `2px solid ${color}`;
      tabEl.style.borderRight = `2px solid ${color}`;
      tabEl.style.borderTop = isPrevSame ? 'none' : `2px solid ${color}`;
      tabEl.style.borderBottom = isNextSame ? 'none' : `2px solid ${color}`;

      if (isPrevSame && isNextSame) {
        tabEl.style.borderRadius = '0';
      } else if (isPrevSame) {
        tabEl.style.borderRadius = '0 0 6px 6px';
      } else if (isNextSame) {
        tabEl.style.borderRadius = '6px 6px 0 0';
      } else {
        tabEl.style.borderRadius = '6px';
      }

      if (isPrevSame) {
        tabEl.style.marginTop = '-8px';
      }

      // Container name label overlay
      let titleEl = tabEl.querySelector('.container-border-title');
      if (!isPrevSame) {
        if (!titleEl) {
          titleEl = document.createElement('span');
          titleEl.className = 'container-border-title';
          tabEl.appendChild(titleEl);
        }
        titleEl.textContent = containerInfo.name;
        titleEl.style.color = color;
        titleEl.style.display = '';
      } else if (titleEl) {
        titleEl.style.display = 'none';
      }
    } else {
      const titleEl = tabEl.querySelector('.container-border-title');
      if (titleEl) titleEl.style.display = 'none';
    }
  }
}
