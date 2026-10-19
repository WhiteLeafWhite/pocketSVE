/* Original preparation page: Hermes #22162, #22176, #22182, #22220.
 * Original NFC modal: #22647; dimensions use #18951 and #12061.
 * The optional collapsed skin drawer delegates to the host application.
 */
(function (global) {
  'use strict';
  let options = {}, screen = null, modal = null, modalOptions = {}, priorFocus = null;
  let selected = { you: '100001', opponent: '100001' };
  const roleOrder = ['1', '2', '3', '4', '5', '6', '0']; // #17900 shifts neutral to the end.
  const thumbnailIds = new Set(['100101','100102','100103','100104','100105','100106','100111','100112','100113','100114','100115','100116','100201','100202','100401','100403','100404','100405','100406','100516','100525','100601','100602','100603','100604','100605','100606','100701','100704','100903','100904','100906','999999']);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function button(className, label, action) {
    const node = el('button', className);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    if (action) node.addEventListener('click', action);
    return node;
  }
  function art(name) { return 'art/' + name + '.webp'; }
  function ui(name) { return 'ui/' + name + '.png'; }
  function findLeader(id) {
    return (options.catalog && options.catalog.leaders || []).find(item => String(item.id) === String(id));
  }
  function resize() {
    const width = global.innerWidth, height = global.innerHeight;
    const ratio = Number((height / width).toFixed(3));
    const wide = ratio - 1.778 < -0.05;
    const contentWidth = wide ? height / (16 / 9) : width;
    // pxTransform performs ~~ before multiplying by windowWidth/750.
    // Phone portrait branch is exactly width/750. Wide screens use the original two-stage scale.
    let unit = width / 750;
    if (wide) unit *= contentWidth / 750 * (Math.abs(ratio - 1.333) <= 0.1 ? 0.98 : 1);
    let bottom;
    if (wide || Math.abs(ratio - 1.778) <= 0.05) {
      bottom = Math.trunc((width / 720 * 67.5) * (wide ? contentWidth / 750 : 1)) * width / 750;
    } else {
      const t = (width / height - 0.46153846153846156) / 0.10096153846153844;
      bottom = Math.trunc(113.6 + (67.5 - 113.6) * t) * width / 750;
    }
    for (const node of [screen, modal]) if (node) {
      node.style.setProperty('--ps-px', unit + 'px');
      node.style.setProperty('--ps-static-px', width / 750 + 'px');
      node.style.setProperty('--ps-content-width', contentWidth + 'px');
      node.style.setProperty('--ps-action-bottom', bottom + 'px');
    }
  }
  function choose(side, id) {
    selected[side] = String(id);
    renderPanels();
    if (typeof options.onSelect === 'function') options.onSelect(side, String(id));
  }
  function roleIcon(side, classId) {
    const id = '10000' + classId;
    const leader = findLeader(selected[side]);
    const isDefault = selected[side] === id;
    const className = (options.catalog && options.catalog.classes || []).find(item => String(item.id) === classId);
    const node = button('ps-role-icon', (className ? className.name : classId), () => choose(side, id));
    node.setAttribute('aria-pressed', String(isDefault));
    const image = el('img');
    image.alt = '';
    image.draggable = false;
    image.src = art('assets_game_button_classButton0' + classId + (isDefault ? 'On' : 'Off') + 'Png');
    node.append(image);
    if (leader && !isDefault) node.dataset.currentClass = String(leader.classId);
    return node;
  }
  function scanButton(side) {
    const node = button('ps-image-button ps-scan', '读取卡牌', () => {
      if (typeof options.onScan === 'function') options.onScan(side);
    });
    node.append(el('span', 'ps-scan-label', '读取卡牌'));
    return node;
  }
  function panel(side) {
    const own = side === 'you';
    const panel = el('section', 'ps-panel ' + (own ? 'ps-own' : 'ps-opponent'));
    panel.setAttribute('aria-label', own ? '自己的主战者' : '对手的主战者');
    const title = el('img', 'ps-panel-title');
    title.alt = own ? '自己' : '对手';
    title.src = ui(own ? 'role_class_you' : 'role_class_opponent');
    panel.append(title);
    const leader = findLeader(selected[side]);
    const skinId = String(leader && leader.skinId || selected[side]);
    // In the original only the player's NFC-selected skin replaces its class icons.
    if (own && (leader?.thumbnail || thumbnailIds.has(skinId)) && !/^10000[0-6]$/.test(selected[side])) {
      panel.classList.add('ps-has-skin');
      const image = el('img', 'ps-leader-thumbnail');
      image.alt = leader ? leader.name : '已读取的主战者';
      image.src = leader?.thumbnail || art('Class_thumbnail' + skinId + 'Png');
      if (leader?.thumbnail) image.classList.add('ps-custom-thumbnail');
      panel.append(image);
      const actions = el('div', 'ps-skin-actions');
      const reset = button('ps-image-button ps-blue ps-reset-skin', '重置', () => choose('you', '100001'));
      reset.append(el('span', '', '重置'));
      actions.append(reset, scanButton('you'));
      panel.append(actions);
    } else {
      const first = el('div', 'ps-role-row ps-role-row-first');
      const second = el('div', 'ps-role-row ps-role-row-second');
      roleOrder.slice(0, 4).forEach(id => first.append(roleIcon(side, id)));
      roleOrder.slice(4).forEach(id => second.append(roleIcon(side, id)));
      panel.append(first, second);
      if (own) panel.append(scanButton('you'));
    }
    return panel;
  }
  function renderPanels() {
    if (!screen) return;
    const cards = screen.querySelector('.ps-role-cards');
    const tip = el('div', 'ps-tip-space');
    tip.append(el('div', 'ps-tip', '请选择职业'));
    cards.replaceChildren(panel('opponent'), tip, panel('you'));
  }
  function extensions() {
    const details = el('details', 'ps-extensions');
    details.append(el('summary', '', '扩展皮肤'));
    for (const side of ['you', 'opponent']) {
      const entry = button('ps-extension-entry', side === 'you' ? '选择自己的皮肤' : '选择对手的皮肤', () => {
        details.open = false;
        if (typeof options.onSkins === 'function') options.onSkins(side);
      });
      entry.textContent = side === 'you' ? '自己' : '对手';
      details.append(entry);
    }
    return details;
  }
  function update(state) {
    if (!screen) return false;
    options.state = state || options.state;
    for (const side of ['you', 'opponent']) {
      const player = options.state && options.state.players && options.state.players[side];
      if (player && player.leaderId) selected[side] = String(player.leaderId);
    }
    renderPanels();
    return true;
  }
  function open(config) {
    options = config || {};
    if (screen) { update(options.state); return; }
    priorFocus = document.activeElement;
    screen = el('section', 'pocket-selection');
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');
    screen.setAttribute('aria-label', '主战者准备');
    const content = el('div', 'ps-content');
    const header = el('div', 'ps-header');
    const menu = button('ps-image-button ps-menu', '菜单', () => {
      if (typeof options.onMenu === 'function') options.onMenu();
      else if (typeof options.onClose === 'function') options.onClose();
    });
    header.append(menu);
    const main = el('div', 'ps-main');
    main.append(el('div', 'ps-role-cards'));
    const footer = el('div', 'ps-footer');
    const start = button('ps-image-button ps-start', '开始', () => {
      const callback = options.onStart;
      close();
      if (typeof callback === 'function') callback();
    });
    start.append(el('span', '', '开始'));
    footer.append(start);
    content.append(header, main, footer);
    screen.append(content);
    document.body.append(screen);
    global.addEventListener('resize', resize);
    update(options.state);
    resize();
    menu.focus({ preventScroll: true });
  }
  function close() {
    hideNfc();
    if (screen) screen.remove();
    screen = null;
    global.removeEventListener('resize', resize);
    if (priorFocus && priorFocus.isConnected && typeof priorFocus.focus === 'function') priorFocus.focus({ preventScroll: true });
  }
  function hideNfc() {
    if (modal) modal.remove();
    modal = null;
    modalOptions = {};
    if (!screen) global.removeEventListener('resize', resize);
  }
  function showNfc(config) {
    hideNfc();
    modalOptions = config || {};
    modal = el('section', 'pocket-selection-nfc');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '读取卡牌');
    const box = el('div', 'ps-nfc-box');
    const header = el('header', 'ps-nfc-header');
    header.append(el('div', 'ps-nfc-title', '读取卡牌'));
    const body = el('div', 'ps-nfc-body');
    const illustration = el('img', 'ps-nfc-illustration');
    illustration.alt = '将手机靠近主战者卡牌的 NFC 感应位置';
    illustration.src = art('assets_nfc_onboarding02Png');
    body.append(illustration, el('p', 'ps-nfc-instruction', modalOptions.message || '请把手机放到卡牌上，如没有读取到数据，\n请尝试调整卡牌的位置。'));
    const footer = el('footer', 'ps-nfc-footer');
    const dismiss = () => {
      const callback = modalOptions.onClose;
      hideNfc();
      if (typeof callback === 'function') callback();
    };
    const cancel = button('ps-image-button ps-blue ps-nfc-close', '关闭', dismiss);
    cancel.textContent = '关闭';
    footer.append(cancel);
    box.append(header, body, footer);
    modal.append(box);
    modal.addEventListener('click', event => { if (event.target === modal) dismiss(); });
    document.body.append(modal);
    global.addEventListener('resize', resize);
    resize();
    cancel.focus({ preventScroll: true });
    return modal;
  }
  function setNfcMessage(message) {
    if (!modal) return false;
    modal.querySelector('.ps-nfc-instruction').textContent = String(message);
    return true;
  }
  global.PocketSelection = { open, close, update, isOpen: () => Boolean(screen), showNfc, hideNfc, setNfcMessage };
})(window);
