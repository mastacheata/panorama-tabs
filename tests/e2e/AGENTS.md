# E2E Testing Agent Rules

This directory contains end-to-end browser automation tests designed to verify dashboard user interactions using real browser instances.

---

## Testing Environment

- **Automation Tools:** The E2E tests are performed using **Puppeteer** and **`web-ext.cmd`**.
- **Runner script:** [`e2e-runner.js`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/e2e/e2e-runner.js)
  > [!IMPORTANT]
  > **TODO:** The e2e-test-harness currently uses fixed paths (e.g., hardcoded paths to `web-ext.cmd` or specific Firefox binaries) that need overriding in case this should ever run on a different machine.
- **Browser configuration:**
  - Automated launches are done via `web-ext.cmd` loading the extension temporarily.
  - Firefox is configured using the profile settings in [`profile/user.js`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/e2e/profile/user.js) to enable developer and debugging preferences automatically.
  - Headless/headful state is governed by the `E2E_HEADLESS` environment variable (controlled via the `web-ext-config.cjs` configuration).

---

## Guidelines for Modifying E2E Tests

- **Process-Switch Handling:** Firefox isolates extensions in separate processes (Fission). When navigating to a `moz-extension://` URL, query the open pages/tabs in Puppeteer to find the target extension dashboard.
- **Evaluate JS & Interact:** Use Puppeteer's native methods (like `page.click()`, `page.type()`, `page.waitForSelector()`, or `page.evaluate()`) to interact with page components.
- **Stub Dialogs:** Since tests run headlessly, override blocking modal dialogs (like `window.confirm`) inside the page context before executing triggers that open them (such as deleting a collection).
