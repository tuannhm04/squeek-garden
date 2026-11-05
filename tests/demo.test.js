import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_ROUNDS, demoStart } from '../public/demo.js';

test('the replay holds whole, valid rounds', () => {
  assert.ok(DEMO_ROUNDS.length > 1000);
  assert.ok(DEMO_ROUNDS.every(w => Number.isInteger(w) && w >= 0));
});

test('the replay behaves like the real hamster: mostly naps, with all three moods', () => {
  const active = DEMO_ROUNDS.filter(w => w > 0).length / DEMO_ROUNDS.length;
  assert.ok(active > .1 && active < .25, `active ${active}`);
  assert.ok(DEMO_ROUNDS.some(w => w > 0 && w < 500), 'jogs');
  assert.ok(DEMO_ROUNDS.some(w => w >= 500), 'zoomies');
});

test('a demo begins one quiet round before a run', () => {
  for (const r of [0, .25, .5, .75, .999]) {
    const at = demoStart(() => r);
    assert.equal(DEMO_ROUNDS[at], 0);
    assert.ok(DEMO_ROUNDS[at + 1] > 0);
  }
});

test('different demos can begin in different places', () => {
  assert.notEqual(demoStart(() => 0), demoStart(() => .999));
});
