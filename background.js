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

// Track if we are currently creating the extension tab
let creatingExtensionTab = false;

// Track the active tab ID for each window
let activeTabIdByWindow = {};

// Initialize active tabs for all windows
browser.tabs.query({ active: true }).then(tabs => {
  tabs.forEach(tab => {
    activeTabIdByWindow[tab.windowId] = tab.id;
  });
}).catch(err => {
  console.warn('Failed to query active tabs on startup:', err);
});

// ============================================================================
// Storage and State Management
// ============================================================================

let isSyncingFromRemote = false;

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
 * Save collections to storage and sync with Firefox Sync
 */
async function saveCollections(collections) {
  await browser.storage.local.set({ tabCollections: collections });
  
  if (!isSyncingFromRemote) {
    try {
      await syncToRemote(collections);
    } catch (err) {
      console.warn('[SYNC] Failed to sync collections to remote:', err);
    }
  }
}

/**
 * Sync minimized collections metadata and tabs to Firefox Sync
 */
async function syncToRemote(collections) {
  const indexKey = 'sync-collection-index';
  const syncData = await browser.storage.sync.get(indexKey);
  const remoteIndex = syncData[indexKey] || { order: [], collections: {} };
  
  const localKeys = Object.keys(collections);
  const newRemoteIndex = {
    order: [...localKeys].sort((a, b) => (collections[a].created || 0) - (collections[b].created || 0)),
    collections: {}
  };
  
  const keysToUpdate = {};
  const keysToRemove = [];
  
  for (const id of localKeys) {
    const localCol = collections[id];
    newRemoteIndex.collections[id] = {
      name: localCol.name,
      created: localCol.created,
      lastModified: localCol.lastModified,
      hidden: localCol.hidden || false,
      collapsed: localCol.collapsed || false
    };
    
    const remoteColMeta = remoteIndex.collections[id];
    if (!remoteColMeta || remoteColMeta.lastModified < localCol.lastModified) {
      keysToUpdate[`sync-col-${id}`] = {
        id: id,
        lastModified: localCol.lastModified,
        tabs: localCol.tabs.map(tab => ({
          url: tab.url,
          index: tab.index,
          active: tab.active || false
        }))
      };
    }
  }
  
  for (const id in remoteIndex.collections) {
    if (!collections[id]) {
      keysToRemove.push(`sync-col-${id}`);
    }
  }
  
  if (Object.keys(keysToUpdate).length > 0) {
    console.log('[SYNC] Uploading updated collections to sync:', Object.keys(keysToUpdate));
    await browser.storage.sync.set(keysToUpdate);
  }
  if (keysToRemove.length > 0) {
    console.log('[SYNC] Removing deleted collections from sync:', keysToRemove);
    await browser.storage.sync.remove(keysToRemove);
  }
  
  const indexChanged = JSON.stringify(newRemoteIndex) !== JSON.stringify(remoteIndex);
  if (indexChanged) {
    console.log('[SYNC] Updating sync index');
    await browser.storage.sync.set({ [indexKey]: newRemoteIndex });
  }
}

/**
 * Handle remote storage changes from Firefox Sync
 */
async function handleRemoteChanges(changes) {
  console.log('[SYNC] Detected sync storage changes:', Object.keys(changes));
  
  isSyncingFromRemote = true;
  try {
    const collections = await getCollections();
    let localModified = false;
    
    const indexKey = 'sync-collection-index';
    if (changes[indexKey]) {
      const newIndex = changes[indexKey].newValue;
      if (newIndex && newIndex.collections) {
        for (const localId in collections) {
          if (!newIndex.collections[localId]) {
            console.log(`[SYNC] Remote deleted collection: ${collections[localId].name}`);
            delete collections[localId];
            localModified = true;
          }
        }
        
        for (const id in newIndex.collections) {
          const remoteMeta = newIndex.collections[id];
          const localCol = collections[id];
          
          if (!localCol) {
            console.log(`[SYNC] Fetching new remote collection: ${remoteMeta.name}`);
            const syncColData = await browser.storage.sync.get(`sync-col-${id}`);
            const remoteCol = syncColData[`sync-col-${id}`];
            if (remoteCol) {
              collections[id] = {
                id: id,
                name: remoteMeta.name,
                created: remoteMeta.created,
                lastModified: remoteMeta.lastModified,
                hidden: remoteMeta.hidden || false,
                collapsed: remoteMeta.collapsed || false,
                tabs: (remoteCol.tabs || []).map(t => ({
                  id: null,
                  url: t.url,
                  title: '',
                  favIconUrl: '',
                  index: t.index,
                  active: t.active || false
                })),
                tabIds: []
              };
              localModified = true;
            }
          } else if (localCol.lastModified < remoteMeta.lastModified) {
            console.log(`[SYNC] Updating metadata for collection: ${remoteMeta.name}`);
            localCol.name = remoteMeta.name;
            localCol.hidden = remoteMeta.hidden || false;
            localCol.collapsed = remoteMeta.collapsed || false;
            localCol.lastModified = remoteMeta.lastModified;
            localModified = true;
          }
        }
      }
    }
    
    for (const key in changes) {
      if (key.startsWith('sync-col-')) {
        const id = key.substring('sync-col-'.length);
        const change = changes[key];
        const newValue = change.newValue;
        
        if (newValue) {
          const localCol = collections[id];
          if (!localCol || localCol.lastModified < newValue.lastModified) {
            console.log(`[SYNC] Integrating updated tabs for collection ID: ${id}`);
            
            const updatedTabs = (newValue.tabs || []).map(t => {
              const existingTab = localCol ? localCol.tabs.find(lt => lt.url === t.url) : null;
              return {
                id: existingTab ? existingTab.id : null,
                url: t.url,
                title: existingTab ? existingTab.title : '',
                favIconUrl: existingTab ? existingTab.favIconUrl : '',
                index: t.index,
                active: t.active || false
              };
            });
            
            if (localCol) {
              localCol.tabs = updatedTabs;
              const allTabs = await browser.tabs.query({});
              localCol.tabIds = updatedTabs
                .map(t => t.id)
                .filter(tid => tid !== null && allTabs.some(rt => rt.id === tid));
              localCol.lastModified = newValue.lastModified;
            } else {
              const indexData = await browser.storage.sync.get('sync-collection-index');
              const idx = indexData['sync-collection-index'] || { collections: {} };
              const meta = idx.collections[id] || { name: 'Synced Collection', created: Date.now() };
              
              collections[id] = {
                id: id,
                name: meta.name,
                created: meta.created,
                lastModified: newValue.lastModified,
                hidden: meta.hidden || false,
                collapsed: meta.collapsed || false,
                tabs: updatedTabs,
                tabIds: []
              };
            }
            localModified = true;
          }
        }
      }
    }
    
    if (localModified) {
      await browser.storage.local.set({ tabCollections: collections });
      console.log('[SYNC] Successfully merged remote changes into local storage');
      
      await reconcileTabIds();
      
      try {
        await browser.runtime.sendMessage({ type: 'collectionsUpdated' });
      } catch (e) {
        // Normal if no extension dashboard page is open
      }
    }
  } catch (error) {
    console.error('[SYNC] Error handling remote changes:', error);
  } finally {
    isSyncingFromRemote = false;
  }
}

/**
 * Reconcile stored tab IDs with actual open tabs in the browser by URL.
 * This runs at startup and whenever sync updates are received.
 */
async function reconcileTabIds() {
  try {
    const collections = await getCollections();
    const allTabs = await browser.tabs.query({});
    
    const openTabsByUrl = {};
    const extensionBaseUrl = browser.runtime.getURL('');
    
    allTabs.forEach(tab => {
      if (tab.url && tab.url.startsWith(extensionBaseUrl)) {
        return;
      }
      if (!openTabsByUrl[tab.url]) {
        openTabsByUrl[tab.url] = [];
      }
      openTabsByUrl[tab.url].push(tab);
    });
    
    let modified = false;
    
    for (const collectionId in collections) {
      const collection = collections[collectionId];
      const updatedTabIds = [];
      
      for (const savedTab of collection.tabs) {
        const urlPool = openTabsByUrl[savedTab.url] || [];
        let matchedTab = null;
        if (urlPool.length > 0) {
          const idMatchIndex = urlPool.findIndex(t => t.id === savedTab.id);
          if (idMatchIndex !== -1) {
            matchedTab = urlPool.splice(idMatchIndex, 1)[0];
          } else {
            matchedTab = urlPool.shift();
          }
        }
        
        if (matchedTab) {
          if (savedTab.id !== matchedTab.id) {
            savedTab.id = matchedTab.id;
            modified = true;
          }
          if (matchedTab.title && savedTab.title !== matchedTab.title) {
            savedTab.title = matchedTab.title;
            modified = true;
          }
          if (matchedTab.favIconUrl && savedTab.favIconUrl !== matchedTab.favIconUrl) {
            savedTab.favIconUrl = matchedTab.favIconUrl;
            modified = true;
          }
          if (matchedTab.cookieStoreId && savedTab.cookieStoreId !== matchedTab.cookieStoreId) {
            savedTab.cookieStoreId = matchedTab.cookieStoreId;
            modified = true;
          }
          updatedTabIds.push(matchedTab.id);
        } else {
          if (savedTab.id !== null) {
            savedTab.id = null;
            modified = true;
          }
        }
      }
      
      const newTabIdsJson = JSON.stringify(updatedTabIds);
      const oldTabIdsJson = JSON.stringify(collection.tabIds || []);
      if (newTabIdsJson !== oldTabIdsJson) {
        collection.tabIds = updatedTabIds;
        modified = true;
      }
    }
    
    if (modified) {
      await browser.storage.local.set({ tabCollections: collections });
      console.log('[RECONCILE] Successfully reconciled tab IDs with open browser tabs');
    }
  } catch (error) {
    console.error('[RECONCILE] Error reconciling tab IDs:', error);
  }
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
      cookieStoreId: tab.cookieStoreId || 'firefox-default',
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
 * Create a collection from a custom list of tabs
 */
async function createCollectionFromTabs(name, tabs) {
  try {
    const collections = await getCollections();
    const collectionId = `col-${Date.now()}`;
    
    const extensionBaseUrl = browser.runtime.getURL('');
    const filteredTabs = tabs.filter(tab => {
      return tab.id !== extensionTabId && !(tab.url && tab.url.startsWith(extensionBaseUrl));
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
    
    const newCollection = {
      id: collectionId,
      name: name,
      created: Date.now(),
      lastModified: Date.now(),
      tabs: tabSnapshot,
      tabIds: filteredTabs.map(t => t.id)
    };
    
    collections[collectionId] = newCollection;
    await saveCollections(collections);
    
    console.log(`Created collection "${name}" from tabs:`, newCollection);
    return newCollection;
  } catch (error) {
    console.error('Error creating collection from tabs:', error);
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
        const createParams = {
          url: savedTab.url,
          active: savedTab.active || false
        };
        if (savedTab.cookieStoreId) {
          createParams.cookieStoreId = savedTab.cookieStoreId;
        }
        const newTab = await browser.tabs.create(createParams);
        savedTab.id = newTab.id;
        validTabIds.push(newTab.id);
      } catch (err) {
        console.warn(`[ACTIVATE] Failed to restore tab for URL ${savedTab.url}:`, err);
      }
    }
    
    // Update collection to only have valid tabs
    collection.tabIds = validTabIds;
    
    // Tabs to hide: all tabs NOT in the collection (excluding extension tabs)
    const extensionBaseUrl = browser.runtime.getURL('');
    const tabsToHide = allTabs
      .filter(tab => !validTabIds.includes(tab.id) && tab.id !== extensionTabId && !(tab.url && tab.url.startsWith(extensionBaseUrl)))
      .map(tab => tab.id);
    
    // Tabs to show: tabs in the collection
    const tabsToShow = validTabIds;
    
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
          // If the source collection was active, this tab is no longer in it, so we must hide it
          try {
            console.log(`[DRAG_MOVE_TAB] Hiding tab ${tabId} as its source collection is active.`);
            await browser.tabs.hide(tabId);
          } catch (err) {
            console.warn('Failed to hide moved tab:', err);
          }
        } else if (activeState.id === targetCollectionId) {
          // If the target collection is active, we must show it and position it at the end
          try {
            console.log(`[DRAG_MOVE_TAB] Showing tab ${tabId} as its target collection is active.`);
            await browser.tabs.show(tabId);
            
            // Find other tabs in target collection
            const otherTargetTabs = allTabs.filter(t => targetCollection.tabIds.includes(t.id) && t.id !== tabId);
            if (otherTargetTabs.length > 0) {
              otherTargetTabs.sort((a, b) => a.index - b.index);
              const lastTab = otherTargetTabs[otherTargetTabs.length - 1];
              await browser.tabs.move(tabId, { index: lastTab.index + 1 });
            }
          } catch (err) {
            console.warn('Failed to show/move target tab:', err);
          }
        }
      }
    }
    
    // 5. Update indexes for all tabs in source and target collections
    const finalTabs = await browser.tabs.query({ currentWindow: true });
    
    // Update source collection tab indexes in storage
    const finalCollections = await getCollections();
    const updatedSource = finalCollections[sourceCollectionId];
    if (updatedSource) {
      updatedSource.tabs.forEach(t => {
        const realTab = finalTabs.find(rt => rt.id === t.id);
        if (realTab) {
          t.index = realTab.index;
        }
      });
      updatedSource.lastModified = Date.now();
    }
    
    // Update target collection tab indexes in storage
    const updatedTarget = finalCollections[targetCollectionId];
    if (updatedTarget) {
      updatedTarget.tabs.forEach(t => {
        const realTab = finalTabs.find(rt => rt.id === t.id);
        if (realTab) {
          t.index = realTab.index;
        }
      });
      updatedTarget.lastModified = Date.now();
    }
    
    await saveCollections(finalCollections);
    console.log(`[DRAG_MOVE_TAB] Successfully moved tab ${tabId} from ${sourceCollectionId} to ${targetCollectionId}`);
    return { success: true };
  } catch (error) {
    console.error('Error moving tab between collections:', error);
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
          console.log(`[REFRESH] Removing tab ${savedTab.url} (ID ${savedTab.id}) because it no longer exists.`);
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
    console.error('Error refreshing collection:', error);
    throw error;
  }
}

// ============================================================================
// Tab Event Listeners
// ============================================================================

/**
 * Handle new tab creation - close extension tab if open, restore active group,
 * and append new tab to the end of the active collection.
 */
browser.tabs.onCreated.addListener(async (tab) => {
  try {
    // If we are currently creating the extension tab, track its ID and exit early
    if (creatingExtensionTab) {
      extensionTabId = tab.id;
      console.log(`Extension tab created (detected via flag), set extensionTabId = ${tab.id}`);
      return;
    }

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
    
    // Check if the extension tab is open and active in the same window
    let isExtensionActive = false;
    if (extensionTabId !== null) {
      if (activeTabIdByWindow[tab.windowId] === extensionTabId) {
        isExtensionActive = true;
      } else {
        const activeTabs = await browser.tabs.query({ windowId: tab.windowId, active: true });
        if (activeTabs.length > 0 && activeTabs[0].id === extensionTabId) {
          isExtensionActive = true;
        }
      }
    }

    if (isExtensionActive) {
      console.log('[NEW_TAB_TRIGGER] New tab created while extension page is active. Closing extension page and restoring active group.');
      
      // Close the extension tab
      const extIdToClose = extensionTabId;
      extensionTabId = null; // Clear reference early
      try {
        await browser.tabs.remove(extIdToClose);
      } catch (err) {
        console.warn('Failed to remove extension tab:', err);
      }

      // Restore/activate collection if one is active
      if (activeState && activeState.type === 'collection') {
        const collections = await getCollections();
        const collection = collections[activeState.id];
        if (collection) {
          // Show all tabs in collection
          try {
            const allTabs = await browser.tabs.query({ windowId: tab.windowId });
            const validTabIds = collection.tabIds.filter(id => allTabs.some(t => t.id === id));
            if (validTabIds.length > 0) {
              await browser.tabs.show(validTabIds);
            }
          } catch (showError) {
            console.warn('Failed to show collection tabs:', showError);
          }
        }
      } else {
        // No active collection: restore all tabs
        try {
          const allTabs = await browser.tabs.query({ windowId: tab.windowId });
          const tabIds = allTabs.map(t => t.id).filter(id => id !== extIdToClose);
          await browser.tabs.show(tabIds);
        } catch (showError) {
          console.warn('Failed to show all tabs:', showError);
        }
      }
    }
    
    // If a collection is active, add this tab to it and position it correctly at the end
    if (activeState && activeState.type === 'collection') {
      const collections = await getCollections();
      const collection = collections[activeState.id];
      
      if (collection) {
        // First query all tabs to find group positions
        const allTabs = await browser.tabs.query({ windowId: tab.windowId });
        
        // Find other tabs in the collection
        const otherGroupTabs = allTabs.filter(t => collection.tabIds.includes(t.id) && t.id !== tab.id);
        
        if (otherGroupTabs.length > 0) {
          // Sort by their current index
          otherGroupTabs.sort((a, b) => a.index - b.index);
          const lastTab = otherGroupTabs[otherGroupTabs.length - 1];
          
          try {
            console.log(`[TAB_MOVE] Moving new tab [${tab.id}] to index ${lastTab.index + 1} (after "${lastTab.title}")`);
            await browser.tabs.move(tab.id, { index: lastTab.index + 1 });
          } catch (moveError) {
            console.warn('Failed to move tab to end of active collection:', moveError);
          }
        }

        // Make sure the new tab is active
        try {
          await browser.tabs.update(tab.id, { active: true });
        } catch (updateError) {
          console.warn('Failed to activate new tab:', updateError);
        }

        // Update collections in storage with new indexes and active state
        const updatedCollections = await getCollections();
        const updatedCollection = updatedCollections[activeState.id];
        if (updatedCollection) {
          // Query tabs again to get final indexes after move
          const finalTabs = await browser.tabs.query({ windowId: tab.windowId });
          
          if (!updatedCollection.tabIds.includes(tab.id)) {
            updatedCollection.tabIds.push(tab.id);
            updatedCollection.tabs.push({
              id: tab.id,
              url: tab.url || '',
              title: tab.title || 'New Tab',
              favIconUrl: tab.favIconUrl || '',
              cookieStoreId: tab.cookieStoreId || 'firefox-default',
              index: tab.index,
              active: true
            });
          }
          
          updatedCollection.tabs.forEach(t => {
            const realTab = finalTabs.find(rt => rt.id === t.id);
            if (realTab) {
              t.index = realTab.index;
            }
            t.active = (t.id === tab.id);
          });
          
          updatedCollection.lastModified = Date.now();
          await saveCollections(updatedCollections);
          console.log(`[TAB_ADDED] Added and moved new tab [${tab.id}] to active collection: ${updatedCollection.name}`);
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
        if (tab.cookieStoreId && tabEntry.cookieStoreId !== tab.cookieStoreId) {
          tabEntry.cookieStoreId = tab.cookieStoreId;
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
      
      case 'moveTabBetweenCollections': {
        const { tabId, sourceCollectionId, targetCollectionId } = message;
        const result = await moveTabBetweenCollections(tabId, sourceCollectionId, targetCollectionId);
        return result;
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

      case 'setCollectionHidden': {
        const collections = await getCollections();
        const collection = collections[message.collectionId];
        
        if (!collection) {
          return { error: 'Collection not found' };
        }
        
        collection.hidden = message.hidden;
        collection.lastModified = Date.now();
        await saveCollections(collections);
        
        return { success: true, collection };
      }

      case 'showAllHiddenCollections': {
        const collections = await getCollections();
        let modified = false;
        for (const id in collections) {
          if (collections[id].hidden) {
            collections[id].hidden = false;
            collections[id].lastModified = Date.now();
            modified = true;
          }
        }
        if (modified) {
          await saveCollections(collections);
        }
        return { success: true, collections };
      }

      case 'refreshCollection': {
        const collection = await refreshCollection(message.collectionId);
        return { success: true, collection };
      }

      case 'createCollectionFromTabs': {
        const newCollection = await createCollectionFromTabs(message.name, message.tabs);
        return { success: true, collection: newCollection };
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
  // Track active tab by window
  activeTabIdByWindow[activeInfo.windowId] = activeInfo.tabId;
  
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
      console.log('[TAB_REMOVED] Extension tab closed. Restoring active collection tabs.');
      
      const activeState = await getActiveState();
      if (activeState && activeState.type === 'collection') {
        const collections = await getCollections();
        const collection = collections[activeState.id];
        if (collection) {
          try {
            const allTabs = await browser.tabs.query({ windowId: removeInfo.windowId });
            const validTabIds = collection.tabIds.filter(id => allTabs.some(t => t.id === id));
            if (validTabIds.length > 0) {
              await browser.tabs.show(validTabIds);
            }
          } catch (showError) {
            console.warn('Failed to restore collection tabs on extension tab close:', showError);
          }
        }
      } else {
        // No active collection: restore all tabs
        try {
          const allTabs = await browser.tabs.query({ windowId: removeInfo.windowId });
          const tabIds = allTabs.map(t => t.id).filter(id => id !== tabId);
          if (tabIds.length > 0) {
            await browser.tabs.show(tabIds);
          }
        } catch (showError) {
          console.warn('Failed to show all tabs on extension tab close:', showError);
        }
      }
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
    creatingExtensionTab = true;
    try {
      const newTab = await browser.tabs.create({
        url: 'extension/extension.html'
      });
      extensionTabId = newTab.id;
    } finally {
      creatingExtensionTab = false;
    }
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
  creatingExtensionTab = true;
  try {
    const newTab = await browser.tabs.create({
      url: 'extension/extension.html'
    });
    extensionTabId = newTab.id;
  } finally {
    creatingExtensionTab = false;
  }
});

// ============================================================================
// Sync Storage Listener and Startup Initialization
// ============================================================================

// Listen for sync storage changes (Firefox Sync)
browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'sync') {
    await handleRemoteChanges(changes);
  }
});

// Reconcile tab IDs on startup to handle browser restarts or sync
reconcileTabIds().catch(err => {
  console.warn('Failed to reconcile tab IDs on startup:', err);
});
