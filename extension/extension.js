/**
 * Extension Tab UI Logic for Tab Collections Manager
 */

// ============================================================================
// Constants
// ============================================================================

const TAB_PREVIEW_LIMIT = 4;

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
// DOM Elements
// ============================================================================

const createBtn = document.getElementById('createBtn');
const collapseAllBtn = document.getElementById('collapseAllBtn');
const expandAllBtn = document.getElementById('expandAllBtn');
const showHiddenBtn = document.getElementById('showHiddenBtn');
const collectionsContainer = document.getElementById('collectionsContainer');
const loadingMessage = document.getElementById('loadingMessage');
const statusMessage = document.getElementById('statusMessage');

// Store this extension's base URL to filter out only its own tabs
let extensionBaseUrl = '';

// Track whether we are temporarily displaying hidden collections in the current view
let showHiddenTemporarily = false;


// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize extension page when loaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Extension page loaded');
  
  // Get this extension's base URL to identify its own tabs
  extensionBaseUrl = browser.runtime.getURL('');
  console.log('Extension base URL:', extensionBaseUrl);
  
  // Get the extension tab ID to track it
  const extensionTab = await browser.tabs.getCurrent();
  console.log('Extension tab ID:', extensionTab.id);
  
  // Log all currently open tabs
  const allTabs = await browser.tabs.query({ currentWindow: true });
  console.log(`=== Currently open tabs (${allTabs.length} total) ===`);
  allTabs.forEach(tab => {
    console.log(`  [${tab.id}] ${tab.title || '(Untitled)'} - ${tab.url}`);
  });
  
  // Hide all other tabs since extension tab is active
  await hideAllOtherTabs(extensionTab.id);
  
  // Clean up tabs that were closed by the user
  await cleanupClosedTabs();
  
  // Check if we need to initialize default collection
  await initializeIfNeeded();
  
  // Load and display collections
  await loadCollections();
  
  // Setup event listeners
  setupEventListeners();
});

/**
 * Initialize default collection on first use
 */
async function initializeIfNeeded() {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    
    const collections = response.collections || {};
    const collectionCount = Object.keys(collections).length;
    
    // If no collections exist, create default collection with all current tabs
    if (collectionCount === 0) {
      console.log('[INIT] No collections found, creating default collection');
      
      // Get all tabs except the extension tab
      const extensionTab = await browser.tabs.getCurrent();
      const allTabs = await browser.tabs.query({ currentWindow: true });
      const otherTabs = allTabs.filter(tab => tab.id !== extensionTab.id);
      
      console.log(`[INIT] Found ${otherTabs.length} tabs to add to default collection`);
      
      if (otherTabs.length > 0) {
        const response = await browser.runtime.sendMessage({
          type: 'createDefaultCollection',
          tabs: otherTabs
        });
        
        if (!response.error) {
          console.log(`[INIT] Created default collection: ${response.collection.name}`);
          showStatus(`Created default collection: ${response.collection.name}`);
        }
      } else {
        console.log('[INIT] No other tabs found, skipping default collection creation');
      }
    }
  } catch (error) {
    console.error('Error initializing default collection:', error);
  }
}

/**
 * Remove tabs from collections that have been closed by the user
 */
async function cleanupClosedTabs() {
  try {
    // Get all currently open tabs
    const openTabs = await browser.tabs.query({ currentWindow: true });
    const openTabIds = new Set(openTabs.map(tab => tab.id));
    
    console.log(`[CLEANUP] Starting cleanup: ${openTabs.length} tabs currently open`);
    
    // Get all collections
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    
    const collections = response.collections || {};
    let totalRemoved = 0;
    let collectionsModified = 0;
    
    // Check each collection for closed tabs
    for (const collectionId in collections) {
      const collection = collections[collectionId];
      const originalTabCount = collection.tabs.length;
      
      // Filter out tabs that are no longer open, BUT keep tabs with id === null (unopened/synced tabs)
      collection.tabs = collection.tabs.filter(tab => tab.id === null || openTabIds.has(tab.id));
      collection.tabIds = collection.tabs.filter(tab => tab.id !== null).map(tab => tab.id);
      
      const removedCount = originalTabCount - collection.tabs.length;
      if (removedCount > 0) {
        totalRemoved += removedCount;
        collectionsModified++;
        console.log(`[CLEANUP] Collection "${collection.name}": removed ${removedCount} closed tab(s) (${collection.tabs.length} remaining)`);
      }
    }
    
    // Save updated collections if any changes were made
    if (collectionsModified > 0) {
      await browser.runtime.sendMessage({
        type: 'saveCollectionsForCleanup',
        collections: collections
      });
      console.log(`[CLEANUP] Cleanup complete: removed ${totalRemoved} closed tab(s) from ${collectionsModified} collection(s)`);
    } else {
      console.log('[CLEANUP] No closed tabs found, cleanup not needed');
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Hide all tabs except the extension tab
 */
async function hideAllOtherTabs(extensionTabId) {
  try {
    const allTabs = await browser.tabs.query({ currentWindow: true });
    const tabsToHide = allTabs
      .filter(tab => tab.id !== extensionTabId && !(tab.url && tab.url.startsWith(extensionBaseUrl)))
      .map(tab => tab.id);
    
    if (tabsToHide.length > 0) {
      try {
        console.log(`[HIDE] Extension page active, hiding ${tabsToHide.length} tabs:`, tabsToHide.map(id => `[${id}]`).join(' '));
        await browser.tabs.hide(tabsToHide);
        console.log(`[HIDE] Successfully hid other tabs`);
      } catch (hideError) {
        console.warn('Some tabs could not be hidden:', hideError);
      }
    }
  } catch (error) {
    console.error('Error hiding tabs:', error);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  createBtn.addEventListener('click', handleCreateCollection);
  collapseAllBtn.addEventListener('click', handleCollapseAll);
  expandAllBtn.addEventListener('click', handleExpandAll);
  if (showHiddenBtn) {
    showHiddenBtn.addEventListener('click', handleShowAllHidden);
  }

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
  const isEditing = document.querySelector('.collection-name-input') !== null;
  if (isEditing) return; // Skip reload to avoid disrupting edit input

  if (tabChangeDebounceTimeout) {
    clearTimeout(tabChangeDebounceTimeout);
  }
  tabChangeDebounceTimeout = setTimeout(() => {
    loadCollections();
  }, 200);
}

/**
 * Listen for updates from background script
 */
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'collectionsUpdated') {
    console.log('[SYNC_UI] Sync change detected, reloading collections...');
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
    
    loadingMessage.style.display = 'none';
    
    if (collectionIds.length === 0) {
      collectionsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 64px 24px; color: #999;">No collections yet.</div>';
      if (showHiddenBtn) {
        showHiddenBtn.style.display = 'none';
      }
      return;
    }
    
    // Render each collection
    let hasHidden = false;
    let visibleCount = 0;
    collectionIds.sort((a, b) => {
      return collections[a].created - collections[b].created;
    });
    
    for (const collectionId of collectionIds) {
      const collection = collections[collectionId];
      if (collection.hidden) {
        hasHidden = true;
        if (!showHiddenTemporarily) {
          continue;
        }
      }
      visibleCount++;
      const isActive = activeState && activeState.type === 'collection' && activeState.id === collectionId;
      await renderCollection(collection, isActive);
    }
    
    if (visibleCount === 0) {
      collectionsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 64px 24px; color: #999;">No collections yet.</div>';
    }

    if (!hasHidden) {
      showHiddenTemporarily = false;
    }

    if (showHiddenBtn) {
      showHiddenBtn.style.display = (hasHidden && !showHiddenTemporarily) ? 'inline-block' : 'none';
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
  collectionEl.dataset.collapsed = collection.collapsed ? 'true' : 'false';
  collectionEl.dataset.showAllTabs = 'false';
  
  // Filter out this extension's tabs from display and sort by index
  const displayTabs = collection.tabs
    .filter(tab => !(tab.url && tab.url.startsWith(extensionBaseUrl)))
    .sort((a, b) => (a.index || 0) - (b.index || 0));
  const tabCount = displayTabs.length;
  
  const isCollapsed = collection.collapsed || false;
  const collapseToggleSymbol = isCollapsed ? '▶' : '▼';
  
  const isHidden = collection.hidden || false;
  const hideButtonText = isHidden ? 'Show' : 'Hide';
  const hideButtonTitle = isHidden ? 'Show collection in overview' : 'Hide collection from overview';
  const hideButtonClass = isHidden ? 'btn-show' : 'btn-hide';
  
  collectionEl.innerHTML = `
    <div class="collection-header">
      <button class="btn-collapse" data-action="toggle-collapse" title="${isCollapsed ? 'Expand' : 'Collapse'} collection">${collapseToggleSymbol}</button>
      <div class="collection-header-title">
        <div class="collection-name">${isHidden ? '<span class="hidden-icon" title="This collection is hidden">👁</span>' : ''}${escapeHtml(collection.name)}</div>
        <button class="btn-edit-name" data-action="edit" title="Edit collection name">✎</button>
      </div>
      <span class="collection-badge">${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'}</span>
    </div>
    <div class="collection-tabs" style="display: ${isCollapsed ? 'none' : 'block'};">
      <!-- Tabs list will be populated dynamically -->
    </div>
    <div class="collection-controls" style="display: ${isCollapsed ? 'none' : 'block'};">
      <button class="btn btn-small btn-activate ${isActive ? 'active' : ''}" data-action="activate">
        ${isActive ? '✓ Active' : 'Activate'}
      </button>
      <button class="btn btn-small ${hideButtonClass}" data-action="toggle-hidden" title="${hideButtonTitle}">
        ${hideButtonText}
      </button>
    </div>
  `;
  
  // Function to render the tabs list HTML
  async function renderTabsHTML(showAll = false) {
    const freshDisplayTabs = collection.tabs
      .filter(tab => !(tab.url && tab.url.startsWith(extensionBaseUrl)))
      .sort((a, b) => (a.index || 0) - (b.index || 0));
    const freshTabCount = freshDisplayTabs.length;
    
    const tabsToShow = showAll ? freshDisplayTabs : freshDisplayTabs.slice(0, TAB_PREVIEW_LIMIT);
    
    // Resolve open tabs and groups in current window
    const openTabs = await browser.tabs.query({ currentWindow: true });
    const openTabsById = {};
    openTabs.forEach(tab => {
      openTabsById[tab.id] = tab;
    });

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

    for (const tab of tabsToShow) {
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
                  <div class="tab-item" data-tab-id="${tab.id}" draggable="true">
                    <div class="tab-icon">
                      ${favIcon ? `<img src="${escapeHtml(favIcon)}" alt="">` : ''}
                    </div>
                    <div class="tab-info">
                      <div class="tab-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                      <div class="tab-url" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</div>
                    </div>
                    <button class="btn-close-tab" data-action="close-tab" data-tab-id="${tab.id}" data-collection-id="${collection.id}" title="Close tab">×</button>
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
            <div class="tab-item" data-tab-id="${tab.id}" draggable="true">
              <div class="tab-icon">
                ${favIcon ? `<img src="${escapeHtml(favIcon)}" alt="">` : ''}
              </div>
              <div class="tab-info">
                <div class="tab-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                <div class="tab-url" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</div>
              </div>
              <button class="btn-close-tab" data-action="close-tab" data-tab-id="${tab.id}" data-collection-id="${collection.id}" title="Close tab">×</button>
            </div>
          `;
        }
      })
      .join('');
      
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

    let extraInfo = '';
    if (!showAll && freshTabCount > TAB_PREVIEW_LIMIT) {
      extraInfo = `<div class="extra-tabs-link" data-action="show-all-tabs" title="Show all tabs">... and ${freshTabCount - TAB_PREVIEW_LIMIT} more tabs</div>`;
    } else if (showAll && freshTabCount > TAB_PREVIEW_LIMIT) {
      extraInfo = `<div class="extra-tabs-link" data-action="show-less-tabs" title="Show fewer tabs">Show less</div>`;
    }
    
    return { tabsHTML, extraInfo, freshDisplayTabs, renderedTabs };
  }
  
  // Function to update the tabs container content dynamically
  async function updateTabsList(showAll) {
    collectionEl.dataset.showAllTabs = showAll ? 'true' : 'false';
    const tabsContainer = collectionEl.querySelector('.collection-tabs');
    const { tabsHTML, extraInfo, freshDisplayTabs, renderedTabs } = await renderTabsHTML(showAll);
    
    tabsContainer.innerHTML = `${tabsHTML}${extraInfo}`;
    
    // Bind close buttons
    const closeTabBtns = tabsContainer.querySelectorAll('[data-action="close-tab"]');
    closeTabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabId = parseInt(btn.dataset.tabId, 10);
        handleCloseTab(tabId, btn.closest('.tab-item'));
      });
    });
    
    // Bind overflow / less links
    const overflowLink = tabsContainer.querySelector('.extra-tabs-link');
    if (overflowLink) {
      overflowLink.addEventListener('click', (e) => {
        e.stopPropagation();
        updateTabsList(showAll ? false : true);
      });
    }

    // Bind group collapse/expand toggle
    const groupHeaders = tabsContainer.querySelectorAll('[data-action="toggle-group-collapse"]');
    groupHeaders.forEach(header => {
      header.addEventListener('click', async (e) => {
        e.stopPropagation();
        const groupId = parseInt(header.dataset.groupId, 10);
        try {
          const group = await browser.tabGroups.get(groupId);
          if (group) {
            await browser.tabGroups.update(groupId, { collapsed: !group.collapsed });
            await updateTabsList(showAll);
          }
        } catch (err) {
          console.error('[TABGROUP] Failed to toggle collapse:', err);
        }
      });
    });
    
    // Apply borders
    await applyTabGroupBordersForTabs(renderedTabs, showAll ? renderedTabs.length : TAB_PREVIEW_LIMIT, tabsContainer);

    // Bind dragstart/dragend to tab items
    const tabItemEls = tabsContainer.querySelectorAll('.tab-item');
    tabItemEls.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const tabId = parseInt(item.dataset.tabId, 10);
        console.log(`[DRAG] Drag start for tab ${tabId} in collection ${collection.id}`);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
          tabId: tabId,
          sourceCollectionId: collection.id
        }));
        item.classList.add('dragging');
      });
      
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });
    });
  }
  
  // Handle closing a tab and removing it from the collection
  async function handleCloseTab(tabId, tabItemEl) {
    try {
      console.log(`[UI] Closing tab [${tabId}] from collection: ${collection.id}`);
      
      try {
        await browser.tabs.remove(tabId);
      } catch (err) {
        console.warn(`[UI] Tab [${tabId}] was not open or could not be closed in browser:`, err);
      }
      
      const response = await browser.runtime.sendMessage({
        type: 'getCollections'
      });
      const collections = response.collections || {};
      const col = collections[collection.id];
      
      if (col) {
        col.tabs = col.tabs.filter(t => t.id !== tabId);
        col.tabIds = col.tabIds.filter(id => id !== tabId);
        col.lastModified = Date.now();
        
        await browser.runtime.sendMessage({
          type: 'saveCollectionsForCleanup',
          collections: collections
        });
        
        // Mutate the outer collection reference so updateTabsList sees the change
        collection.tabs = col.tabs;
        collection.tabIds = col.tabIds;
        
        const displayTabs = col.tabs.filter(t => !(t.url && t.url.startsWith(extensionBaseUrl)));
        const badge = collectionEl.querySelector('.collection-badge');
        if (badge) {
          badge.textContent = `${displayTabs.length} ${displayTabs.length === 1 ? 'tab' : 'tabs'}`;
        }
        
        const isShowAll = collectionEl.dataset.showAllTabs === 'true';
        await updateTabsList(isShowAll);
        
        showStatus('Tab closed and removed from collection');
      }
    } catch (error) {
      console.error('Error closing tab:', error);
      showStatus('Error closing tab: ' + error.message, true);
    }
  }
  
  // Add event listeners
  const collapseBtn = collectionEl.querySelector('[data-action="toggle-collapse"]');
  collapseBtn.addEventListener('click', () => handleToggleCollapse(collection.id, collectionEl));
  
  const activateBtn = collectionEl.querySelector('[data-action="activate"]');
  activateBtn.addEventListener('click', () => handleActivateCollection(collection.id));

  const toggleHiddenBtn = collectionEl.querySelector('[data-action="toggle-hidden"]');
  if (toggleHiddenBtn) {
    toggleHiddenBtn.addEventListener('click', () => handleToggleCollectionHidden(collection.id, collection.hidden));
  }
  
  const editBtn = collectionEl.querySelector('[data-action="edit"]');
  editBtn.addEventListener('click', () => handleEditCollectionName(collectionEl, collection));

  // Drop zone listeners for drag and drop
  collectionEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    collectionEl.classList.add('drag-over');
  });

  collectionEl.addEventListener('dragenter', (e) => {
    e.preventDefault();
    collectionEl.classList.add('drag-over');
  });

  collectionEl.addEventListener('dragleave', () => {
    collectionEl.classList.remove('drag-over');
  });

  collectionEl.addEventListener('drop', (e) => handleDropTab(e, collection.id, collectionEl));
  
  // Render tabs list initially
  await updateTabsList(false);
  
  collectionsContainer.appendChild(collectionEl);
}

/**
 * Handle tab drop event to move tab to target collection
 */
async function handleDropTab(e, targetCollectionId, collectionEl) {
  e.preventDefault();
  collectionEl.classList.remove('drag-over');
  
  try {
    const dataStr = e.dataTransfer.getData('text/plain');
    if (!dataStr) return;
    
    const { tabId, sourceCollectionId } = JSON.parse(dataStr);
    
    if (sourceCollectionId === targetCollectionId) {
      console.log('[DRAG] Tab dropped onto its own collection, ignoring.');
      return;
    }
    
    console.log(`[DRAG] Moving tab ${tabId} from ${sourceCollectionId} to ${targetCollectionId}`);
    showStatus('Moving tab...', false);
    
    const response = await browser.runtime.sendMessage({
      type: 'moveTabBetweenCollections',
      tabId: tabId,
      sourceCollectionId: sourceCollectionId,
      targetCollectionId: targetCollectionId
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    showStatus('Tab moved successfully', false);
    await loadCollections();
  } catch (err) {
    console.error('[DRAG] Failed to drop tab:', err);
    showStatus('Error moving tab: ' + err.message, true);
  }
}

/**
 * Apply tabGroup border styling to visible tabs in a collection (General API)
 */
async function applyTabGroupBorders(collection, collectionEl) {
  const tabsContainer = collectionEl.querySelector('.collection-tabs');
  const displayTabs = collection.tabs.filter(tab => !(tab.url && tab.url.startsWith(extensionBaseUrl)));
  const isShowAll = collectionEl.dataset.showAllTabs === 'true';
  await applyTabGroupBordersForTabs(displayTabs, isShowAll ? displayTabs.length : TAB_PREVIEW_LIMIT, tabsContainer);
}

/**
 * Apply tabGroup border styling to a specific container's tabs list
 */
async function applyTabGroupBordersForTabs(displayTabs, limit, tabsContainer) {
  try {
    const visibleTabs = displayTabs.slice(0, limit);
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
      console.warn('[CONTAINER] Failed to query contextual identities:', err);
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
    
    // Precompute container information for all visible tabs
    const tabContainerInfos = [];
    for (let i = 0; i < visibleTabs.length; i++) {
      const savedTab = visibleTabs[i];
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
    
    const tabItems = tabsContainer.querySelectorAll('.tab-item');
    
    for (let i = 0; i < Math.min(visibleTabs.length, tabItems.length); i++) {
      const savedTab = visibleTabs[i];
      const tabItem = tabItems[i];
      const currentTab = openTabsById[savedTab.id];
      
      const prevTab = i > 0 ? visibleTabs[i - 1] : null;
      const nextTab = i < visibleTabs.length - 1 ? visibleTabs[i + 1] : null;
      
      const prevTabOpen = prevTab ? openTabsById[prevTab.id] : null;
      const nextTabOpen = nextTab ? openTabsById[nextTab.id] : null;

      const currentTabGroupId = currentTab ? currentTab.groupId : null;
      const prevTabGroupId = prevTabOpen ? prevTabOpen.groupId : null;
      const nextTabGroupId = nextTabOpen ? nextTabOpen.groupId : null;
      
      const isPrevSameGroup = currentTabGroupId === prevTabGroupId;
      const isNextSameGroup = currentTabGroupId === nextTabGroupId;

      const containerInfo = tabContainerInfos[i];
      const prevInfo = i > 0 ? tabContainerInfos[i - 1] : null;
      const nextInfo = i < visibleTabs.length - 1 ? tabContainerInfos[i + 1] : null;

      const isPrevSame = prevInfo && containerInfo && prevInfo.cookieStoreId === containerInfo.cookieStoreId && isPrevSameGroup;
      const isNextSame = nextInfo && containerInfo && nextInfo.cookieStoreId === containerInfo.cookieStoreId && isNextSameGroup;
      
      let containerColor = containerInfo ? containerInfo.color : null;
      let groupColor = null;
      
      // Determine tab group color
      if (currentTab && currentTab.groupId && currentTab.groupId !== browser.tabGroups.TAB_GROUP_ID_NONE) {
        try {
          const group = await browser.tabGroups.get(currentTab.groupId);
          if (group) {
            groupColor = TAB_GROUP_COLORS[group.color] || group.color || '#999';
          }
        } catch (error) {
          console.warn(`[TABGROUP] Could not get tabGroup for tab ${savedTab.id}:`, error);
        }
      }
      
      // Reset styling first
      tabItem.style.border = '';
      tabItem.style.borderTop = '';
      tabItem.style.borderBottom = '';
      tabItem.style.borderLeft = '';
      tabItem.style.borderRight = '';
      tabItem.style.borderRadius = '';
      tabItem.style.marginTop = '';
      tabItem.style.outline = '';
      tabItem.style.outlineOffset = '';
      
      // Apply container border styles
      if (containerColor) {
        tabItem.style.borderLeft = `2px solid ${containerColor}`;
        tabItem.style.borderRight = `2px solid ${containerColor}`;
        tabItem.style.borderTop = isPrevSame ? 'none' : `2px solid ${containerColor}`;
        tabItem.style.borderBottom = isNextSame ? 'none' : `2px solid ${containerColor}`;
        
        if (isPrevSame && isNextSame) {
          tabItem.style.borderRadius = '0';
        } else if (isPrevSame) {
          tabItem.style.borderRadius = '0 0 6px 6px';
        } else if (isNextSame) {
          tabItem.style.borderRadius = '6px 6px 0 0';
        } else {
          tabItem.style.borderRadius = '6px';
        }
        
        if (isPrevSame) {
          tabItem.style.marginTop = '-8px';
        }
      }
      
      // Container border-title overlay
      let titleEl = tabItem.querySelector('.container-border-title');
      if (containerColor && !isPrevSame) {
        if (!titleEl) {
          titleEl = document.createElement('span');
          titleEl.className = 'container-border-title';
          tabItem.appendChild(titleEl);
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
  } catch (error) {
    console.error('[TABGROUP] Error applying tabGroup/container borders:', error);
  }
}

/**
 * Create a new empty collection with a blank tab
 */
async function handleCreateCollection() {
  try {
    createBtn.disabled = true;
    console.log(`[UI] Create collection button clicked`);
    showStatus('Creating collection...', false);
    
    const response = await browser.runtime.sendMessage({
      type: 'createEmptyCollection'
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    console.log(`[UI] New collection created: ${response.collection.name} with ${response.collection.tabs.length} tab(s)`);
    showStatus(`Created: ${response.collection.name}`, false);
    
    // Close the extension tab since we've created a new collection
    const extensionTab = await browser.tabs.getCurrent();
    console.log(`[UI] Closing extension tab [${extensionTab.id}]`);
    await browser.tabs.remove(extensionTab.id);
    
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
    console.log(`[UI] Clicking activate button for collection: ${collectionId}`);
    const response = await browser.runtime.sendMessage({
      type: 'activateCollection',
      collectionId: collectionId
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    console.log(`[UI] Collection activated successfully: ${response.collection.name}`);
    showStatus(`Activated: ${response.collection.name}`, false);
    
    // Close the extension tab since we've activated a collection
    const extensionTab = await browser.tabs.getCurrent();
    console.log(`[UI] Closing extension tab [${extensionTab.id}]`);
    await browser.tabs.remove(extensionTab.id);
    
  } catch (error) {
    console.error('Error activating collection:', error);
    showStatus('Error activating collection: ' + error.message, true);
  }
}

/**
 * Toggle collapse state of a collection
 */
async function handleToggleCollapse(collectionId, collectionEl) {
  try {
    const isCurrentlyCollapsed = collectionEl.dataset.collapsed === 'true';
    const newCollapsedState = !isCurrentlyCollapsed;
    
    console.log(`[UI] Toggling collapse for collection: ${collectionId}, new state: ${newCollapsedState ? 'collapsed' : 'expanded'}`);
    
    // Update UI immediately
    const tabsSection = collectionEl.querySelector('.collection-tabs');
    const controlsSection = collectionEl.querySelector('.collection-controls');
    const collapseBtn = collectionEl.querySelector('[data-action="toggle-collapse"]');
    
    tabsSection.style.display = newCollapsedState ? 'none' : 'block';
    controlsSection.style.display = newCollapsedState ? 'none' : 'block';
    collapseBtn.textContent = newCollapsedState ? '▶' : '▼';
    collapseBtn.title = newCollapsedState ? 'Expand collection' : 'Collapse collection';
    collectionEl.dataset.collapsed = newCollapsedState ? 'true' : 'false';
    
    // Save the collapsed state
    const response = await browser.runtime.sendMessage({
      type: 'setCollectionCollapsed',
      collectionId: collectionId,
      collapsed: newCollapsedState
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // If expanding, reapply tabGroup borders since tabs are now visible
    if (!newCollapsedState) {
      const collection = response.collection;
      if (collection) {
        await applyTabGroupBorders(collection, collectionEl);
      }
    }
    
    console.log(`[UI] Collapse state saved for collection: ${collectionId}`);
  } catch (error) {
    console.error('Error toggling collapse:', error);
    showStatus('Error toggling collapse: ' + error.message, true);
  }
}

/**
 * Collapse all collections
 */
async function handleCollapseAll() {
  try {
    console.log('[UI] Collapse all button clicked');
    const collectionEls = document.querySelectorAll('[data-collection-id]');
    
    for (const collectionEl of collectionEls) {
      const collectionId = collectionEl.dataset.collectionId;
      const isCurrentlyCollapsed = collectionEl.dataset.collapsed === 'true';
      
      if (!isCurrentlyCollapsed) {
        // Toggle only if currently expanded
        await handleToggleCollapse(collectionId, collectionEl);
      }
    }
    
    showStatus('All collections collapsed', false);
  } catch (error) {
    console.error('Error collapsing all:', error);
    showStatus('Error collapsing all: ' + error.message, true);
  }
}

/**
 * Expand all collections
 */
async function handleExpandAll() {
  try {
    console.log('[UI] Expand all button clicked');
    const collectionEls = document.querySelectorAll('[data-collection-id]');
    
    for (const collectionEl of collectionEls) {
      const collectionId = collectionEl.dataset.collectionId;
      const isCurrentlyCollapsed = collectionEl.dataset.collapsed === 'true';
      
      if (isCurrentlyCollapsed) {
        // Toggle only if currently collapsed
        await handleToggleCollapse(collectionId, collectionEl);
      }
    }
    
    showStatus('All collections expanded', false);
  } catch (error) {
    console.error('Error expanding all:', error);
    showStatus('Error expanding all: ' + error.message, true);
  }
}

/**
 * Handle editing collection name
 */
function handleEditCollectionName(collectionEl, collection) {
  try {
    console.log(`[UI] Edit button clicked for collection: ${collection.name}`);
    
    const nameEl = collectionEl.querySelector('.collection-name');
    const editBtn = collectionEl.querySelector('[data-action="edit"]');
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = collection.name;
    input.className = 'collection-name-input';
    
    // Replace name with input
    nameEl.replaceWith(input);
    editBtn.style.display = 'none';
    
    // Focus and select all text
    input.focus();
    input.select();
    
    // Flag to prevent multiple simultaneous saves
    let isSaving = false;
    
    // Handle save and cancel
    async function saveChanges() {
      if (isSaving) return;
      isSaving = true;
      
      const newName = input.value.trim();
      
      if (newName && newName !== collection.name) {
        try {
          console.log(`[UI] Renaming collection to: ${newName}`);
          const response = await browser.runtime.sendMessage({
            type: 'renameCollection',
            collectionId: collection.id,
            newName: newName
          });
          
          if (!response.error) {
            console.log(`[UI] Collection renamed successfully`);
            showStatus(`Renamed to: ${newName}`, false);
          }
        } catch (error) {
          console.error('Error renaming collection:', error);
          showStatus('Error renaming collection: ' + error.message, true);
          isSaving = false;
          cancelEdit();
        }
      } else {
        // No changes, just cancel
        isSaving = false;
        cancelEdit();
      }
    }
    
    function cancelEdit() {
      // Restore name element
      const newNameEl = document.createElement('div');
      newNameEl.className = 'collection-name';
      newNameEl.innerHTML = (collection.hidden ? '<span class="hidden-icon" title="This collection is hidden">👁</span>' : '') + escapeHtml(collection.name);
      input.replaceWith(newNameEl);
      editBtn.style.display = '';
    }
    
    // Blur event - save changes
    input.addEventListener('blur', saveChanges);
    
    // Enter key - save changes
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveChanges();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });
  } catch (error) {
    console.error('Error handling edit:', error);
    showStatus('Error editing collection: ' + error.message, true);
  }
}

/**
 * Toggle the hidden state of a collection persistently
 */
async function handleToggleCollectionHidden(collectionId, currentlyHidden) {
  try {
    const action = currentlyHidden ? 'show' : 'hide';
    const confirmMessage = currentlyHidden
      ? 'Are you sure you want to show this collection in the overview?'
      : 'Are you sure you want to hide this collection from the overview? The tabs will remain open.';
      
    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;
    
    console.log(`[UI] Persistent ${action} for collection: ${collectionId}`);
    showStatus(`${currentlyHidden ? 'Showing' : 'Hiding'} collection...`, false);
    
    const response = await browser.runtime.sendMessage({
      type: 'setCollectionHidden',
      collectionId: collectionId,
      hidden: !currentlyHidden
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    showStatus(`Collection is now ${currentlyHidden ? 'visible' : 'hidden'}`, false);
    await loadCollections();
  } catch (error) {
    console.error('Error toggling collection hidden state:', error);
    showStatus('Error: ' + error.message, true);
  }
}

/**
 * Show hidden collections temporarily in the current view
 */
async function handleShowAllHidden() {
  try {
    const confirmed = confirm('Are you sure you want to show all hidden collections in the current view?');
    if (!confirmed) return;
    
    console.log('[UI] Showing hidden collections temporarily');
    showHiddenTemporarily = true;
    await loadCollections();
  } catch (error) {
    console.error('Error showing hidden collections temporarily:', error);
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
