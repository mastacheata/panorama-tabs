# Unit Testing Agent Rules

This directory contains browserless unit tests for background logic such as storage reconciliation and tab management actions.

---

## Testing Environment

- Unit tests are run using Node's native test runner (`node --test`).
- Third-party browser APIs are simulated using a schema-based mock environment generated from the `webext-schema` package.
- Individual tests are isolated from one another by initializing a fresh VM context for each test case via the helper in [`setup-mock.js`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/setup-mock.js).

---

## Guidelines for Modifying Unit Tests

- **No Browser Access:** Do not attempt to load UI elements or rely on active browser rendering in this folder.
- **Mock Actions & Storage:** Seed data or stub return values on the `browserMock` object inside the `beforeEach` hook of your test suite.
- **Preserve Isolated Context:** Ensure that background scripts are evaluated fresh using `createBackgroundContext()` for each test to prevent cross-test state leakage.
