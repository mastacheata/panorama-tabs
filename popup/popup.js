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

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize popup when opened
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup loaded');
  loadCollections();
  setupEventListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
  createBtn.addEventListener('click', handleCreateCollection);
}

// Listen for updates from background script
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'collectionsUpdated') {
    console.log('[POPUP] Sync change detected, reloading collections...');
    loadCollections();
  }
});

/**
 * Get display title for tab, using domain name as fallback if missing
 */
function getTabTitle(tab) {
  if (tab.title && tab.title !== 'New Tab') return tab.title;
  try {
    const hostname = new URL(tab.url).hostname;
    return hostname.replace('www.', '') || 'New Tab';
  } catch (e) {
    return tab.title || 'New Tab';
  }
}

/**
 * Get favicon URL for tab, resolving via Google Favicon service if missing
 */
function getTabFavIcon(tab) {
  if (tab.favIconUrl) return tab.favIconUrl;
  try {
    const hostname = new URL(tab.url).hostname;
    if (hostname) {
      return `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
    }
  } catch (e) {}
  return '';
}

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
    
    loadingMessage.style.display = 'none';
    
    // Render each collection
    let visibleCount = 0;
    collectionIds.forEach(collectionId => {
      const collection = collections[collectionId];
      if (collection.hidden) {
        return;
      }
      visibleCount++;
      const isActive = activeState && activeState.type === 'collection' && activeState.id === collectionId;
      renderCollection(collection, isActive);
    });
    
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
function renderCollection(collection, isActive) {
  const collectionEl = document.createElement('div');
  collectionEl.className = `collection-item ${isActive ? 'active' : ''}`;
  collectionEl.dataset.collectionId = collection.id;
  
  // Filter out this extension's tabs from display
  const extensionBaseUrl = browser.runtime.getURL('');
  const displayTabs = collection.tabs
    .filter(tab => !(tab.url && tab.url.startsWith(extensionBaseUrl)));
  const tabCount = displayTabs.length;
  
  // Build tabs HTML
  const tabsHTML = displayTabs
    .map(tab => {
      const favIcon = getTabFavIcon(tab);
      const title = getTabTitle(tab);
      return `
        <div class="tab-item">
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
  
  collectionEl.innerHTML = `
    <div class="collection-header">
      <div class="collection-name">${escapeHtml(collection.name)}</div>
      <span class="collection-badge">${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'}</span>
      <div class="collection-controls">
        <button class="btn btn-small btn-activate ${isActive ? 'active' : ''}" data-action="activate">
          ${isActive ? '✓ Active' : 'Activate'}
        </button>
      </div>
    </div>
    <div class="collection-tabs">
      ${tabsHTML}
    </div>
  `;
  
  // Add event listeners
  const activateBtn = collectionEl.querySelector('[data-action="activate"]');
  activateBtn.addEventListener('click', () => handleActivateCollection(collection.id));
  
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

// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Show status message
 */
function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${isError ? 'error' : ''}`;
  statusMessage.style.display = 'block';
  
  // Auto-hide after 4 seconds
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 4000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
