import assert from 'node:assert/strict';

function toVisibleText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

export async function runBasicOverviewTest({ browser, extensionBaseUrl }) {
  const extensionOrigin = new URL(extensionBaseUrl).origin;
  const pages = await browser.pages();
  const page = pages.find((candidate) => {
    try {
      const parsed = new URL(candidate.url());
      return parsed.origin === extensionOrigin && parsed.pathname === '/extension/extension.html';
    } catch {
      return false;
    }
  });
  assert.equal(!!page, true, `overview tab should be open under origin ${extensionOrigin}`);

  await page.bringToFront();

  await page.waitForSelector('h1', { timeout: 20000 });
  await page.waitForFunction(() => {
    const collectionCount = document.querySelectorAll('.collection-item').length;
    const emptyStateVisible = Array.from(document.querySelectorAll('#collectionsContainer div'))
      .some((el) => (el.textContent || '').includes('No collections yet.'));
    return collectionCount > 0 || emptyStateVisible;
  }, { timeout: 20000 });

  const snapshot = await page.evaluate(() => {
    const heading = document.querySelector('h1')?.textContent || '';
    const loadingEl = document.querySelector('#loadingMessage');
    const loadingDisplay = loadingEl ? getComputedStyle(loadingEl).display : null;
    const loadingText = loadingEl?.textContent || '';
    const hasCreateButton = !!document.querySelector('#createBtn');
    const hasCollectionsContainer = !!document.querySelector('#collectionsContainer');
    const collectionCount = document.querySelectorAll('.collection-item').length;
    const emptyText = Array.from(document.querySelectorAll('#collectionsContainer div'))
      .map((el) => el.textContent || '')
      .find((text) => text.includes('No collections yet.')) || '';

    return {
      heading,
      loadingDisplay,
      loadingText,
      hasCreateButton,
      hasCollectionsContainer,
      collectionCount,
      emptyText,
    };
  });

  assert.equal(toVisibleText(snapshot.heading), 'Tab Collections Manager', 'overview heading should be rendered');
  assert.equal(snapshot.hasCreateButton, true, 'create collection button should exist');
  assert.equal(snapshot.hasCollectionsContainer, true, 'collections container should exist');

  // Initial load should either render at least one collection card or the empty-state message.
  const hasExpectedInitialState = snapshot.collectionCount > 0 || toVisibleText(snapshot.emptyText) === 'No collections yet.';
  assert.equal(
    hasExpectedInitialState,
    true,
    `expected initial state to show collections or empty message (loading="${toVisibleText(snapshot.loadingText)}", display="${snapshot.loadingDisplay}")`
  );

  console.log('[e2e] PASS basic overview initial state test');
}