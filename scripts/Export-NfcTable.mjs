import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'app/src/main/assets');
const context = vm.createContext({ window: {} });
for (const file of ['catalog.js', 'leader-lines.js', 'leader-audio.js', 'custom-leaders.js']) {
  vm.runInContext(fs.readFileSync(path.join(assets, file), 'utf8'), context, { filename: file });
}
const { POCKET_CATALOG: catalog, POCKET_AUDIO: audio } = context.window;
const { resolveTag } = createRequire(import.meta.url)(path.join(assets, 'core.js'));
const exists = file => Boolean(file && fs.existsSync(path.join(assets, file)));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const classes = new Map(catalog.classes.map(item => [item.id, item.name]));
const rows = catalog.leaders.map(leader => {
  const text = `pocketsve:leader/${leader.id}`;
  const result = resolveTag({ ndefMessage: [{ tnf: 1, type: [84], payload: [2, 101, 110, ...Buffer.from(text)] }] }, catalog.leaders);
  assert.equal(result.status, 'matched');
  assert.equal(result.id, leader.id);
  assert.equal(result.source, 'ndef');
  const voices = audio.leaders[leader.id] || {};
  const events = [['enter', '登场'], ['start', '回合开始'], ['end', '回合结束'], ['scan', '读卡']]
    .filter(([key]) => exists(voices[key])).map(([, label]) => label);
  const emotes = Object.values(voices.emotes || {}).filter(exists).length;
  if (emotes) events.push(`表情 ${emotes} 条`);
  const thumbnail = [leader.thumbnail, `art/Class_thumbnail${leader.skinId}Png.webp`, leader.portrait].find(exists);
  const mime = thumbnail?.endsWith('.png') ? 'image/png' : 'image/webp';
  return {
    ...leader, text, className: classes.get(leader.classId),
    art: exists(leader.portrait) && exists(leader.background),
    artText: [exists(leader.portrait) ? '立绘有' : '立绘缺', exists(leader.background) ? '背景有' : '背景缺'].join(' / '),
    voices: events.join('、') || '暂无语音素材',
    image: thumbnail ? `data:${mime};base64,${fs.readFileSync(path.join(assets, thumbnail)).toString('base64')}` : '',
    note: /^主战者 \d+$/.test(leader.name) ? '名称尚未恢复，请按编号及图片辨认' : leader.id === 'svgdb-2808' ? '自定义角色；按要求归为皇家护卫' : '',
  };
}).sort((a, b) => Number(a.classId) - Number(b.classId) || a.id.localeCompare(b.id, 'en', { numeric: true }));
assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
const complete = rows.filter(row => row.art).length;
const markup = rows.map(row => `<tr data-class="${escape(row.classId)}" data-art="${row.art}" data-search="${escape([row.name, row.aliases || '', row.id, row.skinId, row.className].join(' ').toLowerCase())}">
<td>${row.image ? `<img loading="lazy" src="${row.image}" alt="${escape(row.name)}">` : '<span class="muted">暂无图片</span>'}</td>
<td><strong>${escape(row.name)}</strong><small>${escape(row.note)}</small></td>
<td>${escape(row.className)}</td><td><code>${escape(row.id)}</code><small>皮肤 ${escape(row.skinId)}</small></td>
<td><code class="payload">${escape(row.text)}</code><button class="copy" data-text="${escape(row.text)}" aria-label="复制 ${escape(row.id)} 的写入文本">复制</button></td>
<td><span class="${row.art ? 'ok' : 'missing'}">${row.artText}</span><small>${escape(row.voices)}</small></td></tr>`).join('\n');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PocketSVE NFC 主战者对照表</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f5f8;color:#172638;font:15px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1440px;margin:auto;padding:32px 24px}h1{font-size:29px;margin:0 0 8px}.intro{max-width:980px}.muted,small{color:#607084}small{display:block;font-size:12px;max-width:260px;margin-top:4px}code{font-family:Consolas,monospace}.steps{background:white;border-left:4px solid #267a78;padding:14px 22px;border-radius:8px;margin:20px 0}.steps p{margin:6px 0}.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:22px 0}input[type=search]{min-width:240px;flex:1}input[type=search],select,button{font:inherit;border:1px solid #bdc9d6;border-radius:7px;padding:9px 12px;background:white}button{cursor:pointer;color:#166764}.copy{font-size:13px;margin:6px 0 0;display:block;padding:4px 12px}.table-wrap{overflow:auto;background:white;border:1px solid #d7e0e9;border-radius:12px}table{border-collapse:collapse;width:100%;min-width:1000px}th{text-align:left;background:#e7eef4;padding:14px;white-space:nowrap}td{border-top:1px solid #e3e9ef;padding:12px 14px;vertical-align:middle}td:first-child{width:104px}img{width:76px;height:88px;object-fit:contain;background:#e6ecf2;border-radius:8px}.payload{white-space:nowrap;font-size:14px;user-select:all}.ok{color:#19675e}.missing{color:#93551a}tr[hidden]{display:none}#status{min-height:24px;color:#19675e}footer{margin-top:22px;color:#607084;font-size:13px}@media(max-width:600px){main{padding:22px 14px}h1{font-size:24px}.controls{align-items:stretch;flex-direction:column}.table-wrap{border-radius:8px}}@media print{.controls,.copy,#status{display:none}.table-wrap{overflow:visible}main{padding:0}table{min-width:0;font-size:11px}.payload{font-size:10px}th,td{padding:5px}img{width:40px;height:50px}tr{break-inside:avoid}}
</style><main>
<h1>PocketSVE · NFC 主战者对照表</h1>
<div class="intro">适用 v0.4.0 · 共 ${rows.length} 个编号 · ${complete} 个有立绘和背景，${rows.length - complete} 个缺少美术素材。名称和职业以当前 APK 的目录为准；同名条目可能使用不同皮肤或边框，请以编号区分。</div>
<div class="steps"><p><strong>写卡：</strong>NFC Tools → 写入 → 添加记录 → 文本（Text，UTF-8）→ 粘贴表内完整文本 → 写入空白、可写的 NTAG213 / 215 / 216 卡。</p>
<p><strong>使用：</strong>打开 PocketSVE → 读取卡牌 → 扫卡 → 开始。建议每张卡只保留一条主战者文本记录；应用按第一条匹配的记录选择角色。</p>
<p>不填 SVGDB 网页地址，不需要绑定 UID。卡片只保存编号，图片和语音由 APK 提供。此格式供 PocketSVE 使用，原官方应用不支持。</p></div>
<div class="controls"><input id="search" type="search" aria-label="搜索主战者" placeholder="搜索名称、编号或职业"><select id="class" aria-label="筛选职业"><option value="">全部职业</option>${catalog.classes.map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('')}</select><label><input type="checkbox" id="art"> 仅显示有立绘和背景的角色</label><span id="count"></span></div>
<div id="status" role="status" aria-live="polite"></div><div class="table-wrap"><table><thead><tr><th>图片</th><th>主战者</th><th>职业</th><th>编号 / 皮肤</th><th>NFC 文本（完整复制）</th><th>当前 APK 素材</th></tr></thead><tbody>${markup}</tbody></table></div>
<footer>数据来源：本项目 catalog.js、custom-leaders.js、leader-audio.js 及实际素材文件。生成时已将全部 ${rows.length} 条文本逐一送入应用的 NDEF 解析逻辑，均匹配对应编号；尚未用实体 NFC 手机和卡片验证。缺少素材的编号可以识别，但不会凭空下载或补齐人物图片。页面图片已内嵌，单独保存此 HTML 即可离线使用。</footer>
<script>
const rows = [...document.querySelectorAll('tbody tr')];
function filter() {
  const query = document.getElementById('search').value.trim().toLowerCase();
  const craft = document.getElementById('class').value;
  const art = document.getElementById('art').checked;
  for (const row of rows) row.hidden = !row.dataset.search.includes(query) || (craft && row.dataset.class !== craft) || (art && row.dataset.art !== 'true');
  document.getElementById('count').textContent = rows.filter(row => !row.hidden).length + ' / ' + rows.length + ' 项';
}
document.getElementById('search').addEventListener('input', filter);
document.getElementById('class').addEventListener('change', filter);
document.getElementById('art').addEventListener('change', filter);
document.addEventListener('click', async event => {
  const button = event.target.closest('button.copy');
  if (!button) return;
  let copied = false;
  try { await navigator.clipboard.writeText(button.dataset.text); copied = true; } catch (_) {
    const field = document.createElement('textarea'); field.value = button.dataset.text;
    field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field); field.select();
    try { copied = document.execCommand('copy'); } finally { field.remove(); }
  }
  if (!copied) { const range = document.createRange(); range.selectNodeContents(button.previousElementSibling); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
  document.getElementById('status').textContent = copied ? '已复制：' + button.dataset.text : '已选中文本，请长按或按 Ctrl+C 复制。';
});
filter();
</script></main></html>`;
const output = path.join(root, 'dist/pocketSVE-v0.4.0-nfc-table.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);
console.log(JSON.stringify({ output, leaders: rows.length, withArt: complete, missingArt: rows.length - complete, bytes: Buffer.byteLength(html), ndefMatches: rows.length }, null, 2));
