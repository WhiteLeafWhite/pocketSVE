import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '.tools/rea/package.json'));
const { chromium } = require('playwright-core');
const preview = path.join(root, 'analysis/preview-v2');
fs.mkdirSync(preview, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], checks = [];
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.5 });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const url = pathToFileURL(path.join(root, 'app/src/main/assets/index.html')).href;
const number = id => page.locator(id).getAttribute('data-value').then(Number);
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('pocketsve.match.v1')));
async function scan(side = 'you') {
  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await page.getByRole('button', { name: '主战者收藏', exact: false }).click();
  if (side === 'opponent') await page.locator('.side-tabs button').nth(1).click();
  await page.getByRole('button', { name: 'NFC 读取', exact: true }).click();
}
try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.ps-role-icon').count(), 14);
  await page.locator('.ps-opponent').getByRole('button', { name: '皇家护卫', exact: true }).click();
  await page.locator('.ps-own').getByRole('button', { name: '巫师', exact: true }).click();
  assert.equal((await state()).players.you.leaderId, '100003');
  assert.equal((await state()).players.opponent.leaderId, '100002');
  checks.push('原版上下准备页、4+3职业图标、双方选择');
  await page.screenshot({ path: path.join(preview, 'preparation.png') });
  await page.getByRole('button', { name: '读取卡牌', exact: true }).click();
  assert.match(await page.locator('.ps-nfc-instruction').textContent(), /Android/);
  await page.screenshot({ path: path.join(preview, 'nfc-unavailable.png') });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '开始', exact: true }).click();
  assert.equal(await number('#you-hp'), 20);
  await page.getByRole('button', { name: '我方生命减一', exact: true }).click();
  assert.equal(await number('#you-hp'), 19);
  assert.match(await page.locator('#you-hp img').first().getAttribute('src'), /lifeNumber11/);
  await page.getByRole('button', { name: '我方生命加一', exact: true }).click();
  await page.getByRole('button', { name: '回合开始', exact: true }).click();
  assert.equal(await number('#pp-current'), 1);
  await page.getByRole('button', { name: '回合开始', exact: true }).click();
  assert.equal(await number('#pp-max'), 1, '500ms start throttle');
  await page.getByRole('button', { name: '回合结束', exact: true }).click();
  assert.equal(await number('#pp-current'), 1, 'end keeps PP');
  await page.waitForTimeout(550);
  await page.getByRole('button', { name: '回合开始', exact: true }).click();
  assert.equal(await number('#pp-max'), 2);
  await page.getByRole('button', { name: '可用PP减一', exact: true }).click();
  assert.equal(await number('#pp-current'), 1);
  await page.getByRole('button', { name: 'PP上限加一', exact: true }).click();
  assert.equal(await number('#pp-current'), 1, 'max plus does not refill');
  assert.equal(await number('#pp-max'), 3);
  await page.getByRole('button', { name: '将可用PP设为3', exact: true }).click();
  assert.equal(await number('#pp-current'), 3);
  await page.getByRole('button', { name: '将可用PP设为10', exact: true }).click();
  assert.equal(await number('#pp-current'), 3, 'locked pip ignored');
  assert.equal(await page.locator('#pp-pips .pip-base').count(), 10);
  checks.push('HP纹理切换、原版独立回合按钮、500ms节流、PP上限与消耗规则');
  await page.getByRole('button', { name: '重新开始对战', exact: true }).click();
  assert.equal(await number('#pp-current'), 0);
  assert.equal(await page.locator('#modal').isHidden(), true, 'original reset has no confirmation');
  await page.getByRole('button', { name: '表情', exact: true }).click();
  assert.equal(await page.locator('#emote-tray button').count(), 4, 'default leader has three emotes plus close');
  await page.locator('#emote-tray button').nth(1).click();
  assert.equal(await page.locator('#battle-message').isVisible(), true);
  await page.getByRole('button', { name: '收起表情', exact: true }).click();
  await page.getByRole('button', { name: '重新开始对战', exact: true }).click();
  await page.screenshot({ path: path.join(preview, 'battle.png') });
  checks.push('直接重置、原版表情与台词、主屏无额外EP/标题/NFC按钮');

  await page.getByRole('button', { name: '打开对战菜单', exact: true }).click();
  await page.getByRole('button', { name: '选择主战者', exact: false }).click();
  await page.evaluate(() => {
    window.PocketNfc = {
      getStatus: () => JSON.stringify({ available: true, enabled: true, scanning: true }),
      startScan() {}, stopScan() {}, vibrate() {},
    };
  });
  await page.getByRole('button', { name: '读取卡牌', exact: true }).click();
  await page.screenshot({ path: path.join(preview, 'nfc.png') });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('pocket:nfc', { detail: { id: 'TEST', originalCard: { cardId: '0000100101', verified: false, message: '校验失败' } } })));
  assert.equal((await state()).players.you.leaderId, '100003');
  assert.match(await page.locator('#modal-body').textContent(), /校验失败/);
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('pocket:nfc', { detail: { id: 'TEST', originalCard: { cardId: '0000100101', verified: true } } })));
  assert.equal((await state()).players.you.leaderId, '100101');
  assert.equal(await page.locator('.ps-leader-thumbnail').count(), 1);
  await page.screenshot({ path: path.join(preview, 'selected-skin.png') });
  checks.push('离线模拟NFC事件：拒绝未验证原卡、成功切换原版缩略图；不代表实体读卡通过');

  await scan();
  await page.evaluate(() => {
    const payload = [2, 101, 110, ...new TextEncoder().encode('pocketsve:leader/100004')];
    window.dispatchEvent(new CustomEvent('pocket:nfc', { detail: { id: 'NDEFTEST', ndefMessage: [{ tnf: 1, type: [84], payload }] } }));
  });
  assert.equal((await state()).players.you.leaderId, '100004');
  await page.reload();
  assert.equal(await page.locator('.ps-own button[aria-pressed="true"]').getAttribute('aria-label'), '龙族');
  checks.push('NDEF扩展与选择持久化');

  const broken = await page.locator('img').evaluateAll(images => images.filter(img => img.offsetParent && (!img.complete || !img.naturalWidth)).map(img => img.src));
  assert.deepEqual(broken, []);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(preview, 'ui-checks.json'), JSON.stringify({ checks, errors, brokenImages: broken, physicalNfcTested: false }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { await browser.close(); }

