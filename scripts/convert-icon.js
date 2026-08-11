import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertSvgToPng() {
  const svgPath = path.resolve(__dirname, '../icons/icon-128.svg');
  const pngPath = path.resolve(__dirname, '../icons/icon-128.png');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 128, height: 128, deviceScaleFactor: 1 });
  await page.goto(`file://${svgPath}`);
  
  // Take screenshot with transparent background
  await page.screenshot({
    path: pngPath,
    omitBackground: true,
    clip: { x: 0, y: 0, width: 128, height: 128 }
  });

  await browser.close();
  console.log(`Successfully generated ${pngPath}`);
}

convertSvgToPng().catch(err => {
  console.error('Error generating PNG:', err);
  process.exit(1);
});
