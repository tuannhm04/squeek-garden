import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRound, blankState, classify, harvestValue, newPlant, rollSeason, seasonId, water } from '../engine.js';

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
