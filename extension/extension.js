/**
 * Extension Tab UI Logic for Tab Collections Manager
 */

// ============================================================================
// Constants
// ============================================================================

const TAB_PREVIEW_LIMIT = 4;

// TAB_GROUP_COLORS, CONTAINER_COLORS, getTabTitle, getTabFavIcon, escapeHtml,
// makeCollectionSortComparator, showStatusMessage, makeDebouncedTabChangeHandler,
// registerTabAndGroupListeners, applyContainerBordersToDOMElements
// are all provided by shared/utils.js (loaded before this script).


// ============================================================================
// DOM Elements
// ============================================================================

const createBtn = document.getElementById('createBtn');
const collapseAllBtn = document.getElementById('collapseAllBtn');
const expandAllBtn = document.getElementById('expandAllBtn');
const showHiddenBtn = document.getElementById('showHiddenBtn');
const importBtn = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');
const groupUnassignedBtn = document.getElementById('groupUnassignedBtn');
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
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', handleImportBackup);
  }
  if (groupUnassignedBtn) {
    groupUnassignedBtn.addEventListener('click', handleGroupUnassigned);
  }

  const debouncedHandler = makeDebouncedTabChangeHandler(() => {
    const isEditing = document.querySelector('.collection-name-input') !== null;
    if (!isEditing) loadCollections();
  });
  registerTabAndGroupListeners(debouncedHandler);
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

// getTabTitle and getTabFavIcon are provided by shared/utils.js
// ============================================================================
// Collection Management
// ============================================================================

let loadCount = 0;

/**
 * Load and display all collections.
 */
async function loadCollections() {
  const currentLoadId = ++loadCount;
  try {
    loadingMessage.style.display = 'block';
    
    // Request collections from background
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    
    if (currentLoadId !== loadCount) return;
    
    loadingMessage.style.display = 'none';
    
    const collections = response.collections || {};
    const activeState = response.activeState;
    const collectionIds = Object.keys(collections);

    
    if (collectionIds.length === 0) {
      collectionsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 64px 24px; color: #999;">No collections yet.</div>';
      if (showHiddenBtn) {
        showHiddenBtn.style.display = 'none';
      }
      return;
    }
    
    // Sort collection IDs
    collectionIds.sort(makeCollectionSortComparator(collections));
    
    let hasHidden = false;
    let visibleCount = 0;
    
    // Get all existing collection elements in DOM
    const existingEls = {};
    collectionsContainer.querySelectorAll('.collection-item').forEach(el => {
      const id = el.dataset.collectionId;
      if (id) {
        existingEls[id] = el;
      }
    });
    
    const orderedEls = [];
    
    for (const collectionId of collectionIds) {
      if (currentLoadId !== loadCount) return;
      const collection = collections[collectionId];
      if (collection.hidden) {
        hasHidden = true;
        if (!showHiddenTemporarily) {
          // If it exists in DOM but should be hidden now, remove it
          if (existingEls[collectionId]) {
            existingEls[collectionId].remove();
            delete existingEls[collectionId];
          }
          continue;
        }
      }
      visibleCount++;
      const isActive = activeState && activeState.type === 'collection' && activeState.id === collectionId;
      
      let collectionEl = existingEls[collectionId];
      let isNew = false;
      if (!collectionEl) {
        collectionEl = createCollectionEl(collectionId);
        isNew = true;
      }
      
      await updateCollectionEl(collectionEl, collection, isActive, true);
      orderedEls.push(collectionEl);
      delete existingEls[collectionId];
    }
    
    // Remove deleted/leftover collections
    for (const id in existingEls) {
      existingEls[id].remove();
    }
    
    if (visibleCount === 0) {
      collectionsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 64px 24px; color: #999;">No collections yet.</div>';
    } else {
      // Remove any placeholder/empty messages if they exist
      const emptyMsg = collectionsContainer.querySelector('div[style*="text-align: center"]');
      if (emptyMsg) {
        emptyMsg.remove();
      }
      
      // Reorder cards in collectionsContainer to match orderedEls
      orderedEls.forEach((el, index) => {
        if (collectionsContainer.children[index] !== el) {
          collectionsContainer.insertBefore(el, collectionsContainer.children[index] || null);
        }
      });
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
 * Create a skeleton collection card element and bind its listeners
 */
function createCollectionEl(collectionId) {
  const collectionEl = document.createElement('div');
  collectionEl.className = 'collection-item';
  collectionEl.dataset.collectionId = collectionId;
  collectionEl.dataset.collapsed = 'false';
  collectionEl.dataset.showAllTabs = 'false';
  
  collectionEl.innerHTML = `
    <div class="collection-header">
      <button class="btn-collapse" data-action="toggle-collapse" title="Collapse collection">▼</button>
      <div class="collection-header-title">
        <div class="collection-name"></div>
        <button class="btn-edit-name" data-action="edit" title="Edit collection name">✎</button>
        <button class="btn-refresh" data-action="refresh" title="Compare and refresh collection tabs">↻</button>
      </div>
      <span class="collection-badge">0 tabs</span>
    </div>
    <div class="collection-tabs" style="display: block;">
      <!-- Tabs list will be populated dynamically -->
    </div>
    <div class="collection-controls" style="display: block;">
      <button class="btn btn-small btn-activate" data-action="activate">Activate</button>
      <button class="btn btn-small btn-hide" data-action="toggle-hidden">Hide</button>
      <button class="btn btn-small btn-delete-collection" data-action="delete-collection" title="Delete collection and close its tabs">🗑 Delete</button>
    </div>
  `;
  
  // Bind collapse/expand
  const collapseBtn = collectionEl.querySelector('[data-action="toggle-collapse"]');
  collapseBtn.addEventListener('click', () => {
    const col = collectionEl.collection;
    if (col) {
      handleToggleCollapse(col.id, collectionEl);
    }
  });
  
  // Bind activate
  const activateBtn = collectionEl.querySelector('[data-action="activate"]');
  activateBtn.addEventListener('click', () => {
    const col = collectionEl.collection;
    if (col) {
      handleActivateCollection(col.id);
    }
  });
  
  // Bind toggle hidden
  const toggleHiddenBtn = collectionEl.querySelector('[data-action="toggle-hidden"]');
  if (toggleHiddenBtn) {
    toggleHiddenBtn.addEventListener('click', () => {
      const col = collectionEl.collection;
      if (col) {
        handleToggleCollectionHidden(col.id, col.hidden);
      }
    });
  }
  
  // Bind delete collection
  const deleteCollectionBtn = collectionEl.querySelector('[data-action="delete-collection"]');
  if (deleteCollectionBtn) {
    deleteCollectionBtn.addEventListener('click', () => {
      const col = collectionEl.collection;
      if (col) {
        handleDeleteCollection(col);
      }
    });
  }
  
  // Bind edit name
  const editBtn = collectionEl.querySelector('[data-action="edit"]');
  editBtn.addEventListener('click', () => {
    const col = collectionEl.collection;
    if (col) {
      handleEditCollectionName(collectionEl, col);
    }
  });
  
  // Bind refresh collection
  const refreshBtn = collectionEl.querySelector('[data-action="refresh"]');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const col = collectionEl.collection;
      if (col) {
        handleRefreshCollection(col.id);
      }
    });
  }
  
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

  collectionEl.addEventListener('drop', (e) => {
    const col = collectionEl.collection;
    if (col) {
      handleDropTab(e, col.id, collectionEl);
    }
  });

  // Drag listeners for collection card itself
  collectionEl.draggable = true;
  collectionEl.addEventListener('dragstart', (e) => {
    if (e.target.closest('.tab-item')) {
      return;
    }
    const col = collectionEl.collection;
    if (col) {
      console.log(`[DRAG_COLL] Drag start for collection: ${col.id}`);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        collectionId: col.id,
        type: 'collection'
      }));
      collectionEl.classList.add('dragging-collection');
    }
  });

  collectionEl.addEventListener('dragend', () => {
    collectionEl.classList.remove('dragging-collection');
  });
  
  return collectionEl;
}

/**
 * Update an existing collection card element in-place with new data
 */
async function updateCollectionEl(collectionEl, collection, isActive, forceTabsUpdate = false) {
  // Store the latest collection reference on the DOM element
  collectionEl.collection = collection;
  
  if (isActive) {
    collectionEl.classList.add('active');
  } else {
    collectionEl.classList.remove('active');
  }
  
  const isCollapsed = collection.collapsed || false;
  collectionEl.dataset.collapsed = isCollapsed ? 'true' : 'false';
  
  const collapseBtn = collectionEl.querySelector('[data-action="toggle-collapse"]');
  if (collapseBtn) {
    collapseBtn.textContent = isCollapsed ? '▶' : '▼';
    collapseBtn.title = isCollapsed ? 'Expand collection' : 'Collapse collection';
  }
  
  const tabsSection = collectionEl.querySelector('.collection-tabs');
  if (tabsSection) {
    tabsSection.style.display = isCollapsed ? 'none' : 'block';
  }
  
  const controlsSection = collectionEl.querySelector('.collection-controls');
  if (controlsSection) {
    controlsSection.style.display = isCollapsed ? 'none' : 'block';
  }
  
  // Skip updating name text if currently editing to avoid cursor disruption
  const isEditing = collectionEl.querySelector('.collection-name-input') !== null;
  if (!isEditing) {
    const nameEl = collectionEl.querySelector('.collection-name');
    if (nameEl) {
      const isHidden = collection.hidden || false;
      nameEl.innerHTML = (isHidden ? '<span class="hidden-icon" title="This collection is hidden">👁</span>' : '') + escapeHtml(collection.name);
    }
  }
  
  const displayTabs = collection.tabs
    .filter(tab => !(tab.url && tab.url.startsWith(extensionBaseUrl)))
    .sort((a, b) => (a.index || 0) - (b.index || 0));
  const tabCount = displayTabs.length;
  
  const badge = collectionEl.querySelector('.collection-badge');
  if (badge) {
    badge.textContent = `${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'}`;
  }
  
  const isHidden = collection.hidden || false;
  const toggleHiddenBtn = collectionEl.querySelector('[data-action="toggle-hidden"]');
  if (toggleHiddenBtn) {
    toggleHiddenBtn.textContent = isHidden ? 'Show' : 'Hide';
    toggleHiddenBtn.title = isHidden ? 'Show collection in overview' : 'Hide collection from overview';
    toggleHiddenBtn.className = `btn btn-small ${isHidden ? 'btn-show' : 'btn-hide'}`;
  }
  
  const activateBtn = collectionEl.querySelector('[data-action="activate"]');
  if (activateBtn) {
    if (tabCount === 0) {
      activateBtn.disabled = true;
      activateBtn.title = 'Cannot activate an empty collection';
      activateBtn.classList.remove('active');
      activateBtn.textContent = 'Activate';
    } else {
      activateBtn.disabled = false;
      activateBtn.title = '';
      if (isActive) {
        activateBtn.classList.add('active');
        activateBtn.textContent = '✓ Active';
      } else {
        activateBtn.classList.remove('active');
        activateBtn.textContent = 'Activate';
      }
    }
  }
  
  // Update the tabs list
  const showAll = collectionEl.dataset.showAllTabs === 'true';
  await updateTabsList(collectionEl, collection, showAll);
}

/**
 * Render the HTML for tabs of a collection
 */
async function renderTabsHTML(collection, showAll = false) {
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
                  <button class="btn-close-tab" data-action="close-tab" data-tab-id="${tab.id}" data-tab-url="${escapeHtml(tab.url || '')}" data-collection-id="${collection.id}" title="Close tab">×</button>
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
            <button class="btn-close-tab" data-action="close-tab" data-tab-id="${tab.id}" data-tab-url="${escapeHtml(tab.url || '')}" data-collection-id="${collection.id}" title="Close tab">×</button>
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

/**
 * Update the DOM tabs list container inside a collection card
 */
async function updateTabsList(collectionEl, collection, showAll) {
  collectionEl.dataset.showAllTabs = showAll ? 'true' : 'false';
  const tabsContainer = collectionEl.querySelector('.collection-tabs');
  const { tabsHTML, extraInfo, freshDisplayTabs, renderedTabs } = await renderTabsHTML(collection, showAll);
  
  if (freshDisplayTabs.length === 0) {
    tabsContainer.innerHTML = `
      <div class="empty-collection-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 12px; text-align: center; gap: 12px; border: 1px dashed #ccc; border-radius: 8px; background: #fafafa; margin: 8px 0;">
        <span class="empty-collection-message" style="font-size: 13px; color: #666;">This collection is empty.</span>
        <button class="btn btn-small btn-activate btn-add-tab" data-action="add-tab" style="margin-right: 0; font-weight: 600;">+ New Tab</button>
      </div>
    `;
    
    const addTabBtn = tabsContainer.querySelector('[data-action="add-tab"]');
    if (addTabBtn) {
      addTabBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        addTabBtn.disabled = true;
        showStatus('Opening new tab...', false);
        try {
          const response = await browser.runtime.sendMessage({
            type: 'addTabToCollection',
            collectionId: collection.id
          });
          if (response.error) {
            throw new Error(response.error);
          }
        } catch (err) {
          console.error('Failed to add tab:', err);
          showStatus('Failed to add tab: ' + err.message, true);
          addTabBtn.disabled = false;
        }
      });
    }
    return;
  }
  
  tabsContainer.innerHTML = `${tabsHTML}${extraInfo}`;
  
  // Bind close buttons
  const closeTabBtns = tabsContainer.querySelectorAll('[data-action="close-tab"]');
  closeTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rawTabId = btn.dataset.tabId;
      const tabId = (rawTabId === 'null' || !rawTabId) ? null : parseInt(rawTabId, 10);
      const tabUrl = btn.dataset.tabUrl || '';
      handleCloseTab(tabId, tabUrl, btn.closest('.tab-item'), collectionEl);
    });
  });
  
  // Bind overflow / less links
  const overflowLink = tabsContainer.querySelector('.extra-tabs-link');
  if (overflowLink) {
    overflowLink.addEventListener('click', (e) => {
      e.stopPropagation();
      updateTabsList(collectionEl, collection, !showAll);
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
          await updateTabsList(collectionEl, collection, showAll);
        }
      } catch (err) {
        console.error('[TABGROUP] Failed to toggle collapse:', err);
      }
    });
  });
  
  // Apply container borders
  const tabItemEls = Array.from(tabsContainer.querySelectorAll('.tab-item'));
  const visibleForBorders = showAll ? renderedTabs : renderedTabs.slice(0, TAB_PREVIEW_LIMIT);
  await applyContainerBorders(tabItemEls, visibleForBorders);

  // Bind dragstart/dragend to tab items
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

/**
 * Handle closing a tab and removing it from the collection
 */
async function handleCloseTab(tabId, tabUrl, tabItemEl, collectionEl) {
  const collection = collectionEl.collection;
  if (!collection) return;
  try {
    console.log(`[UI] Closing tab [${tabId}] (URL: ${tabUrl}) from collection: ${collection.id}`);
    
    if (tabId !== null && !isNaN(tabId)) {
      try {
        await browser.tabs.remove(tabId);
      } catch (err) {
        console.warn(`[UI] Tab [${tabId}] was not open or could not be closed in browser:`, err);
      }
    }
    
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    const collections = response.collections || {};
    const col = collections[collection.id];
    
    if (col) {
      if (tabId !== null && !isNaN(tabId)) {
        col.tabs = col.tabs.filter(t => t.id !== tabId);
        col.tabIds = col.tabIds.filter(id => id !== tabId);
      } else if (tabUrl) {
        col.tabs = col.tabs.filter(t => t.url !== tabUrl);
      }
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
      await updateTabsList(collectionEl, collection, isShowAll);
      
      showStatus('Tab closed and removed from collection');
    }
  } catch (error) {
    console.error('Error closing tab:', error);
    showStatus('Error closing tab: ' + error.message, true);
  }
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
    
    const dragData = JSON.parse(dataStr);
    if (dragData.type === 'collection') {
      // Reordering collections!
      await handleReorderCollections(dragData.collectionId, targetCollectionId);
      return;
    }
    
    const { tabId, sourceCollectionId } = dragData;
    
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
 * Handle reordering collections when a collection card is dropped onto another
 */
async function handleReorderCollections(sourceCollectionId, targetCollectionId) {
  if (sourceCollectionId === targetCollectionId) return;
  
  try {
    // Get current collections to see their current order in the UI
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    const collections = response.collections || {};
    
    // Sort collection IDs as they are currently rendered in the UI
    const sortedIds = Object.keys(collections).sort((a, b) => {
      const posA = collections[a].position !== undefined ? collections[a].position : (collections[a].created || 0);
      const posB = collections[b].position !== undefined ? collections[b].position : (collections[b].created || 0);
      return posA - posB;
    });
    
    const sourceIndex = sortedIds.indexOf(sourceCollectionId);
    const targetIndex = sortedIds.indexOf(targetCollectionId);
    
    if (sourceIndex === -1 || targetIndex === -1) return;
    
    // Remove source and insert it at target position
    sortedIds.splice(sourceIndex, 1);
    sortedIds.splice(targetIndex, 0, sourceCollectionId);
    
    // Send message to background to save the new order
    showStatus('Reordering collections...', false);
    const reorderResponse = await browser.runtime.sendMessage({
      type: 'reorderCollections',
      orderedCollectionIds: sortedIds
    });
    
    if (reorderResponse.error) {
      throw new Error(reorderResponse.error);
    }
    
    showStatus('Reordered collections', false);
    await loadCollections();
  } catch (err) {
    console.error('Failed to reorder collections:', err);
    showStatus('Error reordering collections: ' + err.message, true);
  }
}

/**
 * Apply container border styling to all visible tab items in a collection card.
 * Delegates to the shared applyContainerBordersToDOMElements utility.
 * @param {HTMLElement[]} tabItemEls - ordered .tab-item elements
 * @param {Array} visibleTabs - tab snapshot objects in the same order
 */
async function applyContainerBorders(tabItemEls, visibleTabs) {
  try {
    const openTabs = await browser.tabs.query({ currentWindow: true });
    const openTabsById = {};
    openTabs.forEach(tab => { openTabsById[tab.id] = tab; });

    const identityMap = await queryIdentityMap();

    let tabGroups = [];
    try {
      tabGroups = await browser.tabGroups.query({});
    } catch (e) {
      console.warn('Failed to query tab groups for border painting:', e);
    }
    const groupMap = {};
    tabGroups.forEach(g => { groupMap[g.id] = g; });

    applyContainerBordersToDOMElements(tabItemEls, visibleTabs, openTabsById, identityMap, groupMap);
  } catch (error) {
    console.error('[CONTAINER] Error applying container borders:', error);
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
 * Delete a collection.
 * Eagerly removes the card from the DOM to prevent race conditions with the
 * tab-removal debounce. On error the card is fully restored via loadCollections().
 */
async function handleDeleteCollection(collection) {
  try {
    const displayTabs = collection.tabs.filter(t => !(t.url && t.url.startsWith(extensionBaseUrl)));
    const tabCount = displayTabs.length;
    
    const confirmMsg = tabCount === 0
      ? `Are you sure you want to delete the collection "${collection.name}"?`
      : `Are you sure you want to delete the collection "${collection.name}"? This will delete the collection and close all ${tabCount} tab(s) associated with it in your browser.`;
      
    if (!confirm(confirmMsg)) {
      return;
    }

    // Remove the card from the DOM immediately so it vanishes before background.js
    // closes its tabs (which would fire a debounced loadCollections() that would
    // still see the collection in storage and put the card back).
    const cardEl = collectionsContainer.querySelector(`[data-collection-id="${collection.id}"]`);
    if (cardEl) {
      cardEl.remove();
    }
    
    showStatus('Deleting collection...', false);
    const response = await browser.runtime.sendMessage({
      type: 'deleteCollection',
      collectionId: collection.id
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    showStatus(`Deleted collection: ${collection.name}`, false);
    await loadCollections();
  } catch (error) {
    console.error('Error deleting collection:', error);
    showStatus('Error deleting collection: ' + error.message, true);
    // The card was already removed from the DOM. Reload from storage so it
    // reappears if the deletion did not actually complete.
    await loadCollections();
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
    
    // If expanding, reapply container borders and refresh tab list
    if (!newCollapsedState) {
      const collection = response.collection;
      if (collection) {
        const showAll = collectionEl.dataset.showAllTabs === 'true';
        await updateTabsList(collectionEl, collection, showAll);
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
    const collectionEls = document.querySelectorAll('.collection-item[data-collection-id]');
    
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
    const collectionEls = document.querySelectorAll('.collection-item[data-collection-id]');
    
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
    const refreshBtn = collectionEl.querySelector('[data-action="refresh"]');
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = collection.name;
    input.className = 'collection-name-input';
    
    // Replace name with input
    nameEl.replaceWith(input);
    editBtn.style.display = 'none';
    if (refreshBtn) refreshBtn.style.display = 'none';
    
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
      if (refreshBtn) refreshBtn.style.display = '';
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
 * Compare and refresh collection tabs with live browser state
 */
async function handleRefreshCollection(collectionId) {
  try {
    console.log(`[UI] Refresh button clicked for collection: ${collectionId}`);
    showStatus('Refreshing collection...', false);
    
    const response = await browser.runtime.sendMessage({
      type: 'refreshCollection',
      collectionId: collectionId
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    console.log(`[UI] Collection refreshed successfully`);
    showStatus('Collection refreshed successfully', false);
    await loadCollections();
  } catch (error) {
    console.error('Error refreshing collection:', error);
    showStatus('Error refreshing collection: ' + error.message, true);
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

/**
 * Create a new collection containing all open tabs that are not currently in any collection
 */
async function handleGroupUnassigned() {
  try {
    console.log('[UI] Group Unassigned button clicked');
    showStatus('Finding unassigned tabs...', false);
    
    // Request collections from background
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    
    const collections = response.collections || {};
    
    // Get all open tabs in current window (or all windows? Let's check all tabs in browser)
    const allTabs = await browser.tabs.query({});
    
    // Find all assigned tab IDs
    const assignedTabIds = new Set();
    for (const col of Object.values(collections)) {
      if (col.tabs) {
        col.tabs.forEach(st => {
          if (st.id !== null) {
            assignedTabIds.add(st.id);
          }
        });
      }
    }
    
    // Filter unassigned open tabs (exclude extension's own tabs)
    const unassignedTabs = allTabs.filter(tab => {
      if (tab.url && tab.url.startsWith(extensionBaseUrl)) {
        return false;
      }
      return !assignedTabIds.has(tab.id);
    });
    
    if (unassignedTabs.length === 0) {
      showStatus('All open tabs are already in collections!', false);
      return;
    }
    
    showStatus(`Grouping ${unassignedTabs.length} unassigned tab(s)...`, false);
    
    // Send message to background to create collection
    const name = `Unassigned Tabs`;
    const createResponse = await browser.runtime.sendMessage({
      type: 'createCollectionFromTabs',
      name: name,
      tabs: unassignedTabs
    });
    
    if (createResponse.error) {
      throw new Error(createResponse.error);
    }
    
    showStatus(`Created collection: ${name}`, false);
    await loadCollections();
  } catch (error) {
    console.error('Error grouping unassigned tabs:', error);
    showStatus('Error grouping unassigned tabs: ' + error.message, true);
  }
}

// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Show status message (delegates to shared utility).
 */
function showStatus(message, isError = false) {
  showStatusMessage(statusMessage, message, isError);
}

// escapeHtml is provided by shared/utils.js

/**
 * Handle importing a JSON backup from the old extension
 */
async function handleImportBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Reset input value so same file can be selected again
  const targetInput = event.target;

  try {
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      showStatus('Invalid file type. Please upload a JSON backup.', true);
      targetInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        let data = JSON.parse(e.target.result);
        let windows = [];

        // Check format
        if (data.file && data.file.type === 'panoramaView' && data.file.version === 1) {
          windows = data.windows || [];
        } else if (((data.version && data.version[0] === 'tabGroups') || (data.version && data.version[0] === 'sessionrestore')) && data.version[1] === 1) {
          const converted = convertLegacyBackup(data);
          windows = converted ? (converted.windows || []) : [];
        } else if (data.groups && Array.isArray(data.groups)) {
          // Simple single window backup format
          windows = [{
            groups: data.groups,
            tabs: data.tabs || []
          }];
        } else {
          showStatus('Unrecognized backup format. Please upload a valid Tab Groups/Panorama backup.', true);
          targetInput.value = '';
          return;
        }

        if (windows.length === 0) {
          showStatus('No groups or windows found in the backup file.', true);
          targetInput.value = '';
          return;
        }

        // Fetch current collections
        const getResponse = await browser.runtime.sendMessage({
          type: 'getCollections'
        });
        const currentCollections = getResponse.collections || {};
        const updatedCollections = { ...currentCollections };

        let importedCollectionsCount = 0;
        let importedTabsCount = 0;

        windows.forEach((wi, winIdx) => {
          const groups = wi.groups || [];
          const tabs = wi.tabs || [];

          // If no groups are explicitly defined but tabs exist, extract them from tabs
          if (groups.length === 0 && tabs.length > 0) {
            const uniqueGroupIds = [...new Set(tabs.map(t => t.groupId).filter(id => id !== undefined && id !== null))];
            uniqueGroupIds.forEach(gId => {
              groups.push({
                id: gId,
                name: `Group ${gId}`
              });
            });
          }

          groups.forEach(group => {
            const oldGroupId = group.id;
            
            // Filter tabs belonging to this group
            const groupTabs = tabs.filter(tab => {
              // Skip extension UI tabs
              const isExtensionTab = tab.url && (
                tab.url.startsWith(browser.runtime.getURL('')) ||
                (tab.url.startsWith('moz-extension://') && (tab.url.includes('/view.html') || tab.url.includes('/popup-view/')))
              );
              if (isExtensionTab) return false;
              
              return String(tab.groupId) === String(oldGroupId);
            });

            // Map tabs to snapshots structure
            const tabSnapshots = groupTabs.map((tab, idx) => ({
              id: null,
              url: tab.url || 'about:blank',
              title: tab.title || tab.url || 'New Tab',
              favIconUrl: '',
              cookieStoreId: tab.cookieStoreId || 'firefox-default',
              index: idx,
              active: idx === 0
            }));

            // Generate a unique collection ID
            const newCollectionId = `col-${Date.now()}-${winIdx}-${oldGroupId}-${Math.floor(Math.random() * 1000)}`;
            const collectionName = group.name || `Imported Group ${oldGroupId}`;

            updatedCollections[newCollectionId] = {
              id: newCollectionId,
              name: collectionName,
              created: Date.now() + importedCollectionsCount, // add offset to keep creation order distinct
              lastModified: Date.now(),
              tabs: tabSnapshots,
              tabIds: []
            };

            importedCollectionsCount++;
            importedTabsCount += tabSnapshots.length;
          });
        });

        // Save back to storage
        const saveResponse = await browser.runtime.sendMessage({
          type: 'saveCollectionsForCleanup',
          collections: updatedCollections
        });

        if (saveResponse && saveResponse.success) {
          showStatus(`Imported ${importedCollectionsCount} collections (${importedTabsCount} tabs) successfully!`);
          // Force a full DOM refresh after import so stale cards are not shown
          collectionsContainer.innerHTML = '';
          await loadCollections();

        } else {
          showStatus('Failed to save imported collections: ' + (saveResponse.error || 'unknown error'), true);
        }

      } catch (err) {
        console.error('Error parsing JSON backup file:', err);
        showStatus('Error parsing backup file. Make sure it is valid JSON.', true);
      }
      targetInput.value = '';
    };

    reader.onerror = function() {
      showStatus('Error reading file.', true);
      targetInput.value = '';
    };

    reader.readAsText(file);

  } catch (err) {
    console.error('Error handling import file change event:', err);
    showStatus('Failed to import backup.', true);
    targetInput.value = '';
  }
}

/**
 * Convert older legacy format (tabGroups or sessionrestore) backup data to panoramaView format.
 */
function convertLegacyBackup(tgData) {
  try {
    const data = {
      file: {
        type: 'panoramaView',
        version: 1
      },
      windows: []
    };

    if (!tgData.windows || !Array.isArray(tgData.windows)) return data;

    tgData.windows.forEach((wi, index) => {
      if (!wi.extData) return;
      const tabviewGroupStr = wi.extData['tabview-group'];
      const tabviewGroupsStr = wi.extData['tabview-groups'];
      if (!tabviewGroupStr || !tabviewGroupsStr) return;

      let tabviewGroup, tabviewGroups;
      try {
        tabviewGroup = JSON.parse(tabviewGroupStr);
        tabviewGroups = JSON.parse(tabviewGroupsStr);
      } catch (parseErr) {
        console.warn('Failed to parse legacy JSON strings in extData:', parseErr);
        return;
      }

      data.windows[index] = {
        groups: [],
        tabs: [],
        activeGroup: tabviewGroups.activeGroupId,
        groupIndex: tabviewGroups.nextID
      };

      // Map groups
      if (Array.isArray(tabviewGroup)) {
        tabviewGroup.forEach((gkey) => {
          data.windows[index].groups.push({
            id: gkey.id,
            name: gkey.title || `Group ${gkey.id}`,
            rect: { x: 0, y: 0, w: 0.25, h: 0.5 }
          });
        });
      } else if (typeof tabviewGroup === 'object') {
        Object.keys(tabviewGroup).forEach((gId) => {
          const gkey = tabviewGroup[gId];
          data.windows[index].groups.push({
            id: gId,
            name: gkey.title || `Group ${gId}`,
            rect: { x: 0, y: 0, w: 0.25, h: 0.5 }
          });
        });
      }

      // Map tabs
      if (wi.tabs && Array.isArray(wi.tabs)) {
        wi.tabs.forEach((tab, tIndex) => {
          let groupId = 0;
          if (tab.pinned === true) {
            groupId = 0;
          } else if (tab.extData && tab.extData['tabview-tab']) {
            try {
              groupId = JSON.parse(tab.extData['tabview-tab']).groupID;
            } catch (e) {
              console.warn('Failed to parse tab groupId from legacy tab extData:', e);
            }
          }

          let url = '';
          let title = '';
          if (tab.entries && Array.isArray(tab.entries) && tab.entries.length > 0) {
            url = tab.entries[0].url || '';
            title = tab.entries[0].title || '';
          } else if (tab.url) {
            url = tab.url;
            title = tab.title || tab.url;
          }

          data.windows[index].tabs.push({
            url: url,
            title: title,
            groupId: groupId,
            index: Number(tIndex),
            pinned: !!tab.pinned
          });
        });
      }
    });

    return data;
  } catch (err) {
    console.error('Error during legacy backup conversion:', err);
    return null;
  }
}
