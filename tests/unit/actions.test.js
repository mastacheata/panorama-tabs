import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createBackgroundContext } from '../setup-mock.js';

describe('background/actions.js Unit Tests', () => {
  let context;
  let browserMock;

  beforeEach(() => {
    const res = createBackgroundContext();
    context = res.context;
    browserMock = res.browserMock;
    
    // Seed extension runtime URL
    browserMock.runtime.getURL.returns('moz-extension://test-uuid/');
  });

  it('isExtensionOwnTab should identify extension own tabs correctly', () => {
    const extBaseUrl = 'moz-extension://test-uuid/';
    
    const normalTab = { id: 123, url: 'https://example.com' };
    const extensionTab = { id: 456, url: 'moz-extension://test-uuid/extension.html' };
    
    assert.strictEqual(!!context.isExtensionOwnTab(normalTab, extBaseUrl), false);
    assert.strictEqual(!!context.isExtensionOwnTab(extensionTab, extBaseUrl), true);
  });

  it('createDefaultCollection should filter extension own tabs and save the new collection', async () => {
    // Seed initial collections in mock storage.local
    browserMock.storage.local.get.withArgs('tabCollections').resolves({
      tabCollections: {}
    });

    // Seed mock remote index get
    browserMock.storage.sync.get.withArgs('sync-collection-index').resolves({
      'sync-collection-index': { order: [], collections: {} }
    });

    const openTabs = [
      { id: 1, url: 'https://google.com', title: 'Google', index: 0 },
      { id: 2, url: 'moz-extension://test-uuid/extension.html', title: 'Dashboard', index: 1 },
      { id: 3, url: 'https://github.com', title: 'GitHub', index: 2 }
    ];

    const result = await context.createDefaultCollection(openTabs);

    assert.strictEqual(result.name, 'Collection 1');
    assert.strictEqual(result.tabs.length, 2);
    assert.strictEqual(result.tabs[0].url, 'https://google.com');
    assert.strictEqual(result.tabs[1].url, 'https://github.com');
    assert.strictEqual(result.tabs[0].active, true, 'First non-extension tab should be active');
    
    // Verify it saved collections
    assert(browserMock.storage.local.set.called);
  });

  it('appendTabToActiveCollection should preserve active state without forcing focus for background tabs', async () => {
    const existingCollection = {
      id: 'col-1',
      name: 'Work',
      tabIds: [10],
      tabs: [{ id: 10, url: 'https://example.com', title: 'Example', index: 0, active: true }]
    };

    browserMock.storage.local.get.withArgs('tabCollections').resolves({
      tabCollections: { 'col-1': existingCollection }
    });

    const openTabsInWindow = [
      { id: 10, url: 'https://example.com', title: 'Example', index: 0, active: true, windowId: 1 },
      { id: 20, url: 'https://github.com', title: 'GitHub', index: 1, active: false, windowId: 1 }
    ];

    browserMock.tabs.query.resolves(openTabsInWindow);

    const newBackgroundTab = {
      id: 20,
      url: 'https://github.com',
      title: 'GitHub',
      index: 1,
      active: false,
      windowId: 1
    };

    await context.appendTabToActiveCollection(newBackgroundTab, { type: 'collection', id: 'col-1' });

    // Should NOT have called tabs.update with active: true for background tab
    assert.strictEqual(browserMock.tabs.update.calledWith(20, { active: true }), false);

    // Should update collection with active: false for the new tab and active: true for the original
    assert(browserMock.storage.local.set.called);
    const savedCollections = browserMock.storage.local.set.firstCall.args[0].tabCollections;
    assert.strictEqual(savedCollections['col-1'].tabIds.includes(20), true);
    const savedNewTab = savedCollections['col-1'].tabs.find(t => t.id === 20);
    assert.strictEqual(savedNewTab.active, false);
    const savedOldTab = savedCollections['col-1'].tabs.find(t => t.id === 10);
    assert.strictEqual(savedOldTab.active, true);
  });

  it('appendTabToActiveCollection should keep new tab adjacent to opener tab when opened from a link', async () => {
    // Collection has Tab 10 (index 0) and Tab 30 (index 2)
    const existingCollection = {
      id: 'col-1',
      name: 'Work',
      tabIds: [10, 30],
      tabs: [
        { id: 10, url: 'https://example.com', title: 'Opener', index: 0, active: true },
        { id: 30, url: 'https://other.com', title: 'Other', index: 2, active: false }
      ]
    };

    browserMock.storage.local.get.withArgs('tabCollections').resolves({
      tabCollections: { 'col-1': existingCollection }
    });

    // Firefox placed Tab 20 right after Tab 10 (at index 1)
    const openTabsInWindow = [
      { id: 10, url: 'https://example.com', title: 'Opener', index: 0, active: true, windowId: 1 },
      { id: 20, url: 'https://link.com', title: 'Link', index: 1, active: false, windowId: 1, openerTabId: 10 },
      { id: 30, url: 'https://other.com', title: 'Other', index: 2, active: false, windowId: 1 }
    ];

    browserMock.tabs.query.resolves(openTabsInWindow);

    const newTabFromLink = {
      id: 20,
      url: 'https://link.com',
      title: 'Link',
      index: 1,
      active: false,
      windowId: 1,
      openerTabId: 10
    };

    await context.appendTabToActiveCollection(newTabFromLink, { type: 'collection', id: 'col-1' });

    // Should NOT move tab because it is already adjacent to opener
    assert.strictEqual(browserMock.tabs.move.called, false, 'tabs.move should not be called when already next to opener');

    // Should save collections with all tabs sorted by index
    assert(browserMock.storage.local.set.called);
    const savedCollections = browserMock.storage.local.set.firstCall.args[0].tabCollections;
    const colTabs = savedCollections['col-1'].tabs;
    assert.strictEqual(colTabs.length, 3);
    assert.deepStrictEqual(colTabs.map(t => t.id), [10, 20, 30]);
    assert.deepStrictEqual(savedCollections['col-1'].tabIds, [10, 20, 30]);
  });

  it('appendTabToActiveCollection should move tab next to opener tab if opened past collection boundary', async () => {
    const existingCollection = {
      id: 'col-1',
      name: 'Work',
      tabIds: [10, 20],
      tabs: [
        { id: 10, url: 'https://example.com', title: 'Opener', index: 0, active: true },
        { id: 20, url: 'https://other.com', title: 'Other', index: 1, active: false }
      ]
    };

    browserMock.storage.local.get.withArgs('tabCollections').resolves({
      tabCollections: { 'col-1': existingCollection }
    });

    // Tab was placed at index 5 (e.g. past hidden tabs)
    const openTabsInWindow = [
      { id: 10, url: 'https://example.com', title: 'Opener', index: 0, active: true, windowId: 1 },
      { id: 20, url: 'https://other.com', title: 'Other', index: 1, active: false, windowId: 1 },
      { id: 30, url: 'https://link.com', title: 'Far Tab', index: 5, active: false, windowId: 1, openerTabId: 10 }
    ];

    browserMock.tabs.query.resolves(openTabsInWindow);

    const newFarTab = {
      id: 30,
      url: 'https://link.com',
      title: 'Far Tab',
      index: 5,
      active: false,
      windowId: 1,
      openerTabId: 10
    };

    await context.appendTabToActiveCollection(newFarTab, { type: 'collection', id: 'col-1' });

    // Should move tab next to opener tab (index 0 + 1 = 1)
    assert(browserMock.tabs.move.calledWith(30, { index: 1 }), 'tabs.move should move tab to openerTab.index + 1');
  });

  it('appendTabToActiveCollection should move new tab without opener to end of collection if past boundary', async () => {
    const existingCollection = {
      id: 'col-1',
      name: 'Work',
      tabIds: [10, 20],
      tabs: [
        { id: 10, url: 'https://example.com', title: 'First', index: 0, active: true },
        { id: 20, url: 'https://second.com', title: 'Second', index: 1, active: false }
      ]
    };

    browserMock.storage.local.get.withArgs('tabCollections').resolves({
      tabCollections: { 'col-1': existingCollection }
    });

    // New tab opened via '+' button at index 6 (e.g. after hidden tabs)
    const openTabsInWindow = [
      { id: 10, url: 'https://example.com', title: 'First', index: 0, active: true, windowId: 1 },
      { id: 20, url: 'https://second.com', title: 'Second', index: 1, active: false, windowId: 1 },
      { id: 30, url: 'about:newtab', title: 'New Tab', index: 6, active: true, windowId: 1 }
    ];

    browserMock.tabs.query.resolves(openTabsInWindow);

    const newTabPlusButton = {
      id: 30,
      url: 'about:newtab',
      title: 'New Tab',
      index: 6,
      active: true,
      windowId: 1
    };

    await context.appendTabToActiveCollection(newTabPlusButton, { type: 'collection', id: 'col-1' });

    // Should move to end of active collection (lastTab.index + 1 = 1 + 1 = 2)
    assert(browserMock.tabs.move.calledWith(30, { index: 2 }), 'tabs.move should move tab to lastTab.index + 1');
  });
});


