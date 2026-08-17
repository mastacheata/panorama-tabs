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
});

