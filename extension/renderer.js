/**
 * Renderer for Extension Manager Dashboard
 */

/**
 * Load and display all collections.
 */
async function loadCollections() {
  const currentLoadId = ++window.loadCount;
  try {
    window.loadingMessage.style.display = 'block';
    
    // Request collections from background
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    
    if (currentLoadId !== window.loadCount) return;
    
    window.loadingMessage.style.display = 'none';
    
    const collections = response.collections || {};
    const activeState = response.activeState;
    const collectionIds = Object.keys(collections);

    if (collectionIds.length === 0) {
      window.collectionsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 64px 24px; color: #999;">No collections yet.</div>';
      if (window.showHiddenBtn) {
        window.showHiddenBtn.style.display = 'none';
      }
      return;
    }
    
    // Sort collection IDs
    collectionIds.sort(makeCollectionSortComparator(collections));
    
    let hasHidden = false;
    let visibleCount = 0;
    
    // Get all existing collection elements in DOM
    const existingEls = {};
    window.collectionsContainer.querySelectorAll('.collection-item').forEach(el => {
      const id = el.dataset.collectionId;
      if (id) {
        existingEls[id] = el;
      }
    });
    
    const orderedEls = [];
    
    for (const collectionId of collectionIds) {
      if (currentLoadId !== window.loadCount) return;
      const collection = collections[collectionId];
      if (collection.hidden) {
        hasHidden = true;
        if (!window.showHiddenTemporarily) {
          // If it exists in DOM but should be hidden now, remove it
          if (existingEls[collectionId]) {
            existingEls[collectionId].remove();
            delete existingEls[collectionId];
          }
          continue;
        }
      }
      visibleCount++;
      const isActive = activeState && activeState.type === 'collection' && activeState.id === collectionId;
      
      let collectionEl = existingEls[collectionId];
      if (!collectionEl) {
        collectionEl = createCollectionEl(collectionId);
      }
      
      await updateCollectionEl(collectionEl, collection, isActive, true);
      orderedEls.push(collectionEl);
      delete existingEls[collectionId];
    }
    
    // Remove deleted/leftover collections
    for (const id in existingEls) {
      existingEls[id].remove();
    }
    
    if (visibleCount === 0) {
      window.collectionsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 64px 24px; color: #999;">No collections yet.</div>';
    } else {
      // Remove any placeholder/empty messages if they exist
      const emptyMsg = window.collectionsContainer.querySelector('div[style*="text-align: center"]');
      if (emptyMsg) {
        emptyMsg.remove();
      }
      
      // Reorder cards in collectionsContainer to match orderedEls
      orderedEls.forEach((el, index) => {
        if (window.collectionsContainer.children[index] !== el) {
          window.collectionsContainer.insertBefore(el, window.collectionsContainer.children[index] || null);
        }
      });
    }
    
    if (!hasHidden) {
      window.showHiddenTemporarily = false;
    }
    
    if (window.showHiddenBtn) {
      window.showHiddenBtn.style.display = (hasHidden && !window.showHiddenTemporarily) ? 'inline-block' : 'none';
    }
    
  } catch (error) {
    logger.error('Error loading collections:', error);
    window.loadingMessage.textContent = 'Error loading collections';
    window.loadingMessage.style.display = 'block';
  }
}

/**
 * Create a skeleton collection card element and bind its listeners
 */
function createCollectionEl(collectionId) {
  const collectionEl = document.createElement('div');
  collectionEl.className = 'collection-item';
  collectionEl.dataset.collectionId = collectionId;
  collectionEl.dataset.collapsed = 'false';
  collectionEl.dataset.showAllTabs = 'false';
  
  collectionEl.innerHTML = `
    <div class="collection-header">
      <button class="btn-collapse" data-action="toggle-collapse" title="Collapse collection">▼</button>
      <div class="collection-header-title">
        <div class="collection-name"></div>
        <button class="btn-edit-name" data-action="edit" title="Edit collection name">✎</button>
        <button class="btn-refresh" data-action="refresh" title="Compare and refresh collection tabs">↻</button>
      </div>
      <span class="collection-badge">0 tabs</span>
    </div>
    <div class="collection-tabs" style="display: block;">
      <!-- Tabs list will be populated dynamically -->
    </div>
    <div class="collection-controls" style="display: block;">
      <button class="btn btn-small btn-activate" data-action="activate">Activate</button>
      <button class="btn btn-small btn-hide" data-action="toggle-hidden">Hide</button>
      <button class="btn btn-small btn-delete-collection" data-action="delete-collection" title="Delete collection and close its tabs">🗑 Delete</button>
    </div>
  `;
  
  // Bind collapse/expand
  const collapseBtn = collectionEl.querySelector('[data-action="toggle-collapse"]');
  collapseBtn.addEventListener('click', () => {
    const col = collectionEl.collection;
    if (col) {
      handleToggleCollapse(col.id, collectionEl);
    }
  });
  
  // Bind activate
  const activateBtn = collectionEl.querySelector('[data-action="activate"]');
  activateBtn.addEventListener('click', () => {
    const col = collectionEl.collection;
    if (col) {
      handleActivateCollection(col.id);
    }
  });
  
  // Bind toggle hidden
  const toggleHiddenBtn = collectionEl.querySelector('[data-action="toggle-hidden"]');
  if (toggleHiddenBtn) {
    toggleHiddenBtn.addEventListener('click', () => {
      const col = collectionEl.collection;
      if (col) {
        handleToggleCollectionHidden(col.id, col.hidden);
      }
    });
  }
  
  // Bind delete collection
  const deleteCollectionBtn = collectionEl.querySelector('[data-action="delete-collection"]');
  if (deleteCollectionBtn) {
    deleteCollectionBtn.addEventListener('click', () => {
      const col = collectionEl.collection;
      if (col) {
        handleDeleteCollection(col);
      }
    });
  }
  
  // Bind edit name
  const editBtn = collectionEl.querySelector('[data-action="edit"]');
  editBtn.addEventListener('click', () => {
    const col = collectionEl.collection;
    if (col) {
      handleEditCollectionName(collectionEl, col);
    }
  });
  
  // Bind refresh collection
  const refreshBtn = collectionEl.querySelector('[data-action="refresh"]');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const col = collectionEl.collection;
      if (col) {
        handleRefreshCollection(col.id);
      }
    });
  }
  
  // Drop zone listeners for drag and drop
  collectionEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    collectionEl.classList.add('drag-over');
  });

  collectionEl.addEventListener('dragenter', (e) => {
    e.preventDefault();
    collectionEl.classList.add('drag-over');
  });

  collectionEl.addEventListener('dragleave', () => {
    collectionEl.classList.remove('drag-over');
  });

  collectionEl.addEventListener('drop', (e) => {
    const col = collectionEl.collection;
    if (col) {
      handleDropTab(e, col.id, collectionEl);
    }
  });

  // Drag listeners for collection card itself
  collectionEl.draggable = true;
  collectionEl.addEventListener('dragstart', (e) => {
    if (e.target.closest('.tab-item')) {
      return;
    }
    const col = collectionEl.collection;
    if (col) {
      logger.log(`[DRAG_COLL] Drag start for collection: ${col.id}`);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        collectionId: col.id,
        type: 'collection'
      }));
      collectionEl.classList.add('dragging-collection');
    }
  });

  collectionEl.addEventListener('dragend', () => {
    collectionEl.classList.remove('dragging-collection');
  });
  
  return collectionEl;
}

/**
 * Update an existing collection card element in-place with new data
 */
async function updateCollectionEl(collectionEl, collection, isActive, forceTabsUpdate = false) {
  // Store the latest collection reference on the DOM element
  collectionEl.collection = collection;
  
  if (isActive) {
    collectionEl.classList.add('active');
  } else {
    collectionEl.classList.remove('active');
  }
  
  const isCollapsed = collection.collapsed || false;
  collectionEl.dataset.collapsed = isCollapsed ? 'true' : 'false';
  
  const collapseBtn = collectionEl.querySelector('[data-action="toggle-collapse"]');
  if (collapseBtn) {
    collapseBtn.textContent = isCollapsed ? '▶' : '▼';
    collapseBtn.title = isCollapsed ? 'Expand collection' : 'Collapse collection';
  }
  
  const tabsSection = collectionEl.querySelector('.collection-tabs');
  if (tabsSection) {
    tabsSection.style.display = isCollapsed ? 'none' : 'block';
  }
  
  const controlsSection = collectionEl.querySelector('.collection-controls');
  if (controlsSection) {
    controlsSection.style.display = isCollapsed ? 'none' : 'block';
  }
  
  // Skip updating name text if currently editing to avoid cursor disruption
  const isEditing = collectionEl.querySelector('.collection-name-input') !== null;
  if (!isEditing) {
    const nameEl = collectionEl.querySelector('.collection-name');
    if (nameEl) {
      const isHidden = collection.hidden || false;
      nameEl.textContent = '';
      if (isHidden) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'hidden-icon';
        iconSpan.title = 'This collection is hidden';
        iconSpan.textContent = '👁';
        nameEl.appendChild(iconSpan);
      }
      nameEl.appendChild(document.createTextNode(collection.name));
    }
  }
  
  const displayTabs = collection.tabs
    .filter(tab => !(tab.url && tab.url.startsWith(window.extensionBaseUrl)))
    .sort((a, b) => (a.index || 0) - (b.index || 0));
  const tabCount = displayTabs.length;
  
  const badge = collectionEl.querySelector('.collection-badge');
  if (badge) {
    badge.textContent = `${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'}`;
  }
  
  const isHidden = collection.hidden || false;
  const toggleHiddenBtn = collectionEl.querySelector('[data-action="toggle-hidden"]');
  if (toggleHiddenBtn) {
    toggleHiddenBtn.textContent = isHidden ? 'Show' : 'Hide';
    toggleHiddenBtn.title = isHidden ? 'Show collection in overview' : 'Hide collection from overview';
    toggleHiddenBtn.className = `btn btn-small ${isHidden ? 'btn-show' : 'btn-hide'}`;
  }
  
  const activateBtn = collectionEl.querySelector('[data-action="activate"]');
  if (activateBtn) {
    if (tabCount === 0) {
      activateBtn.disabled = true;
      activateBtn.title = 'Cannot activate an empty collection';
      activateBtn.classList.remove('active');
      activateBtn.textContent = 'Activate';
    } else {
      activateBtn.disabled = false;
      activateBtn.title = '';
      if (isActive) {
        activateBtn.classList.add('active');
        activateBtn.textContent = '✓ Active';
      } else {
        activateBtn.classList.remove('active');
        activateBtn.textContent = 'Activate';
      }
    }
  }
  
  // Update the tabs list only if not collapsed to avoid massive DOM rendering overhead
  if (isCollapsed) {
    const tabsContainer = collectionEl.querySelector('.collection-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = '';
    }
  } else {
    const showAll = collectionEl.dataset.showAllTabs === 'true';
    await updateTabsList(collectionEl, collection, showAll);
  }
}

/**
 * Render the HTML for tabs of a collection
 */
async function renderTabsHTML(collection, showAll = false) {
  const freshDisplayTabs = collection.tabs
    .filter(tab => !(tab.url && tab.url.startsWith(window.extensionBaseUrl)))
    .sort((a, b) => (a.index || 0) - (b.index || 0));
  const freshTabCount = freshDisplayTabs.length;
  
  const tabsToShow = showAll ? freshDisplayTabs : freshDisplayTabs.slice(0, window.TAB_PREVIEW_LIMIT);
  
  // Resolve open tabs and groups in current window
  const openTabs = await browser.tabs.query({ currentWindow: true });
  const openTabsById = {};
  openTabs.forEach(tab => {
    openTabsById[tab.id] = tab;
  });

  let tabGroups = [];
  try {
    tabGroups = await browser.tabGroups.query({});
  } catch (e) {
    logger.warn('Failed to query tab groups:', e);
  }
  const groupMap = {};
  tabGroups.forEach(g => {
    groupMap[g.id] = g;
  });

  // Group tabs contiguous by groupId
  const groupedItems = [];
  let currentGroupItem = null;

  for (const tab of tabsToShow) {
    const currentTab = openTabsById[tab.id];
    const groupId = currentTab ? currentTab.groupId : null;
    const group = (groupId && groupId !== browser.tabGroups.TAB_GROUP_ID_NONE) ? groupMap[groupId] : null;

    if (group) {
      if (currentGroupItem && currentGroupItem.type === 'group' && currentGroupItem.groupId === groupId) {
        currentGroupItem.tabs.push(tab);
      } else {
        currentGroupItem = {
          type: 'group',
          groupId: groupId,
          group: group,
          tabs: [tab]
        };
        groupedItems.push(currentGroupItem);
      }
    } else {
      currentGroupItem = null;
      groupedItems.push({
        type: 'tab',
        tab: tab
      });
    }
  }
function createTabItemElement(tab, collectionId) {
  const tabItem = document.createElement('div');
  tabItem.className = 'tab-item';
  tabItem.dataset.tabId = tab.id;
  tabItem.draggable = true;

  const tabIcon = document.createElement('div');
  tabIcon.className = 'tab-icon';
  const favIcon = getTabFavIcon(tab);
  if (favIcon) {
    const img = document.createElement('img');
    img.src = favIcon;
    img.alt = '';
    tabIcon.appendChild(img);
  }

  const tabInfo = document.createElement('div');
  tabInfo.className = 'tab-info';

  const title = getTabTitle(tab);
  const tabTitle = document.createElement('div');
  tabTitle.className = 'tab-title';
  tabTitle.title = title;
  tabTitle.textContent = title;

  const tabUrl = document.createElement('div');
  tabUrl.className = 'tab-url';
  tabUrl.title = tab.url || '';
  tabUrl.textContent = tab.url || '';

  tabInfo.append(tabTitle, tabUrl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-close-tab';
  closeBtn.dataset.action = 'close-tab';
  closeBtn.dataset.tabId = tab.id;
  closeBtn.dataset.tabUrl = tab.url || '';
  closeBtn.dataset.collectionId = collectionId;
  closeBtn.title = 'Close tab';
  closeBtn.textContent = '×';

  tabItem.append(tabIcon, tabInfo, closeBtn);
  return tabItem;
}

  // Generate HTML for grouped items
  const tabsHTML = groupedItems
    .map(item => {
      if (item.type === 'group') {
        const group = item.group;
        const groupColor = TAB_GROUP_COLORS[group.color] || group.color || '#999';
        const isCollapsed = group.collapsed;
        
        let groupTabsHTML = '';
        if (!isCollapsed) {
          groupTabsHTML = item.tabs
            .map(tab => {
              const favIcon = getTabFavIcon(tab);
              const title = getTabTitle(tab);
              return `
                <div class="tab-item" data-tab-id="${tab.id}" draggable="true">
                  <div class="tab-icon">
                    ${favIcon ? `<img src="${escapeHtml(favIcon)}" alt="">` : ''}
                  </div>
                  <div class="tab-info">
                    <div class="tab-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                    <div class="tab-url" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</div>
                  </div>
                  <button class="btn-close-tab" data-action="close-tab" data-tab-id="${tab.id}" data-tab-url="${escapeHtml(tab.url || '')}" data-collection-id="${collection.id}" title="Close tab">×</button>
                </div>
              `;
            })
            .join('');
        }
        
        return `
          <div class="tab-group-container" data-group-id="${group.id}" style="border-left: 3px solid ${groupColor};">
            <div class="tab-group-header" data-action="toggle-group-collapse" data-group-id="${group.id}" title="${isCollapsed ? 'Expand' : 'Collapse'} tab group">
              <span class="tab-group-dot" style="background-color: ${groupColor};"></span>
              <span class="tab-group-title">${escapeHtml(group.title || 'Group')}</span>
              <span class="tab-group-collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
            </div>
            ${!isCollapsed ? `<div class="tab-group-tabs">${groupTabsHTML}</div>` : ''}
          </div>
        `;
      } else {
        const tab = item.tab;
        const favIcon = getTabFavIcon(tab);
        const title = getTabTitle(tab);
        return `
          <div class="tab-item" data-tab-id="${tab.id}" draggable="true">
            <div class="tab-icon">
              ${favIcon ? `<img src="${escapeHtml(favIcon)}" alt="">` : ''}
            </div>
            <div class="tab-info">
              <div class="tab-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
              <div class="tab-url" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</div>
            </div>
            <button class="btn-close-tab" data-action="close-tab" data-tab-id="${tab.id}" data-tab-url="${escapeHtml(tab.url || '')}" data-collection-id="${collection.id}" title="Close tab">×</button>
          </div>
        `;
      }
    })
    .join('');
    
  const renderedTabs = [];
  groupedItems.forEach(item => {
    if (item.type === 'group') {
      if (!item.group.collapsed) {
        renderedTabs.push(...item.tabs);
      }
    } else {
      renderedTabs.push(item.tab);
    }
  });

  let extraInfo = '';
  if (!showAll && freshTabCount > window.TAB_PREVIEW_LIMIT) {
    extraInfo = `<div class="extra-tabs-link" data-action="show-all-tabs" title="Show all tabs">... and ${freshTabCount - window.TAB_PREVIEW_LIMIT} more tabs</div>`;
  } else if (showAll && freshTabCount > window.TAB_PREVIEW_LIMIT) {
    extraInfo = `<div class="extra-tabs-link" data-action="show-less-tabs" title="Show fewer tabs">Show less</div>`;
  }
  
  return { tabsHTML, extraInfo, freshDisplayTabs, renderedTabs };
}

/**
 * Update the DOM tabs list container inside a collection card
 */
async function updateTabsList(collectionEl, collection, showAll) {
  collectionEl.dataset.showAllTabs = showAll ? 'true' : 'false';
  const tabsContainer = collectionEl.querySelector('.collection-tabs');
  const { tabsHTML, extraInfo, freshDisplayTabs, renderedTabs } = await renderTabsHTML(collection, showAll);
  
  if (freshDisplayTabs.length === 0) {
    tabsContainer.innerHTML = `
      <div class="empty-collection-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 12px; text-align: center; gap: 12px; border: 1px dashed #ccc; border-radius: 8px; background: #fafafa; margin: 8px 0;">
        <span class="empty-collection-message" style="font-size: 13px; color: #666;">This collection is empty.</span>
        <button class="btn btn-small btn-activate btn-add-tab" data-action="add-tab" style="margin-right: 0; font-weight: 600;">+ New Tab</button>
      </div>
    `;
    
    const addTabBtn = tabsContainer.querySelector('[data-action="add-tab"]');
    if (addTabBtn) {
      addTabBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        addTabBtn.disabled = true;
        showStatus('Opening new tab...', false);
        try {
          const response = await browser.runtime.sendMessage({
            type: 'addTabToCollection',
            collectionId: collection.id
          });
          if (response.error) {
            throw new Error(response.error);
          }
          // Close the extension page tab upon successful collection switch & new tab opening
          const currentTab = await browser.tabs.getCurrent();
          if (currentTab) {
            await browser.tabs.remove(currentTab.id);
          }
        } catch (err) {
          logger.error('Failed to add tab:', err);
          showStatus('Failed to add tab: ' + err.message, true);
          addTabBtn.disabled = false;
        }
      });
    }
    return;
  }
  
  tabsContainer.textContent = '';
  
  groupedItems.forEach(item => {
    if (item.type === 'group') {
      const group = item.group;
      const groupColor = TAB_GROUP_COLORS[group.color] || group.color || '#999';
      const isCollapsed = group.collapsed;

      const groupContainer = document.createElement('div');
      groupContainer.className = 'tab-group-container';
      groupContainer.dataset.groupId = group.id;
      groupContainer.style.borderLeft = `3px solid ${groupColor}`;

      const groupHeader = document.createElement('div');
      groupHeader.className = 'tab-group-header';
      groupHeader.dataset.action = 'toggle-group-collapse';
      groupHeader.dataset.groupId = group.id;
      groupHeader.title = isCollapsed ? 'Expand' : 'Collapse';

      const groupDot = document.createElement('span');
      groupDot.className = 'tab-group-dot';
      groupDot.style.backgroundColor = groupColor;

      const groupTitle = document.createElement('span');
      groupTitle.className = 'tab-group-title';
      groupTitle.textContent = group.title || 'Group';

      const collapseIcon = document.createElement('span');
      collapseIcon.className = 'tab-group-collapse-icon';
      collapseIcon.textContent = isCollapsed ? '▶' : '▼';

      groupHeader.append(groupDot, groupTitle, collapseIcon);
      groupContainer.appendChild(groupHeader);

      if (!isCollapsed) {
        const groupTabsDiv = document.createElement('div');
        groupTabsDiv.className = 'tab-group-tabs';
        item.tabs.forEach(tab => {
          groupTabsDiv.appendChild(createTabItemElement(tab, collection.id));
        });
        groupContainer.appendChild(groupTabsDiv);
      }
      tabsContainer.appendChild(groupContainer);
    } else {
      tabsContainer.appendChild(createTabItemElement(item.tab, collection.id));
    }
  });

  if (extraInfo) {
    const extraDiv = document.createElement('div');
    extraDiv.className = 'extra-tabs-link';
    if (!showAll) {
      extraDiv.dataset.action = 'show-all-tabs';
      extraDiv.title = 'Show all tabs';
      extraDiv.textContent = `... and ${freshTabCount - window.TAB_PREVIEW_LIMIT} more tabs`;
    } else {
      extraDiv.dataset.action = 'show-less-tabs';
      extraDiv.title = 'Show fewer tabs';
      extraDiv.textContent = 'Show less';
    }
    tabsContainer.appendChild(extraDiv);
  }
  
  // Bind close buttons
  const closeTabBtns = tabsContainer.querySelectorAll('[data-action="close-tab"]');
  closeTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rawTabId = btn.dataset.tabId;
      const tabId = (rawTabId === 'null' || !rawTabId) ? null : parseInt(rawTabId, 10);
      const tabUrl = btn.dataset.tabUrl || '';
      handleCloseTab(tabId, tabUrl, btn.closest('.tab-item'), collectionEl);
    });
  });
  
  // Bind overflow / less links
  const overflowLink = tabsContainer.querySelector('.extra-tabs-link');
  if (overflowLink) {
    overflowLink.addEventListener('click', (e) => {
      e.stopPropagation();
      updateTabsList(collectionEl, collection, !showAll);
    });
  }

  // Bind group collapse/expand toggle
  const groupHeaders = tabsContainer.querySelectorAll('[data-action="toggle-group-collapse"]');
  groupHeaders.forEach(header => {
    header.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupId = parseInt(header.dataset.groupId, 10);
      try {
        const group = await browser.tabGroups.get(groupId);
        if (group) {
          await browser.tabGroups.update(groupId, { collapsed: !group.collapsed });
          await updateTabsList(collectionEl, collection, showAll);
        }
      } catch (err) {
        logger.error('[TABGROUP] Failed to toggle collapse:', err);
      }
    });
  });
  
  // Apply container borders
  const tabItemEls = Array.from(tabsContainer.querySelectorAll('.tab-item'));
  const visibleForBorders = showAll ? renderedTabs : renderedTabs.slice(0, window.TAB_PREVIEW_LIMIT);
  await applyContainerBorders(tabItemEls, visibleForBorders);

  // Bind dragstart/dragend to tab items
  tabItemEls.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      const tabId = parseInt(item.dataset.tabId, 10);
      logger.log(`[DRAG] Drag start for tab ${tabId} in collection ${collection.id}`);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        tabId: tabId,
        sourceCollectionId: collection.id
      }));
      item.classList.add('dragging');
    });
    
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });
  });
}

/**
 * Handle closing a tab and removing it from the collection
 */
async function handleCloseTab(tabId, tabUrl, tabItemEl, collectionEl) {
  const collection = collectionEl.collection;
  if (!collection) return;
  try {
    logger.log(`[UI] Closing tab [${tabId}] (URL: ${tabUrl}) from collection: ${collection.id}`);
    
    if (tabId !== null && !isNaN(tabId)) {
      window.tabIdBeingClosed = tabId;
      try {
        await browser.tabs.remove(tabId);
      } catch (err) {
        logger.warn(`[UI] Tab [${tabId}] was not open or could not be closed in browser:`, err);
      }
    }
    
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    const collections = response.collections || {};
    const col = collections[collection.id];
    
    if (col) {
      if (tabId !== null && !isNaN(tabId)) {
        col.tabs = col.tabs.filter(t => t.id !== tabId);
        col.tabIds = col.tabIds.filter(id => id !== tabId);
      } else if (tabUrl) {
        col.tabs = col.tabs.filter(t => t.url !== tabUrl);
      }
      col.lastModified = Date.now();
      
      await browser.runtime.sendMessage({
        type: 'saveCollectionsForCleanup',
        collections: collections
      });
      
      // Mutate the outer collection reference so updateTabsList sees the change
      collection.tabs = col.tabs;
      collection.tabIds = col.tabIds;
      
      const displayTabs = col.tabs.filter(t => !(t.url && t.url.startsWith(window.extensionBaseUrl)));
      const badge = collectionEl.querySelector('.collection-badge');
      if (badge) {
        badge.textContent = `${displayTabs.length} ${displayTabs.length === 1 ? 'tab' : 'tabs'}`;
      }
      
      const isShowAll = collectionEl.dataset.showAllTabs === 'true';
      await updateTabsList(collectionEl, collection, isShowAll);
      
      showStatus('Tab closed and removed from collection');
    }
  } catch (error) {
    logger.error('Error closing tab:', error);
    showStatus('Error closing tab: ' + error.message, true);
  } finally {
    window.tabIdBeingClosed = null;
  }
}

/**
 * Apply container border styling to all visible tab items in a collection card.
 * Delegates to the shared applyContainerBordersToDOMElements utility.
 * @param {HTMLElement[]} tabItemEls - ordered .tab-item elements
 * @param {Array} visibleTabs - tab snapshot objects in the same order
 */
async function applyContainerBorders(tabItemEls, visibleTabs) {
  try {
    const openTabs = await browser.tabs.query({ currentWindow: true });
    const openTabsById = {};
    openTabs.forEach(tab => { openTabsById[tab.id] = tab; });

    const identityMap = await queryIdentityMap();

    let tabGroups = [];
    try {
      tabGroups = await browser.tabGroups.query({});
    } catch (e) {
      logger.warn('Failed to query tab groups for border painting:', e);
    }
    const groupMap = {};
    tabGroups.forEach(g => { groupMap[g.id] = g; });

    applyContainerBordersToDOMElements(tabItemEls, visibleTabs, openTabsById, identityMap, groupMap);
  } catch (error) {
    logger.error('[CONTAINER] Error applying container borders:', error);
  }
}
