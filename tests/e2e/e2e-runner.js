import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const defaultFirefoxBinary = 'C:\\Program Files\\Firefox Developer Edition\\firefox.exe';
const defaultFirefoxProfile =
  'C:\\Users\\BenediktBauer\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\ztmsqhr5.Panorma-Tabs';
const defaultWebExtWindows = 'C:\\Users\\BenediktBauer\\AppData\\Local\\Yarn\\bin\\web-ext.cmd';

const firefoxBinary = process.env.FIREFOX_BINARY || defaultFirefoxBinary;
const firefoxProfile = process.env.FIREFOX_PROFILE || defaultFirefoxProfile;

function getExtensionIdFromManifest() {
  const manifestPath = path.join(repoRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const extensionId = manifest?.browser_specific_settings?.gecko?.id;
  if (!extensionId) {
    throw new Error('manifest.json is missing browser_specific_settings.gecko.id, which is required for Firefox e2e URL resolution.');
  }
  return extensionId;
}

function getOpenManagerShortcutFromManifest() {
  const manifestPath = path.join(repoRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const platformKey = process.platform === 'darwin' ? 'mac' : 'default';
  return manifest?.commands?.['open-manager']?.suggested_key?.[platformKey] || null;
}

function resolveWebExtCommand() {
  if (process.env.WEB_EXT_CMD && fs.existsSync(process.env.WEB_EXT_CMD)) {
    return process.env.WEB_EXT_CMD;
  }

  if (process.platform === 'win32' && fs.existsSync(defaultWebExtWindows)) {
    return defaultWebExtWindows;
  }

  const localBin = path.join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'web-ext.cmd' : 'web-ext'
  );
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  return process.platform === 'win32' ? 'web-ext.cmd' : 'web-ext';
}

const webExtCmd = resolveWebExtCommand();

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForDebuggerEndpoint({ port, timeoutMs = 30000 }) {
  const started = Date.now();
  const url = `http://127.0.0.1:${port}/json/version`;

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const payload = await res.json();
        if (payload?.webSocketDebuggerUrl) {
          return payload.webSocketDebuggerUrl;
        }
      }
    } catch {
      // Firefox debugger endpoint not ready yet.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for Firefox debugger endpoint at ${url}`);
}

async function waitForPortOpen({ hostCandidates, port, timeoutMs = 45000 }) {
  const started = Date.now();
  const hosts = hostCandidates && hostCandidates.length > 0 ? hostCandidates : ['127.0.0.1'];

  while (Date.now() - started < timeoutMs) {
    for (const host of hosts) {
      const isOpen = await new Promise((resolve) => {
        const socket = net.createConnection({ host, port });

        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });

        socket.once('error', () => {
          resolve(false);
        });
      });

      if (isOpen) {
        return host;
      }
    }

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for open TCP port at ${hosts.join(',')}:${port}. ` +
    'web-ext started Firefox and loaded the extension, but this Firefox instance did not expose the remote debugging socket. ' +
    'Try Firefox Nightly or set FIREFOX_BINARY/FIREFOX_DEBUG_PORT to a build+port combination that supports Puppeteer attach.'
  );
}

async function connectBiDiWithRetries({ host, port, timeoutMs = 45000 }) {
  const started = Date.now();
  let lastError;

  // Try the root path and the /session path (WebDriver BiDi spec).
  const paths = ['', '/session'];

  while (Date.now() - started < timeoutMs) {
    for (const wsPath of paths) {
      try {
        return await puppeteer.connect({
          browserWSEndpoint: `ws://${host}:${port}${wsPath}`,
          protocol: 'webDriverBiDi',
          protocolTimeout: 10000,
          defaultViewport: null,
        });
      } catch (error) {
        lastError = error;
      }
    }
    await delay(500);
  }

  throw new Error(`Timed out connecting to Firefox BiDi websocket on port ${port}. Last error: ${lastError?.message ?? JSON.stringify(lastError)}`);
}

function unescapeFirefoxPrefString(raw) {
  return raw
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"');
}

function parseFirefoxExtensionUuidFromPrefs({ prefsContent, extensionId }) {
  const prefPattern = /user_pref\("extensions\.webextensions\.uuids",\s*"((?:\\.|[^"\\])*)"\);/;
  const match = prefsContent.match(prefPattern);
  if (!match) {
    return null;
  }

  const uuidsJsonEscaped = match[1];
  const uuidsJson = unescapeFirefoxPrefString(uuidsJsonEscaped);
  const mapping = JSON.parse(uuidsJson);
  return mapping?.[extensionId] || null;
}

function readExtensionBaseUrlFromPrefs({ extensionId }) {
  const prefsPath = path.join(firefoxProfile, 'prefs.js');
  if (!fs.existsSync(prefsPath)) {
    return null;
  }

  try {
    const prefsContent = fs.readFileSync(prefsPath, 'utf8');
    const uuid = parseFirefoxExtensionUuidFromPrefs({ prefsContent, extensionId });
    if (!uuid) {
      return null;
    }
    return `moz-extension://${uuid}/`;
  } catch {
    return null;
  }
}

async function waitForExtensionBaseUrl({ extensionId, timeoutMs = 45000 }) {
  const started = Date.now();
  const prefsPath = path.join(firefoxProfile, 'prefs.js');

  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(prefsPath)) {
      try {
        const prefsContent = fs.readFileSync(prefsPath, 'utf8');
        const uuid = parseFirefoxExtensionUuidFromPrefs({ prefsContent, extensionId });
        if (uuid) {
          return `moz-extension://${uuid}/`;
        }
      } catch {
        // prefs.js may be written concurrently while Firefox is running.
      }
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for Firefox extension UUID mapping for ${extensionId} in ${prefsPath}.`);
}

async function waitForOverviewPage({ browser, extensionBaseUrl, timeoutMs = 30000 }) {
  const extensionOrigin = new URL(extensionBaseUrl).origin;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const pages = await browser.pages();
    for (const candidate of pages) {
      let parsed;
      try {
        parsed = new URL(candidate.url());
      } catch {
        continue;
      }

      if (parsed.origin !== extensionOrigin || parsed.pathname !== '/extension/extension.html') {
        continue;
      }

      try {
        await candidate.evaluate(() => document.readyState);
        return candidate;
      } catch {
        // Ignore stale page handles and keep polling.
      }
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for overview tab under origin ${extensionOrigin}`);
}

async function ensureOverviewE2EMode({ browser, extensionBaseUrl }) {
  const page = await waitForOverviewPage({ browser, extensionBaseUrl });
  let hasFlag = false;

  try {
    hasFlag = await page.evaluate(() => new URLSearchParams(window.location.search).get('e2eNoAutoClose') === '1');
  } catch {
    // If evaluate fails due to transient context replacement, just retry below.
  }

  if (hasFlag) {
    return;
  }

  const targetUrl = new URL('extension/extension.html?e2eNoAutoClose=1', extensionBaseUrl).toString();
  await page.evaluate((url) => {
    window.location.href = url;
  }, targetUrl);

  const updatedPage = await waitForOverviewPage({ browser, extensionBaseUrl });
  const confirmed = await updatedPage.evaluate(
    () => new URLSearchParams(window.location.search).get('e2eNoAutoClose') === '1'
  );

  if (!confirmed) {
    throw new Error('Failed to activate e2eNoAutoClose mode on overview page.');
  }
}

function normalizeShortcutPart(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'ctrl' || normalized === 'control') return 'Control';
  if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') return 'Meta';
  if (normalized === 'shift') return 'Shift';
  if (normalized === 'alt' || normalized === 'option') return 'Alt';
  if (normalized.startsWith('key') && normalized.length === 4) return normalized[0].toUpperCase() + normalized.slice(1);
  if (normalized.length === 1 && /[a-z]/.test(normalized)) return `Key${normalized.toUpperCase()}`;
  if (/^[0-9]$/.test(normalized)) return `Digit${normalized}`;
  return null;
}

async function triggerShortcut({ browser, shortcut }) {
  if (!shortcut) {
    throw new Error('No shortcut configured for open-manager command in manifest.json');
  }

  const pages = await browser.pages();
  let page = null;

  for (const candidate of pages) {
    try {
      await candidate.evaluate(() => true);
      page = candidate;
      break;
    } catch {
      // Ignore stale page handles.
    }
  }

  if (!page) {
    page = await browser.newPage();
  }

  await page.bringToFront();

  const parts = shortcut.split('+').map((part) => normalizeShortcutPart(part)).filter(Boolean);
  const modifiers = parts.filter((part) => part === 'Control' || part === 'Shift' || part === 'Alt' || part === 'Meta');
  const keys = parts.filter((part) => !modifiers.includes(part));

  if (keys.length !== 1) {
    throw new Error(`Unsupported shortcut format: ${shortcut}`);
  }

  for (const modifier of modifiers) {
    await page.keyboard.down(modifier);
  }

  try {
    await page.keyboard.press(keys[0]);
  } finally {
    for (const modifier of modifiers.reverse()) {
      await page.keyboard.up(modifier);
    }
  }
}

async function getFreeTcpPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error('Could not allocate free TCP port'));
          return;
        }
        resolve(port);
      });
    });
  });
}

let webExtProcess;

function quoteForCmd(arg) {
  const eqIdx = arg.indexOf('=');
  if (eqIdx !== -1) {
    const key = arg.slice(0, eqIdx);
    const value = arg.slice(eqIdx + 1);
    if (/[\s"&|<>^]/.test(value)) {
      return `${key}="${value.replace(/(["^])/g, '^$1')}"`;
    }
    return arg;
  }

  if (!/[\s"&|<>^]/.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/(["^])/g, '^$1')}"`;
}

function shutdown(code = 0) {
  process.exitCode = code;
}

function stopProcessTree(childProcess) {
  if (!childProcess || !childProcess.pid) {
    return Promise.resolve();
  }

  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(childProcess.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
      });
      killer.on('error', () => resolve());
      killer.on('exit', () => resolve());
    });
  }

  return new Promise((resolve) => {
    try {
      process.kill(-childProcess.pid, 'SIGTERM');
    } catch {
      // Ignore if process is already gone.
    }
    resolve();
  });
}

async function run() {
  const extensionId = getExtensionIdFromManifest();
  const openManagerShortcut = getOpenManagerShortcutFromManifest();
  const knownExtensionBaseUrl = readExtensionBaseUrlFromPrefs({ extensionId });
  const debugPort = process.env.FIREFOX_DEBUG_PORT
    ? Number.parseInt(process.env.FIREFOX_DEBUG_PORT, 10)
    : await getFreeTcpPort();
  const webExtArgs = [
    'run',
    `--source-dir=${repoRoot}`,
    `--firefox=${firefoxBinary}`,
    `--firefox-profile=${firefoxProfile}`,
    '--keep-profile-changes',
    '--pref=remote.active-protocols=3',
    '--arg=--remote-debugging-port',
    `--arg=${debugPort}`,
    '--arg=--remote-allow-hosts',
    '--arg=localhost',
    '--arg=--remote-allow-origins',
    '--arg=*',
  ];

  if (knownExtensionBaseUrl) {
    webExtArgs.push(`--start-url=${new URL('extension/extension.html?e2eNoAutoClose=1', knownExtensionBaseUrl).toString()}`);
  }

  console.log('[e2e] Launching web-ext with Firefox...');
  console.log(`[e2e] Command: ${webExtCmd} ${webExtArgs.join(' ')}`);

  if (process.platform === 'win32' && webExtCmd.toLowerCase().endsWith('.cmd')) {
    const fullCommand = `"${webExtCmd}" ${webExtArgs.map(quoteForCmd).join(' ')}`;
    webExtProcess = spawn(fullCommand, [], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: true,
    });
  } else {
    webExtProcess = spawn(webExtCmd, webExtArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
    });
  }
  console.log(`[e2e] web-ext started (pid ${webExtProcess.pid})`);

  webExtProcess.on('error', (error) => {
    console.error('[e2e] Failed to start web-ext:', error);
    shutdown(1);
  });

  webExtProcess.on('exit', (code) => {
    if (process.exitCode == null) {
      process.exitCode = code ?? 0;
    }
  });

  const debugHost = await waitForPortOpen({
    hostCandidates: ['127.0.0.1', '::1', 'localhost'],
    port: debugPort,
  });

  // Connect via the host that was confirmed open by waitForPortOpen.
  const puppeteerHost = debugHost;
  let browser;
  try {
    console.log('[e2e] Attempting Puppeteer CDP connection via debugger endpoint...');
    const cdpEndpoint = await waitForDebuggerEndpoint({ port: debugPort });
    console.log(`[e2e] CDP endpoint discovered: ${cdpEndpoint}`);
    browser = await puppeteer.connect({
      browserWSEndpoint: cdpEndpoint,
      protocol: 'cdp',
      protocolTimeout: 30000,
      defaultViewport: null,
    });
  } catch (cdpError) {
    console.log(`[e2e] CDP connection failed (${cdpError.message}), falling back to BiDi...`);
    browser = await connectBiDiWithRetries({ host: puppeteerHost, port: debugPort });
  }

  try {
    const extensionBaseUrl = await waitForExtensionBaseUrl({ extensionId });
    console.log(`[e2e] Extension base URL detected: ${extensionBaseUrl}`);

    const openOverview = async () => {
      console.log(`[e2e] Triggering open-manager shortcut: ${openManagerShortcut}`);
      await triggerShortcut({ browser, shortcut: openManagerShortcut });
      await waitForOverviewPage({ browser, extensionBaseUrl });
    };

    try {
      await waitForOverviewPage({ browser, extensionBaseUrl, timeoutMs: 5000 });
    } catch {
      await openOverview();
    }

    await ensureOverviewE2EMode({ browser, extensionBaseUrl });

    const tests = [
      {
        name: 'basic overview initial state',
        run: async () => {
          const module = await import('./basic-overview.test.js');
          await module.runBasicOverviewTest({ browser, extensionBaseUrl });
        },
      },
      {
        name: 'controls smoke',
        run: async () => {
          const module = await import('./controls-smoke.test.js');
          await module.runControlsSmokeTest({ browser, extensionBaseUrl });
        },
      },
    ];

    for (const test of tests) {
      console.log(`[e2e] Running test: ${test.name}`);
      await test.run();
      console.log(`[e2e] Completed test: ${test.name}`);
    }
  } finally {
    await browser.disconnect();
    await stopProcessTree(webExtProcess);
    shutdown(0);
  }
}

process.on('SIGINT', () => {
  shutdown(130);
});

process.on('SIGTERM', () => {
  shutdown(143);
});

run().catch((error) => {
  console.error('[e2e] Fatal error:', error);
  stopProcessTree(webExtProcess).finally(() => {
    shutdown(1);
  });
});
