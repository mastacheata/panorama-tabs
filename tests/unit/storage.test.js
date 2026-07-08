import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createBackgroundContext } from '../setup-mock.js';

describe('background/storage.js Unit Tests', () => {
  let context;
  let browserMock;

  beforeEach(() => {
    const res = createBackgroundContext();
    context = res.context;
    browserMock = res.browserMock;
  });

  it('getCollections should retrieve data from storage.local', async () => {
    browserMock.storage.local.get.withArgs('tabCollections').resolves({
      tabCollections: {
        col1: { id: 'col1', name: 'Work Tabs', tabs: [] }
      }
    });

    const collections = await context.getCollections();
    assert.deepEqual(collections, {
      col1: { id: 'col1', name: 'Work Tabs', tabs: [] }
    });
  });

  it('getActiveState should return active state from local storage', async () => {
    browserMock.storage.local.get.withArgs('activeState').resolves({
      activeState: 'col1'
    });

    const state = await context.getActiveState();
    assert.strictEqual(state, 'col1');
  });

  it('setActiveState should store active state in local storage', async () => {
    await context.setActiveState('col2');
    assert(browserMock.storage.local.set.calledWith({ activeState: 'col2' }));
  });

  it('saveCollections should write to storage.local and invoke remote sync', async () => {
    const collections = {
      col1: { id: 'col1', name: 'Work Tabs', created: 100, lastModified: 150, tabs: [] }
    };
    
    // Seed the remote sync index to return empty initially
    browserMock.storage.sync.get.withArgs('sync-collection-index').resolves({
      'sync-collection-index': { order: [], collections: {} }
    });

    await context.saveCollections(collections);

    assert(browserMock.storage.local.set.calledWith({ tabCollections: collections }));
    assert(browserMock.storage.sync.set.called);
  });
});
