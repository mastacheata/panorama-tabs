import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const code = fs.readFileSync(path.resolve('shared/tab-utils.js'), 'utf8');
const context = { browser: { runtime: { getURL: (p) => 'moz-extension://test-uuid/' + p } } };
vm.createContext(context);
vm.runInContext(code, context);

const { isRestrictedUrl, getRestrictedFallbackUrl } = context;

describe('shared/tab-utils.js Restricted URL Tests', () => {
  it('isRestrictedUrl should correctly identify internal/privileged browser URLs', () => {
    assert.strictEqual(isRestrictedUrl('about:addons'), true);
    assert.strictEqual(isRestrictedUrl('about:firefoxview'), true);
    assert.strictEqual(isRestrictedUrl('about:config'), true);
    assert.strictEqual(isRestrictedUrl('about:preferences'), true);
    assert.strictEqual(isRestrictedUrl('chrome://browser/content/browser.xhtml'), true);

    assert.strictEqual(isRestrictedUrl('https://example.com'), false);
    assert.strictEqual(isRestrictedUrl('http://localhost:3000'), false);
    assert.strictEqual(isRestrictedUrl('moz-extension://uuid/extension/extension.html'), false);
    assert.strictEqual(isRestrictedUrl(null), false);
    assert.strictEqual(isRestrictedUrl(''), false);
  });

  it('getRestrictedFallbackUrl should construct proper fallback page URL', () => {
    const fallback = getRestrictedFallbackUrl('about:firefoxview');
    assert(fallback.includes('extension/restricted-url.html?url=about%3Afirefoxview'));
  });
});

