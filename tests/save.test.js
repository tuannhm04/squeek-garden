import test from 'node:test';
import assert from 'node:assert/strict';
import { blankState, newPlant } from '../public/engine.js';
import { KEY_V2, KEY_V3, applyImport, exportSave, loadSave, migrateV2, parseImport, rollbackV3, validateState, writeSave } from '../public/save.js';

class Memory {
  map = new Map();
  failOn = null;
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { if (this.failOn === k) throw new Error('quota'); this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
const blank = () => blankState(100);
const v2Save = () => {
  const s = { ...blankState(100), v: 2, processed: 1200, pips: 345, xp: 500, harvests: 9, seasonScore: 210, best: 400, herb: { moonmoss: 2 }, ach: { first: true } };
  s.plots = [...s.plots];
  s.plots[0] = { ...newPlant('zoomflower', 1190), age: 3 };
  s.plots[1] = { ...newPlant('moonmoss', 1100), status: 'ripe', ripeRound: 1195 };
  return s;
};
const keys = (m, prefix) => [...m.map.keys()].filter(k => k.startsWith(prefix));

test('a first visit starts a blank v3 garden', () => {
  const { state, report } = loadSave(new Memory(), blank);
  assert.equal(state.v, 3);
  assert.equal(report.source, 'new');
});

test('a v2 save migrates with every value intact', () => {
  const m = new Memory(), raw = JSON.stringify(v2Save());
  m.setItem(KEY_V2, raw);
  const { state, report } = loadSave(m, blank, 111);
  assert.deepEqual(state, { ...v2Save(), v: 3 });
  assert.equal(report.migrated, true);
  assert.equal(m.getItem(KEY_V2), raw, 'the v2 key is untouched');
  assert.equal(m.getItem(report.backup), raw, 'the backup is byte for byte');
  assert.deepEqual(JSON.parse(m.getItem(KEY_V3)), state);
});

test('migration runs once: reloading reads v3 and makes no new backup', () => {
  const m = new Memory();
  m.setItem(KEY_V2, JSON.stringify(v2Save()));
  loadSave(m, blank, 111);
  const count = keys(m, 'squeek-garden:backup').length;
  const again = loadSave(m, blank, 222);
  assert.equal(again.report.source, 'v3');
  assert.equal(keys(m, 'squeek-garden:backup').length, count);
});

test('playing after migration does not touch v2', () => {
  const m = new Memory(), raw = JSON.stringify(v2Save());
  m.setItem(KEY_V2, raw);
  const { state } = loadSave(m, blank);
  state.pips = 9999;
  assert.equal(writeSave(m, state), true);
  assert.equal(m.getItem(KEY_V2), raw);
  assert.equal(loadSave(m, blank).state.pips, 9999);
});

test('corrupt v2 is kept, never overwritten', () => {
  const m = new Memory();
  m.setItem(KEY_V2, '{not json');
  const { state, report } = loadSave(m, blank, 111);
  assert.equal(report.source, 'corrupt');
  assert.equal(state.pips, 60);
  assert.equal(m.getItem(KEY_V2), '{not json');
  assert.equal(m.getItem(report.backup), '{not json');
  writeSave(m, state);
  assert.equal(m.getItem(KEY_V2), '{not json');
});

test('a v2 save with impossible values is refused', () => {
  for (const change of [{ plots: [] }, { open: 99 }, { pips: -5 }, { pips: 'lots' }, { v: 1 }, { processed: 1.5 }]) {
    const m = new Memory(), raw = JSON.stringify({ ...v2Save(), ...change });
    m.setItem(KEY_V2, raw);
    const { report } = loadSave(m, blank);
    assert.equal(report.source, 'corrupt', JSON.stringify(change));
    assert.equal(m.getItem(KEY_V2), raw);
  }
});

test('an unknown seed in a plot is refused', () => {
  const s = v2Save();
  s.plots[0] = { ...s.plots[0], seed: 'gold-printer' };
  assert.ok(validateState(s).length);
});

test('a corrupt v3 save is quarantined and v2 recovers the garden', () => {
  const m = new Memory();
  m.setItem(KEY_V2, JSON.stringify(v2Save()));
  m.setItem(KEY_V3, '{broken');
  const { state, report } = loadSave(m, blank, 111);
  assert.equal(report.source, 'v2');
  assert.equal(state.pips, 345);
  assert.equal(m.getItem('squeek-garden:corrupt:111'), '{broken');
});

test('a failed migration write keeps the old save and leaves no half state', () => {
  const m = new Memory(), raw = JSON.stringify(v2Save());
  m.setItem(KEY_V2, raw);
  m.failOn = KEY_V3;
  const { report } = loadSave(m, blank);
  assert.ok(report.problems.length);
  assert.equal(m.getItem(KEY_V2), raw);
  assert.equal(m.getItem(KEY_V3), null);
});

test('rollback sets v3 aside and the next load migrates from v2 again', () => {
  const m = new Memory();
  m.setItem(KEY_V2, JSON.stringify(v2Save()));
  const { state } = loadSave(m, blank);
  state.pips = 1;
  writeSave(m, state);
  const kept = rollbackV3(m, 333);
  assert.equal(JSON.parse(m.getItem(kept)).pips, 1);
  assert.equal(m.getItem(KEY_V3), null);
  assert.equal(loadSave(m, blank).state.pips, 345);
});

test('blocked storage still gives a playable garden', () => {
  const { state, report } = loadSave(null, blank);
  assert.equal(report.source, 'memory');
  assert.equal(state.pips, 60);
  assert.equal(writeSave(null, state), false);
});

test('export then import gives the same garden', () => {
  const s = migrateV2(v2Save());
  assert.deepEqual(parseImport(exportSave(s, 0)), s);
});

test('import accepts a bare v2 save and upgrades it', () => {
  const s = parseImport(JSON.stringify(v2Save()));
  assert.equal(s.v, 3);
  assert.equal(s.pips, 345);
});

test('import refuses junk with a readable message', () => {
  assert.throws(() => parseImport('nope'), /not JSON/);
  assert.throws(() => parseImport('{"format":"squeek-garden-save","state":{"v":3}}'), /can't be used/);
  assert.throws(() => parseImport('[]'), /can't be used/);
});

test('import backs up the garden it replaces', () => {
  const m = new Memory(), current = blank();
  writeSave(m, current);
  const next = parseImport(JSON.stringify(v2Save()));
  applyImport(m, next, 444);
  assert.deepEqual(JSON.parse(m.getItem('squeek-garden:backup:v3:444')), current);
  assert.equal(JSON.parse(m.getItem(KEY_V3)).pips, 345);
});

test('a chain mark loads and a bad one is refused', () => {
  assert.deepEqual(validateState({ ...blank(), chain: 'sepolia-core' }), []);
  assert.ok(validateState({ ...blank(), chain: 5 }).length);
});

test('a v2 save with no challenges or combo still loads', () => {
  const m = new Memory();
  m.setItem(KEY_V2, JSON.stringify(v2Save()));
  const { state, report } = loadSave(m, blank);
  assert.equal(report.source, 'v2');
  assert.deepEqual(validateState(state), []);
});

test('a v2 file without the new fields still imports', () => {
  const s = v2Save(); delete s.daily; delete s.combo;
  assert.equal(parseImport(JSON.stringify(s)).pips, 345);
});

test('challenges and combos survive a save and a load', () => {
  const m = new Memory(), s = blank();
  s.daily = { day: 20000, items: [{ id: 'pick3', progress: 2, done: false }] };
  s.combo = { count: 2, lastSeed: 'moonmoss', lastRound: 50 };
  writeSave(m, s);
  const { state } = loadSave(m, blank);
  assert.deepEqual(state.daily, s.daily);
  assert.deepEqual(state.combo, s.combo);
});

test('impossible challenges or combos are refused', () => {
  for (const change of [
    { daily: { day: 1, items: [{ id: 'free-pips', progress: 0, done: false }] } },
    { daily: { day: 'today', items: [] } },
    { daily: { day: 1, items: [{ id: 'pick1', progress: -1, done: false }] } },
    { combo: { count: 0, lastSeed: 'moonmoss', lastRound: 1 } },
    { combo: { count: 2, lastSeed: 'gold', lastRound: 1 } },
  ]) assert.ok(validateState({ ...blank(), ...change }).length, JSON.stringify(change));
});

test('old saves without gloves, compost or decorations still load, and bad ones are refused', () => {
  const old = blank(); delete old.gloves; delete old.composted; delete old.decor;
  assert.deepEqual(validateState(old), []);
  assert.deepEqual(validateState({ ...blank(), gloves: 2, composted: 3, decor: { fence: true } }), []);
  for (const change of [{ gloves: -1 }, { composted: 'x' }, { decor: { 'gold-tree': true } }, { decor: [] }]) {
    assert.ok(validateState({ ...blank(), ...change }).length, JSON.stringify(change));
  }
});

test('a barn loads, old saves have none, and impossible ones are refused', () => {
  const good = { ...blank(), barn: [{ kind: 'cow', boughtRound: 1, progress: 0, stock: 2 }, null, null], collected: 4 };
  assert.deepEqual(validateState(good), []);
  const old = blank(); delete old.barn; delete old.collected;
  assert.deepEqual(validateState(old), []);
  for (const barn of [[], 'cows', [{ kind: 'dragon', boughtRound: 1, progress: 0, stock: 1 }, null, null], [{ kind: 'cow', boughtRound: 1, progress: 0, stock: -1 }, null, null]]) {
    assert.ok(validateState({ ...blank(), barn }).length, JSON.stringify(barn));
  }
});

test('feed loads, old saves have none, and a bad amount is refused', () => {
  assert.deepEqual(validateState({ ...blank(), feed: 5 }), []);
  const old = blank(); delete old.feed;
  assert.deepEqual(validateState(old), []);
  assert.ok(validateState({ ...blank(), feed: -1 }).length);
});
