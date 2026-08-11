/**
 * Collection Actions for Extension Manager Dashboard
 */

/**
 * Show status message using the shared dom utility
 */
function showStatus(message, isError = false) {
  showStatusMessage(window.statusMessage, message, isError);
}

/**
 * Create a new empty collection with a blank tab
 */
async function handleCreateCollection() {
  try {
    window.createBtn.disabled = true;
    logger.log(`[UI] Create collection button clicked`);
    showStatus('Creating collection...', false);
    
    const response = await browser.runtime.sendMessage({
      type: 'createEmptyCollection'
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    logger.log(`[UI] New collection created: ${response.collection.name} with ${response.collection.tabs.length} tab(s)`);
    showStatus(`Created: ${response.collection.name}`, false);
    
    if (!window.e2eNoAutoClose) {
      // Close the extension tab since we've created a new collection
      const extensionTab = await browser.tabs.getCurrent();
      logger.log(`[UI] Closing extension tab [${extensionTab.id}]`);
      await browser.tabs.remove(extensionTab.id);
    }
    
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
    logger.log(`[UI] Clicking activate button for collection: ${collectionId}`);
    const response = await browser.runtime.sendMessage({
      type: 'activateCollection',
      collectionId: collectionId
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    logger.log(`[UI] Collection activated successfully: ${response.collection.name}`);
    showStatus(`Activated: ${response.collection.name}`, false);
    
    if (!window.e2eNoAutoClose) {
      // Close the extension tab since we've activated a collection
      const extensionTab = await browser.tabs.getCurrent();
      logger.log(`[UI] Closing extension tab [${extensionTab.id}]`);
      await browser.tabs.remove(extensionTab.id);
    }
    
  } catch (error) {
    logger.error('Error activating collection:', error);
    showStatus('Error activating collection: ' + error.message, true);
  }
}

/**
 * Delete a collection.
 * Eagerly removes the card from the DOM to prevent race conditions with the
 * tab-removal debounce. On error the card is fully restored via loadCollections().
 */
async function handleDeleteCollection(collection) {
  try {
    const displayTabs = collection.tabs.filter(t => !(t.url && t.url.startsWith(window.extensionBaseUrl)));
    const tabCount = displayTabs.length;
    
    const confirmMsg = tabCount === 0
      ? `Are you sure you want to delete the collection "${collection.name}"?`
      : `Are you sure you want to delete the collection "${collection.name}"? This will delete the collection and close all ${tabCount} tab(s) associated with it in your browser.`;
      
    if (!confirm(confirmMsg)) {
      return;
    }

    // Remove the card from the DOM immediately so it vanishes before background.js
    // closes its tabs (which would fire a debounced loadCollections() that would
    // still see the collection in storage and put the card back).
    const cardEl = window.collectionsContainer.querySelector(`[data-collection-id="${collection.id}"]`);
    if (cardEl) {
      cardEl.remove();
    }
    
    showStatus('Deleting collection...', false);
    const response = await browser.runtime.sendMessage({
      type: 'deleteCollection',
      collectionId: collection.id
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    showStatus(`Deleted collection: ${collection.name}`, false);
    await loadCollections();
  } catch (error) {
    logger.error('Error deleting collection:', error);
    showStatus('Error deleting collection: ' + error.message, true);
    // The card was already removed from the DOM. Reload from storage so it
    // reappears if the deletion did not actually complete.
    await loadCollections();
  }
}

/**
 * Toggle collapse state of a collection
 */
async function handleToggleCollapse(collectionId, collectionEl) {
  try {
    const isCurrentlyCollapsed = collectionEl.dataset.collapsed === 'true';
    const newCollapsedState = !isCurrentlyCollapsed;
    
    logger.log(`[UI] Toggling collapse for collection: ${collectionId}, new state: ${newCollapsedState ? 'collapsed' : 'expanded'}`);
    
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
    
    // If expanding, reapply container borders and refresh tab list
    if (!newCollapsedState) {
      const collection = response.collection;
      if (collection) {
        const showAll = collectionEl.dataset.showAllTabs === 'true';
        await updateTabsList(collectionEl, collection, showAll);
      }
    }
    
    logger.log(`[UI] Collapse state saved for collection: ${collectionId}`);
  } catch (error) {
    logger.error('Error toggling collapse:', error);
    showStatus('Error toggling collapse: ' + error.message, true);
  }
}

/**
 * Collapse all collections
 */
async function handleCollapseAll() {
  try {
    logger.log('[UI] Collapse all button clicked');
    const collectionEls = document.querySelectorAll('.collection-item[data-collection-id]');
    
    // Visually collapse all cards immediately to keep UI responsive
    for (const collectionEl of collectionEls) {
      const tabsSection = collectionEl.querySelector('.collection-tabs');
      const controlsSection = collectionEl.querySelector('.collection-controls');
      const collapseBtn = collectionEl.querySelector('[data-action="toggle-collapse"]');
      
      if (tabsSection) {
        tabsSection.style.display = 'none';
        tabsSection.innerHTML = '';
      }
      if (controlsSection) {
        controlsSection.style.display = 'none';
      }
      if (collapseBtn) {
        collapseBtn.textContent = '▶';
        collapseBtn.title = 'Expand collection';
      }
      collectionEl.dataset.collapsed = 'true';
    }

    // Persist all collapsed states in a single storage update
    const response = await browser.runtime.sendMessage({
      type: 'setAllCollectionsCollapsed',
      collapsed: true
    });
    
    if (response && response.error) {
      throw new Error(response.error);
    }
    
    showStatus('All collections collapsed', false);
  } catch (error) {
    logger.error('Error collapsing all:', error);
    showStatus('Error collapsing all: ' + error.message, true);
  }
}

/**
 * Expand all collections
 */
async function handleExpandAll() {
  try {
    logger.log('[UI] Expand all button clicked');
    
    const response = await browser.runtime.sendMessage({
      type: 'setAllCollectionsCollapsed',
      collapsed: false
    });

    if (response && response.error) {
      throw new Error(response.error);
    }

    // Re-render collections with expanded tabs
    await loadCollections();
    
    showStatus('All collections expanded', false);
  } catch (error) {
    logger.error('Error expanding all:', error);
    showStatus('Error expanding all: ' + error.message, true);
  }
}

/**
 * Handle editing collection name
 */
function handleEditCollectionName(collectionEl, collection) {
  try {
    logger.log(`[UI] Edit button clicked for collection: ${collection.name}`);
    
    const nameEl = collectionEl.querySelector('.collection-name');
    const editBtn = collectionEl.querySelector('[data-action="edit"]');
    const refreshBtn = collectionEl.querySelector('[data-action="refresh"]');
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = collection.name;
    input.className = 'collection-name-input';
    
    // Replace name with input
    nameEl.replaceWith(input);
    editBtn.style.display = 'none';
    if (refreshBtn) refreshBtn.style.display = 'none';
    
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
          logger.log(`[UI] Renaming collection to: ${newName}`);
          const response = await browser.runtime.sendMessage({
            type: 'renameCollection',
            collectionId: collection.id,
            newName: newName
          });
          
          if (!response.error) {
            logger.log(`[UI] Collection renamed successfully`);
            showStatus(`Renamed to: ${newName}`, false);
          }
        } catch (error) {
          logger.error('Error renaming collection:', error);
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
      newNameEl.innerHTML = (collection.hidden ? '<span class="hidden-icon" title="This collection is hidden">👁</span>' : '') + escapeHtml(collection.name);
      input.replaceWith(newNameEl);
      editBtn.style.display = '';
      if (refreshBtn) refreshBtn.style.display = '';
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
    logger.error('Error handling edit:', error);
    showStatus('Error editing collection: ' + error.message, true);
  }
}

/**
 * Compare and refresh collection tabs with live browser state
 */
async function handleRefreshCollection(collectionId) {
  try {
    logger.log(`[UI] Refresh button clicked for collection: ${collectionId}`);
    showStatus('Refreshing collection...', false);
    
    const response = await browser.runtime.sendMessage({
      type: 'refreshCollection',
      collectionId: collectionId
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    logger.log(`[UI] Collection refreshed successfully`);
    showStatus('Collection refreshed successfully', false);
    await loadCollections();
  } catch (error) {
    logger.error('Error refreshing collection:', error);
    showStatus('Error refreshing collection: ' + error.message, true);
  }
}

/**
 * Toggle the hidden state of a collection persistently
 */
async function handleToggleCollectionHidden(collectionId, currentlyHidden) {
  try {
    const action = currentlyHidden ? 'show' : 'hide';
    const confirmMessage = currentlyHidden
      ? 'Are you sure you want to show this collection in the overview?'
      : 'Are you sure you want to hide this collection from the overview? The tabs will remain open.';
      
    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;
    
    logger.log(`[UI] Persistent ${action} for collection: ${collectionId}`);
    showStatus(`${currentlyHidden ? 'Showing' : 'Hiding'} collection...`, false);
    
    const response = await browser.runtime.sendMessage({
      type: 'setCollectionHidden',
      collectionId: collectionId,
      hidden: !currentlyHidden
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    showStatus(`Collection is now ${currentlyHidden ? 'visible' : 'hidden'}`, false);
    await loadCollections();
  } catch (error) {
    logger.error('Error toggling collection hidden state:', error);
    showStatus('Error: ' + error.message, true);
  }
}

/**
 * Show hidden collections temporarily in the current view
 */
async function handleShowAllHidden() {
  try {
    const confirmed = confirm('Are you sure you want to show all hidden collections in the current view?');
    if (!confirmed) return;
    
    logger.log('[UI] Showing hidden collections temporarily');
    window.showHiddenTemporarily = true;
    await loadCollections();
  } catch (error) {
    logger.error('Error showing hidden collections temporarily:', error);
  }
}

/**
 * Create a new collection containing all open tabs that are not currently in any collection
 */
async function handleGroupUnassigned() {
  try {
    logger.log('[UI] Group Unassigned button clicked');
    showStatus('Finding unassigned tabs...', false);
    
    // Request collections from background
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    
    const collections = response.collections || {};
    
    // Get all open tabs in current window (or all windows? Let's check all tabs in browser)
    const allTabs = await browser.tabs.query({});
    
    // Find all assigned tab IDs
    const assignedTabIds = new Set();
    for (const col of Object.values(collections)) {
      if (col.tabs) {
        col.tabs.forEach(st => {
          if (st.id !== null) {
            assignedTabIds.add(st.id);
          }
        });
      }
    }
    
    // Filter unassigned open tabs (exclude extension's own tabs)
    const unassignedTabs = allTabs.filter(tab => {
      if (tab.url && tab.url.startsWith(window.extensionBaseUrl)) {
        return false;
      }
      return !assignedTabIds.has(tab.id);
    });
    
    if (unassignedTabs.length === 0) {
      showStatus('All open tabs are already in collections!', false);
      return;
    }
    
    showStatus(`Grouping ${unassignedTabs.length} unassigned tab(s)...`, false);
    
    // Send message to background to create collection
    const name = `Unassigned Tabs`;
    const createResponse = await browser.runtime.sendMessage({
      type: 'createCollectionFromTabs',
      name: name,
      tabs: unassignedTabs
    });
    
    if (createResponse.error) {
      throw new Error(createResponse.error);
    }
    
    showStatus(`Created collection: ${name}`, false);
    await loadCollections();
  } catch (error) {
    logger.error('Error grouping unassigned tabs:', error);
    showStatus('Error grouping unassigned tabs: ' + error.message, true);
  }
}
