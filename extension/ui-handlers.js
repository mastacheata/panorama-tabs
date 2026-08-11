/**
 * UI Event Handlers for Extension Manager Dashboard
 */

/**
 * Setup event listeners
 */
function setupEventListeners() {
  window.createBtn.addEventListener('click', handleCreateCollection);
  window.collapseAllBtn.addEventListener('click', handleCollapseAll);
  window.expandAllBtn.addEventListener('click', handleExpandAll);
  if (window.showHiddenBtn) {
    window.showHiddenBtn.addEventListener('click', handleShowAllHidden);
  }
  if (window.importBtn && window.importInput) {
    window.importBtn.addEventListener('click', () => window.importInput.click());
    window.importInput.addEventListener('change', handleImportBackup);
  }
  if (window.exportBtn) {
    window.exportBtn.addEventListener('click', handleExportBackup);
  }
  if (window.groupUnassignedBtn) {
    window.groupUnassignedBtn.addEventListener('click', handleGroupUnassigned);
  }

  // Dropdown toggle listeners
  const viewOptionsDropdownBtn = document.getElementById('viewOptionsDropdownBtn');
  const backupDropdownBtn = document.getElementById('backupDropdownBtn');

  if (viewOptionsDropdownBtn) {
    viewOptionsDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = viewOptionsDropdownBtn.closest('.dropdown');
      closeAllDropdowns(parent);
      if (parent) parent.classList.toggle('open');
    });
  }

  if (backupDropdownBtn) {
    backupDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = backupDropdownBtn.closest('.dropdown');
      closeAllDropdowns(parent);
      if (parent) parent.classList.toggle('open');
    });
  }

  // Close dropdowns when clicking outside or selecting a dropdown item
  document.addEventListener('click', (e) => {
    if (e.target.closest('.dropdown-item')) {
      closeAllDropdowns();
    } else if (!e.target.closest('.dropdown')) {
      closeAllDropdowns();
    }
  });

  const debouncedHandler = makeDebouncedTabChangeHandler(() => {
    const isEditing = document.querySelector('.collection-name-input') !== null;
    if (isEditing) return;
    if (window.tabIdBeingClosed !== null) {
      logger.log(`[UI] Skipping loadCollections during active tab close for tab ${window.tabIdBeingClosed}`);
      return;
    }
    loadCollections();
  });
  registerTabAndGroupListeners(debouncedHandler);
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
      logger.log('[DRAG] Tab dropped onto its own collection, ignoring.');
      return;
    }
    
    logger.log(`[DRAG] Moving tab ${tabId} from ${sourceCollectionId} to ${targetCollectionId}`);
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
    logger.error('[DRAG] Failed to drop tab:', err);
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
    logger.error('Failed to reorder collections:', err);
    showStatus('Error reordering collections: ' + err.message, true);
  }
}

/**
 * Close all dropdown menus in the header except optional excludeElement
 * @param {HTMLElement} [excludeElement]
 */
function closeAllDropdowns(excludeElement) {
  document.querySelectorAll('.dropdown.open').forEach(dropdown => {
    if (dropdown !== excludeElement) {
      dropdown.classList.remove('open');
    }
  });
}

/**
 * Listen for updates from background script
 */
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'collectionsUpdated') {
    logger.log('[SYNC_UI] Sync change detected, reloading collections...');
    loadCollections();
  }
});
