(function initializeLogger(global) {
  const nativeConsole = global.console || {
    log: function noop() {},
    warn: function noop() {},
    error: function noop() {}
  };

  let initialized = false;
  let enabled = false;
  const pendingEntries = [];

  function flushPending() {
    if (!enabled || pendingEntries.length === 0) {
      pendingEntries.length = 0;
      return;
    }

    while (pendingEntries.length > 0) {
      const entry = pendingEntries.shift();
      nativeConsole[entry.level].apply(nativeConsole, entry.args);
    }
  }

  async function detectLoggingMode() {
    if (!global.browser || !global.browser.management || !global.browser.management.getSelf) {
      return false;
    }

    try {
      const extensionInfo = await global.browser.management.getSelf();
      const installType = extensionInfo && extensionInfo.installType;

      // Log only for temporary/dev installs or non-standard installs.
      return installType === 'development' || installType === 'other';
    } catch (err) {
      return false;
    }
  }

  async function init() {
    if (initialized) {
      return enabled;
    }

    enabled = await detectLoggingMode();
    initialized = true;
    flushPending();
    return enabled;
  }

  function write(level, args) {
    if (!initialized) {
      pendingEntries.push({ level: level, args: args });
      return;
    }

    if (!enabled) {
      return;
    }

    nativeConsole[level].apply(nativeConsole, args);
  }

  var loggerApi = {
    init: init,
    isEnabled: function isEnabled() {
      return enabled;
    },
    log: function log() {
      write('log', Array.prototype.slice.call(arguments));
    },
    warn: function warn() {
      write('warn', Array.prototype.slice.call(arguments));
    },
    error: function error() {
      write('error', Array.prototype.slice.call(arguments));
    }
  };

  global.logger = loggerApi;
  void loggerApi.init();
})(globalThis);
