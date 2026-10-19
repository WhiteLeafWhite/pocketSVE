(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PocketCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.trunc(Number(value) || 0)));
  const clone = value => JSON.parse(JSON.stringify(value));

  function initialState(you, opponent) {
    return {
      version: 1,
      players: { you: { leaderId: String(you || ''), hp: 20 }, opponent: { leaderId: String(opponent || ''), hp: 20 } },
      order: 'second', ep: 3, pp: 0, maxPp: 0, turn: 0, phase: 'ready', muted: false,
    };
  }

  function restoreState(value, leaderIds) {
    if (!value || value.version !== 1 || !value.players) return null;
    const valid = new Set(leaderIds);
    if (!['you', 'opponent'].every(side => value.players[side] && valid.has(String(value.players[side].leaderId)))) return null;
    const state = initialState(value.players.you.leaderId, value.players.opponent.leaderId);
    for (const side of ['you', 'opponent']) state.players[side].hp = clamp(value.players[side].hp, 0, 999);
    state.order = value.order === 'first' ? 'first' : 'second';
    state.ep = clamp(value.ep, 0, 3);
    state.maxPp = clamp(value.maxPp, 0, 10);
    state.pp = clamp(value.pp, 0, state.maxPp);
    state.turn = clamp(value.turn, 0, 999);
    state.phase = ['ready', 'main', 'waiting'].includes(value.phase) ? value.phase : 'ready';
    state.muted = Boolean(value.muted);
    return state;
  }

  function transition(current, action) {
    const state = clone(current);
    const side = action.side === 'opponent' ? 'opponent' : 'you';
    switch (action.type) {
      case 'hp': state.players[side].hp = clamp(state.players[side].hp + Number(action.delta || 0), 0, 999); break;
      case 'setHp': state.players[side].hp = clamp(action.value, 0, 999); break;
      case 'leader': state.players[side].leaderId = String(action.id); break;
      case 'order':
        if (state.turn !== 0) break;
        state.order = action.value === 'first' ? 'first' : 'second';
        state.ep = state.order === 'first' ? 0 : 3;
        break;
      case 'ep': state.ep = clamp(action.value, 0, 3); break;
      case 'pp': state.pp = clamp(action.value, 0, state.maxPp); break;
      case 'maxPp':
        state.maxPp = clamp(action.value, 0, 10);
        state.pp = Math.min(state.pp, state.maxPp);
        break;
      case 'startTurn':
        state.turn = clamp(state.turn + 1, 1, 999);
        state.maxPp = clamp(state.maxPp + 1, 0, 10);
        state.pp = state.maxPp;
        state.phase = 'main';
        break;
      case 'endTurn': if (state.phase === 'main') state.phase = 'waiting'; break;
      case 'reset': {
        const fresh = initialState(state.players.you.leaderId, state.players.opponent.leaderId);
        fresh.order = state.order;
        fresh.ep = state.order === 'first' ? 0 : 3;
        fresh.muted = state.muted;
        return fresh;
      }
      case 'muted': state.muted = Boolean(action.value); break;
      default: throw new Error('Unknown action: ' + action.type);
    }
    return state;
  }

  function textFromRecord(record) {
    const bytes = Uint8Array.from(record.payload || []);
    const type = String.fromCharCode.apply(null, record.type || []);
    if (!bytes.length) return '';
    if (Number(record.tnf) === 1 && type === 'T') {
      const start = 1 + (bytes[0] & 63);
      if (start > bytes.length) return '';
      return new TextDecoder(bytes[0] & 128 ? 'utf-16be' : 'utf-8').decode(bytes.slice(start));
    }
    if (Number(record.tnf) === 1 && type === 'U') {
      const prefixes = ['', 'http://www.', 'https://www.', 'http://', 'https://'];
      return (prefixes[bytes[0]] || '') + new TextDecoder().decode(bytes.slice(1));
    }
    if (Number(record.tnf) === 2 && type.toLowerCase() === 'application/json') return new TextDecoder().decode(bytes);
    return '';
  }

  function parseLeaderText(value) {
    const text = String(value || '').trim();
    if (!text || text.length > 1024) return null;
    let candidate;
    try {
      const item = JSON.parse(text);
      if (item && typeof item === 'object') candidate = item.cardId || item.leaderId;
    } catch (_) { /* An NDEF Text/URI record may use the compact format. */ }
    if (!candidate) {
      const match = text.match(/^pocketsve:(?:\/\/)?leader\/([a-zA-Z0-9_-]{1,100})$/i);
      if (match) candidate = match[1];
    }
    return typeof candidate === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(candidate) ? candidate : null;
  }

  function resolveTag(tag, catalog, bindings) {
    const normalizeId = id => String(id).replace(/^0+(?=\d)/, '');
    const idMap = new Map(catalog.map(leader => [normalizeId(leader.id), String(leader.id)]));
    const ids = new Set(catalog.map(leader => String(leader.id)));
    const original = tag.originalCard;
    if (original && original.cardId) {
      const id = idMap.get(normalizeId(original.cardId)) || String(original.cardId);
      // An explicitly failed integrity check must never silently select a leader.
      if (original.verified !== true || original.valid === false) return { status: 'invalid', id, message: original.message || '卡片数据校验未通过' };
      return ids.has(id) ? { status: 'matched', id, source: 'original' } : { status: 'unknown-card', id };
    }
    for (const record of tag.ndefMessage || []) {
      const candidate = parseLeaderText(textFromRecord(record));
      const id = candidate && (idMap.get(normalizeId(candidate)) || candidate);
      if (id) return ids.has(id) ? { status: 'matched', id, source: 'ndef' } : { status: 'unknown-card', id };
    }
    const uid = String(tag.id || '').toUpperCase();
    if (uid && bindings && ids.has(bindings[uid])) return { status: 'matched', id: bindings[uid], source: 'binding' };
    return { status: uid ? 'unbound-tag' : 'unreadable', uid };
  }

  return { clamp, initialState, restoreState, transition, textFromRecord, parseLeaderText, resolveTag };
});
