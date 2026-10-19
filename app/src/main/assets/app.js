(function () {
  'use strict';
  const C = window.PocketCore;
  const catalog = window.POCKET_CATALOG || { classes: [], leaders: [] };
  const leaders = catalog.leaders;
  const byId = new Map(leaders.map(item => [String(item.id), item]));
  const $ = id => document.getElementById(id);
  const storageKey = 'pocketsve.match.v1';
  let state, modalKind = '', activeSide = 'you', activeClass = '', query = '', lastFocus;
  let scanTarget = 'you', pendingBinding = '', lastTag = null, nativeStatus = null;
  let scanUi = null, lastStartAt = 0;
  let emoteLeader = '', battleMessageTimer;
  let undo = [], log = [], toastTimer, repeatTimer, repeatInterval, toastMessage = '';
  let bindings = {};
  const titleFor = side => side === 'opponent' ? '对手' : '我方';
  const leaderFor = side => byId.get(String(state.players[side].leaderId));
  const classNameFor = leader => catalog.classes.find(item => String(item.id) === String(leader.classId))?.name || '';
  const safeLeaderName = leader => leader?.name || '未选择';

  function node(tag, props, children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key === 'text') element.textContent = value;
      else if (key === 'className') element.className = value;
      else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
      else element.setAttribute(key, value);
    }
    for (const child of children || []) element.append(child);
    return element;
  }
  function load() {
    try { state = C.restoreState(JSON.parse(localStorage.getItem(storageKey)), leaders.map(item => String(item.id))); } catch (_) {}
    if (!state) state = C.initialState(byId.has('100001') ? '100001' : leaders.find(item => item.available)?.id, byId.has('100002') ? '100002' : leaders.find(item => item.available && item.classId !== '1')?.id);
    try {
      const saved = JSON.parse(localStorage.getItem('pocketsve.bindings.v1'));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) bindings = saved;
    } catch (_) {}
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { toast('本机存储暂不可用，本次对战仍可继续'); }
  }
  function toast(message) {
    toastMessage = message;
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2700);
  }
  function vibrate() {
    if (state.muted) return;
    try { window.PocketNfc?.vibrate(); } catch (_) {}
  }
  function gameToast(message) {
    clearTimeout(battleMessageTimer);
    $('battle-message').textContent = message || '';
    $('battle-message').hidden = !message;
    if (message) battleMessageTimer = setTimeout(() => { $('battle-message').hidden = true; }, 4000);
  }
  function setEmotesOpen(open) {
    $('emote-tray').hidden = !open;
    $('emote-button').hidden = open;
  }
  function renderEmotes() {
    const id = String(state.players.you.leaderId);
    if (id === emoteLeader) return;
    emoteLeader = id;
    const lines = window.POCKET_LINES?.[id];
    const items = lines?.emotes || [];
    $('emote-region').classList.toggle('many', items.length > 4);
    const tray = $('emote-tray');
    tray.replaceChildren(node('button', { className: 'emote-close', 'aria-label': '收起表情', onclick: () => setEmotesOpen(false) }, [node('img', { src: 'ui/emote_btn_emote_menu_l_off.png', alt: '' })]));
    for (const item of items) tray.append(node('button', { 'aria-label': item.text || '表情' + item.icon, onclick: () => { gameToast(item.text); window.PocketAudio?.playLeader(id, 'emote', item.icon); } },
      [node('img', { src: 'ui/emote_btn_emote_0' + item.icon + '_off.png', alt: '' })]));
    setEmotesOpen(false);
  }
  function commit(action, message, remember = true) {
    const next = C.transition(state, action);
    if (JSON.stringify(state) === JSON.stringify(next)) return;
    if (action.type === 'reset' || next.players.you.leaderId !== state.players.you.leaderId) window.PocketAudio?.stop('voice');
    if (remember) {
      undo.push(JSON.stringify(state));
      if (undo.length > 40) undo.shift();
      if (message) log.unshift({ message, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) });
      if (log.length > 80) log.pop();
    }
    state = next;
    persist();
    render();
    window.PocketSelection?.update(state);
  }
  function fit() {
    const width = window.innerWidth, height = window.innerHeight;
    const ratio = Number((height / width).toFixed(3));
    const wider = ratio - 1.778 < -.05;
    const designWidth = wider ? height / (16 / 9) : width;
    const scale = designWidth / 750;
    const stage = $('scene');
    stage.style.height = height / scale + 'px';
    stage.style.left = (width - 750 * scale) / 2 + 'px';
    stage.style.transform = 'scale(' + scale + ')';
    // Hermes #12058 truncates pxTransform input before scaling. The original
    // screen-based formulas mix dp and design values; keep that order intact.
    const G = n => Math.trunc(n);
    const t = (designWidth / height - 6 / 13) / (9 / 16 - 6 / 13);
    const lerp = (a, b) => a + (b - a) * t;
    const is169 = Math.abs(Number((height / designWidth).toFixed(3)) - 1.778) <= .05;
    const marginTop = wider ? 0 : 35 / scale;
    $('battle-content').style.top = marginTop + 'px';
    $('blood-region').style.top = G(designWidth * .15) + 'px';
    $('stars').style.top = G(designWidth * .284375 + (wider ? 0 : 25)) + 'px';
    $('stars').style.bottom = G(wider ? 11.8 : is169 ? -13.2 : lerp(57.9, 11.8) - 25) + 'px';
    $('bottom-controls').style.bottom = G(wider || is169 ? designWidth * .09375 : lerp(113.6, 67.5)) + 'px';
    $('reset-button').style.top = (wider ? 600 : 650) + 'px';
    const artSize = ratio < 1.778 ? .8084 * height / scale : 1.4375 * width / scale;
    const artBottom = ratio <= 1.778 ? -.2434 * height / scale : Math.min(0, lerp(-.03125 * width, -.4328 * width)) / scale;
    $('leader-art').style.width = artSize + 'px';
    $('leader-art').style.height = artSize + 'px';
    $('leader-art').style.bottom = artBottom + 'px';
  }
  function digits(element, value, kind) {
    element.dataset.value = String(value);
    element.replaceChildren(...String(value).split('').map(digit => node('img', {
      src: kind === 'hp' ? 'art/assets_game_life_lifeNumber' + digit + (value < 20 ? digit : '') + 'Png.webp' :
        'ui/ppnumber_pp_' + digit + (kind === 'pp' ? '_' + digit : '') + '.png', alt: digit,
    })));
  }
  function render() {
    for (const side of ['you', 'opponent']) {
      digits($(side + '-hp'), state.players[side].hp, 'hp');
      $(side + '-hp').setAttribute('aria-label', '设置' + titleFor(side) + '生命值，当前' + state.players[side].hp);
      const selected = leaderFor(side);
      const panel = document.querySelector('.life-panel.' + side);
      panel.style.setProperty('--leader-frame', selected?.frame ? 'url("' + encodeURI(selected.frame).replace(/"/g, '%22') + '")' : 'none');
    }
    const leader = leaderFor('you');
    renderEmotes();
    const image = $('leader-art');
    if (leader?.portrait && image.getAttribute('src') !== leader.portrait) image.src = leader.portrait;
    image.hidden = !leader?.portrait;
    image.alt = safeLeaderName(leader);
    $('battle-background').style.backgroundImage = leader?.background ? 'url("' + encodeURI(leader.background).replace(/"/g, '%22') + '")' : '';
    digits($('pp-current'), state.pp, 'pp');
    digits($('pp-max'), state.maxPp, 'max');
    $('pp-pips').replaceChildren(...Array.from({ length: 10 }, (_, index) => {
      const number = index + 1;
      const pip = node('button', {
        className: 'pp-pip' + (number <= state.maxPp ? ' enabled' : ''),
        'aria-label': '将可用PP设为' + number, 'aria-pressed': number <= state.pp ? 'true' : 'false',
        onclick: () => {
          if (number > state.maxPp) return;
          commit({ type: 'pp', value: state.pp === number ? number - 1 : number }, '调整可用 PP');
        },
      }, [node('img', { className: 'pip-base', src: 'ui/battle_pp_base.png', alt: '' }),
        ...(number <= state.maxPp ? [node('img', { src: number <= state.pp ? 'ui/battle_icon_pp_on.png' : 'ui/battle_icon_pp_off.png', alt: '' })] : []), node('span', { text: number })]);
      return pip;
    }));
  }
  function showModal(title, kind) {
    if (modalKind === 'scan' && kind !== 'scan') { stopScan(); window.PocketSelection.hideNfc(); scanUi = null; }
    lastFocus = document.activeElement;
    modalKind = kind;
    $('modal-title').textContent = title;
    $('modal-body').replaceChildren();
    $('modal').hidden = false;
    $('modal-close').focus();
  }
  function closeModal() {
    if (modalKind === 'scan') stopScan();
    window.PocketSelection?.hideNfc();
    scanUi = null;
    modalKind = '';
    $('modal').hidden = true;
    pendingBinding = '';
    lastFocus?.focus();
  }
  function footer(primaryLabel, primaryAction, secondaryLabel, secondaryAction) {
    const items = [];
    if (secondaryLabel) items.push(node('button', { className: 'secondary-button', text: secondaryLabel, onclick: secondaryAction }));
    items.push(node('button', { className: 'primary-button', text: primaryLabel, onclick: primaryAction }));
    return node('div', { className: 'modal-footer' }, items);
  }
  function sideTabs(selected, action) {
    return node('div', { className: 'side-tabs' }, ['you', 'opponent'].map(side => node('button', {
      className: side === selected ? 'active' : '', text: titleFor(side), onclick: () => action(side),
    })));
  }
  function selectLeader(id) {
    if (!byId.has(String(id))) return;
    const binding = pendingBinding;
    commit({ type: 'leader', side: activeSide, id: String(id) }, titleFor(activeSide) + '选择 ' + safeLeaderName(byId.get(String(id))));
    if (binding) {
      bindings[binding.toUpperCase()] = String(id);
      try { localStorage.setItem('pocketsve.bindings.v1', JSON.stringify(bindings)); } catch (_) {}
      toast('已绑定标签，下次贴卡即可切换主战者');
    } else toast('已选择 ' + safeLeaderName(byId.get(String(id))));
    closeModal();
    vibrate();
  }
  function showLeaderGrid() {
    const grid = $('leader-grid');
    if (!grid) return;
    const items = leaders.filter(item => (!activeClass || String(item.classId) === activeClass) &&
      (!query || (item.name + ' ' + classNameFor(item) + ' ' + item.id).toLowerCase().includes(query.toLowerCase())))
      .sort((a, b) => Number(b.available) - Number(a.available));
    grid.replaceChildren(...items.map(item => {
      const image = item.portrait ? node('img', { src: item.portrait, alt: item.name, loading: 'lazy' }) : node('div', { className: 'unavailable-art', text: '立绘未收录' });
      const button = node('button', {
        className: 'leader-option' + (String(state.players[activeSide].leaderId) === String(item.id) ? ' selected' : ''),
        'aria-label': '选择' + item.name, onclick: () => selectLeader(item.id),
      }, [image, node('span', { className: 'leader-option-name', text: item.name }), node('small', { text: classNameFor(item) + (item.skinId ? ' · ' + item.id : '') })]);
      return button;
    }));
    if (!items.length) grid.append(node('div', { className: 'empty-state', text: '没有找到符合条件的主战者' }));
  }
  function openLeaders(side, bindUid) {
    activeSide = side || 'you';
    activeClass = '';
    query = '';
    pendingBinding = bindUid || '';
    showModal(pendingBinding ? '绑定 NFC 主战者' : '选择主战者', 'leaders');
    const body = $('modal-body');
    if (pendingBinding) body.append(node('p', { text: '选择与此标签关联的主战者。此绑定仅保存在本机。' }));
    body.append(sideTabs(activeSide, sideValue => {
      activeSide = sideValue;
      body.querySelectorAll('.side-tabs button').forEach((button, index) => button.classList.toggle('active', index === (sideValue === 'you' ? 0 : 1)));
      showLeaderGrid();
    }));
    const tabs = node('div', { className: 'class-tabs' });
    for (const item of [{ id: '', name: '全部' }, ...catalog.classes]) tabs.append(node('button', {
      className: item.id === '' ? 'active' : '', text: item.name,
      onclick: () => {
        activeClass = String(item.id);
        [...tabs.children].forEach(button => button.classList.toggle('active', button.textContent === item.name));
        showLeaderGrid();
      },
    }));
    body.append(tabs);
    body.append(node('input', { className: 'leader-search', type: 'search', placeholder: '搜索主战者名称 / 编号', 'aria-label': '搜索主战者', oninput: event => { query = event.target.value.trim(); showLeaderGrid(); } }));
    body.append(node('div', { id: 'leader-grid', className: 'leader-grid' }));
    body.append(footer('完成', closeModal, 'NFC 读取', () => openScan(activeSide)));
    showLeaderGrid();
  }
  function openMenu() {
    showModal('对战菜单', 'menu');
    const list = node('div', { className: 'menu-list' });
    for (const [name, action] of [
      ['选择主战者', openPreparation], ['主战者收藏', () => openLeaders('you')],
      ['对战记录', openHistory], ['撤销上一步', () => { undoLast(); closeModal(); }], ['对战设置', openSettings], ['重新开始', confirmReset],
    ]) list.append(node('button', { text: name, onclick: action }, [node('span', { text: '›' })]));
    $('modal-body').append(list, footer('返回对战', closeModal));
  }
  function openPreparation() {
    window.PocketAudio?.stop();
    clearTimeout(toastTimer); $('toast').hidden = true;
    gameToast('');
    closeModal();
    window.PocketSelection.open({ catalog, state,
      onSelect: (side, id) => commit({ type: 'leader', side, id }, titleFor(side) + '选择主战者'),
      onScan: side => openScan(side),
      onSkins: side => { window.PocketSelection.close(); openLeaders(side); },
      onMenu: openMenu,
      onStart: () => { commit({ type: 'reset' }, '开始对战'); window.PocketSelection.close(); },
      onClose: () => window.PocketSelection.close(),
    });
  }
  function openSettings() {
    showModal('对战设置', 'settings');
    const body = $('modal-body');
    const sound = node('div', { className: 'setting-row' }, [node('span', { text: '语音与音效' })]);
    sound.append(node('button', { 'aria-label': '切换语音与音效', 'aria-pressed': String(window.PocketAudio?.isEnabled() ?? true), text: window.PocketAudio?.isEnabled() ? '已开启' : '已关闭', onclick: () => { window.PocketAudio?.setEnabled(!window.PocketAudio.isEnabled()); openSettings(); } }));
    const feedback = node('div', { className: 'setting-row' }, [node('span', { text: '触觉反馈' })]);
    feedback.append(node('button', { text: state.muted ? '已关闭' : '已开启', onclick: () => { commit({ type: 'muted', value: !state.muted }, '调整触觉反馈'); openSettings(); } }));
    const bindingsRow = node('div', { className: 'setting-row' }, [node('span', { text: '本机 NFC 标签绑定 · ' + Object.keys(bindings).length })]);
    bindingsRow.append(node('button', { text: '清除', onclick: () => {
      showModal('清除标签绑定', 'confirm');
      $('modal-body').append(node('p', { text: '仅清除手动设置的本机标签关联，原版主战者卡的识别不受影响。' }), footer('确认清除', () => {
        bindings = {};
        try { localStorage.removeItem('pocketsve.bindings.v1'); } catch (_) {}
        openSettings();
      }, '取消', openSettings));
    } }));
    body.append(sound, feedback, bindingsRow, node('p', { className: 'app-note', text: 'PocketSVE · 主战者与对战数据离线可用' }), footer('完成', closeModal, '重新开始', confirmReset));
  }
  function confirmReset() {
    showModal('重新开始对战', 'confirm');
    $('modal-body').append(node('p', { text: '恢复双方生命值至 20，重置 PP 和回合数。保留已选择的主战者。' }),
      footer('重新开始', () => { commit({ type: 'reset' }, '重新开始对战'); closeModal(); toast('新对战已准备就绪'); }, '取消', closeModal));
  }
  function openHistory() {
    showModal('对战记录', 'history');
    const list = node('ol', { className: 'history-list' });
    for (const item of log) list.append(node('li', {}, [node('span', { text: item.message }), node('time', { text: item.time })]));
    if (!log.length) list.append(node('li', { text: '本次打开应用后尚无操作记录' }));
    $('modal-body').append(list, footer('返回对战', closeModal));
  }
  function setLife(side) {
    showModal('设置' + titleFor(side) + '生命值', 'life');
    const input = node('input', { className: 'number-input', type: 'number', min: '0', max: '999', inputmode: 'numeric', value: state.players[side].hp, 'aria-label': '生命值' });
    const submit = () => {
      if (input.value.trim() === '' || !Number.isFinite(Number(input.value))) { toast('请输入 0 到 999 的生命值'); return; }
      commit({ type: 'setHp', side, value: input.value }, '设置' + titleFor(side) + '生命值为 ' + C.clamp(input.value, 0, 999));
      closeModal();
    };
    input.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    $('modal-body').append(input, footer('确定', submit, '取消', closeModal));
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }
  function stopScan() {
    try { window.PocketNfc?.stopScan(); } catch (_) {}
  }
  function getNativeStatus() {
    try {
      const value = window.PocketNfc?.getStatus();
      if (typeof value === 'string') return JSON.parse(value);
      if (value && typeof value === 'object') return value;
    } catch (_) {}
    return { available: false, enabled: false, state: 'browser', message: '请在 Android 应用中使用 NFC 读取。' };
  }
  function updateScanStatus(status) {
    nativeStatus = status;
    if (modalKind !== 'scan') return;
    if (scanUi) {
      const instruction = scanUi.querySelector('.ps-nfc-instruction');
      instruction.textContent = status.scanning ? '请把手机放到卡牌上，如没有读取到数据，\n请尝试调整卡牌的位置。' : (status.message || '请开启手机 NFC 后重新读取。');
      const footer = scanUi.querySelector('.ps-nfc-footer');
      footer.querySelector('[data-nfc-settings]')?.remove();
      if (status.available && !status.enabled) footer.prepend(node('button', { 'data-nfc-settings': '', className: 'ps-image-button ps-blue ps-nfc-close', text: '开启 NFC', onclick: () => { window.PocketNfc?.openSettings(); } }));
      return;
    }
    const message = $('scan-message');
    const detail = $('scan-detail');
    const ring = $('scan-ring');
    if (!message) return;
    ring.classList.toggle('active', !!status.scanning);
    message.textContent = status.message || (status.scanning ? '将主战者卡贴近手机 NFC 感应区' : status.enabled ? '准备读取主战者卡' : status.available ? '请开启手机 NFC' : '当前设备未提供 NFC');
    detail.textContent = status.scanning ? '读取过程中请保持卡片贴合，完成后将自动切换主战者。' : '也可以直接在主战者列表中选择。';
    const settings = $('nfc-settings');
    if (settings) settings.hidden = !status.available || !!status.enabled;
  }
  function openScan(side) {
    scanTarget = side || 'you';
    lastTag = null;
    closeModal();
    modalKind = 'scan';
    lastFocus = document.activeElement;
    scanUi = window.PocketSelection.showNfc({ onClose: closeModal });
    updateScanStatus(getNativeStatus());
    if (window.PocketNfc) {
      try { window.PocketNfc.startScan(); updateScanStatus(getNativeStatus()); } catch (_) { toast('无法开始 NFC 读取'); }
    }
  }
  function onTag(tag) {
    if (modalKind !== 'scan') return;
    lastTag = tag;
    const result = C.resolveTag(tag, leaders, bindings);
    if (result.status === 'matched') {
      commit({ type: 'leader', side: scanTarget, id: result.id }, titleFor(scanTarget) + ' NFC 识别 ' + byId.get(result.id).name);
      closeModal();
      toast('已读取：' + byId.get(result.id).name + (byId.get(result.id).available ? '' : '（当前资源无立绘）'));
      vibrate();
      return;
    }
    stopScan();
    window.PocketSelection.hideNfc();
    scanUi = null;
    showModal('读取卡牌', 'scan-result');
    const body = $('modal-body');
    body.replaceChildren();
    const message = result.status === 'invalid' ? result.message : result.status === 'unknown-card' ? '卡片已读取，但此主战者未收录在当前资源中。' : '已读取 NFC 标签，可以在本机为它绑定主战者。';
    body.append(node('p', { className: 'scan-message', text: message }));
    body.append(node('div', { className: 'scan-summary', text: result.id ? '卡片编号：' + result.id : '标签 UID：' + (tag.id || '未知') }));
    const bindUid = String(tag.id || '').toUpperCase();
    body.append(footer('重新读取', () => openScan(scanTarget), bindUid ? '手动选择并绑定' : '手动选择', () => openLeaders(scanTarget, bindUid)));
  }
  function rollDice() {
    if (window.PocketDice?.isOpen()) return;
    window.PocketDice.open({ onResult: result => {
      log.unshift({ message: '掷骰子：' + result, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) });
      if (log.length > 80) log.pop();
    } });
    vibrate();
  }
  function undoLast() {
    if (!undo.length) return;
    const previous = C.restoreState(JSON.parse(undo.pop()), leaders.map(item => String(item.id)));
    if (!previous) return;
    state = previous;
    log.unshift({ message: '撤销上一步', time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) });
    persist(); render(); toast('已撤销');
  }
  function stopRepeat() {
    clearTimeout(repeatTimer); clearInterval(repeatInterval);
    repeatTimer = null; repeatInterval = null;
  }
  for (const button of document.querySelectorAll('[data-life]')) {
    const adjust = () => {
      const side = button.dataset.life, delta = Number(button.dataset.delta);
      commit({ type: 'hp', side, delta }, titleFor(side) + '生命 ' + (delta > 0 ? '+' : '') + delta);
      vibrate();
    };
    button.addEventListener('click', adjust);
  }
  $('menu-button').addEventListener('click', openMenu);
  $('reset-button').addEventListener('click', () => { commit({ type: 'reset' }, '重置对战'); setEmotesOpen(false); gameToast(''); });
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', event => { if (event.target === $('modal')) closeModal(); });
  for (const button of document.querySelectorAll('[data-select]')) button.addEventListener('click', () => openLeaders(button.dataset.select));
  $('turn-button').addEventListener('click', () => {
    const now = performance.now();
    if (now - lastStartAt < 500) return;
    lastStartAt = now;
    commit({ type: 'startTurn' }, '开始我方第 ' + (state.turn + 1) + ' 回合');
    gameToast(window.POCKET_LINES?.[state.players.you.leaderId]?.start);
    window.PocketAudio?.playLeader(state.players.you.leaderId, 'start');
    vibrate();
  });
  $('end-turn-button').addEventListener('click', () => { commit({ type: 'endTurn' }, '回合结束'); gameToast(window.POCKET_LINES?.[state.players.you.leaderId]?.end); window.PocketAudio?.playLeader(state.players.you.leaderId, 'end'); });
  $('max-pp-minus').addEventListener('click', () => commit({ type: 'maxPp', value: state.maxPp - 1 }, 'PP 上限 -1'));
  $('max-pp-plus').addEventListener('click', () => commit({ type: 'maxPp', value: state.maxPp + 1 }, 'PP 上限 +1'));
  $('pp-minus').addEventListener('click', () => commit({ type: 'pp', value: state.pp - 1 }, '可用 PP -1'));
  $('pp-plus').addEventListener('click', () => commit({ type: 'pp', value: state.pp + 1 }, '可用 PP +1'));
  $('dice-button').addEventListener('click', rollDice);
  for (const button of document.querySelectorAll('.original-button')) {
    const img = button.querySelector('img');
    if (!img || !/_off\.png$/.test(img.getAttribute('src'))) continue;
    const off = img.getAttribute('src'), on = off.replace(/_off\.png$/, '_on.png');
    button.addEventListener('pointerdown', () => { img.src = on; });
    for (const event of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) button.addEventListener(event, () => { img.src = off; });
  }
  $('emote-button').addEventListener('click', () => setEmotesOpen(true));
  window.addEventListener('resize', fit);
  window.addEventListener('blur', stopRepeat);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopRepeat(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modalKind) { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab' && modalKind) {
      const focusable = [...(scanUi || $('modal')).querySelectorAll('button:not([disabled]),input')].filter(element => element.offsetParent !== null);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.addEventListener('pocket:back', event => {
    if (window.PocketDice?.isOpen()) { event.preventDefault(); window.PocketDice.close(); }
    else if (modalKind) { event.preventDefault(); closeModal(); }
    else if (window.PocketSelection.isOpen()) { event.preventDefault(); window.PocketSelection.close(); }
    else { event.preventDefault(); openPreparation(); }
  });
  window.addEventListener('pocket:nfc', event => onTag(event.detail || {}));
  window.addEventListener('pocket:audio-error', event => toast(event.detail.message));
  window.addEventListener('pocket:nfc-status', event => updateScanStatus(event.detail || {}));
  window.addEventListener('pocket:nfc-error', event => {
    if (modalKind === 'scan') updateScanStatus({ ...nativeStatus, scanning: false, message: event.detail?.message || '读取失败，请移开卡片后重试。' });
  });
  load(); fit(); render();
  openPreparation();
  if (!leaders.length) toast('主战者资源未加载，请重新安装完整 APK');
})();
