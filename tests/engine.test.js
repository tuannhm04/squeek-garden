import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRound, blankState, classify, doAction, harvestValue, newPlant, rollSeason, seasonEndsAt, seasonId, settleRounds, syncChain, water } from '../public/engine.js';

const grow = (seed, works, from = 11) => {
  const p = newPlant(seed, 10);
  const events = works.map((w, i) => applyRound(p, from + i, w));
  return { p, events };
};

test('moods follow the published thresholds', () => {
  assert.equal(classify(0), 'nap');
  assert.equal(classify(1), 'jog');
  assert.equal(classify(499), 'jog');
  assert.equal(classify(500), 'zoom');
});

test('a plant ignores the round it was planted in', () => {
  const p = newPlant('moonmoss', 10);
  assert.equal(applyRound(p, 10, 0), null);
  assert.equal(p.growth, 0);
});

test('each seed ripens on its own rule', () => {
  const cases = {
    moonmoss: [0, 0, 0, 0],
    trotbean: [100, 100, 100],
    zoomflower: [0, 600],
    mileoak: [1500, 1500],
    comet: [0, 600],
    dreamcap: [0, 0, 0],
    twinvine: [200, 260],
    wheelbloom: [0, 0, 100, 100, 600, 600],
  };
  for (const [seed, works] of Object.entries(cases)) assert.equal(grow(seed, works).p.status, 'ripe', seed);
});

test('each seed fails on its own rule', () => {
  const cases = {
    moonmoss: [600, 600],
    trotbean: [0, 0, 0],
    zoomflower: Array(9).fill(0),
    comet: Array(12).fill(100),
    dreamcap: Array(15).fill(100),
    twinvine: Array(12).fill(0),
  };
  for (const [seed, works] of Object.entries(cases)) assert.equal(grow(seed, works).p.status, 'wilted', seed);
});

test('Mile Oak and Golden Wheelbloom never wilt', () => {
  assert.equal(grow('mileoak', Array(100).fill(0)).p.status, 'growing');
  assert.equal(grow('wheelbloom', Array(100).fill(0)).p.status, 'growing');
});

test('Twinvine needs its two jogs within 100 work', () => {
  assert.equal(grow('twinvine', [200, 301]).p.status, 'growing');
  assert.equal(grow('twinvine', [200, 300]).p.status, 'ripe');
});

test('a cloche saves a plant once', () => {
  const p = newPlant('moonmoss', 10);
  p.cloche = true;
  applyRound(p, 11, 600); applyRound(p, 12, 600);
  assert.equal(p.status, 'growing');
  assert.equal(p.cloche, false);
  applyRound(p, 13, 600); applyRound(p, 14, 600);
  assert.equal(p.status, 'wilted');
});

test('a ripe plant rots after the window', () => {
  const { p } = grow('zoomflower', [600]);
  assert.equal(p.ripeRound, 11);
  applyRound(p, 22, 0);
  assert.equal(p.status, 'ripe');
  applyRound(p, 23, 0);
  assert.equal(p.status, 'rotten');
});

test('an unknown round leaves a growing plant exactly as it was', () => {
  for (const seed of ['moonmoss', 'trotbean', 'zoomflower', 'mileoak', 'comet', 'dreamcap', 'twinvine', 'wheelbloom']) {
    const p = newPlant(seed, 10), before = JSON.stringify(p);
    assert.equal(applyRound(p, 11, null), null);
    assert.equal(JSON.stringify(p), before, seed);
  }
});

test('an unknown round still counts towards rotting', () => {
  const { p } = grow('zoomflower', [600]);
  applyRound(p, 23, null);
  assert.equal(p.status, 'rotten');
});

test('the mixed-bed bonus needs two other living species next door', () => {
  const S = blankState(1);
  S.plots[1] = { ...newPlant('zoomflower', 1), status: 'ripe' };
  assert.deepEqual(harvestValue(S, 1), { value: 70, diverse: false });
  S.plots[0] = newPlant('moonmoss', 1);
  assert.deepEqual(harvestValue(S, 1), { value: 70, diverse: false });
  S.plots[2] = newPlant('moonmoss', 1);
  assert.deepEqual(harvestValue(S, 1), { value: 70, diverse: false }, 'same species twice is one kind');
  S.plots[2] = newPlant('trotbean', 1);
  assert.deepEqual(harvestValue(S, 1), { value: 84, diverse: true });
  S.plots[2].status = 'wilted';
  assert.deepEqual(harvestValue(S, 1), { value: 70, diverse: false }, 'dead neighbours do not count');
});

test('seasons turn over at Monday 00:00 UTC', () => {
  const sunday = Date.UTC(2026, 10, 1, 23, 59, 59), monday = Date.UTC(2026, 10, 2, 0, 0, 0);
  assert.equal(new Date(monday).getUTCDay(), 1);
  assert.equal(seasonId(monday), seasonId(sunday) + 1);
  assert.equal(seasonId(monday + 6 * 86400000), seasonId(monday));
});

test('a new season resets the score and keeps the best', () => {
  const S = blankState(5);
  S.seasonScore = 300; S.best = 200;
  assert.equal(rollSeason(S, 5), false);
  assert.equal(S.seasonScore, 300);
  assert.equal(rollSeason(S, 6), true);
  assert.deepEqual([S.season, S.seasonScore, S.best], [6, 0, 300]);
});

test('watering gives one step of help', () => {
  const p = newPlant('moonmoss', 10);
  water(p, 11);
  assert.equal(p.growth, 1);
});

// ---------- how long a season runs ----------
test('a season locks on the Monday 00:00 UTC that follows it', () => {
  const thursday = Date.UTC(2026, 10, 5, 6, 0, 0), monday = Date.UTC(2026, 10, 9, 0, 0, 0);
  assert.equal(new Date(monday).getUTCDay(), 1);
  assert.equal(seasonEndsAt(seasonId(thursday)), monday);
  assert.equal(seasonId(monday), seasonId(thursday) + 1);
  assert.equal(seasonEndsAt(seasonId(monday - 1)), monday, 'the last moment still belongs to this season');
  assert.equal(seasonEndsAt(seasonId(monday)), monday + 7 * 86400000);
});

// ---------- a redeployed chain ----------
/** The real case: a garden at round 1306 when the chain restarts and the clock says 165. */
const oldGarden = () => {
  const S = blankState(1);
  S.processed = 1306; S.pips = 345; S.xp = 500; S.seasonScore = 210; S.harvests = 9; S.waterAt = 1310;
  S.plots[0] = { ...newPlant('moonmoss', 1300), growth: 2, age: 6 };
  S.plots[1] = { ...newPlant('zoomflower', 1290), status: 'ripe', ripeRound: 1300 };
  return S;
};

test('a save from the old chain moves to the new count and keeps everything', () => {
  const S = oldGarden();
  assert.equal(syncChain(S, 'new-chain', 165), true);
  assert.equal(S.chain, 'new-chain');
  assert.equal(S.processed, 164);
  assert.equal(S.plots[0].plantedRound, 158);
  assert.equal(S.plots[1].ripeRound, 158);
  assert.equal(S.waterAt, 168);
  assert.deepEqual([S.pips, S.xp, S.seasonScore, S.harvests, S.plots[0].growth, S.plots[0].age], [345, 500, 210, 9, 2, 6]);
});

test('a moved garden grows on the new rounds at once, not eight days later', () => {
  const S = oldGarden();
  syncChain(S, 'new-chain', 165);
  settleRounds(S, new Map([[165, { work: 0 }], [166, { work: 0 }]]), 166);
  assert.equal(S.processed, 166);
  assert.equal(S.plots[0].growth, 4);
  assert.equal(S.plots[0].status, 'ripe');
});

test('rounds from before the restart do not count', () => {
  const S = oldGarden();
  syncChain(S, 'new-chain', 165);
  settleRounds(S, new Map([[1, { work: 0 }], [2, { work: 0 }]]), 2);
  assert.equal(S.plots[0].growth, 2);
  assert.equal(S.processed, 164);
});

test('the time left to pick a ripe plant survives the move', () => {
  const S = oldGarden();
  syncChain(S, 'new-chain', 165);
  settleRounds(S, new Map([[165, { work: 0 }], [166, { work: 0 }], [167, { work: 0 }], [168, { work: 0 }], [169, { work: 0 }]]), 169);
  assert.equal(S.plots[1].status, 'ripe');
  settleRounds(S, new Map([[170, { work: 0 }]]), 170);
  assert.equal(S.plots[1].status, 'rotten');
});

test('a plant set after the last settled round is not left ahead of the new count', () => {
  const S = oldGarden();
  S.plots[2] = newPlant('moonmoss', 1320);
  syncChain(S, 'new-chain', 165);
  assert.equal(S.plots[2].plantedRound, 164);
  settleRounds(S, new Map([[165, { work: 0 }]]), 165);
  assert.equal(S.plots[2].growth, 1);
});

test('syncing twice changes nothing the second time', () => {
  const S = oldGarden();
  syncChain(S, 'new-chain', 165);
  const once = JSON.stringify(S);
  assert.equal(syncChain(S, 'new-chain', 170), false);
  assert.equal(JSON.stringify(S), once);
});

test('a marked garden moves again if the chain changes again', () => {
  const S = oldGarden();
  syncChain(S, 'second', 165);
  assert.equal(syncChain(S, 'third', 10), true);
  assert.equal(S.processed, 9);
});

test('a save that is not ahead of the clock is only marked', () => {
  const S = blankState(1);
  S.processed = 100;
  assert.equal(syncChain(S, 'a-chain', 165), false);
  assert.equal(S.processed, 100);
  assert.equal(S.chain, 'a-chain');
});

test('a brand new garden on a paused chain just takes the mark', () => {
  const S = blankState(1);
  assert.equal(syncChain(S, 'new-chain', 165), false);
  assert.equal(S.processed, null);
  assert.equal(S.log.length, 0);
});

test('no chain id leaves the garden alone', () => {
  const S = oldGarden(), before = JSON.stringify(S);
  assert.equal(syncChain(S, null, 165), false);
  assert.equal(JSON.stringify(S), before);
});

test('a plant watered ripe before any round settles does not rot at once', () => {
  const S = blankState(1);
  S.plots[0] = { ...newPlant('moonmoss', 165), growth: 3 };
  assert.equal(doAction(S, { type: 'water', plot: 0 }, 165).error, undefined);
  assert.equal(S.plots[0].status, 'ripe');
  assert.equal(S.plots[0].ripeRound, 165);
  settleRounds(S, new Map([[166, { work: 0 }]]), 166);
  settleRounds(S, new Map([[167, { work: 0 }]]), 167);
  assert.equal(S.plots[0].status, 'ripe');
});
