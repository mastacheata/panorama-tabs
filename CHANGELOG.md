# Changelog

All notable changes to the **Tab Collections Manager** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.3] - 2026-09-09

### Added
- **GitHub Actions Release Workflow**: Created [`.github/workflows/release.yml`](.github/workflows/release.yml) to automatically build and publish extension packages on GitHub releases when tags (`v*`) are pushed or triggered manually.
- **Clean Package Build Filtering**: Configured `ignoreFiles` in [`web-ext-config.cjs`](web-ext-config.cjs) to exclude non-runtime files (tests, documentation, build scripts, development configs) from the final distribution zip.
- **Repository Changelog**: Added [`CHANGELOG.md`](CHANGELOG.md) to track all version releases and updates.

### Fixed
- **New Tab Positioning on Link Clicks**: Fixed an issue where tabs opened via middle-click or right-click "Open Link in New Tab" were moved to the far end of the tab bar. Tabs opened from existing collection tabs now stay directly adjacent to their opener tab.
- **Collection Index Sorting**: Ensured stored collection tab arrays and IDs remain synchronized with real browser window tab indices.

---

## [0.1.2] - 2026-08-17

### Fixed
- **Dashboard Tab Closure**: Ensured the extension dashboard tab reliably closes when activating a collection by placing the tab removal call inside a `finally` block.
- **Background Tab Focus State**: Preserved background focus state when opening tabs in the background without stealing focus or forcing `active: true`.

---

## [0.1.1] - 2026-08-12

### Added
- **Extension Icons & Build Pipeline**: Added extension icon assets in various sizes (16, 32, 48, 96, 128 px), icon generation script, and `npm run build` command using `web-ext`.
- **Licensing & Documentation**: Added BSD 2-Clause open-source license and comprehensive user guide in [`README.md`](README.md).
- **JSON Backup Export**: Added ability to export collections into JSON backup payloads compatible with panorama schema.
- **Restricted URL Handling**: Added warning fallback page when restoring restricted browser internal URLs (`about:*`).
- **Theme Switcher**: Integrated system automatic and manual light/dark theme switcher with earthy color scheme.

### Fixed
- **Renderer Scope Bug**: Resolved `ReferenceError: groupedItems is not defined` in extension renderer.
- **Popup Scope Bug**: Fixed `activateBtn` variable redeclaration in popup renderer.
- **Manifest Compliance**: Added `data_collection_permissions` and updated minimum Firefox version constraints.

---

## [0.1.0] - 2026-08-11

### Added
- **Initial Release**: Initial implementation of Tab Collections Manager WebExtension for Firefox (Manifest V3).
- **Tab Grouping & Hiding**: Organize tabs into persistent collections with tab hiding and restoration.
- **Native Tab Groups & Multi-Account Containers**: Visual border highlighting and container overlays.
- **Firefox Sync Support**: Cross-device collection index synchronization via `browser.storage.sync`.
- **Drag-and-Drop Management**: Drag-and-drop support for tab movement between collections and collection reordering.
- **Dashboard & Quick Popup**: Full management dashboard page and quick-access toolbar popup.
- **Legacy Backup Import**: Import support for legacy panorama-tab-groups backups.
