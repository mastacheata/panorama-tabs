/**
 * UI Event Handlers for Action Toolbar Popup
 */

/**
 * Setup event listeners
 */
function setupEventListeners() {
  window.createBtn.addEventListener('click', handleCreateCollection);

  const debouncedHandler = makeDebouncedTabChangeHandler(() => loadCollections());
  registerTabAndGroupListeners(debouncedHandler);
}

// Listen for updates from background script
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'collectionsUpdated') {
    logger.log('[POPUP] Sync change detected, reloading collections...');
    loadCollections();
  }
});
