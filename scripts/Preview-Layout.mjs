import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '.tools/rea/package.json'));
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.5 });
  page.on('pageerror', e => console.error(e.message));
  await page.goto(pathToFileURL(path.join(root, 'app/src/main/assets/index.html')).href);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.evaluate(() => window.PocketSelection?.close());
  await page.locator('#leader-art').evaluate(async img => { await img.decode(); });
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.join(root, 'analysis/preview-v2'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'analysis/preview-v2/battle.png') });
  console.log('Saved battle preview.');
} finally { await browser.close(); }
