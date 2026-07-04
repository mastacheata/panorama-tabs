/**
 * Background Service Worker for Tab Collections Manager
 * Handles collection storage, tab state management, and tab hiding/showing
 */

// ============================================================================
// Global State
// ============================================================================

// Store the tab ID that was active before opening the extension page
let previouslyActiveTabId = null;

// Store the extension tab ID when it's created or activated
let extensionTabId = null;

// ============================================================================
// Storage and State Management
// ============================================================================

/**
 * Get all collections from storage
 */
async function getCollections() {
  const data = await browser.storage.local.get('tabCollections');
  return data.tabCollections || {};
}

/**
 * Get active state (which collection or page is active)
 */
async function getActiveState() {
  const data = await browser.storage.local.get('activeState');
  return data.activeState || null;
}

/**
 * Set active state
 */
async function setActiveState(state) {
  await browser.storage.local.set({ activeState: state });
}

/**
 * Save collections to storage
 */
async function saveCollections(collections) {
  await browser.storage.local.set({ tabCollections: collections });
}

// ============================================================================
// Core Collection Management
// ============================================================================

/**
 * Create a default collection from all currently open tabs (except extension tab)
 */
async function createDefaultCollection(tabs) {
  try {
    const collections = await getCollections();
    const defaultName = `Collection 1`;
    const collectionId = `col-${Date.now()}`;
    
    // Snapshot provided tabs - filter out extension tabs and mark first tab as active
    const extensionBaseUrl = browser.runtime.getURL('');
    const filteredTabs = tabs.filter(tab => {
      return tab.id !== extensionTabId && !(tab.url && tab.url.startsWith(extensionBaseUrl));
    });
    const tabSnapshot = filteredTabs.map((tab, index) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl || '',
      index: tab.index,
      active: index === 0
    }));
    
    // Create collection object
    const newCollection = {
      id: collectionId,
      name: defaultName,
      created: Date.now(),
      lastModified: Date.now(),
      tabs: tabSnapshot,
      tabIds: filteredTabs.map(t => t.id)
    };
    
    // Add to collections
    collections[collectionId] = newCollection;
    await saveCollections(collections);
    
    console.log(`Created default collection: ${defaultName}`, newCollection);
    return newCollection;
  } catch (error) {
    console.error('Error creating default collection:', error);
    throw error;
  }
}

/**
 * Create a new empty collection with a blank tab
 */
async function createEmptyCollection() {
  try {
    const collections = await getCollections();
    const collectionCount = Object.keys(collections).length;
    const defaultName = `Collection ${collectionCount + 1}`;
    const collectionId = `col-${Date.now()}`;
    
    // Create collection object first (empty, before creating tab)
    const newCollection = {
      id: collectionId,
      name: defaultName,
      created: Date.now(),
      lastModified: Date.now(),
      tabs: [],
      tabIds: []
    };
    
    // Add to collections and save
    collections[collectionId] = newCollection;
    await saveCollections(collections);
    
    // Set this as the active collection BEFORE creating the tab
    // This way, when the tab is created, the onCreated listener will add it to the new collection
    await setActiveState({ type: 'collection', id: collectionId });
    
    // Now create a new blank tab for this collection
    // The onCreated listener will handle adding it to the active collection
    const newTab = await browser.tabs.create({});
    
    console.log(`Created empty collection: ${defaultName}`, newCollection);
    return newCollection;
  } catch (error) {
    console.error('Error creating empty collection:', error);
    throw error;
  }
}

/**
 * Activate a collection (hide all tabs except those in collection)
 */
async function activateCollection(collectionId) {
  try {
    const collections = await getCollections();
    const collection = collections[collectionId];
    
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }
    
    // Get all tabs in current window
    const allTabs = await browser.tabs.query({ currentWindow: true });
    
    // Get current collection tab IDs and filter out tabs that no longer exist
    const validTabIds = new Set();
    for (const tabId of collection.tabIds) {
      if (allTabs.some(tab => tab.id === tabId)) {
        validTabIds.add(tabId);
      }
    }
    
    // Update collection to only have valid tabs
    collection.tabIds = Array.from(validTabIds);
    collection.tabs = collection.tabs.filter(t => validTabIds.has(t.id));
    
    // Tabs to hide: all tabs NOT in the collection (excluding extension tabs)
    const extensionBaseUrl = browser.runtime.getURL('');
    const tabsToHide = allTabs
      .filter(tab => !validTabIds.has(tab.id) && tab.id !== extensionTabId && !(tab.url && tab.url.startsWith(extensionBaseUrl)))
      .map(tab => tab.id);
    
    // Tabs to show: tabs in the collection
    const tabsToShow = Array.from(validTabIds);
    
    // Hide tabs not in collection
    if (tabsToHide.length > 0) {
      try {
        console.log(`[HIDE] Hiding ${tabsToHide.length} tabs:`, tabsToHide.map(id => `[${id}]`).join(' '));
        await browser.tabs.hide(tabsToHide);
        console.log(`[HIDE] Successfully hid ${tabsToHide.length} tabs`);
      } catch (hideError) {
        console.warn('[HIDE] Some tabs could not be hidden:', hideError);
      }
    }
    
    // Show tabs in collection
    if (tabsToShow.length > 0) {
      try {
        console.log(`[SHOW] Showing ${tabsToShow.length} tabs:`, tabsToShow.map(id => `[${id}]`).join(' '));
        await browser.tabs.show(tabsToShow);
        console.log(`[SHOW] Successfully showed ${tabsToShow.length} tabs`);
      } catch (showError) {
        console.warn('[SHOW] Some tabs could not be shown:', showError);
      }
    }
    
    // Activate the previously active tab in this collection, or the first one
    if (tabsToShow.length > 0) {
      let tabToActivate = null;
      
      // Look for a tab marked as active in this collection
      const activeTab = collection.tabs.find(tab => tab.active);
      if (activeTab && tabsToShow.includes(activeTab.id)) {
        // Find the actual active tab in allTabs
        tabToActivate = allTabs.find(tab => tab.id === activeTab.id);
      }
      
      // Fallback to first visible tab if no active tab found
      if (!tabToActivate) {
        tabToActivate = allTabs.find(tab => tabsToShow.includes(tab.id));
      }
      
      if (tabToActivate) {
        await browser.tabs.update(tabToActivate.id, { active: true });
      }
    }
    
    // Save the updated collection (with cleaned up tab IDs)
    await saveCollections(collections);
    
    // Set active state
    await setActiveState({ type: 'collection', id: collectionId });
    
    console.log(`\n=== ACTIVATED COLLECTION ===`);
    console.log(`Collection: ${collection.name}`);
    console.log(`Visible tabs (${tabsToShow.length}):`);
    collection.tabs.forEach(tab => {
      console.log(`  [${tab.id}] ${tab.title || '(Untitled)'} - ${tab.url}`);
    });
    console.log(`Hidden tabs: ${tabsToHide.length}`);
    console.log(`===========================\n`);
    
    return collection;
  } catch (error) {
    console.error('Error activating collection:', error);
    throw error;
  }
}

/**
 * Deactivate current active collection and show all tabs
 */
async function deactivateCollection() {
  try {
    const allTabs = await browser.tabs.query({ currentWindow: true });
    const tabIds = allTabs.map(tab => tab.id);
    
    // Show all tabs
    if (tabIds.length > 0) {
      try {
        await browser.tabs.show(tabIds);
      } catch (showError) {
        console.warn('Some tabs could not be shown:', showError);
      }
    }
    
    // Clear active state
    await setActiveState(null);
    
    console.log('Deactivated collection - all tabs visible');
  } catch (error) {
    console.error('Error deactivating collection:', error);
    throw error;
  }
}

/**
 * Rename a collection
 */
async function renameCollection(collectionId, newName) {
  try {
    const collections = await getCollections();
    
    if (!collections[collectionId]) {
      throw new Error(`Collection ${collectionId} not found`);
    }
    
    collections[collectionId].name = newName;
    collections[collectionId].lastModified = Date.now();
    await saveCollections(collections);
    
    console.log(`Renamed collection to: ${newName}`);
    return collections[collectionId];
  } catch (error) {
    console.error('Error renaming collection:', error);
    throw error;
  }
}

// ============================================================================
// Tab Event Listeners
// ============================================================================

/**
 * Handle new tab creation - add to active collection if one is active
 */
browser.tabs.onCreated.addListener(async (tab) => {
  try {
    // Don't auto-add extension tabs
    const extensionBaseUrl = browser.runtime.getURL('');
    const isExtensionTab = tab.id === extensionTabId || 
                           (tab.url && tab.url.startsWith(extensionBaseUrl)) || 
                           (tab.pendingUrl && tab.pendingUrl.startsWith(extensionBaseUrl));
    if (isExtensionTab) {
      console.log('Extension tab created, not adding to collection');
      return;
    }
    
    console.log(`[TAB_CREATED] New tab created: [${tab.id}] ${tab.title || '(Untitled)'}`);
    
    const activeState = await getActiveState();
    
    // If a collection is active, add this tab to it
    if (activeState && activeState.type === 'collection') {
      const collections = await getCollections();
      const collection = collections[activeState.id];
      
      if (collection) {
        // Add tab ID if not already there
        if (!collection.tabIds.includes(tab.id)) {
          collection.tabIds.push(tab.id);
          collection.tabs.push({
            id: tab.id,
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl || '',
            index: tab.index,
            active: false
          });
          collection.lastModified = Date.now();
          await saveCollections(collections);
          console.log(`[TAB_ADDED] Added new tab [${tab.id}] to active collection: ${collection.name}`);
        }
      }
    } else {
      console.log(`[TAB_CREATED] No active collection, tab not added to any collection`);
    }
  } catch (error) {
    console.error('Error handling tab creation:', error);
  }
});

/**
 * Handle tab removal - clean up references in collections
 */
browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    const collections = await getCollections();
    let modified = false;
    
    for (const collectionId in collections) {
      const collection = collections[collectionId];
      const tabIndex = collection.tabIds.indexOf(tabId);
      
      if (tabIndex !== -1) {
        collection.tabIds.splice(tabIndex, 1);
        collection.tabs = collection.tabs.filter(t => t.id !== tabId);
        collection.lastModified = Date.now();
        modified = true;
      }
    }
    
    if (modified) {
      await saveCollections(collections);
      console.log(`Cleaned up tab ${tabId} from collections`);
    }
  } catch (error) {
    console.error('Error handling tab removal:', error);
  }
});

/**
 * Handle tab updates - update title/URL in collections
 */
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    // Check if a tab just updated to become the extension page
    const extensionBaseUrl = browser.runtime.getURL('');
    const isExtensionUrl = (changeInfo.url && changeInfo.url.startsWith(extensionBaseUrl)) || 
                            (tab.url && tab.url.startsWith(extensionBaseUrl));
    if (tabId === extensionTabId || isExtensionUrl) {
      // If it is inside any collection, remove it!
      const collections = await getCollections();
      let modified = false;
      
      for (const collectionId in collections) {
        const collection = collections[collectionId];
        const tabIndex = collection.tabIds.indexOf(tabId);
        
        if (tabIndex !== -1) {
          collection.tabIds.splice(tabIndex, 1);
          collection.tabs = collection.tabs.filter(t => t.id !== tabId);
          collection.lastModified = Date.now();
          modified = true;
          console.log(`[CLEANUP] Removed extension tab [${tabId}] from collection: ${collection.name}`);
        }
      }
      
      if (modified) {
        await saveCollections(collections);
      }

      if (tabId === extensionTabId && changeInfo.url && tab.active) {
        handleExtensionPageActivated(tabId);
      }
      return;
    }
    
    // Only update if URL or title changed (for regular tabs)
    if (!changeInfo.url && !changeInfo.title) {
      return;
    }
    
    if (changeInfo.url) {
      console.log(`[TAB_UPDATED] Tab [${tabId}] navigated to: ${changeInfo.url}`);
    }
    if (changeInfo.title) {
      console.log(`[TAB_UPDATED] Tab [${tabId}] title changed to: ${changeInfo.title}`);
    }
    
    const collections = await getCollections();
    let modified = false;
    
    for (const collectionId in collections) {
      const collection = collections[collectionId];
      const tabEntry = collection.tabs.find(t => t.id === tabId);
      
      if (tabEntry) {
        if (changeInfo.url) {
          tabEntry.url = changeInfo.url;
        }
        if (tab.title) {
          tabEntry.title = tab.title;
        }
        collection.lastModified = Date.now();
        modified = true;
      }
    }
    
    if (modified) {
      await saveCollections(collections);
      console.log(`[TAB_UPDATED] Updated tab info in collections`);
    }
  } catch (error) {
    console.error('Error handling tab update:', error);
  }
});

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Listen for messages from popup or other extension pages
 */
browser.runtime.onMessage.addListener(async (message, sender) => {
  try {
    console.log('Background received message:', message.type);
    
    switch (message.type) {
      case 'getCollections': {
        const collections = await getCollections();
        const activeState = await getActiveState();
        return { collections, activeState };
      }
      
      case 'createDefaultCollection': {
        const newCollection = await createDefaultCollection(message.tabs);
        return { success: true, collection: newCollection };
      }
      
      case 'createEmptyCollection': {
        const newCollection = await createEmptyCollection();
        return { success: true, collection: newCollection };
      }
      
      case 'activateCollection': {
        const collection = await activateCollection(message.collectionId);
        return { success: true, collection };
      }
      
      case 'deactivateCollection': {
        await deactivateCollection();
        return { success: true };
      }
      
      case 'renameCollection': {
        const collection = await renameCollection(message.collectionId, message.newName);
        return { success: true, collection };
      }
      
      case 'saveCollectionsForCleanup': {
        await saveCollections(message.collections);
        return { success: true };
      }
      
      case 'setCollectionCollapsed': {
        const collections = await getCollections();
        const collection = collections[message.collectionId];
        
        if (!collection) {
          return { error: 'Collection not found' };
        }
        
        collection.collapsed = message.collapsed;
        collection.lastModified = Date.now();
        await saveCollections(collections);
        
        return { success: true, collection };
      }
      
      default:
        console.warn(`Unknown message type: ${message.type}`);
        return { error: 'Unknown message type' };
    }
  } catch (error) {
    console.error('Error handling message:', error);
    return { error: error.message };
  }
});

/**
 * Handle tab activation - track activated tabs and watch for extension page
 */
browser.tabs.onActivated.addListener(async (activeInfo) => {
  // Check if the activated tab is the extension tab
  if (activeInfo.tabId === extensionTabId) {
    handleExtensionPageActivated(activeInfo.tabId);
  }
});

/**
 * Handle extension page activation - save active tab state and hide other tabs
 */
async function handleExtensionPageActivated(extensionTabId) {
  try {
    console.log('Extension tab activated');
    
    // Get all tabs in the window
    const allTabs = await browser.tabs.query({ currentWindow: true });
    
    // Before hiding tabs, update the active collection with the previously active tab
    const activeState = await getActiveState();
    if (activeState && activeState.type === 'collection' && previouslyActiveTabId) {
      const collections = await getCollections();
      const collection = collections[activeState.id];
      
      if (collection) {
        // Find the tab that was stored when the extension button was clicked
        const previousActiveTab = allTabs.find(t => t.id === previouslyActiveTabId);
        
        if (previousActiveTab && collection.tabIds.includes(previousActiveTab.id)) {
          // Mark this tab as active and all others in the collection as inactive
          let changed = false;
          collection.tabs.forEach(t => {
            const wasActive = t.active;
            t.active = (t.id === previousActiveTab.id);
            if (t.active !== wasActive) {
              changed = true;
            }
          });
          
          if (changed) {
            collection.lastModified = Date.now();
            await saveCollections(collections);
            console.log(`[EXTENSION_OPENED] Marked tab [${previousActiveTab.id}] as active in collection: ${collection.name}`);
          }
        }
      }
    }
    
    // Clear the stored tab ID
    previouslyActiveTabId = null;
    
    // Now hide all other tabs
    const tabsToHide = allTabs
      .filter(t => t.id !== extensionTabId)
      .map(t => t.id);
    
    if (tabsToHide.length > 0) {
      try {
        console.log(`[HIDE] Hiding ${tabsToHide.length} tabs:`, tabsToHide.map(id => `[${id}]`).join(' '));
        await browser.tabs.hide(tabsToHide);
      } catch (hideError) {
        console.warn('Some tabs could not be hidden:', hideError);
      }
    }
  } catch (error) {
    console.error('Error handling extension page activation:', error);
  }
}

/**
 * Handle tab removal - clean up extension tab tracking
 */
browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    console.log(`[TAB_REMOVED] Tab closed: [${tabId}]`);
    
    // Check if the closed tab was the extension tab
    if (tabId === extensionTabId) {
      extensionTabId = null;
      console.log('[TAB_REMOVED] Extension tab closed');
      return;
    }
    
    // First, clean up tab from collections
    const collections = await getCollections();
    let modified = false;
    
    for (const collectionId in collections) {
      const collection = collections[collectionId];
      const tabIndex = collection.tabIds.indexOf(tabId);
      
      if (tabIndex !== -1) {
        collection.tabIds.splice(tabIndex, 1);
        collection.tabs = collection.tabs.filter(t => t.id !== tabId);
        collection.lastModified = Date.now();
        modified = true;
        console.log(`[TAB_REMOVED] Removed tab [${tabId}] from collection: ${collection.name}`);
      }
    }
    
    if (modified) {
      await saveCollections(collections);
    }
  } catch (error) {
    console.error('Error handling tab removal:', error);
  }
});

/**
 * Listen for command: open manager
 */
browser.commands.onCommand.addListener(async (command) => {
  if (command === 'open-manager') {
    const allTabs = await browser.tabs.query({ currentWindow: true });
    
    // Check if extension page is already open by ID
    if (extensionTabId !== null) {
      const extensionTab = allTabs.find(tab => tab.id === extensionTabId);
      if (extensionTab) {
        // Store the currently active tab before switching to extension
        const activeTab = allTabs.find(tab => tab.active);
        if (activeTab && activeTab.id !== extensionTabId) {
          previouslyActiveTabId = activeTab.id;
        }
        // Focus existing extension tab
        await browser.tabs.update(extensionTab.id, { active: true });
        return;
      } else {
        // Extension tab ID is stale, clear it
        extensionTabId = null;
      }
    }
    
    // Store the currently active tab before opening extension
    const activeTab = allTabs.find(tab => tab.active);
    if (activeTab) {
      previouslyActiveTabId = activeTab.id;
    }
    
    // Create new extension tab and store its ID
    const newTab = await browser.tabs.create({
      url: 'extension/extension.html'
    });
    extensionTabId = newTab.id;
  }
});

/**
 * Listen for toolbar button click
 */
browser.action.onClicked.addListener(async () => {
  const allTabs = await browser.tabs.query({ currentWindow: true });
  
  // Check if extension page is already open by ID
  if (extensionTabId !== null) {
    const extensionTab = allTabs.find(tab => tab.id === extensionTabId);
    if (extensionTab) {
      // Store the currently active tab before switching to extension
      const activeTab = allTabs.find(tab => tab.active);
      if (activeTab && activeTab.id !== extensionTabId) {
        previouslyActiveTabId = activeTab.id;
      }
      // Focus existing extension tab
      await browser.tabs.update(extensionTab.id, { active: true });
      return;
    } else {
      // Extension tab ID is stale, clear it
      extensionTabId = null;
    }
  }
  
  // Store the currently active tab before opening extension
  const activeTab = allTabs.find(tab => tab.active);
  if (activeTab) {
    previouslyActiveTabId = activeTab.id;
  }
  
  // Create new extension tab and store its ID
  const newTab = await browser.tabs.create({
    url: 'extension/extension.html'
  });
  extensionTabId = newTab.id;
});
