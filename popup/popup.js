/**
 * Popup UI Logic for Tab Collections Manager
 */

// ============================================================================
// DOM Elements
// ============================================================================

const createBtn = document.getElementById('createBtn');
const collectionsContainer = document.getElementById('collectionsContainer');
const emptyState = document.getElementById('emptyState');
const loadingMessage = document.getElementById('loadingMessage');
const statusMessage = document.getElementById('statusMessage');

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


// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup loaded');
  await loadCollections();
  setupEventListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
  createBtn.addEventListener('click', handleCreateCollection);

  if (typeof browser !== 'undefined') {
    if (browser.tabs) {
      browser.tabs.onUpdated.addListener(handleBrowserTabOrGroupChange);
      browser.tabs.onCreated.addListener(handleBrowserTabOrGroupChange);
      browser.tabs.onRemoved.addListener(handleBrowserTabOrGroupChange);
      browser.tabs.onMoved.addListener(handleBrowserTabOrGroupChange);
      browser.tabs.onAttached.addListener(handleBrowserTabOrGroupChange);
      browser.tabs.onDetached.addListener(handleBrowserTabOrGroupChange);
    }
    if (browser.tabGroups) {
      browser.tabGroups.onCreated.addListener(handleBrowserTabOrGroupChange);
      browser.tabGroups.onUpdated.addListener(handleBrowserTabOrGroupChange);
      browser.tabGroups.onRemoved.addListener(handleBrowserTabOrGroupChange);
    }
  }
}

let tabChangeDebounceTimeout = null;
function handleBrowserTabOrGroupChange() {
  if (tabChangeDebounceTimeout) {
    clearTimeout(tabChangeDebounceTimeout);
  }
  tabChangeDebounceTimeout = setTimeout(() => {
    loadCollections();
  }, 200);
}

// Listen for updates from background script
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'collectionsUpdated') {
    console.log('[POPUP] Sync change detected, reloading collections...');
    loadCollections();
  }
});

/**
 * Get display title for tab, using domain name as fallback if missing
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
 * Get favicon URL for tab, resolving via Google Favicon service if missing
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
// Collection Management
// ============================================================================

/**
 * Load and display all collections
 */
async function loadCollections() {
  try {
    loadingMessage.style.display = 'block';
    collectionsContainer.innerHTML = '';
    
    // Request collections from background
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    
    const collections = response.collections || {};
    const activeState = response.activeState;
    const collectionIds = Object.keys(collections);
    
    collectionIds.sort((a, b) => {
      const posA = collections[a].position !== undefined ? collections[a].position : (collections[a].created || 0);
      const posB = collections[b].position !== undefined ? collections[b].position : (collections[b].created || 0);
      return posA - posB;
    });
    
    loadingMessage.style.display = 'none';
    
    // Render each collection
    let visibleCount = 0;
    for (const collectionId of collectionIds) {
      const collection = collections[collectionId];
      if (collection.hidden) {
        continue;
      }
      visibleCount++;
      const isActive = activeState && activeState.type === 'collection' && activeState.id === collectionId;
      await renderCollection(collection, isActive);
    }
    
    if (visibleCount === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
    
  } catch (error) {
    console.error('Error loading collections:', error);
    loadingMessage.textContent = 'Error loading collections';
    loadingMessage.style.display = 'block';
  }
}

/**
 * Render a single collection
 */
async function renderCollection(collection, isActive) {
  const collectionEl = document.createElement('div');
  collectionEl.className = `collection-item ${isActive ? 'active' : ''}`;
  collectionEl.dataset.collectionId = collection.id;
  
  // Filter out this extension's tabs from display
  const extensionBaseUrl = browser.runtime.getURL('');
  const displayTabs = collection.tabs
    .filter(tab => !(tab.url && tab.url.startsWith(extensionBaseUrl)));
  const tabCount = displayTabs.length;
  
  // Resolve open tabs and groups in current window
  const openTabs = await browser.tabs.query({ currentWindow: true });
  const openTabsById = {};
  openTabs.forEach(tab => {
    openTabsById[tab.id] = tab;
  });

  // Query all contextual identities to get container colors
  const identityMap = {};
  try {
    const identities = await browser.contextualIdentities.query({});
    identities.forEach(identity => {
      identityMap[identity.cookieStoreId] = identity;
    });
  } catch (err) {
    console.warn('[CONTAINER] Failed to query contextual identities in popup:', err);
  }

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



  let tabGroups = [];
  try {
    tabGroups = await browser.tabGroups.query({});
  } catch (e) {
    console.warn('Failed to query tab groups:', e);
  }
  const groupMap = {};
  tabGroups.forEach(g => {
    groupMap[g.id] = g;
  });

  // Group tabs contiguous by groupId
  const groupedItems = [];
  let currentGroupItem = null;

  for (const tab of displayTabs) {
    const currentTab = openTabsById[tab.id];
    const groupId = currentTab ? currentTab.groupId : null;
    const group = (groupId && groupId !== browser.tabGroups.TAB_GROUP_ID_NONE) ? groupMap[groupId] : null;

    if (group) {
      if (currentGroupItem && currentGroupItem.type === 'group' && currentGroupItem.groupId === groupId) {
        currentGroupItem.tabs.push(tab);
      } else {
        currentGroupItem = {
          type: 'group',
          groupId: groupId,
          group: group,
          tabs: [tab]
        };
        groupedItems.push(currentGroupItem);
      }
    } else {
      currentGroupItem = null;
      groupedItems.push({
        type: 'tab',
        tab: tab
      });
    }
  }

  // Filter out tabs in collapsed groups
  const renderedTabs = [];
  groupedItems.forEach(item => {
    if (item.type === 'group') {
      if (!item.group.collapsed) {
        renderedTabs.push(...item.tabs);
      }
    } else {
      renderedTabs.push(item.tab);
    }
  });

  // Precompute container information for renderedTabs
  const tabContainerInfos = [];
  for (let i = 0; i < renderedTabs.length; i++) {
    const savedTab = renderedTabs[i];
    const currentTab = openTabsById[savedTab.id];
    const cookieStoreId = currentTab ? currentTab.cookieStoreId : savedTab.cookieStoreId;
    
    let info = null;
    if (cookieStoreId && cookieStoreId !== 'firefox-default' && cookieStoreId !== 'firefox-private') {
      const identity = identityMap[cookieStoreId];
      if (identity) {
        info = {
          cookieStoreId: cookieStoreId,
          name: identity.name,
          color: identity.colorCode || CONTAINER_COLORS[identity.color] || '#7c7c7d'
        };
      }
    }
    tabContainerInfos.push(info);
  }

  // Generate HTML for grouped items
  const tabsHTML = groupedItems
    .map(item => {
      if (item.type === 'group') {
        const group = item.group;
        const groupColor = TAB_GROUP_COLORS[group.color] || group.color || '#999';
        const isCollapsed = group.collapsed;
        
        let groupTabsHTML = '';
        if (!isCollapsed) {
          groupTabsHTML = item.tabs
            .map(tab => {
              const favIcon = getTabFavIcon(tab);
              const title = getTabTitle(tab);
              return `
                <div class="tab-item" data-tab-id="${tab.id}">
                  <div class="tab-icon">
                    ${favIcon ? `<img src="${escapeHtml(favIcon)}" alt="">` : ''}
                  </div>
                  <div class="tab-info">
                    <div class="tab-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                    <div class="tab-url" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</div>
                  </div>
                </div>
              `;
            })
            .join('');
        }
        
        return `
          <div class="tab-group-container" data-group-id="${group.id}" style="border-left: 3px solid ${groupColor};">
            <div class="tab-group-header" data-action="toggle-group-collapse" data-group-id="${group.id}" title="${isCollapsed ? 'Expand' : 'Collapse'} tab group">
              <span class="tab-group-dot" style="background-color: ${groupColor};"></span>
              <span class="tab-group-title">${escapeHtml(group.title || 'Group')}</span>
              <span class="tab-group-collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
            </div>
            ${!isCollapsed ? `<div class="tab-group-tabs">${groupTabsHTML}</div>` : ''}
          </div>
        `;
      } else {
        const tab = item.tab;
        const favIcon = getTabFavIcon(tab);
        const title = getTabTitle(tab);
        return `
          <div class="tab-item" data-tab-id="${tab.id}">
            <div class="tab-icon">
              ${favIcon ? `<img src="${escapeHtml(favIcon)}" alt="">` : ''}
            </div>
            <div class="tab-info">
              <div class="tab-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
              <div class="tab-url" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</div>
            </div>
          </div>
        `;
      }
    })
    .join('');
  
  collectionEl.innerHTML = `
    <div class="collection-header">
      <div class="collection-name">${escapeHtml(collection.name)}</div>
      <span class="collection-badge">${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'}</span>
      <div class="collection-controls">
        <button class="btn btn-small btn-activate ${isActive ? 'active' : ''}" data-action="activate">
          ${isActive ? '✓ Active' : 'Activate'}
        </button>
      </div>
    </div>
    <div class="collection-tabs">
      ${tabsHTML}
    </div>
  `;
  
  // Add event listeners
  const activateBtn = collectionEl.querySelector('[data-action="activate"]');
  activateBtn.addEventListener('click', () => handleActivateCollection(collection.id));

  // Bind group collapse/expand toggle
  const groupHeaders = collectionEl.querySelectorAll('[data-action="toggle-group-collapse"]');
  groupHeaders.forEach(header => {
    header.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupId = parseInt(header.dataset.groupId, 10);
      try {
        const group = await browser.tabGroups.get(groupId);
        if (group) {
          await browser.tabGroups.update(groupId, { collapsed: !group.collapsed });
          await loadCollections();
        }
      } catch (err) {
        console.error('[TABGROUP] Failed to toggle collapse in popup:', err);
      }
    });
  });

  // Apply borders and group underlines to tab items
  const tabEls = collectionEl.querySelectorAll('.tab-item');
  for (let i = 0; i < Math.min(renderedTabs.length, tabEls.length); i++) {
    const savedTab = renderedTabs[i];
    const tabEl = tabEls[i];
    const currentTab = openTabsById[savedTab.id];
    
    const containerInfo = tabContainerInfos[i];
    const prevInfo = i > 0 ? tabContainerInfos[i - 1] : null;
    const nextInfo = i < renderedTabs.length - 1 ? tabContainerInfos[i + 1] : null;
    
    const prevTab = i > 0 ? renderedTabs[i - 1] : null;
    const nextTab = i < renderedTabs.length - 1 ? renderedTabs[i + 1] : null;
    
    const prevTabOpen = prevTab ? openTabsById[prevTab.id] : null;
    const nextTabOpen = nextTab ? openTabsById[nextTab.id] : null;

    const currentTabGroupId = currentTab ? currentTab.groupId : null;
    const prevTabGroupId = prevTabOpen ? prevTabOpen.groupId : null;
    const nextTabGroupId = nextTabOpen ? nextTabOpen.groupId : null;
    
    const isPrevSameGroup = currentTabGroupId === prevTabGroupId;
    const isNextSameGroup = currentTabGroupId === nextTabGroupId;

    const isPrevSame = prevInfo && containerInfo && prevInfo.cookieStoreId === containerInfo.cookieStoreId && isPrevSameGroup;
    const isNextSame = nextInfo && containerInfo && nextInfo.cookieStoreId === containerInfo.cookieStoreId && isNextSameGroup;
    
    let containerColor = containerInfo ? containerInfo.color : null;
    let groupColor = null;
    
    // Determine tab group color
    if (currentTab && currentTab.groupId && currentTab.groupId !== browser.tabGroups.TAB_GROUP_ID_NONE) {
      try {
        const group = groupMap[currentTab.groupId];
        if (group) {
          groupColor = TAB_GROUP_COLORS[group.color] || group.color || '#999';
        }
      } catch (error) {
        console.warn(`[TABGROUP] Could not get tabGroup for tab ${savedTab.id}:`, error);
      }
    }
    
    // Reset styling first
    tabEl.style.border = '';
    tabEl.style.borderTop = '';
    tabEl.style.borderBottom = '';
    tabEl.style.borderLeft = '';
    tabEl.style.borderRight = '';
    tabEl.style.borderRadius = '';
    tabEl.style.marginTop = '';
    
    // Apply container border styles
    if (containerColor) {
      tabEl.style.borderLeft = `2px solid ${containerColor}`;
      tabEl.style.borderRight = `2px solid ${containerColor}`;
      tabEl.style.borderTop = isPrevSame ? 'none' : `2px solid ${containerColor}`;
      tabEl.style.borderBottom = isNextSame ? 'none' : `2px solid ${containerColor}`;
      
      if (isPrevSame && isNextSame) {
        tabEl.style.borderRadius = '0';
      } else if (isPrevSame) {
        tabEl.style.borderRadius = '0 0 4px 4px';
      } else if (isNextSame) {
        tabEl.style.borderRadius = '4px 4px 0 0';
      } else {
        tabEl.style.borderRadius = '4px';
      }
      
      if (isPrevSame) {
        tabEl.style.marginTop = '-6px';
      }
    }
    
    // Container border-title overlay
    let titleEl = tabEl.querySelector('.container-border-title');
    if (containerColor && !isPrevSame) {
      if (!titleEl) {
        titleEl = document.createElement('span');
        titleEl.className = 'container-border-title';
        tabEl.appendChild(titleEl);
      }
      titleEl.textContent = containerInfo.name;
      titleEl.style.color = containerColor;
      titleEl.style.display = '';
    } else {
      if (titleEl) {
        titleEl.style.display = 'none';
      }
    }
  }
  
  collectionsContainer.appendChild(collectionEl);
}

/**
 * Create a new collection from current tabs
 */
async function handleCreateCollection() {
  try {
    createBtn.disabled = true;
    showStatus('Creating collection...', false);
    
    const response = await browser.runtime.sendMessage({
      type: 'createCollection'
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    showStatus(`Created: ${response.collection.name}`, false);
    await loadCollections();
    
  } catch (error) {
    console.error('Error creating collection:', error);
    showStatus('Error creating collection: ' + error.message, true);
  } finally {
    createBtn.disabled = false;
  }
}

/**
 * Activate a collection
 */
async function handleActivateCollection(collectionId) {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'activateCollection',
      collectionId: collectionId
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    showStatus(`Activated: ${response.collection.name}`, false);
    await loadCollections();
    
  } catch (error) {
    console.error('Error activating collection:', error);
    showStatus('Error activating collection: ' + error.message, true);
  }
}

// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Show status message
 */
function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${isError ? 'error' : ''}`;
  statusMessage.style.display = 'block';
  
  // Auto-hide after 4 seconds
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 4000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
