/**
 * Background Event Listeners for Tab Collections Manager
 */

/**
 * Handle tab activation - track activated tabs and watch for extension page
 */
browser.tabs.onActivated.addListener(async (activeInfo) => {
  // Track previous active tab
  const prevTabId = window.activeTabIdByWindow[activeInfo.windowId];
  if (prevTabId && prevTabId !== activeInfo.tabId) {
    window.previousTabIdByWindow[activeInfo.windowId] = prevTabId;
  }
  // Track active tab by window
  window.activeTabIdByWindow[activeInfo.windowId] = activeInfo.tabId;
  
  // Check if the activated tab is the extension tab
  if (activeInfo.tabId === window.extensionTabId) {
    handleExtensionPageActivated(activeInfo.tabId);
  }
});

/**
 * Handle tab removal - clean up extension tab tracking and update collections
 */
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log(`[TAB_REMOVED] Event received for tabId: ${tabId}`);
  queueStorageUpdate(async () => {
    try {
      console.log(`[TAB_REMOVED] Reconciling collections for tabId: ${tabId}`);
      
      // Check if the closed tab was the extension tab
      if (tabId === window.extensionTabId) {
        window.extensionTabId = null;
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
        console.log(`[TAB_REMOVED] Successfully saved updated collections for tabId: ${tabId}`);
      } else {
        console.log(`[TAB_REMOVED] TabId: ${tabId} was not in any collections.`);
      }
    } catch (error) {
      console.error('Error handling tab removal:', error);
    }
  });
});

/**
 * Handle new tab creation
 */
browser.tabs.onCreated.addListener((tab) => {
  queueStorageUpdate(async () => {
    try {
      if (window.creatingExtensionTab) {
        window.extensionTabId = tab.id;
        return;
      }

      const extensionBaseUrl = browser.runtime.getURL('');
      if (isExtensionOwnTab(tab, extensionBaseUrl)) return;

      const activeState = await getActiveState();

      // Detect whether the extension dashboard is currently the active tab
      let isExtensionActive = false;
      if (window.extensionTabId !== null) {
        if (window.activeTabIdByWindow[tab.windowId] === window.extensionTabId ||
            window.previousTabIdByWindow[tab.windowId] === window.extensionTabId) {
          isExtensionActive = true;
        } else {
          const activeTabs = await browser.tabs.query({ windowId: tab.windowId, active: true });
          isExtensionActive = activeTabs.length > 0 && activeTabs[0].id === window.extensionTabId;
        }
      }

      if (isExtensionActive) {
        await handleNewTabWhileExtensionActive(tab, activeState);
      }

      if (activeState && activeState.type === 'collection') {
        await appendTabToActiveCollection(tab, activeState);
      }
    } catch (error) {
      console.error('Error handling tab creation:', error);
    }
  });
});

/**
 * Handle tab updates - update title/URL in collections
 */
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  queueStorageUpdate(async () => {
    try {
      // Check if a tab just updated to become the extension page
      const extensionBaseUrl = browser.runtime.getURL('');
      const isExtensionUrl = (changeInfo.url && changeInfo.url.startsWith(extensionBaseUrl)) || 
                              (tab.url && tab.url.startsWith(extensionBaseUrl));
      if (tabId === window.extensionTabId || isExtensionUrl) {
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

        if (tabId === window.extensionTabId && tab.active) {
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
});

/**
 * Listen for command: open manager
 */
browser.commands.onCommand.addListener(async (command) => {
  if (command === 'open-manager') {
    await openOrFocusExtensionTab();
  }
});

/**
 * Listen for toolbar button click
 */
browser.action.onClicked.addListener(async () => {
  await openOrFocusExtensionTab();
});

/**
 * Open manager tab on extension install.
 * This provides a predictable first-run experience and makes temporary
 * web-ext installs deterministic for e2e automation.
 */
browser.runtime.onInstalled.addListener(async (details) => {
  if (!details || details.reason !== 'install') {
    return;
  }

  try {
    await openOrFocusExtensionTab();
  } catch (error) {
    console.warn('Failed to open manager tab on install:', error);
  }
});

/**
 * Listen for sync storage changes (Firefox Sync)
 */
browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'sync') {
    await handleRemoteChanges(changes);
  }
});
