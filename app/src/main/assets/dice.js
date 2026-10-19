/* Original animations and timing: Hermes #22717, #22922, #22931, #22934.
 * Local animationData and SVG renderer keep this compatible with connect-src 'none'.
 */
(function (global) {
  'use strict';
  const scriptLoads = new Map();
  let session = null, generation = 0;
  let lastState = { open: false, phase: 'closed', result: null, frame: 0, totalFrames: 0, canClose: false };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function loadScript(path, isReady) {
    if (isReady()) return Promise.resolve();
    if (scriptLoads.has(path)) return scriptLoads.get(path);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.async = true;
      script.onload = () => isReady() ? resolve() : reject(new Error('Invalid local animation library'));
      script.onerror = () => { script.remove(); scriptLoads.delete(path); reject(new Error('Local animation asset could not be loaded')); };
      document.head.append(script);
    });
    scriptLoads.set(path, promise);
    return promise;
  }
  function resize() {
    if (!session) return;
    const width = global.innerWidth, height = global.innerHeight;
    const ratio = Number((height / width).toFixed(3));
    const wide = ratio - 1.778 < -0.05;
    let unit = width / 750;
    if (wide) unit *= height / (16 / 9) / 750 * (Math.abs(ratio - 1.333) <= 0.1 ? 0.98 : 1);
    session.root.style.setProperty('--pd-px', unit + 'px');
    session.root.style.setProperty('--pd-static-px', width / 750 + 'px');
    session.root.classList.toggle('pd-wide', wide);
    for (const animation of session.animations) animation.resize();
  }
  function schedule(active, callback, delay) {
    const timer = global.setTimeout(() => {
      active.timers.delete(timer);
      if (session === active) callback();
    }, delay);
    active.timers.add(timer);
  }
  function makeAnimation(active, container, data) {
    const animation = global.lottie.loadAnimation({
      container, renderer: 'svg', loop: false, autoplay: false,
      animationData: JSON.parse(JSON.stringify(data)),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: false, hideOnTransparent: false },
    });
    active.animations.push(animation);
    return animation;
  }
  function failed(active, error) {
    if (session !== active || active.phase === 'error') return;
    active.phase = 'error';
    active.error = error.message;
    active.root.dataset.phase = 'error';
    const failure = element('button', 'pd-failure', '骰子动画加载失败，点击关闭后重试');
    failure.type = 'button';
    failure.addEventListener('click', event => { event.stopPropagation(); close('error'); });
    active.scene.append(failure);
  }
  function playOpeningSounds(active) {
    if (!global.PocketAudio) return;
    // #22916 starts both independent sounds synchronously. The awaited value
    // resolves when playback starts, as Expo playAsync does, rather than at ended.
    Promise.resolve(global.PocketAudio.playEffect('diceStart')).catch(() => {});
    Promise.resolve(global.PocketAudio.playEffect('diceAnim')).then(played => {
      if (played && session === active) return global.PocketAudio.playEffect('diceEnd');
    }).catch(() => {});
  }
  function completed(active) {
    if (session !== active || active.phase !== 'rolling') return;
    active.roll.goToAndStop(Math.max(0, active.roll.totalFrames - 1), true);
    active.phase = 'result';
    active.result = active.outcome;
    active.resultAt = performance.now();
    active.root.dataset.phase = 'result';
    active.live.textContent = '骰子结果：' + active.result;
    // #22922 waits 500 ms after Dice.onAnimationFinish before showing its confirmation effect.
    schedule(active, () => {
      active.confirmShell.hidden = false;
      const confirm = makeAnimation(active, active.glow, global.POCKET_DICE_ANIMATIONS.confirm);
      active.confirm = confirm;
      confirm.addEventListener('DOMLoaded', () => { if (session === active) confirm.play(); });
      schedule(active, () => {
        active.canClose = true;
        active.root.dataset.canClose = 'true';
        active.ok.disabled = false;
        active.ok.focus({ preventScroll: true });
      }, 300);
    }, 500);
    if (!active.reported) {
      active.reported = true;
      if (typeof active.options.onResult === 'function') active.options.onResult(active.result);
    }
  }
  function getState() {
    if (!session) return { ...lastState };
    const active = session;
    return {
      open: true, phase: active.phase, result: active.result,
      frame: Number((active.roll && active.roll.currentFrame || 0).toFixed(3)),
      totalFrames: active.roll ? active.roll.totalFrames : 0,
      confirmFrame: Number((active.confirm && active.confirm.currentFrame || 0).toFixed(3)),
      canClose: active.canClose, elapsedMs: Math.round(performance.now() - active.openedAt),
      rollDurationMs: active.roll ? Math.round(active.roll.totalFrames / active.roll.frameRate * 1000) : null,
      error: active.error || null,
    };
  }
  function close(reason) {
    const active = session;
    if (!active) return false;
    lastState = { ...getState(), open: false, phase: 'closed', canClose: false };
    session = null;
    generation++;
    active.timers.forEach(timer => global.clearTimeout(timer));
    active.timers.clear();
    active.animations.forEach(animation => animation.destroy());
    active.animations.length = 0;
    active.root.remove();
    global.removeEventListener('resize', resize);
    if (global.PocketAudio) {
      global.PocketAudio.stop('diceStart');
      global.PocketAudio.stop('diceAnim');
    }
    if (active.priorFocus && active.priorFocus.isConnected) active.priorFocus.focus({ preventScroll: true });
    if (typeof active.options.onClose === 'function') active.options.onClose(active.result, reason || 'closed');
    return true;
  }
  function open(config) {
    if (session) return false;
    const active = {
      options: config || {}, token: ++generation, phase: 'loading', result: null,
      outcome: Math.floor(Math.random() * 6) + 1, canClose: false, reported: false,
      timers: new Set(), animations: [], openedAt: performance.now(), priorFocus: document.activeElement,
    };
    const root = element('section', 'pocket-dice');
    active.root = root;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '掷骰子');
    root.dataset.phase = 'loading';
    const scene = element('div', 'pd-scene');
    active.scene = scene;
    active.stage = element('div', 'pd-roll');
    active.stage.setAttribute('aria-hidden', 'true');
    active.confirmShell = element('div', 'pd-confirm-shell');
    active.confirmShell.hidden = true;
    const confirmStage = element('div', 'pd-confirm-stage');
    active.glow = element('div', 'pd-glow');
    active.glow.setAttribute('aria-hidden', 'true');
    active.ok = element('button', 'pd-ok');
    active.ok.type = 'button';
    active.ok.disabled = true;
    active.ok.setAttribute('aria-label', '确定骰子结果');
    const okImage = element('img');
    okImage.src = 'ui/dice_ok.png';
    okImage.alt = 'OK';
    active.ok.append(okImage);
    confirmStage.append(active.glow, active.ok);
    active.confirmShell.append(confirmStage);
    active.live = element('div', 'pd-live');
    active.live.setAttribute('aria-live', 'polite');
    scene.append(active.stage, active.confirmShell, active.live);
    root.append(scene);
    root.addEventListener('click', () => {
      if (active.canClose) {
        if (global.POCKET_AUDIO && global.POCKET_AUDIO.effects && global.POCKET_AUDIO.effects.diceEnd && global.PocketAudio) global.PocketAudio.playEffect('diceEnd');
        close('confirmed');
      }
    });
    session = active;
    document.body.append(root);
    // Preserve user activation before awaiting either local script load.
    playOpeningSounds(active);
    global.addEventListener('resize', resize);
    resize();
    Promise.all([
      loadScript('vendor/lottie_light-5.13.0.min.js', () => Boolean(global.lottie && global.lottie.loadAnimation)),
      loadScript('art/dice-data.js', () => Boolean(global.POCKET_DICE_ANIMATIONS)),
    ]).then(() => {
      if (session !== active || active.token !== generation) return;
      const data = global.POCKET_DICE_ANIMATIONS[String(active.outcome)];
      if (!data) throw new Error('Original dice animation is missing');
      const animation = makeAnimation(active, active.stage, data);
      active.roll = animation;
      animation.addEventListener('complete', () => completed(active));
      animation.addEventListener('DOMLoaded', () => {
        if (session !== active || active.phase === 'error') return;
        active.phase = 'rolling';
        active.root.dataset.phase = 'rolling';
        animation.play();
      });
      animation.addEventListener('data_failed', () => failed(active, new Error('Original dice animation could not be decoded')));
    }).catch(error => failed(active, error));
    return true;
  }
  global.PocketDice = { open, close, isOpen: () => Boolean(session), getState };
})(window);
