/**
 * Renderer for Action Toolbar Popup
 */

/**
 * Load and display all collections
 */
async function loadCollections() {
  try {
    window.loadingMessage.style.display = 'block';
    window.collectionsContainer.innerHTML = '';
    
    // Request collections from background
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    
    const collections = response.collections || {};
    const activeState = response.activeState;
    const collectionIds = Object.keys(collections);
    
    collectionIds.sort(makeCollectionSortComparator(collections));
    
    window.loadingMessage.style.display = 'none';
    
    // Render each collection
    let visibleCount = 0;
    for (const collectionId of collectionIds) {
      const collection = collections[collectionId];
      if (collection.hidden) {
        continue;
      }
      visibleCount++;
      const isActive = activeState && activeState.type === 'collection' && activeState.id === collectionId;
      await renderCollection(collection, isActive);
    }
    
    if (visibleCount === 0) {
      window.emptyState.style.display = 'block';
    } else {
      window.emptyState.style.display = 'none';
    }
    
  } catch (error) {
    logger.error('Error loading collections:', error);
    window.loadingMessage.textContent = 'Error loading collections';
    window.loadingMessage.style.display = 'block';
  }
}

function createPopupTabItemElement(tab) {
  const tabItem = document.createElement('div');
  tabItem.className = 'tab-item';
  tabItem.dataset.tabId = tab.id;

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
  tabItem.append(tabIcon, tabInfo);
  return tabItem;
}

/**
 * Render a single collection
 */
async function renderCollection(collection, isActive) {
  const collectionEl = document.createElement('div');
  collectionEl.className = `collection-item ${isActive ? 'active' : ''}`;
  collectionEl.dataset.collectionId = collection.id;
  
  // Filter out this extension's tabs from display
  const extensionBaseUrl = browser.runtime.getURL('');
  const displayTabs = collection.tabs
    .filter(tab => !(tab.url && tab.url.startsWith(extensionBaseUrl)));
  const tabCount = displayTabs.length;
  
  // Resolve open tabs and groups in current window
  const openTabs = await browser.tabs.query({ currentWindow: true });
  const openTabsById = {};
  openTabs.forEach(tab => { openTabsById[tab.id] = tab; });

  const identityMap = await queryIdentityMap();

  let tabGroups = [];
  try {
    tabGroups = await browser.tabGroups.query({});
  } catch (e) {
    logger.warn('Failed to query tab groups:', e);
  }
  const groupMap = {};
  tabGroups.forEach(g => { groupMap[g.id] = g; });

  // Group tabs contiguous by groupId
  const groupedItems = [];
  let currentGroupItem = null;

  for (const tab of displayTabs) {
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

  // Filter out tabs in collapsed groups
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
                <div class="tab-item" data-tab-id="${tab.id}">
                  <div class="tab-icon">
                    ${favIcon ? `<img src="${escapeHtml(favIcon)}" alt="">` : ''}
                  </div>
                  <div class="tab-info">
                    <div class="tab-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                    <div class="tab-url" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</div>
                  </div>
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
          <div class="tab-item" data-tab-id="${tab.id}">
            <div class="tab-icon">
              ${favIcon ? `<img src="${escapeHtml(favIcon)}" alt="">` : ''}
            </div>
            <div class="tab-info">
              <div class="tab-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
              <div class="tab-url" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</div>
            </div>
          </div>
        `;
      }
    })
    .join('');
  let tabsContentHTML = tabsHTML;
  if (tabCount === 0) {
    tabsContentHTML = `
      <div class="empty-collection-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px 8px; text-align: center; gap: 8px; border: 1px dashed #ccc; border-radius: 6px; background: #fafafa; margin: 4px 0;">
        <span class="empty-collection-message" style="font-size: 12px; color: #666;">This collection is empty.</span>
        <button class="btn btn-small btn-activate btn-add-tab" data-action="add-tab" style="margin-right: 0; font-weight: 600; padding: 6px 10px; font-size: 12px;">+ New Tab</button>
      </div>
    `;
  }
  
  collectionEl.textContent = '';

  const headerDiv = document.createElement('div');
  headerDiv.className = 'collection-header';

  const nameDiv = document.createElement('div');
  nameDiv.className = 'collection-name';
  nameDiv.textContent = collection.name;

  const badgeSpan = document.createElement('span');
  badgeSpan.className = 'collection-badge';
  badgeSpan.textContent = `${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'}`;

  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'collection-controls';

  const activateBtn = document.createElement('button');
  activateBtn.className = `btn btn-small btn-activate ${isActive ? 'active' : ''}`;
  activateBtn.dataset.action = 'activate';
  activateBtn.textContent = isActive ? '✓ Active' : 'Activate';
  if (tabCount === 0) {
    activateBtn.disabled = true;
    activateBtn.title = 'Cannot activate an empty collection';
  }
  controlsDiv.appendChild(activateBtn);

  headerDiv.append(nameDiv, badgeSpan, controlsDiv);

  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'collection-tabs';

  if (tabCount === 0) {
    const emptyPlaceholder = document.createElement('div');
    emptyPlaceholder.className = 'empty-collection-placeholder';
    emptyPlaceholder.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px 8px; text-align: center; gap: 8px; border: 1px dashed #ccc; border-radius: 6px; background: #fafafa; margin: 4px 0;';

    const emptyMsg = document.createElement('span');
    emptyMsg.className = 'empty-collection-message';
    emptyMsg.style.cssText = 'font-size: 12px; color: #666;';
    emptyMsg.textContent = 'This collection is empty.';

    const addTabBtn = document.createElement('button');
    addTabBtn.className = 'btn btn-small btn-activate btn-add-tab';
    addTabBtn.dataset.action = 'add-tab';
    addTabBtn.style.cssText = 'margin-right: 0; font-weight: 600; padding: 6px 10px; font-size: 12px;';
    addTabBtn.textContent = '+ New Tab';

    emptyPlaceholder.append(emptyMsg, addTabBtn);
    tabsDiv.appendChild(emptyPlaceholder);
  } else {
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
            groupTabsDiv.appendChild(createPopupTabItemElement(tab));
          });
          groupContainer.appendChild(groupTabsDiv);
        }
        tabsDiv.appendChild(groupContainer);
      } else {
        tabsDiv.appendChild(createPopupTabItemElement(item.tab));
      }
    });
  }

  collectionEl.append(headerDiv, tabsDiv);
  
  // Add event listeners
  activateBtn.addEventListener('click', () => handleActivateCollection(collection.id));

  if (tabCount === 0) {
    const addTabBtn = collectionEl.querySelector('[data-action="add-tab"]');
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
          await loadCollections();
        } catch (err) {
          logger.error('Failed to add tab:', err);
          showStatus('Failed to add tab: ' + err.message, true);
          addTabBtn.disabled = false;
        }
      });
    }
  }

  // Bind group collapse/expand toggle
  const groupHeaders = collectionEl.querySelectorAll('[data-action="toggle-group-collapse"]');
  groupHeaders.forEach(header => {
    header.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupId = parseInt(header.dataset.groupId, 10);
      try {
        const group = await browser.tabGroups.get(groupId);
        if (group) {
          await browser.tabGroups.update(groupId, { collapsed: !group.collapsed });
          await loadCollections();
        }
      } catch (err) {
        logger.error('[TABGROUP] Failed to toggle collapse in popup:', err);
      }
    });
  });

  // Apply container borders using shared utility
  const tabEls = Array.from(collectionEl.querySelectorAll('.tab-item'));
  applyContainerBordersToDOMElements(tabEls, renderedTabs, openTabsById, identityMap, groupMap);
  
  window.collectionsContainer.appendChild(collectionEl);
}
