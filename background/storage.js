/**
 * Background Storage and State Management for Tab Collections Manager
 */

// ============================================================================
// Global Shared State
// ============================================================================

window.previouslyActiveTabId = null;
window.extensionTabId = null;
window.creatingExtensionTab = false;
window.activeTabIdByWindow = {};
window.previousTabIdByWindow = {};
window.storageQueue = Promise.resolve();
window.isSyncingFromRemote = false;

// Initialize active tabs for all windows
browser.tabs.query({ active: true }).then(tabs => {
  tabs.forEach(tab => {
    window.activeTabIdByWindow[tab.windowId] = tab.id;
  });
}).catch(err => {
  console.warn('Failed to query active tabs on startup:', err);
});

/**
 * Sequential storage update queue to prevent race conditions during async operations
 */
function queueStorageUpdate(task) {
  window.storageQueue = window.storageQueue.then(async () => {
    try {
      await task();
    } catch (err) {
      console.error('[QUEUE] Error in storage task:', err);
    }
  });
  return window.storageQueue;
}

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
  
  if (!window.isSyncingFromRemote) {
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
  const localKeys = Object.keys(collections);
  const indexKey = 'sync-collection-index';
  const syncData = await browser.storage.sync.get(indexKey);
  const remoteIndex = syncData[indexKey] || { order: [], collections: {} };
  
  /**
   * Build a compact sync metadata object for a single collection.
   * @param {object} col
   * @returns {{ name: string, created: number, lastModified: number, hidden: boolean, collapsed: boolean }}
   */
  function collectionToSyncMeta(col) {
    return {
      name: col.name,
      created: col.created,
      lastModified: col.lastModified,
      hidden: col.hidden || false,
      collapsed: col.collapsed || false
    };
  }

  const sortComparator = (a, b) => {
    const posA = collections[a].position !== undefined ? collections[a].position : (collections[a].created || 0);
    const posB = collections[b].position !== undefined ? collections[b].position : (collections[b].created || 0);
    return posA - posB;
  };

  const newRemoteIndex = {
    order: [...localKeys].sort(sortComparator),
    collections: {}
  };
  
  const keysToUpdate = {};
  const keysToRemove = [];
  
  for (const id of localKeys) {
    const localCol = collections[id];
    newRemoteIndex.collections[id] = collectionToSyncMeta(localCol);
    
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
    await browser.storage.sync.set(keysToUpdate);
  }
  if (keysToRemove.length > 0) {
    await browser.storage.sync.remove(keysToRemove);
  }
  
  const indexChanged = JSON.stringify(newRemoteIndex) !== JSON.stringify(remoteIndex);
  if (indexChanged) {
    await browser.storage.sync.set({ [indexKey]: newRemoteIndex });
  }
}

/**
 * Handle remote storage changes from Firefox Sync
 */
async function handleRemoteChanges(changes) {
  console.log('[SYNC] Detected sync storage changes:', Object.keys(changes));
  
  window.isSyncingFromRemote = true;
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
    window.isSyncingFromRemote = false;
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
