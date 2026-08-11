import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createBackgroundContext } from '../setup-mock.js';

describe('Collapse All Batch Storage Tests', () => {
  let context;
  let browserMock;

  beforeEach(() => {
    const res = createBackgroundContext();
    context = res.context;
    browserMock = res.browserMock;
  });

  it('setAllCollectionsCollapsed should set collapsed state on all collections in storage', async () => {
    const initialCollections = {
      col1: { id: 'col1', name: 'Work', collapsed: false, tabs: [] },
      col2: { id: 'col2', name: 'Personal', collapsed: false, tabs: [] }
    };

    browserMock.storage.local.get.withArgs('tabCollections').resolves({
      tabCollections: initialCollections
    });
    browserMock.storage.sync.get.withArgs('sync-collection-index').resolves({
      'sync-collection-index': { order: [], collections: {} }
    });

    const collections = await context.getCollections();
    for (const id in collections) {
      collections[id].collapsed = true;
    }
    await context.saveCollections(collections);

    assert(browserMock.storage.local.set.called);
    const tabColCall = browserMock.storage.local.set.getCalls().find(c => c.args[0] && c.args[0].tabCollections);
    assert(tabColCall, 'Expected browser.storage.local.set to be called with tabCollections');
    const savedCollections = tabColCall.args[0].tabCollections;
    assert.strictEqual(savedCollections.col1.collapsed, true);
    assert.strictEqual(savedCollections.col2.collapsed, true);
  });
});
