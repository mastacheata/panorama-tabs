# Shared Utilities Agents Documentation

This directory contains common utility libraries shared across the Dashboard Page (`extension/extension.html`) and the Toolbar Popup (`popup/popup.html`).

## File Overview

- **[constants.js](file:///c:/Users/BenediktBauer/panorama-tabs/shared/constants.js)**:
  - Defines the color palette constants: `TAB_GROUP_COLORS` and `CONTAINER_COLORS`.

- **[tab-utils.js](file:///c:/Users/BenediktBauer/panorama-tabs/shared/tab-utils.js)**:
  - Implements tab detail helper extractors: `getTabTitle()` (resolves text hostname fallbacks) and `getTabFavIcon()` (resolves favicon links).

- **[dom-utils.js](file:///c:/Users/BenediktBauer/panorama-tabs/shared/dom-utils.js)**:
  - Contains HTML escaping (`escapeHtml()`), status bar animations (`showStatusMessage()`), identity mappings (`queryIdentityMap()`, `resolveContainerInfo()`), and Multi-Account-Container border painting logic (`applyContainerBordersToDOMElements()`).

- **[event-utils.js](file:///c:/Users/BenediktBauer/panorama-tabs/shared/event-utils.js)**:
  - Registers Firefox API listeners and configures rate-limiting debouncers (`makeDebouncedTabChangeHandler()`, `registerTabAndGroupListeners()`).
  - Implements the collection sorting comparator `makeCollectionSortComparator()`.
