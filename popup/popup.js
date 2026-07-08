/**
 * Popup UI Entry Logic for Tab Collections Manager
 */

// ============================================================================
// DOM Element Bindings
// ============================================================================

window.createBtn = document.getElementById('createBtn');
window.collectionsContainer = document.getElementById('collectionsContainer');
window.emptyState = document.getElementById('emptyState');
window.loadingMessage = document.getElementById('loadingMessage');
window.statusMessage = document.getElementById('statusMessage');

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  logger.log('Popup loaded');
  await loadCollections();
  
  // Setup theme management
  bindThemeToggle('themeToggleBtn');

  setupEventListeners();
});

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Create a new collection from current tabs
 */
async function handleCreateCollection() {
  try {
    window.createBtn.disabled = true;
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
    logger.error('Error creating collection:', error);
    showStatus('Error creating collection: ' + error.message, true);
  } finally {
    window.createBtn.disabled = false;
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
    logger.error('Error activating collection:', error);
    showStatus('Error activating collection: ' + error.message, true);
  }
}

/**
 * Show status message (delegates to shared utility).
 */
function showStatus(message, isError = false) {
  showStatusMessage(window.statusMessage, message, isError);
}
