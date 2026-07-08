# Antigravity Rules & Project Overview

Welcome to the **Tab Collections Manager** codebase! This document outlines the project structure and defines workspace rules for agents working on this extension.

---

## 1. Project Overview

This is a Firefox WebExtension (Manifest V3) designed to hide and show tab groups, organizing them into persistent collections.

### Core Files
- [`manifest.json`](file:///c:/Users/BenediktBauer/panorama-tabs/manifest.json): Extension configuration specifying permissions, commands, action icon maps, and the sequential background scripts list.
- [`background.js`](file:///c:/Users/BenediktBauer/panorama-tabs/background.js): Background router listening to runtime message requests and dispatching actions.
- [`background/`](file:///c:/Users/BenediktBauer/panorama-tabs/background): Contains background worker modules:
  - [`storage.js`](file:///c:/Users/BenediktBauer/panorama-tabs/background/storage.js): Global state trackers, storage queue, sync logic, and tab-reconciliation.
  - [`actions.js`](file:///c:/Users/BenediktBauer/panorama-tabs/background/actions.js): Core actions for tab/collection operations (activate, delete, rename, group, move).
  - [`listeners.js`](file:///c:/Users/BenediktBauer/panorama-tabs/background/listeners.js): Event listener registrations for browser events.
- [`extension/`](file:///c:/Users/BenediktBauer/panorama-tabs/extension): Contains the files for the main tab collection manager dashboard screen:
  - [`extension.html`](file:///c:/Users/BenediktBauer/panorama-tabs/extension/extension.html) / [`extension.css`](file:///c:/Users/BenediktBauer/panorama-tabs/extension/extension.css): Dashboard UI markup and styles.
  - [`extension.js`](file:///c:/Users/BenediktBauer/panorama-tabs/extension/extension.js): Global state setup and startup page initialization.
  - [`renderer.js`](file:///c:/Users/BenediktBauer/panorama-tabs/extension/renderer.js): Dynamic DOM list and item rendering.
  - [`ui-handlers.js`](file:///c:/Users/BenediktBauer/panorama-tabs/extension/ui-handlers.js): UI event mapping and drag-and-drop bindings.
  - [`logic/`](file:///c:/Users/BenediktBauer/panorama-tabs/extension/logic): Wrapper actions like collection/backup processing.
- [`popup/`](file:///c:/Users/BenediktBauer/panorama-tabs/popup): Contains files for the quick-action toolbar panel:
  - [`popup.html`](file:///c:/Users/BenediktBauer/panorama-tabs/popup/popup.html) / [`popup.css`](file:///c:/Users/BenediktBauer/panorama-tabs/popup/popup.css): Quick panel markup and styles.
  - [`popup.js`](file:///c:/Users/BenediktBauer/panorama-tabs/popup/popup.js): Global popup setup and action triggers.
  - [`renderer.js`](file:///c:/Users/BenediktBauer/panorama-tabs/popup/renderer.js): Quick list rendering.
  - [`ui-handlers.js`](file:///c:/Users/BenediktBauer/panorama-tabs/popup/ui-handlers.js): Popup change listener hooks.
- [`shared/`](file:///c:/Users/BenediktBauer/panorama-tabs/shared): Contains common utilities shared across pages:
  - [`constants.js`](file:///c:/Users/BenediktBauer/panorama-tabs/shared/constants.js) / [`tab-utils.js`](file:///c:/Users/BenediktBauer/panorama-tabs/shared/tab-utils.js): Constants and tab detail resolvers.
  - [`dom-utils.js`](file:///c:/Users/BenediktBauer/panorama-tabs/shared/dom-utils.js) / [`event-utils.js`](file:///c:/Users/BenediktBauer/panorama-tabs/shared/event-utils.js): DOM manipulation, container border painting, and event listeners helpers.

---

## 2. Firefox WebExtension Development Skill

When working on browser APIs, manifest options, or packaging/debugging this extension, refer to the local Firefox WebExtension skill for instructions, API links, and best practices:
- **Firefox extension development skill:** [`firefox-extension-dev`](file:///c:/Users/BenediktBauer/panorama-tabs/.agents/skills/firefox-extension-dev/SKILL.md)

---

## 3. Automated Testing Guide

When modifying, writing, or running tests for this extension, consult the specific test guidelines:
- **Test Suite Overview:** [`tests/AGENTS.md`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/AGENTS.md)
- **Unit Testing Guidelines:** [`tests/unit/AGENTS.md`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/unit/AGENTS.md)
- **E2E Testing Guidelines:** [`tests/e2e/AGENTS.md`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/e2e/AGENTS.md)

---

## 4. Workspace Agent Rules

- **Prompt Commit Suggestion Requirement:** After addressing the user's prompt and making any code modifications, you MUST:
  1. Summarize the changes implemented.
  2. Propose a git commit message adhering to the **Conventional Commits** specification.
  3. Ask the user for explicit approval before running git add/commit commands.
  4. Allow the user to skip the commit step if they choose to.

- **Uncommitted Changes Tracking Requirement:** If the user skips committing changes for a prompt:
  1. Record a description of those changes (a list of "changes to be considered") in the file [`pending_changes.md`](file:///c:/Users/BenediktBauer/panorama-tabs/.agents/pending_changes.md).
  2. For any subsequent commit prompt, read this file and ask the user if any or all of the recorded pending changes should be included in the new commit.
  3. Once those changes are successfully committed, clear/remove them from the file.
