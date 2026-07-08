import assert from 'node:assert/strict';

function isOverviewPageUrl(url, extensionOrigin) {
  try {
    const parsed = new URL(url);
    return parsed.origin === extensionOrigin && parsed.pathname === '/extension/extension.html';
  } catch {
    return false;
  }
}

async function getOverviewPage({ browser, extensionOrigin }) {
  const pages = await browser.pages();
  return pages.find((candidate) => isOverviewPageUrl(candidate.url(), extensionOrigin));
}

export async function runControlsSmokeTest({ browser, extensionBaseUrl }) {
  const extensionOrigin = new URL(extensionBaseUrl).origin;
  const page = await getOverviewPage({ browser, extensionOrigin });

  assert.equal(!!page, true, `overview tab should be open under origin ${extensionOrigin}`);
  await page.waitForSelector('#collapseAllBtn', { timeout: 20000 });
  await page.waitForSelector('#expandAllBtn', { timeout: 20000 });

  const count = await page.evaluate(() => document.querySelectorAll('.collection-item').length);

  if (count > 0) {
    await page.click('#collapseAllBtn');
    await page.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll('.collection-item'));
      return cards.length > 0 && cards.every((card) => card.dataset.collapsed === 'true');
    }, { timeout: 20000 });

    await page.click('#expandAllBtn');
    await page.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll('.collection-item'));
      return cards.length > 0 && cards.every((card) => card.dataset.collapsed === 'false');
    }, { timeout: 20000 });
  }

  console.log('[e2e] PASS controls smoke test');
}
