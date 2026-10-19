import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '.tools/rea/package.json'));
const { chromium } = require('playwright-core');
const output = path.join(root, 'analysis/preview-v4');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
const errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(pathToFileURL(path.join(root, 'app/src/main/assets/index.html')).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await page.getByRole('button', { name: '主战者收藏', exact: false }).click();
  await page.getByRole('searchbox').fill('2808');
  assert.equal(await page.locator('.leader-option').count(), 1);
  await page.getByRole('button', { name: '选择洛菈米亚（Ralmia）', exact: true }).click();
  assert.equal(await page.locator('.ps-custom-thumbnail').count(), 1);
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.waitForFunction(() => window.PocketAudio.getState().voice.currentTime > .05);
  assert.equal(await page.evaluate(() => window.PocketAudio.getState().voice.path), 'audio/ralmia-2808-jp-008.mp3');
  assert.equal(await page.locator('#leader-art').isHidden(), true, 'user full artwork must not receive a duplicate portrait overlay');
  const entry = await page.evaluate(() => window.POCKET_CATALOG.leaders.find(item => item.id === 'svgdb-2808'));
  assert.equal(entry.classId, '2');
  const royalFrame = await page.evaluate(() => window.POCKET_CATALOG.leaders.find(item => item.id === '100002').frame);
  assert.equal(entry.frame, royalFrame);
  await page.evaluate(async () => { await document.fonts.ready; const image = new Image(); image.src = 'custom/ralmia/background.jpg'; await image.decode(); });
  await page.waitForTimeout(2800); // Let the ordinary selection toast expire before visual review.
  const anchors = [];
  for (const viewport of [{ width: 412, height: 915 }, { width: 360, height: 800 }, { width: 540, height: 960 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const anchor = await page.evaluate(() => {
      const layout = window.POCKET_CATALOG.leaders.find(item => item.id === 'svgdb-2808').backgroundLayout;
      const background = document.getElementById('battle-background');
      const [width, height] = background.style.backgroundSize.split(' ').map(parseFloat);
      const [left, top] = background.style.backgroundPosition.split(' ').map(parseFloat);
      const stageHeight = parseFloat(document.getElementById('scene').style.height);
      return { x: (left + width * layout.faceX) / 750, y: (top + height * layout.faceY) / stageHeight };
    });
    assert.ok(Math.abs(anchor.x - .5) < .001 && Math.abs(anchor.y - .64) < .001);
    anchors.push({ viewport, anchor });
    await page.screenshot({ path: path.join(output, `ralmia-${viewport.width}x${viewport.height}.png`) });
  }
  checks.push('Custom Royal leader selection, entry voice, original supplied background, no duplicate portrait; face anchor 50% x / 64% y on three phone ratios');
  await page.getByRole('button', { name: '表情', exact: true }).click();
  await page.getByRole('button', { name: '打招呼', exact: true }).click();
  await page.waitForFunction(() => window.PocketAudio.getState().voice.currentTime > .05);
  assert.equal(await page.evaluate(() => window.PocketAudio.getState().voice.error), null);
  assert.equal(await page.evaluate(() => window.PocketAudio.getState().voice.path), 'audio/ralmia-2808-jp-001.mp3');
  await page.reload();
  assert.equal(await page.locator('.ps-custom-thumbnail').count(), 1);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.evaluate(() => { window.PocketNfc = { startScan() {}, stopScan() {}, vibrate() {}, getStatus: () => JSON.stringify({ available: true, enabled: true, scanning: true }) }; });
  await page.getByRole('button', { name: '读取卡牌', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('pocket:nfc', { detail: {
    format: 'pocketsve-ndef', id: 'TEST', ndefMessage: [{ tnf: 1, type: [84], payload: [2, 101, 110, ...new TextEncoder().encode('pocketsve:leader/svgdb-2808')] }],
  } })));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pocketsve.match.v1')));
  assert.equal(stored.players.you.leaderId, 'svgdb-2808');
  assert.equal(await page.locator('.ps-custom-thumbnail').count(), 1);
  assert.equal(await page.locator('.pocket-selection-nfc').count(), 0);
  await page.screenshot({ path: path.join(output, 'ralmia-after-ndef.png') });
  checks.push('Greeting audio decodes, selection persists across reload, simulated NFC Text record restores the exact custom leader and closes the scanner');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks, anchors, errors, physicalNfcTested: false }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { await browser.close(); }
