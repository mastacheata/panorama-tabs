# Toolbar Popup Agents Documentation

This directory contains the files for the quick-action panel that loads when the toolbar icon is clicked. All scripts are loaded sequentially in `popup.html`.

## File Overview

- **[popup.js](file:///c:/Users/BenediktBauer/panorama-tabs/popup/popup.js)**:
  - Popup entry script mapping window elements (`window.createBtn`, `window.collectionsContainer`).
  - Sets up the `DOMContentLoaded` listener.
  - Implements direct action wrappers for creating and activating collections from the popup view.

- **[renderer.js](file:///c:/Users/BenediktBauer/panorama-tabs/popup/renderer.js)**:
  - Manages the retrieval of collections and builds their templates dynamically inside the popup.
  - Resolves current tab configurations and contextual container styling.

- **[ui-handlers.js](file:///c:/Users/BenediktBauer/panorama-tabs/popup/ui-handlers.js)**:
  - Binds the button elements and hooks tab change listener triggers.
  - Catches background data change signals to keep the popup dashboard in sync.
