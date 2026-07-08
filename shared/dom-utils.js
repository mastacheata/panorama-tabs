/**
 * Shared DOM utilities for Tab Collections Manager
 */

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
    logger.warn('[CONTAINER] Failed to query contextual identities:', err);
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
