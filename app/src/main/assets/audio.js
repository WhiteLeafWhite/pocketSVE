(function () {
  'use strict';
  const storageKey = 'pocketsve.sound.v1';
  let enabled = true;
  try { enabled = localStorage.getItem(storageKey) !== 'off'; } catch (_) {}
  const channels = {};
  for (const name of ['voice', 'effect', 'diceStart', 'diceAnim']) {
    const audio = document.createElement('audio');
    audio.preload = 'none';
    audio.dataset.channel = name;
    audio.hidden = true;
    document.body.append(audio);
    channels[name] = { audio, generation: 0, path: '' };
  }
  function stop(channel) {
    for (const item of channel ? [channels[channel]] : Object.values(channels)) {
      if (!item) continue;
      item.generation++;
      item.audio.pause();
      if (item.audio.readyState) item.audio.currentTime = 0;
    }
  }
  async function play(path, channel) {
    const item = channels[channel];
    if (!item) return false;
    stop(channel);
    if (!enabled || !path || document.hidden) return false;
    // Only bundled files may be played. Missing original voices remain silent.
    if (!/^audio\/[a-zA-Z0-9_./-]+\.(mp3|ogg|wav|m4a|aac)$/.test(path) || path.includes('..')) return false;
    const generation = item.generation;
    item.path = path;
    item.audio.src = path;
    try {
      await item.audio.play();
      return generation === item.generation;
    } catch (error) {
      if (generation !== item.generation || error.name === 'AbortError') return false;
      window.dispatchEvent(new CustomEvent('pocket:audio-error', { detail: { path, message: '声音播放失败，请重新点击或检查媒体音量。' } }));
      return false;
    }
  }
  window.PocketAudio = {
    playLeader(id, event, icon) {
      const entry = window.POCKET_AUDIO?.leaders?.[String(id)];
      return play(event === 'emote' ? entry?.emotes?.[String(icon)] : entry?.[event], 'voice');
    },
    playEffect(name) { return play(window.POCKET_AUDIO?.effects?.[name], name === 'diceStart' || name === 'diceAnim' ? name : 'effect'); },
    stop,
    isEnabled() { return enabled; },
    setEnabled(value) {
      enabled = !!value;
      try { localStorage.setItem(storageKey, enabled ? 'on' : 'off'); } catch (_) {}
      if (!enabled) stop();
    },
    getState() {
      return { enabled, ...Object.fromEntries(Object.entries(channels).map(([name, item]) => [name, {
        path: item.path, paused: item.audio.paused, ended: item.audio.ended,
        currentTime: item.audio.currentTime, duration: Number.isFinite(item.audio.duration) ? item.audio.duration : 0,
        error: item.audio.error?.code || null,
      }])) };
    },
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', () => stop());
  window.addEventListener('pocket:pause', () => stop());
})();
