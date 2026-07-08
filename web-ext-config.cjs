const path = require('path');

const runHeadless = process.env.E2E_HEADLESS === '1';

module.exports = {
  verbose: true,
  run: {
    firefox: 'C:\\Program Files\\Firefox Developer Edition\\firefox.exe',
    firefoxProfile: path.resolve(__dirname, 'tests/e2e/profile'),
    startUrl: ['https://example.com'],
    args: runHeadless ? ['--headless'] : []
  }
};
