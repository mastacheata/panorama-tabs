import assert from 'node:assert/strict';

function isOverviewPageUrl(url, extensionOrigin) {
  try {
    const parsed = new URL(url);
    return parsed.origin === extensionOrigin && parsed.pathname === '/extension/extension.html';
  } catch {
    return false;
  }
}

function getOverviewPage(pages, extensionOrigin) {
  return pages.find((candidate) => isOverviewPageUrl(candidate.url(), extensionOrigin));
}

async function waitForLiveOverviewPage({ browser, extensionOrigin, timeoutMs = 20000 }) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const pages = await browser.pages();

    for (const candidate of pages) {
      if (!isOverviewPageUrl(candidate.url(), extensionOrigin)) {
        continue;
      }

      try {
        await candidate.evaluate(() => document.readyState);
        return candidate;
      } catch {
        // Ignore stale page handles.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for a live overview page under origin ${extensionOrigin}`);
}

function isNoSuchFrameError(error) {
  return String(error?.message || '').toLowerCase().includes('no such frame');
}

async function getCollectionSnapshot(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.collection-item'));
    const ids = cards
      .map((card) => card.dataset.collectionId)
      .filter(Boolean);

    return {
      count: ids.length,
      ids,
    };
  });
}

async function getCollectionSnapshotWithRecovery({ browser, extensionOrigin, page, openOverview }) {
  try {
    const snapshot = await getCollectionSnapshot(page);
    return { page, snapshot };
  } catch (error) {
    if (!isNoSuchFrameError(error)) {
      throw error;
    }

    let livePage;
    try {
      livePage = await waitForLiveOverviewPage({ browser, extensionOrigin });
    } catch {
      if (!openOverview) {
        throw error;
      }
      await openOverview();
      livePage = await waitForLiveOverviewPage({ browser, extensionOrigin });
    }

    const snapshot = await getCollectionSnapshot(livePage);
    return { page: livePage, snapshot };
  }
}

export async function runCreateCollectionTest({ browser, extensionBaseUrl, openOverview }) {
  const extensionOrigin = new URL(extensionBaseUrl).origin;

  let page = await waitForLiveOverviewPage({ browser, extensionOrigin });
  let before;
  let prepared = false;

  for (let attempt = 0; attempt < 3 && !prepared; attempt += 1) {
    try {
      await page.waitForSelector('#createBtn', { timeout: 20000 });
      await page.evaluate(() => {
        window.e2eNoAutoClose = true;
      });
      before = await getCollectionSnapshot(page);
      prepared = true;
    } catch (error) {
      if (!isNoSuchFrameError(error) || attempt === 2) {
        throw error;
      }
      page = await waitForLiveOverviewPage({ browser, extensionOrigin });
    }
  }

  try {
    await page.click('#createBtn');
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.toLowerCase().includes('no such frame')) {
      throw error;
    }
  }

  try {
    page = await waitForLiveOverviewPage({ browser, extensionOrigin });
  } catch {
    if (!openOverview) {
      throw new Error('Overview context was lost after create and no reopen helper is available.');
    }
    await openOverview();
    page = await waitForLiveOverviewPage({ browser, extensionOrigin });
  }

  await page.waitForSelector('.collection-item', { timeout: 20000 });

  const waitStarted = Date.now();
  let afterResult = await getCollectionSnapshotWithRecovery({ browser, extensionOrigin, page, openOverview });
  page = afterResult.page;
  let after = afterResult.snapshot;
  while (Date.now() - waitStarted < 20000 && after.count < before.count + 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    afterResult = await getCollectionSnapshotWithRecovery({ browser, extensionOrigin, page, openOverview });
    page = afterResult.page;
    after = afterResult.snapshot;
  }

  assert.equal(
    after.count,
    before.count + 1,
    `expected one additional collection after create (before=${before.count}, after=${after.count})`
  );

  const beforeIds = new Set(before.ids);
  const newCollectionId = after.ids.find((id) => !beforeIds.has(id));
  assert.equal(!!newCollectionId, true, 'expected to find the newly created collection ID');

  const dialogHandler = async (dialog) => {
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);

  try {
    await page.click(`.collection-item[data-collection-id="${newCollectionId}"] [data-action="delete-collection"]`);

    const cleanupStarted = Date.now();
    let cleanedResult = await getCollectionSnapshotWithRecovery({ browser, extensionOrigin, page, openOverview });
    page = cleanedResult.page;
    let cleaned = cleanedResult.snapshot;
    while (Date.now() - cleanupStarted < 20000 && cleaned.count !== before.count) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      cleanedResult = await getCollectionSnapshotWithRecovery({ browser, extensionOrigin, page, openOverview });
      page = cleanedResult.page;
      cleaned = cleanedResult.snapshot;
    }

    assert.equal(
      cleaned.count,
      before.count,
      `cleanup should restore original collection count (expected=${before.count}, actual=${cleaned.count})`
    );
  } finally {
    page.off('dialog', dialogHandler);
  }

  console.log('[e2e] PASS create collection flow test');
}
