/**
 * Popup UI Logic for Tab Collections Manager
 */

// ============================================================================
// DOM Elements
// ============================================================================

const createBtn = document.getElementById('createBtn');
const collectionsContainer = document.getElementById('collectionsContainer');
const emptyState = document.getElementById('emptyState');
const loadingMessage = document.getElementById('loadingMessage');
const statusMessage = document.getElementById('statusMessage');

// TAB_GROUP_COLORS, CONTAINER_COLORS, getTabTitle, getTabFavIcon, escapeHtml,
// showStatusMessage, makeDebouncedTabChangeHandler, registerTabAndGroupListeners,
// applyContainerBordersToDOMElements are all provided by shared/utils.js.


// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup loaded');
  await loadCollections();
  setupEventListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
  createBtn.addEventListener('click', handleCreateCollection);

  const debouncedHandler = makeDebouncedTabChangeHandler(() => loadCollections());
  registerTabAndGroupListeners(debouncedHandler);
}



// Listen for updates from background script
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'collectionsUpdated') {
    console.log('[POPUP] Sync change detected, reloading collections...');
    loadCollections();
  }
});

// getTabTitle and getTabFavIcon are provided by shared/utils.js

// ============================================================================
// Collection Management
// ============================================================================

/**
 * Load and display all collections
 */
async function loadCollections() {
  try {
    loadingMessage.style.display = 'block';
    collectionsContainer.innerHTML = '';
    
    // Request collections from background
    const response = await browser.runtime.sendMessage({
      type: 'getCollections'
    });
    
    const collections = response.collections || {};
    const activeState = response.activeState;
    const collectionIds = Object.keys(collections);
    
    collectionIds.sort(makeCollectionSortComparator(collections));
    
    loadingMessage.style.display = 'none';
    
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
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
    
  } catch (error) {
    console.error('Error loading collections:', error);
    loadingMessage.textContent = 'Error loading collections';
    loadingMessage.style.display = 'block';
  }
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
    console.warn('Failed to query tab groups:', e);
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

  // Precompute container information for renderedTabs is handled by shared utility.

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
  
  collectionEl.innerHTML = `
    <div class="collection-header">
      <div class="collection-name">${escapeHtml(collection.name)}</div>
      <span class="collection-badge">${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'}</span>
      <div class="collection-controls">
        <button class="btn btn-small btn-activate ${isActive ? 'active' : ''}" data-action="activate" ${tabCount === 0 ? 'disabled title="Cannot activate an empty collection"' : ''}>
          ${isActive ? '✓ Active' : 'Activate'}
        </button>
      </div>
    </div>
    <div class="collection-tabs">
      ${tabsContentHTML}
    </div>
  `;
  
  // Add event listeners
  const activateBtn = collectionEl.querySelector('[data-action="activate"]');
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
          console.error('Failed to add tab:', err);
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
        console.error('[TABGROUP] Failed to toggle collapse in popup:', err);
      }
    });
  });

  // Apply container borders using shared utility
  const tabEls = Array.from(collectionEl.querySelectorAll('.tab-item'));
  applyContainerBordersToDOMElements(tabEls, renderedTabs, openTabsById, identityMap, groupMap);
  
  collectionsContainer.appendChild(collectionEl);
}

/**
 * Create a new collection from current tabs
 */
async function handleCreateCollection() {
  try {
    createBtn.disabled = true;
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
    console.error('Error creating collection:', error);
    showStatus('Error creating collection: ' + error.message, true);
  } finally {
    createBtn.disabled = false;
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
    console.error('Error activating collection:', error);
    showStatus('Error activating collection: ' + error.message, true);
  }
}

/**
 * Show status message (delegates to shared utility).
 */
function showStatus(message, isError = false) {
  showStatusMessage(statusMessage, message, isError);
}

// escapeHtml is provided by shared/utils.js
