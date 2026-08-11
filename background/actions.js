/**
 * Background Action Handlers for Tab Collections Manager
 */

/**
 * Returns true if the tab belongs to this extension itself and should never be
 * added to a collection.
 * @param {browser.tabs.Tab} tab
 * @param {string} extensionBaseUrl
 * @returns {boolean}
 */
function isExtensionOwnTab(tab, extensionBaseUrl) {
  return (
    tab.id === window.extensionTabId ||
    (tab.url && tab.url.startsWith(extensionBaseUrl)) ||
    (tab.pendingUrl && tab.pendingUrl.startsWith(extensionBaseUrl))
  );
}

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
      return tab.id !== window.extensionTabId && !(tab.url && tab.url.startsWith(extensionBaseUrl));
    });
    const tabSnapshot = filteredTabs.map((tab, index) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl || '',
      cookieStoreId: tab.cookieStoreId || 'firefox-default',
      index: tab.index,
      active: index === 0
    }));
    
    const position = Object.keys(collections).length;
    // Create collection object
    const newCollection = {
      id: collectionId,
      name: defaultName,
      created: Date.now(),
      lastModified: Date.now(),
      tabs: tabSnapshot,
      tabIds: filteredTabs.map(t => t.id),
      position: position
    };
    
    // Add to collections
    collections[collectionId] = newCollection;
    await saveCollections(collections);
    
    logger.log(`Created default collection: ${defaultName}`, newCollection);
    return newCollection;
  } catch (error) {
    logger.error('Error creating default collection:', error);
    throw error;
  }
}

/**
 * Create a collection from a custom list of tabs
 */
async function createCollectionFromTabs(name, tabs) {
  try {
    const collections = await getCollections();
    const collectionId = `col-${Date.now()}`;
    
    const extensionBaseUrl = browser.runtime.getURL('');
    const filteredTabs = tabs.filter(tab => {
      return tab.id !== window.extensionTabId && !(tab.url && tab.url.startsWith(extensionBaseUrl));
    });
    
    const tabSnapshot = filteredTabs.map((tab, index) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title || 'New Tab',
      favIconUrl: tab.favIconUrl || '',
      cookieStoreId: tab.cookieStoreId || 'firefox-default',
      index: tab.index,
      active: index === 0
    }));
    
    const position = Object.keys(collections).length;
    const newCollection = {
      id: collectionId,
      name: name,
      created: Date.now(),
      lastModified: Date.now(),
      tabs: tabSnapshot,
      tabIds: filteredTabs.map(t => t.id),
      position: position
    };
    
    collections[collectionId] = newCollection;
    await saveCollections(collections);
    
    logger.log(`Created collection "${name}" from tabs:`, newCollection);
    return newCollection;
  } catch (error) {
    logger.error('Error creating collection from tabs:', error);
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
    
    const newCollection = {
      id: collectionId,
      name: defaultName,
      created: Date.now(),
      lastModified: Date.now(),
      tabs: [],
      tabIds: [],
      position: collectionCount
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
    
    logger.log(`Created empty collection: ${defaultName}`, newCollection);
    return newCollection;
  } catch (error) {
    logger.error('Error creating empty collection:', error);
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
    
    // Identify tabs in this collection:
    // 1. Existing tabs that are currently open in this window
    // 2. Saved tabs that need to be created/opened
    const validTabIds = [];
    const tabsToCreate = [];
    
    for (const savedTab of collection.tabs) {
      const realTab = allTabs.find(t => t.id === savedTab.id);
      if (realTab) {
        validTabIds.push(savedTab.id);
      } else {
        tabsToCreate.push(savedTab);
      }
    }
    
    // Open any tabs that do not exist yet
    for (const savedTab of tabsToCreate) {
      try {
        const targetUrl = isRestrictedUrl(savedTab.url) 
          ? getRestrictedFallbackUrl(savedTab.url) 
          : savedTab.url;
        const createParams = {
          url: targetUrl,
          active: savedTab.active || false
        };
        if (savedTab.cookieStoreId) {
          createParams.cookieStoreId = savedTab.cookieStoreId;
        }
        const newTab = await browser.tabs.create(createParams);
        savedTab.id = newTab.id;
        validTabIds.push(newTab.id);
      } catch (err) {
        logger.warn(`[ACTIVATE] Failed to restore tab for URL ${savedTab.url}:`, err);
      }
    }
    
    // Update collection to only have valid tabs
    collection.tabIds = validTabIds;
    
    // Tabs to hide: all tabs NOT in the collection (excluding extension tabs)
    const extensionBaseUrl = browser.runtime.getURL('');
    const tabsToHide = allTabs
      .filter(tab => !validTabIds.includes(tab.id) && tab.id !== window.extensionTabId && !(tab.url && tab.url.startsWith(extensionBaseUrl)))
      .map(tab => tab.id);
    
    // Tabs to show: tabs in the collection
    const tabsToShow = validTabIds;
    
    // Hide tabs not in collection
    if (tabsToHide.length > 0) {
      try {
        logger.log(`[HIDE] Hiding ${tabsToHide.length} tabs:`, tabsToHide.map(id => `[${id}]`).join(' '));
        await browser.tabs.hide(tabsToHide);
        logger.log(`[HIDE] Successfully hid ${tabsToHide.length} tabs`);
      } catch (hideError) {
        logger.warn('[HIDE] Some tabs could not be hidden:', hideError);
      }
    }
    
    // Show tabs in collection
    if (tabsToShow.length > 0) {
      try {
        logger.log(`[SHOW] Showing ${tabsToShow.length} tabs:`, tabsToShow.map(id => `[${id}]`).join(' '));
        await browser.tabs.show(tabsToShow);
        logger.log(`[SHOW] Successfully showed ${tabsToShow.length} tabs`);
      } catch (showError) {
        logger.warn('[SHOW] Some tabs could not be shown:', showError);
      }
    }
    
    // Activate the previously active tab in this collection, or the first one
    if (validTabIds.length > 0) {
      let tabToActivate = null;
      
      const activeTab = collection.tabs.find(tab => tab.active);
      if (activeTab && validTabIds.includes(activeTab.id)) {
        tabToActivate = activeTab;
      }
      
      if (!tabToActivate) {
        tabToActivate = collection.tabs.find(t => validTabIds.includes(t.id));
      }
      
      if (tabToActivate && tabToActivate.id) {
        await browser.tabs.update(tabToActivate.id, { active: true });
      }
    }
    
    // Save the updated collection (with cleaned up tab IDs)
    await saveCollections(collections);
    
    // Set active state
    await setActiveState({ type: 'collection', id: collectionId });
    
    logger.log(`\n=== ACTIVATED COLLECTION ===`);
    logger.log(`Collection: ${collection.name}`);
    logger.log(`Visible tabs (${tabsToShow.length}):`);
    collection.tabs.forEach(tab => {
      logger.log(`  [${tab.id}] ${tab.title || '(Untitled)'} - ${tab.url}`);
    });
    logger.log(`Hidden tabs: ${tabsToHide.length}`);
    logger.log(`===========================\n`);
    
    return collection;
  } catch (error) {
    logger.error('Error activating collection:', error);
    throw error;
  }
}

/**
 * Deactivate current active collection and show all tabs
 */
async function deactivateCollection() {
  try {
    const allTabs = await browser.tabs.query({ currentWindow: true });
    
    // Check if the extension tab is currently active
    const activeTab = allTabs.find(tab => tab.active);
    const isExtensionActive = activeTab && activeTab.id === window.extensionTabId;
    
    // Clear active state
    await setActiveState(null);
    
    if (isExtensionActive) {
      // Keep other tabs hidden while the extension tab is active
      const tabsToHide = allTabs
        .filter(t => t.id !== window.extensionTabId && !t.hidden)
        .map(t => t.id);
      if (tabsToHide.length > 0) {
        try {
          await browser.tabs.hide(tabsToHide);
        } catch (err) {
          logger.warn('Failed to hide tabs while deactivating with active extension:', err);
        }
      }
    } else {
      // Show all tabs
      const tabIds = allTabs.map(tab => tab.id);
      if (tabIds.length > 0) {
        try {
          await browser.tabs.show(tabIds);
        } catch (showError) {
          logger.warn('Some tabs could not be shown:', showError);
        }
      }
    }
    
    logger.log('Deactivated collection - state cleared');
  } catch (error) {
    logger.error('Error deactivating collection:', error);
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
    
    logger.log(`Renamed collection to: ${newName}`);
    return collections[collectionId];
  } catch (error) {
    logger.error('Error renaming collection:', error);
    throw error;
  }
}

/**
 * Delete a collection by ID, closing any open tabs first if needed
 */
async function deleteCollection(collectionId) {
  try {
    const collections = await getCollections();
    const collection = collections[collectionId];
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }
    
    // Close open tabs in the browser
    const allTabs = await browser.tabs.query({});
    const openTabIds = [];
    
    // Find matching open tabs in the browser
    for (const savedTab of collection.tabs) {
      if (savedTab.id !== null && !isNaN(savedTab.id)) {
        const realTab = allTabs.find(t => t.id === savedTab.id);
        if (realTab) {
          openTabIds.push(savedTab.id);
        }
      }
    }
    
    if (openTabIds.length > 0) {
      try {
        await browser.tabs.remove(openTabIds);
      } catch (err) {
        logger.warn(`[DELETE] Failed to remove some tabs in browser:`, err);
      }
    }
    
    // Delete from collections
    delete collections[collectionId];
    await saveCollections(collections);
    
    // If the deleted collection was the active one, deactivate it
    const activeState = await getActiveState();
    if (activeState && activeState.type === 'collection' && activeState.id === collectionId) {
      await deactivateCollection();
    }
    
    logger.log(`Deleted collection: ${collectionId}`);
    
    // Notify all UI scripts of update
    try {
      await browser.runtime.sendMessage({ type: 'collectionsUpdated' });
    } catch (e) {
      // Normal if no dashboard is open
    }
  } catch (error) {
    logger.error('Error deleting collection:', error);
    throw error;
  }
}

/**
 * Activate an empty collection and create a new blank tab for it.
 */
async function activateEmptyCollectionWithNewTab(collectionId) {
  try {
    const collections = await getCollections();
    const collection = collections[collectionId];
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    // 1. Hide all tabs of the currently active collection, if any
    const activeState = await getActiveState();
    if (activeState && activeState.type === 'collection') {
      const activeCol = collections[activeState.id];
      if (activeCol) {
        const allTabs = await browser.tabs.query({ currentWindow: true });
        const openActiveColTabIds = activeCol.tabIds.filter(id => allTabs.some(t => t.id === id));
        if (openActiveColTabIds.length > 0) {
          try {
            await browser.tabs.hide(openActiveColTabIds);
          } catch (hideErr) {
            logger.warn('Failed to hide tabs of previously active collection:', hideErr);
          }
        }
      }
    }

    // 2. Set this collection as the active one
    await setActiveState({ type: 'collection', id: collectionId });

    // 3. Create a new blank tab. The tabs.onCreated listener will automatically
    // add it to this active collection.
    const newTab = await browser.tabs.create({});

    return { success: true, collection };
  } catch (error) {
    logger.error('Error activating empty collection with new tab:', error);
    throw error;
  }
}

/**
 * Update the positions of collections based on a list of collection IDs
 */
async function reorderCollections(orderedCollectionIds) {
  try {
    const collections = await getCollections();
    let modified = false;
    
    orderedCollectionIds.forEach((id, index) => {
      const collection = collections[id];
      if (collection && collection.position !== index) {
        collection.position = index;
        collection.lastModified = Date.now();
        modified = true;
      }
    });
    
    if (modified) {
      await saveCollections(collections);
      
      // Notify other scripts
      try {
        await browser.runtime.sendMessage({ type: 'collectionsUpdated' });
      } catch (e) {
        // Normal if no other page is open
      }
    }
  } catch (error) {
    logger.error('Error reordering collections:', error);
    throw error;
  }
}

/**
 * Move a tab from one collection to another
 */
async function moveTabBetweenCollections(tabId, sourceCollectionId, targetCollectionId) {
  try {
    const collections = await getCollections();
    const sourceCollection = collections[sourceCollectionId];
    const targetCollection = collections[targetCollectionId];
    
    if (!sourceCollection || !targetCollection) {
      return { error: 'Source or target collection not found' };
    }
    
    // Find the tab in the source collection
    const tabIndex = sourceCollection.tabIds.indexOf(tabId);
    const tabObject = sourceCollection.tabs.find(t => t.id === tabId);
    
    if (tabIndex === -1 || !tabObject) {
      return { error: 'Tab not found in source collection' };
    }
    
    // 1. Remove from source collection
    sourceCollection.tabIds.splice(tabIndex, 1);
    sourceCollection.tabs = sourceCollection.tabs.filter(t => t.id !== tabId);
    sourceCollection.lastModified = Date.now();
    
    // 2. Add to target collection
    if (!targetCollection.tabIds.includes(tabId)) {
      targetCollection.tabIds.push(tabId);
      targetCollection.tabs.push(tabObject);
      targetCollection.lastModified = Date.now();
    }
    
    // 3. Save collections to storage
    await saveCollections(collections);
    
    // 4. Update tab visibility and position based on activeState
    const activeState = await getActiveState();
    const allTabs = await browser.tabs.query({ currentWindow: true });
    const tabExists = allTabs.some(t => t.id === tabId);
    
    if (tabExists) {
      if (activeState && activeState.type === 'collection') {
        if (activeState.id === sourceCollectionId) {
          try {
            await browser.tabs.hide(tabId);
          } catch (err) {
            logger.warn('Failed to hide moved tab:', err);
          }
        } else if (activeState.id === targetCollectionId) {
          try {
            await browser.tabs.show(tabId);
            const otherTargetTabs = allTabs.filter(t => targetCollection.tabIds.includes(t.id) && t.id !== tabId);
            if (otherTargetTabs.length > 0) {
              otherTargetTabs.sort((a, b) => a.index - b.index);
              const lastTab = otherTargetTabs[otherTargetTabs.length - 1];
              await browser.tabs.move(tabId, { index: lastTab.index + 1 });
            }
          } catch (err) {
            logger.warn('Failed to show/move target tab:', err);
          }
        }
      }
    }
    
    // 5. Update indexes for all tabs in source and target collections
    // Re-use the already-loaded collections object rather than re-fetching
    const finalTabs = await browser.tabs.query({ currentWindow: true });
    
    const updatedSource = collections[sourceCollectionId];
    if (updatedSource) {
      updatedSource.tabs.forEach(t => {
        const realTab = finalTabs.find(rt => rt.id === t.id);
        if (realTab) t.index = realTab.index;
      });
      updatedSource.lastModified = Date.now();
    }
    
    const updatedTarget = collections[targetCollectionId];
    if (updatedTarget) {
      updatedTarget.tabs.forEach(t => {
        const realTab = finalTabs.find(rt => rt.id === t.id);
        if (realTab) t.index = realTab.index;
      });
      updatedTarget.lastModified = Date.now();
    }
    
    await saveCollections(collections);
    return { success: true };
  } catch (error) {
    logger.error('Error moving tab between collections:', error);
    return { error: error.message };
  }
}

/**
 * Compare collection tabs with live browser state, reconcile any differences.
 * If a tab no longer exists at all, remove it from the list.
 * If anything else doesn't line up, try to update the internal storage based on the actual tab list from firefox extension API.
 */
async function refreshCollection(collectionId) {
  try {
    const collections = await getCollections();
    const collection = collections[collectionId];
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    // Query all open tabs from browser
    const allTabs = await browser.tabs.query({});
    const extensionBaseUrl = browser.runtime.getURL('');
    
    // Filter out extension tabs
    const realTabs = allTabs.filter(tab => tab.url && !tab.url.startsWith(extensionBaseUrl));

    // Map actual tabs by ID for quick lookup
    const openTabsById = {};
    realTabs.forEach(tab => {
      openTabsById[tab.id] = tab;
    });

    // Keep track of which open tabs have been associated/claimed to avoid duplicate mappings
    const claimedTabIds = new Set();
    const reconciledTabs = [];
    
    // First pass: Process tabs that still exist by ID
    for (const savedTab of collection.tabs) {
      if (savedTab.id !== null && openTabsById[savedTab.id]) {
        const actualTab = openTabsById[savedTab.id];
        // Claim this tab ID
        claimedTabIds.add(savedTab.id);
        
        // Update properties from the live tab
        savedTab.url = actualTab.url || savedTab.url;
        savedTab.title = actualTab.title || savedTab.title;
        savedTab.favIconUrl = actualTab.favIconUrl || '';
        savedTab.cookieStoreId = actualTab.cookieStoreId || 'firefox-default';
        savedTab.index = actualTab.index;
        savedTab.active = actualTab.active || false;
        
        reconciledTabs.push(savedTab);
      }
    }

    // Second pass: Process tabs whose ID is null or whose ID no longer exists
    // For these, we try to find an unclaimed open tab with the same URL.
    for (const savedTab of collection.tabs) {
      // If it was already reconciled in first pass, skip
      if (savedTab.id !== null && claimedTabIds.has(savedTab.id)) {
        continue;
      }

      // Find an unclaimed open tab with the same URL
      const matchingTab = realTabs.find(tab => tab.url === savedTab.url && !claimedTabIds.has(tab.id));
      
      if (matchingTab) {
        // Claim this tab ID
        claimedTabIds.add(matchingTab.id);
        
        // Re-associate and update properties
        savedTab.id = matchingTab.id;
        savedTab.title = matchingTab.title || savedTab.title;
        savedTab.favIconUrl = matchingTab.favIconUrl || '';
        savedTab.cookieStoreId = matchingTab.cookieStoreId || 'firefox-default';
        savedTab.index = matchingTab.index;
        savedTab.active = matchingTab.active || false;
        
        reconciledTabs.push(savedTab);
      } else {
        // If the tab had an ID (so it was open) but it no longer exists anywhere, it is removed.
        // If the tab had id === null (saved tab), and we found no open tab, we still keep it in the list as-is.
        if (savedTab.id === null) {
          reconciledTabs.push(savedTab);
        } else {
          logger.log(`[REFRESH] Removing tab ${savedTab.url} (ID ${savedTab.id}) because it no longer exists.`);
        }
      }
    }

    // Update the collection in memory
    collection.tabs = reconciledTabs;
    // Update tabIds list
    collection.tabIds = reconciledTabs.filter(t => t.id !== null).map(t => t.id);
    collection.lastModified = Date.now();

    // Save collections and notify listeners
    await saveCollections(collections);
    
    return collection;
  } catch (error) {
    logger.error('Error refreshing collection:', error);
    throw error;
  }
}

/**
 * Called when a new tab is opened while the extension dashboard is the active tab.
 * Closes the dashboard and restores the active collection's tabs (or all tabs).
 * @param {browser.tabs.Tab} newTab
 * @param {{ type: string, id: string } | null} activeState
 */
async function handleNewTabWhileExtensionActive(newTab, activeState) {
  const extIdToClose = window.extensionTabId;
  window.extensionTabId = null; // Clear early so onRemoved doesn't double-handle
  try {
    await browser.tabs.remove(extIdToClose);
  } catch (err) {
    logger.warn('Failed to remove extension tab:', err);
  }

  if (activeState && activeState.type === 'collection') {
    const collections = await getCollections();
    const collection = collections[activeState.id];
    if (collection) {
      try {
        const allTabs = await browser.tabs.query({ windowId: newTab.windowId });
        const validTabIds = collection.tabIds.filter(id => allTabs.some(t => t.id === id));
        if (validTabIds.length > 0) {
          await browser.tabs.show(validTabIds);
        }
      } catch (showError) {
        logger.warn('Failed to show collection tabs after extension close:', showError);
      }
    }
  } else {
    try {
      const allTabs = await browser.tabs.query({ windowId: newTab.windowId });
      const tabIds = allTabs.map(t => t.id).filter(id => id !== extIdToClose);
      await browser.tabs.show(tabIds);
    } catch (showError) {
      logger.warn('Failed to show all tabs after extension close:', showError);
    }
  }
}

/**
 * Appends the new tab to the active collection, positions it after existing
 * collection tabs, and saves updated indexes to storage.
 * @param {browser.tabs.Tab} tab
 * @param {{ type: string, id: string }} activeState
 */
async function appendTabToActiveCollection(tab, activeState) {
  const collections = await getCollections();
  const collection = collections[activeState.id];
  if (!collection) return;

  const allTabs = await browser.tabs.query({ windowId: tab.windowId });
  const otherGroupTabs = allTabs.filter(t => collection.tabIds.includes(t.id) && t.id !== tab.id);

  if (otherGroupTabs.length > 0) {
    otherGroupTabs.sort((a, b) => a.index - b.index);
    const lastTab = otherGroupTabs[otherGroupTabs.length - 1];
    try {
      await browser.tabs.move(tab.id, { index: lastTab.index + 1 });
    } catch (moveError) {
      logger.warn('Failed to move tab to end of active collection:', moveError);
    }
  }

  try {
    await browser.tabs.update(tab.id, { active: true });
  } catch (updateError) {
    logger.warn('Failed to activate new tab:', updateError);
  }

  const finalTabs = await browser.tabs.query({ windowId: tab.windowId });

  if (!collection.tabIds.includes(tab.id)) {
    collection.tabIds.push(tab.id);
    collection.tabs.push({
      id: tab.id,
      url: tab.url || '',
      title: tab.title || 'New Tab',
      favIconUrl: tab.favIconUrl || '',
      cookieStoreId: tab.cookieStoreId || 'firefox-default',
      index: tab.index,
      active: true
    });
  }

  collection.tabs.forEach(t => {
    const realTab = finalTabs.find(rt => rt.id === t.id);
    if (realTab) t.index = realTab.index;
    t.active = (t.id === tab.id);
  });

  collection.lastModified = Date.now();
  await saveCollections(collections);
}

/**
 * Handle extension page activation - save active tab state and hide other tabs
 */
async function handleExtensionPageActivated(extensionTabId) {
  try {
    logger.log('Extension tab activated');
    
    // Get all tabs in the window
    const allTabs = await browser.tabs.query({ currentWindow: true });
    
    // Before hiding tabs, update the active collection with the previously active tab
    const activeState = await getActiveState();
    if (activeState && activeState.type === 'collection' && window.previouslyActiveTabId) {
      const collections = await getCollections();
      const collection = collections[activeState.id];
      
      if (collection) {
        // Find the tab that was stored when the extension button was clicked
        const previousActiveTab = allTabs.find(t => t.id === window.previouslyActiveTabId);
        
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
            logger.log(`[EXTENSION_OPENED] Marked tab [${previousActiveTab.id}] as active in collection: ${collection.name}`);
          }
        }
      }
    }
    
    // Clear the stored tab ID
    window.previouslyActiveTabId = null;
    
    // Now hide all other tabs
    const tabsToHide = allTabs
      .filter(t => t.id !== extensionTabId && !t.hidden)
      .map(t => t.id);
    
    if (tabsToHide.length > 0) {
      try {
        logger.log(`[HIDE] Hiding ${tabsToHide.length} tabs:`, tabsToHide.map(id => `[${id}]`).join(' '));
        await browser.tabs.hide(tabsToHide);
      } catch (hideError) {
        logger.warn('Some tabs could not be hidden:', hideError);
      }
    }
  } catch (error) {
    logger.error('Error handling extension page activation:', error);
  }
}

/**
 * Open or focus the extension manager tab.
 */
async function openOrFocusExtensionTab() {
  const allTabs = await browser.tabs.query({ currentWindow: true });
  
  if (window.extensionTabId !== null) {
    const extensionTab = allTabs.find(tab => tab.id === window.extensionTabId);
    if (extensionTab) {
      const activeTab = allTabs.find(tab => tab.active);
      if (activeTab && activeTab.id !== window.extensionTabId) {
        window.previouslyActiveTabId = activeTab.id;
      }
      await browser.tabs.update(extensionTab.id, { active: true });
      return;
    }
    // Stale reference — clear it
    window.extensionTabId = null;
  }
  
  const activeTab = allTabs.find(tab => tab.active);
  if (activeTab) {
    window.previouslyActiveTabId = activeTab.id;
  }
  
  window.creatingExtensionTab = true;
  try {
    const newTab = await browser.tabs.create({ url: 'extension/extension.html' });
    window.extensionTabId = newTab.id;
  } finally {
    window.creatingExtensionTab = false;
  }
}
