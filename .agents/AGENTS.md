# Antigravity Rules & Project Overview

Welcome to the **Tab Collections Manager** codebase! This document outlines the project structure and defines workspace rules for agents working on this extension.

---

## 1. Project Overview

This is a Firefox WebExtension (Manifest V3) designed to hide and show tab groups, organizing them into persistent collections.

### Core Files
- [`manifest.json`](file:///c:/Users/BenediktBauer/panorama-tabs/manifest.json): Extension configuration including MV3 specs, background scripts, actions, keyboard shortcuts, and Firefox-specific permissions (`tabHide`, `tabGroups`).
- [`background.js`](file:///c:/Users/BenediktBauer/panorama-tabs/background.js): Background service worker managing local storage state, listening to global tab events (creation, removal, updates), and executing tab show/hide API calls.
- [`extension/`](file:///c:/Users/BenediktBauer/panorama-tabs/extension): Contains the files for the main tab collection manager dashboard screen:
  - [`extension.html`](file:///c:/Users/BenediktBauer/panorama-tabs/extension/extension.html): UI dashboard markup.
  - [`extension.css`](file:///c:/Users/BenediktBauer/panorama-tabs/extension/extension.css): Stylesheet defining design tokens, interactive hover transitions, layout constraints, and responsive screens.
  - [`extension.js`](file:///c:/Users/BenediktBauer/panorama-tabs/extension/extension.js): DOM manipulation, collection activation, tab rendering, and close action management.
- [`popup/`](file:///c:/Users/BenediktBauer/panorama-tabs/popup): Contains files for the quick-action toolbar panel:
  - [`popup.html`](file:///c:/Users/BenediktBauer/panorama-tabs/popup/popup.html) / [`popup.css`](file:///c:/Users/BenediktBauer/panorama-tabs/popup/popup.css) / [`popup.js`](file:///c:/Users/BenediktBauer/panorama-tabs/popup/popup.js): Layout, styles, and logic for showing collections and quick activation.

---

## 2. Firefox WebExtension Development Skill

When working on browser APIs, manifest options, or packaging/debugging this extension, refer to the local Firefox WebExtension skill for instructions, API links, and best practices:
- **Firefox extension development skill:** [`firefox-extension-dev`](file:///c:/Users/BenediktBauer/panorama-tabs/.agents/skills/firefox-extension-dev/SKILL.md)

---

## 3. Workspace Agent Rules

- **Prompt Commit Suggestion Requirement:** After addressing the user's prompt and making any code modifications, you MUST:
  1. Summarize the changes implemented.
  2. Propose a git commit message adhering to the **Conventional Commits** specification.
  3. Ask the user for explicit approval before running git add/commit commands.
  4. Allow the user to skip the commit step if they choose to.

- **Uncommitted Changes Tracking Requirement:** If the user skips committing changes for a prompt:
  1. Record a description of those changes (a list of "changes to be considered") in the file [`pending_changes.md`](file:///c:/Users/BenediktBauer/panorama-tabs/.agents/pending_changes.md).
  2. For any subsequent commit prompt, read this file and ask the user if any or all of the recorded pending changes should be included in the new commit.
  3. Once those changes are successfully committed, clear/remove them from the file.
