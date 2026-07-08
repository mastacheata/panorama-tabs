# Testing Directory Agent Rules

This directory contains the test suite for the **Tab Collections Manager** extension. It is split into local unit tests and end-to-end browser automation tests.

---

## Directory Structure

- [`unit/`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/unit): Contains local browserless unit tests that mock browser APIs.
  - Rules & Details: See [`unit/AGENTS.md`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/unit/AGENTS.md)
- [`e2e/`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/e2e): Contains E2E tests automating browser interactions via the Remote Debugging Protocol.
  - Rules & Details: See [`e2e/AGENTS.md`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/e2e/AGENTS.md)
- [`setup-mock.js`](file:///c:/Users/BenediktBauer/panorama-tabs/tests/setup-mock.js): Shared harness to construct isolated VM environments for unit testing.

---

## Test Execution Commands

- **Unit Tests:** Run browserless unit tests natively in Node:
  ```bash
  npm run test
  ```
- **E2E Tests:** Run browser automation tests with web-ext and client attach:
  ```bash
  npm run test:e2e
  ```
