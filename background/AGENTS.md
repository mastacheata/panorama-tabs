# Background Agents Documentation

This directory contains scripts that run inside the extension's background page context (defined as sequential background scripts in `manifest.json`).

## File Overview

- **[storage.js](file:///c:/Users/BenediktBauer/panorama-tabs/background/storage.js)**:
  - Establishes global state variables on the `window` context (e.g. `window.extensionTabId`, `window.storageQueue`).
  - Implements the serialized storage task queue (`queueStorageUpdate()`) to prevent asynchronous race conditions.
  - Handles Firefox Sync storage integration (`syncToRemote()`, `handleRemoteChanges()`).
  - Manages browser startup tab reconciliation (`reconcileTabIds()`).
  
- **[actions.js](file:///c:/Users/BenediktBauer/panorama-tabs/background/actions.js)**:
  - Implements collection manipulation routines: `createDefaultCollection()`, `createCollectionFromTabs()`, `createEmptyCollection()`, `activateCollection()`, `deactivateCollection()`, `renameCollection()`, `deleteCollection()`, `activateEmptyCollectionWithNewTab()`, `reorderCollections()`, `moveTabBetweenCollections()`, `refreshCollection()`.
  - Coordinates browser tab creations and visibility updates (`browser.tabs.hide` and `browser.tabs.show`).
  
- **[listeners.js](file:///c:/Users/BenediktBauer/panorama-tabs/background/listeners.js)**:
  - Registers Firefox API event listeners to track changes dynamically (`browser.tabs.onActivated`, `browser.tabs.onRemoved`, `browser.tabs.onCreated`, `browser.tabs.onUpdated`, `browser.commands.onCommand`, `browser.action.onClicked`, `browser.storage.onChanged`).
  - Delegates logic handling to helper actions defined in `actions.js`.

- **[background.js](file:///c:/Users/BenediktBauer/panorama-tabs/background.js)**:
  - Exposes the main message router `browser.runtime.onMessage.addListener` to handle message signals sent from dashboard pages and tool popups.
  - Triggers startup tab reconciliation routines on extension load.
