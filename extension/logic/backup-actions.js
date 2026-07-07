/**
 * Backup Actions (Import/Export) for Extension Manager Dashboard
 */

/**
 * Handle importing a JSON backup from the old extension
 */
async function handleImportBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Reset input value so same file can be selected again
  const targetInput = event.target;

  try {
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      showStatus('Invalid file type. Please upload a JSON backup.', true);
      targetInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        let data = JSON.parse(e.target.result);
        let windows = [];

        // Check format
        if (data.file && data.file.type === 'panoramaView' && data.file.version === 1) {
          windows = data.windows || [];
        } else if (((data.version && data.version[0] === 'tabGroups') || (data.version && data.version[0] === 'sessionrestore')) && data.version[1] === 1) {
          const converted = convertLegacyBackup(data);
          windows = converted ? (converted.windows || []) : [];
        } else if (data.groups && Array.isArray(data.groups)) {
          // Simple single window backup format
          windows = [{
            groups: data.groups,
            tabs: data.tabs || []
          }];
        } else {
          showStatus('Unrecognized backup format. Please upload a valid Tab Groups/Panorama backup.', true);
          targetInput.value = '';
          return;
        }

        if (windows.length === 0) {
          showStatus('No groups or windows found in the backup file.', true);
          targetInput.value = '';
          return;
        }

        // Fetch current collections
        const getResponse = await browser.runtime.sendMessage({
          type: 'getCollections'
        });
        const currentCollections = getResponse.collections || {};
        const updatedCollections = { ...currentCollections };

        let importedCollectionsCount = 0;
        let importedTabsCount = 0;

        windows.forEach((wi, winIdx) => {
          const groups = wi.groups || [];
          const tabs = wi.tabs || [];

          // If no groups are explicitly defined but tabs exist, extract them from tabs
          if (groups.length === 0 && tabs.length > 0) {
            const uniqueGroupIds = [...new Set(tabs.map(t => t.groupId).filter(id => id !== undefined && id !== null))];
            uniqueGroupIds.forEach(gId => {
              groups.push({
                id: gId,
                name: `Group ${gId}`
              });
            });
          }

          groups.forEach(group => {
            const oldGroupId = group.id;
            
            // Filter tabs belonging to this group
            const groupTabs = tabs.filter(tab => {
              // Skip extension UI tabs
              const isExtensionTab = tab.url && (
                tab.url.startsWith(browser.runtime.getURL('')) ||
                (tab.url.startsWith('moz-extension://') && (tab.url.includes('/view.html') || tab.url.includes('/popup-view/')))
              );
              if (isExtensionTab) return false;
              
              return String(tab.groupId) === String(oldGroupId);
            });

            // Map tabs to snapshots structure
            const tabSnapshots = groupTabs.map((tab, idx) => ({
              id: null,
              url: tab.url || 'about:blank',
              title: tab.title || tab.url || 'New Tab',
              favIconUrl: '',
              cookieStoreId: tab.cookieStoreId || 'firefox-default',
              index: idx,
              active: idx === 0
            }));

            // Generate a unique collection ID
            const newCollectionId = `col-${Date.now()}-${winIdx}-${oldGroupId}-${Math.floor(Math.random() * 1000)}`;
            const collectionName = group.name || `Imported Group ${oldGroupId}`;

            updatedCollections[newCollectionId] = {
              id: newCollectionId,
              name: collectionName,
              created: Date.now() + importedCollectionsCount, // add offset to keep creation order distinct
              lastModified: Date.now(),
              tabs: tabSnapshots,
              tabIds: []
            };

            importedCollectionsCount++;
            importedTabsCount += tabSnapshots.length;
          });
        });

        // Save back to storage
        const saveResponse = await browser.runtime.sendMessage({
          type: 'saveCollectionsForCleanup',
          collections: updatedCollections
        });

        if (saveResponse && saveResponse.success) {
          showStatus(`Imported ${importedCollectionsCount} collections (${importedTabsCount} tabs) successfully!`);
          // Force a full DOM refresh after import so stale cards are not shown
          window.collectionsContainer.innerHTML = '';
          await loadCollections();

        } else {
          showStatus('Failed to save imported collections: ' + (saveResponse.error || 'unknown error'), true);
        }

      } catch (err) {
        console.error('Error parsing JSON backup file:', err);
        showStatus('Error parsing backup file. Make sure it is valid JSON.', true);
      }
      targetInput.value = '';
    };

    reader.onerror = function() {
      showStatus('Error reading file.', true);
      targetInput.value = '';
    };

    reader.readAsText(file);

  } catch (err) {
    console.error('Error handling import file change event:', err);
    showStatus('Failed to import backup.', true);
    targetInput.value = '';
  }
}

/**
 * Convert older legacy format (tabGroups or sessionrestore) backup data to panoramaView format.
 */
function convertLegacyBackup(tgData) {
  try {
    const data = {
      file: {
        type: 'panoramaView',
        version: 1
      },
      windows: []
    };

    if (!tgData.windows || !Array.isArray(tgData.windows)) return data;

    tgData.windows.forEach((wi, index) => {
      if (!wi.extData) return;
      const tabviewGroupStr = wi.extData['tabview-group'];
      const tabviewGroupsStr = wi.extData['tabview-groups'];
      if (!tabviewGroupStr || !tabviewGroupsStr) return;

      let tabviewGroup, tabviewGroups;
      try {
        tabviewGroup = JSON.parse(tabviewGroupStr);
        tabviewGroups = JSON.parse(tabviewGroupsStr);
      } catch (parseErr) {
        console.warn('Failed to parse legacy JSON strings in extData:', parseErr);
        return;
      }

      data.windows[index] = {
        groups: [],
        tabs: [],
        activeGroup: tabviewGroups.activeGroupId,
        groupIndex: tabviewGroups.nextID
      };

      // Map groups
      if (Array.isArray(tabviewGroup)) {
        tabviewGroup.forEach((gkey) => {
          data.windows[index].groups.push({
            id: gkey.id,
            name: gkey.title || `Group ${gkey.id}`,
            rect: { x: 0, y: 0, w: 0.25, h: 0.5 }
          });
        });
      } else if (typeof tabviewGroup === 'object') {
        Object.keys(tabviewGroup).forEach((gId) => {
          const gkey = tabviewGroup[gId];
          data.windows[index].groups.push({
            id: gId,
            name: gkey.title || `Group ${gId}`,
            rect: { x: 0, y: 0, w: 0.25, h: 0.5 }
          });
        });
      }

      // Map tabs
      if (wi.tabs && Array.isArray(wi.tabs)) {
        wi.tabs.forEach((tab, tIndex) => {
          let groupId = 0;
          if (tab.pinned === true) {
            groupId = 0;
          } else if (tab.extData && tab.extData['tabview-tab']) {
            try {
              groupId = JSON.parse(tab.extData['tabview-tab']).groupID;
            } catch (e) {
              console.warn('Failed to parse tab groupId from legacy tab extData:', e);
            }
          }

          let url = '';
          let title = '';
          if (tab.entries && Array.isArray(tab.entries) && tab.entries.length > 0) {
            url = tab.entries[0].url || '';
            title = tab.entries[0].title || '';
          } else if (tab.url) {
            url = tab.url;
            title = tab.title || tab.url;
          }

          data.windows[index].tabs.push({
            url: url,
            title: title,
            groupId: groupId,
            index: Number(tIndex),
            pinned: !!tab.pinned
          });
        });
      }
    });

    return data;
  } catch (err) {
    console.error('Error during legacy backup conversion:', err);
    return null;
  }
}
