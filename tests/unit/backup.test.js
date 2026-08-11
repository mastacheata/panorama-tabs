import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Create a virtual context to evaluate backup-actions.js and test export payload generation
const backupActionsPath = path.resolve('extension/logic/backup-actions.js');
const backupActionsCode = fs.readFileSync(backupActionsPath, 'utf8');

const sandbox = {
  logger: {
    log: () => {},
    warn: () => {},
    error: () => {}
  },
  browser: {
    runtime: {
      getURL: (p) => 'moz-extension://test-uuid/' + (p || '')
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(backupActionsCode, sandbox);

describe('extension/logic/backup-actions.js Export Unit Tests', () => {
  it('generateExportPayload should correctly format collections into panoramaView schema', () => {
    const collectionsMap = {
      'col-1': {
        id: 'col-1',
        name: 'Work Tabs',
        created: 1000,
        tabs: [
          { url: 'https://github.com', title: 'GitHub', cookieStoreId: 'firefox-default', index: 0 },
          { url: 'https://gitlab.com', title: 'GitLab', cookieStoreId: 'firefox-default', index: 1 }
        ]
      },
      'col-2': {
        id: 'col-2',
        name: 'Personal Tabs',
        created: 2000,
        tabs: [
          { url: 'https://reddit.com', title: 'Reddit', cookieStoreId: 'firefox-container-1', index: 0 }
        ]
      }
    };

    const payload = sandbox.generateExportPayload(collectionsMap);

    assert.strictEqual(payload.file.type, 'panoramaView');
    assert.strictEqual(payload.file.version, 1);
    assert.strictEqual(payload.windows.length, 1);

    const win = payload.windows[0];
    assert.strictEqual(win.groups.length, 2);
    assert.strictEqual(win.groups[0].name, 'Work Tabs');
    assert.strictEqual(win.groups[0].id, 1);
    assert.strictEqual(win.groups[1].name, 'Personal Tabs');
    assert.strictEqual(win.groups[1].id, 2);

    assert.strictEqual(win.tabs.length, 3);
    assert.strictEqual(win.tabs[0].url, 'https://github.com');
    assert.strictEqual(win.tabs[0].groupId, 1);
    assert.strictEqual(win.tabs[2].url, 'https://reddit.com');
    assert.strictEqual(win.tabs[2].groupId, 2);
  });

  it('generateExportPayload should return empty structure for empty collections', () => {
    const payload = sandbox.generateExportPayload({});
    assert.strictEqual(payload.file.type, 'panoramaView');
    assert.strictEqual(payload.file.version, 1);
    assert.strictEqual(payload.windows[0].groups.length, 0);
    assert.strictEqual(payload.windows[0].tabs.length, 0);
  });
});
