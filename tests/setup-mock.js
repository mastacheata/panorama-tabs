import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'webext-schema';

/**
 * Creates a fresh, isolated background script execution context for unit testing.
 * Every background script runs sequentially inside a clean Node.js VM context
 * with its own mocked browser API instance.
 */
export function createBackgroundContext() {
  const schema = new Schema();
  const browserMock = schema.mock();

  // Pre-seed common API resolved values to ensure standard pathways execute
  browserMock.storage.local.get.resolves({});
  browserMock.storage.local.set.resolves();
  browserMock.storage.sync.get.resolves({});
  browserMock.storage.sync.set.resolves();
  browserMock.tabs.query.resolves([]);

  const context = {
    window: null,
    browser: browserMock,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    URL,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
  };
  
  // Set up window circular reference
  context.window = context;
  
  vm.createContext(context);

  const scripts = [
    'background/storage.js',
    'background/actions.js',
    'background/listeners.js',
    'background.js'
  ];

  for (const script of scripts) {
    const code = fs.readFileSync(path.resolve(script), 'utf8');
    vm.runInContext(code, context, { filename: script });
  }

  return { context, browserMock };
}
