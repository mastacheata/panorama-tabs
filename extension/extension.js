/**
 * Extension Tab UI Entry Logic for Tab Collections Manager
 */

// ============================================================================
// Global UI State & Configuration
// ============================================================================

window.TAB_PREVIEW_LIMIT = 4;
window.extensionBaseUrl = '';
window.showHiddenTemporarily = false;
window.tabIdBeingClosed = null;
window.loadCount = 0;

// Expose DOM elements on window object for shared access
window.createBtn = document.getElementById('createBtn');
window.collapseAllBtn = document.getElementById('collapseAllBtn');
window.expandAllBtn = document.getElementById('expandAllBtn');
window.showHiddenBtn = document.getElementById('showHiddenBtn');
window.importBtn = document.getElementById('importBtn');
window.importInput = document.getElementById('importInput');
window.groupUnassignedBtn = document.getElementById('groupUnassignedBtn');
window.collectionsContainer = document.getElementById('collectionsContainer');
window.loadingMessage = document.getElementById('loadingMessage');
window.statusMessage = document.getElementById('statusMessage');

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize extension page when loaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Extension page loaded');
  
  // Get this extension's base URL to identify its own tabs
  window.extensionBaseUrl = browser.runtime.getURL('');
  console.log('Extension base URL:', window.extensionBaseUrl);
  
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
      .filter(tab => tab.id !== extensionTabId && !(tab.url && tab.url.startsWith(window.extensionBaseUrl)))
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
