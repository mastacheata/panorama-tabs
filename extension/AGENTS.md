# Extension Dashboard Agents Documentation

This directory contains the files for the main tab collection manager dashboard dashboard. All JavaScript files are loaded sequentially in `extension.html`.

## File Overview

- **[extension.js](file:///c:/Users/BenediktBauer/panorama-tabs/extension/extension.js)**:
  - Serves as the dashboard entry script and configures global configuration (`window.TAB_PREVIEW_LIMIT`) and state trackers (`window.extensionBaseUrl`, etc.).
  - Selects and maps HTML elements to the `window` context.
  - Registers the page's `DOMContentLoaded` startup orchestration.
  - Implements dashboard page cleaning logic (`hideAllOtherTabs`, `cleanupClosedTabs`).

- **[renderer.js](file:///c:/Users/BenediktBauer/panorama-tabs/extension/renderer.js)**:
  - Controls DOM generation and rendering for collection card structures.
  - Sets up tab list item representations, empty placeholder buttons, and overflow links.
  - Resolves container border styling and dot markers via the shared utilities.

- **[ui-handlers.js](file:///c:/Users/BenediktBauer/panorama-tabs/extension/ui-handlers.js)**:
  - Registers drag-and-drop listeners for tab items and collection cards.
  - Maps general dashboard event listener hooks (collapse, show-hidden, backups, group-unassigned, etc.).
  - Configures the `browser.runtime.onMessage` listener to catch background sync notifications.

- **[logic/collection-actions.js](file:///c:/Users/BenediktBauer/panorama-tabs/extension/logic/collection-actions.js)**:
  - Wraps dashboard actions that send messages to the background script (`createEmptyCollection`, `activateCollection`, `deleteCollection`, `renameCollection`, etc.).

- **[logic/backup-actions.js](file:///c:/Users/BenediktBauer/panorama-tabs/extension/logic/backup-actions.js)**:
  - Handles uploading JSON backups and parsing/migrating legacy formats to the current storage schema.
