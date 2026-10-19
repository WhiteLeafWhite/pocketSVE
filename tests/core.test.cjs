const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../app/src/main/assets/core.js');

test('life changes preserve SVE initial 20 and the observed 0..999 bounds', () => {
  const initial = core.initialState('1', '2');
  const damaged = core.transition(initial, { type: 'hp', delta: -5 });
  assert.equal(damaged.players.you.hp, 15);
  assert.equal(initial.players.you.hp, 20);
  assert.equal(core.transition(damaged, { type: 'hp', delta: -100 }).players.you.hp, 0);
  assert.equal(core.transition(damaged, { type: 'hp', delta: 2000 }).players.you.hp, 999);
});

test('original separate start button increments/refills PP on each press, capped at ten', () => {
  let state = core.initialState('1', '2');
  for (let turn = 1; turn <= 12; turn++) {
    state = core.transition(state, { type: 'startTurn' });
    assert.equal(state.maxPp, Math.min(turn, 10));
    assert.equal(state.pp, state.maxPp);
    assert.equal(core.transition(state, { type: 'startTurn' }).turn, turn + 1);
    state = core.transition(state, { type: 'pp', value: state.pp - 1 });
    assert.equal(state.pp, state.maxPp - 1);
    state = core.transition(state, { type: 'endTurn' });
  }
});

test('order initializes EP, reset retains leaders and restores match state', () => {
  let state = core.transition(core.initialState('1', '2'), { type: 'order', value: 'first' });
  assert.equal(state.ep, 0);
  state = core.transition(state, { type: 'startTurn' });
  assert.equal(core.transition(state, { type: 'order', value: 'second' }).order, 'first');
  state = core.transition(state, { type: 'reset' });
  assert.deepEqual(state.players, { you: { leaderId: '1', hp: 20 }, opponent: { leaderId: '2', hp: 20 } });
  assert.equal(state.turn, 0);
  assert.equal(state.ep, 0);
});

test('NDEF text and original cards map only to real catalog IDs', () => {
  const catalog = [{ id: '123' }];
  const record = { tnf: 1, type: [84], payload: [2, 101, 110, ...Buffer.from('pocketsve:leader/123')] };
  assert.equal(core.resolveTag({ ndefMessage: [record] }, catalog).id, '123');
  assert.equal(core.resolveTag({ originalCard: { cardId: '123', verified: true } }, catalog).source, 'original');
  assert.equal(core.resolveTag({ originalCard: { cardId: '123', verified: false } }, catalog).status, 'invalid');
  assert.equal(core.resolveTag({ originalCard: { cardId: '999', verified: true } }, catalog).status, 'unknown-card');
  assert.equal(core.resolveTag({ id: 'abc' }, catalog, { ABC: '123' }).source, 'binding');
  assert.equal(core.parseLeaderText('<script>alert(1)</script>'), null);
});

test('corrupt or stale saved leaders are rejected; numeric values are normalized', () => {
  assert.equal(core.restoreState({ version: 1 }, ['1']), null);
  const state = core.initialState('1', '2');
  state.pp = 200;
  state.maxPp = 4;
  assert.equal(core.restoreState(state, ['1', '2']).pp, 4);
  assert.equal(core.restoreState(state, ['1']), null);
});

test('self-written Ralmia text tags select only the explicit catalog entry', () => {
  const id = 'svgdb-2808';
  const catalog = [{ id }];
  const text = { tnf: 1, type: [84], payload: [2, 101, 110, ...Buffer.from('pocketsve:leader/' + id)] };
  assert.deepEqual(core.resolveTag({ ndefMessage: [text] }, catalog), { status: 'matched', id, source: 'ndef' });
  assert.equal(core.resolveTag({ ndefMessage: [text] }, []).status, 'unknown-card');
  assert.equal(core.resolveTag({ ndefMessage: [text], originalCard: { cardId: '123', verified: false } }, catalog).status, 'invalid');
  assert.equal(core.restoreState(core.initialState(id, id), [id]).players.you.leaderId, id);
});
