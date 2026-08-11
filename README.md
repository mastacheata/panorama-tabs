# Tab Collections Manager

Tab Collections Manager is a Firefox extension to organize and store tabs into persistent collections. Easily hide or show tab groups to keep your browser workspace organized, focused, and clutter-free without losing your tabs.

This project is inspired by the original Panorama Tabs feature in Firefox and the Panorama Tab Groups extension (https://github.com/projectdelphai/panorama-tab-groups) but doesn't use any code from the original extension. It's a complete rewrite from scratch.

## Key Features

- **Tab Hiding API:** Seamlessly hide and show whole collections of tabs without losing their state or closing them.
- **Firefox Sync Integration:** Automatically sync your collection metadata and tabs to Firefox Sync so they are available across all your synchronized devices.
- **Container Tabs Support:** Full support for Firefox Multi-Account Containers. Container color borders are drawn around tabs to easily identify them.
- **Tab Groups Support:** Integrates with Firefox native tab groups, grouping tabs within each collection card.
- **Drag and Drop:** Move tabs between collections or reorder collections in the dashboard.

---

## Extension Dashboard

To open the main dashboard, use the keyboard shortcut `Ctrl+Shift+E` (or `Cmd+Shift+E` on macOS) or click the toolbar icon. The dashboard opens in a dedicated tab.

### Header Controls

The dashboard header provides global management controls:

- **+ New Collection:** Creates a new empty collection with a single blank tab and closes the dashboard.
- **Group Unassigned:** Scans all open tabs in the window. Any tab not currently assigned to any collection is grouped into a new collection named "Unassigned Tabs".
- **View Options (▾):** Dropdown menu containing options to control card visibility:
  - **Expand All:** Expands all collection cards on the dashboard to show their tabs and controls.
  - **Collapse All:** Collapses all collection cards to show only their headers, providing a clean overview.
- **Backup (▾):** Dropdown menu containing data import and export options:
  - **Import Backup:** Allows you to upload a JSON backup file exported from Panorama Tab Groups or legacy backups, automatically restoring your collections and tabs.
  - **Export Backup:** Exports all your current collections and tab snapshots into a structured downloadable JSON file (`panorama-tab-collections-YYYY-MM-DD.json`).
- **Show Hidden:** Appears when one or more collections are hidden. Clicking this temporarily displays all hidden collections in the dashboard view.

### Individual Collection Cards

Each collection is displayed as a card containing its title, a tab count badge, a list of tabs, and management controls.

- **Collapse / Expand Toggle (▼ / ▶):** Located at the top left of each card. Clicking this toggles the visibility of the tabs and controls within that specific collection.
- **Collection Name Edit (✎):** Click the pencil icon to rename the collection. Press Enter to save or Escape to cancel.
- **Compare and Refresh (↻):** Compares the tabs stored in the collection with the live browser state and updates the collection to match.
- **Activate / Active State:** Click the **Activate** button to switch to this collection. This hides all tabs from other collections and reveals the tabs belonging to this collection. The currently active collection is highlighted and displays **✓ Active**.
- **Hide / Show:** Click the **Hide** button to persistently hide the collection from the dashboard overview. Once hidden, the button changes to **Show** (visible when "Show Hidden" is active), allowing you to make it visible in the overview again.
- **Delete Collection (🗑 Delete):** Deletes the collection and closes all its associated browser tabs after confirmation.
- **Close Tab (×):** Hover over an individual tab in the list and click the close button to close that tab in the browser and remove it from the collection.
- **Show all tabs / Show less:** When a collection contains more than 4 tabs (the preview limit), clicking "... and X more tabs" expands the card to show all tabs. Click "Show less" to collapse back to the preview.
- **Tab Group Header (▼ / ▶):** Tabs that belong to a Firefox tab group are enclosed together under a group header with a matching color strip. Click the group header to collapse or expand the tabs in that group.

### Drag and Drop Actions

- **Move Tabs:** Drag any tab from one collection card and drop it onto another collection card to transfer it.
- **Reorder Collections:** Drag any collection card by its header and drop it onto another collection card to reorder the collections in your dashboard.

---

## Quick-Action Toolbar Panel (Popup UI)

Clicking the extension icon in the toolbar (if configured as the default popup action) displays a compact quick-access panel:

- **+ New Collection:** Creates a new collection consisting of all currently open tabs.
- **Activate:** Quick-switch to any listed collection by clicking its **Activate** button.
- **Tab Group Header (▼ / ▶):** Collapses or expands tab groups inside the popup list.

---

## License

This project is licensed under the [BSD 2-Clause License](file:///c:/Users/BenediktBauer/panorama-tabs/LICENSE).

