/**
 * Background Router & Startup Entry for Tab Collections Manager
 */

// ============================================================================
// Message Handlers
// ============================================================================

browser.runtime.onMessage.addListener(async (message, sender) => {
  try {
    logger.log('Background received message:', message.type);
    
    switch (message.type) {
      case 'getCollections': {
        const collections = await getCollections();
        const activeState = await getActiveState();
        return { collections, activeState };
      }
      
      case 'createDefaultCollection': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const newCollection = await createDefaultCollection(message.tabs);
            result = { success: true, collection: newCollection };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }
      
      case 'createEmptyCollection': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const newCollection = await createEmptyCollection();
            result = { success: true, collection: newCollection };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }
      
      case 'addTabToCollection': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const res = await activateEmptyCollectionWithNewTab(message.collectionId);
            result = res;
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }
      
      case 'activateCollection': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const collection = await activateCollection(message.collectionId);
            result = { success: true, collection };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }
      
      case 'deactivateCollection': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            await deactivateCollection();
            result = { success: true };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }
      
      case 'renameCollection': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const collection = await renameCollection(message.collectionId, message.newName);
            result = { success: true, collection };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }

      case 'deleteCollection': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            await deleteCollection(message.collectionId);
            result = { success: true };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }

      case 'reorderCollections': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            await reorderCollections(message.orderedCollectionIds);
            result = { success: true };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }
      
      case 'saveCollectionsForCleanup': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            await saveCollections(message.collections);
            result = { success: true };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }
      
      case 'moveTabBetweenCollections': {
        let result;
        await queueStorageUpdate(async () => {
          const { tabId, sourceCollectionId, targetCollectionId } = message;
          result = await moveTabBetweenCollections(tabId, sourceCollectionId, targetCollectionId);
        });
        return result;
      }
      
      case 'setCollectionCollapsed': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const collections = await getCollections();
            const collection = collections[message.collectionId];
            
            if (!collection) {
              result = { error: 'Collection not found' };
              return;
            }
            
            collection.collapsed = message.collapsed;
            collection.lastModified = Date.now();
            await saveCollections(collections);
            
            result = { success: true, collection };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }

      case 'setAllCollectionsCollapsed': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const collections = await getCollections();
            const now = Date.now();
            for (const collectionId in collections) {
              collections[collectionId].collapsed = !!message.collapsed;
              collections[collectionId].lastModified = now;
            }
            await saveCollections(collections);
            result = { success: true, collections };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }

      case 'setCollectionHidden': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const collections = await getCollections();
            const collection = collections[message.collectionId];
            
            if (!collection) {
              result = { error: 'Collection not found' };
              return;
            }
            
            collection.hidden = message.hidden;
            collection.lastModified = Date.now();
            await saveCollections(collections);
            
            result = { success: true, collection };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }

      case 'showAllHiddenCollections': {
        // UI-only state (showHiddenTemporarily in extension.js)
        return { success: true };
      }

      case 'refreshCollection': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const collection = await refreshCollection(message.collectionId);
            result = { success: true, collection };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }

      case 'createCollectionFromTabs': {
        let result;
        await queueStorageUpdate(async () => {
          try {
            const newCollection = await createCollectionFromTabs(message.name, message.tabs);
            result = { success: true, collection: newCollection };
          } catch (err) {
            result = { error: err.message };
          }
        });
        return result;
      }
      
      default:
        logger.warn(`Unknown message type: ${message.type}`);
        return { error: 'Unknown message type' };
    }
  } catch (error) {
    logger.error('Error handling message:', error);
    return { error: error.message };
  }
});

// Reconcile tab IDs on startup to handle browser restarts or sync
reconcileTabIds().catch(err => {
  logger.warn('Failed to reconcile tab IDs on startup:', err);
});
