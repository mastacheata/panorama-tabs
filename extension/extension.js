/**
 * Extension Tab UI Logic for Tab Collections Manager
 */

// ============================================================================
// Constants
// ============================================================================

const TAB_PREVIEW_LIMIT = 4;

// ============================================================================
// DOM Elements
// ============================================================================

const createBtn = document.getElementById('createBtn');
const collapseAllBtn = document.getElementById('collapseAllBtn');
const expandAllBtn = document.getElementById('expandAllBtn');
const collectionsContainer = document.getElementById('collectionsContainer');
const loadingMessage = document.getElementById('loadingMessage');
const statusMessage = document.getElementById('statusMessage');

// Store this extension's base URL to filter out only its own tabs
let extensionBaseUrl = '';


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
      
      // Filter out tabs that are no longer open
      collection.tabs = collection.tabs.filter(tab => openTabIds.has(tab.id));
      collection.tabIds = collection.tabs.map(tab => tab.id);
      
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
}

/**
 * Listen for updates from background script
 */
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
      return;
    }
    
    // Render each collection
    collectionIds.sort((a, b) => {
      return collections[a].created - collections[b].created;
    });
    
    collectionIds.forEach(collectionId => {
      const collection = collections[collectionId];
      const isActive = activeState && activeState.type === 'collection' && activeState.id === collectionId;
      renderCollection(collection, isActive);
    });
    
  } catch (error) {
    console.error('Error loading collections:', error);
    loadingMessage.textContent = 'Error loading collections';
    loadingMessage.style.display = 'block';
  }
}

/**
 * Render a single collection
 */
function renderCollection(collection, isActive) {
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
  
  collectionEl.innerHTML = `
    <div class="collection-header">
      <button class="btn-collapse" data-action="toggle-collapse" title="${isCollapsed ? 'Expand' : 'Collapse'} collection">${collapseToggleSymbol}</button>
      <div class="collection-header-title">
        <div class="collection-name">${escapeHtml(collection.name)}</div>
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
    </div>
  `;
  
  // Function to render the tabs list HTML
  function renderTabsHTML(showAll = false) {
    const freshDisplayTabs = collection.tabs
      .filter(tab => !(tab.url && tab.url.startsWith(extensionBaseUrl)))
      .sort((a, b) => (a.index || 0) - (b.index || 0));
    const freshTabCount = freshDisplayTabs.length;
    
    const tabsToShow = showAll ? freshDisplayTabs : freshDisplayTabs.slice(0, TAB_PREVIEW_LIMIT);
    
    const tabsHTML = tabsToShow
      .map(tab => `
        <div class="tab-item" data-tab-id="${tab.id}">
          <div class="tab-icon">
            ${tab.favIconUrl ? `<img src="${escapeHtml(tab.favIconUrl)}" alt="">` : ''}
          </div>
          <div class="tab-info">
            <div class="tab-title">${escapeHtml(tab.title || 'New Tab')}</div>
            <div class="tab-url">${escapeHtml(tab.url || '')}</div>
          </div>
          <button class="btn-close-tab" data-action="close-tab" data-tab-id="${tab.id}" data-collection-id="${collection.id}" title="Close tab">×</button>
        </div>
      `)
      .join('');
      
    let extraInfo = '';
    if (!showAll && freshTabCount > TAB_PREVIEW_LIMIT) {
      extraInfo = `<div class="extra-tabs-link" data-action="show-all-tabs" title="Show all tabs">... and ${freshTabCount - TAB_PREVIEW_LIMIT} more tabs</div>`;
    } else if (showAll && freshTabCount > TAB_PREVIEW_LIMIT) {
      extraInfo = `<div class="extra-tabs-link" data-action="show-less-tabs" title="Show fewer tabs">Show less</div>`;
    }
    
    return { tabsHTML, extraInfo, freshDisplayTabs };
  }
  
  // Function to update the tabs container content dynamically
  function updateTabsList(showAll) {
    collectionEl.dataset.showAllTabs = showAll ? 'true' : 'false';
    const tabsContainer = collectionEl.querySelector('.collection-tabs');
    const { tabsHTML, extraInfo, freshDisplayTabs } = renderTabsHTML(showAll);
    
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
    
    // Apply borders
    applyTabGroupBordersForTabs(freshDisplayTabs, showAll ? freshDisplayTabs.length : TAB_PREVIEW_LIMIT, tabsContainer);
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
        updateTabsList(isShowAll);
        
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
  
  const editBtn = collectionEl.querySelector('[data-action="edit"]');
  editBtn.addEventListener('click', () => handleEditCollectionName(collectionEl, collection));
  
  // Render tabs list initially
  updateTabsList(false);
  
  collectionsContainer.appendChild(collectionEl);
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
    
    const tabItems = tabsContainer.querySelectorAll('.tab-item');
    
    for (let i = 0; i < Math.min(visibleTabs.length, tabItems.length); i++) {
      const savedTab = visibleTabs[i];
      const tabItem = tabItems[i];
      const currentTab = openTabsById[savedTab.id];
      
      if (currentTab && currentTab.groupId && currentTab.groupId !== browser.tabGroups.TAB_GROUP_ID_NONE) {
        try {
          const group = await browser.tabGroups.get(currentTab.groupId);
          if (group) {
            const borderStyle = group.collapsed ? 'dashed' : 'solid';
            const borderColor = group.color || '#999';
            tabItem.style.border = `2px ${borderStyle} ${borderColor}`;
            console.log(`[TABGROUP] Applied ${borderStyle} ${borderColor} border to tab "${savedTab.title}"`);
          }
        } catch (error) {
          console.warn(`[TABGROUP] Could not get tabGroup for tab ${savedTab.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[TABGROUP] Error applying tabGroup borders:', error);
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
      newNameEl.textContent = collection.name;
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
