import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBO_BONUS, DAILY_CHALLENGES, applyRound, blankState, classify, dailyFor, doAction, harvestValue, newPlant, rollPeriods, rollSeason, seasonEndsAt, seasonId, settleRounds, syncChain, water } from '../public/engine.js';

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

// ---------- daily challenges and combos ----------
const ripeGarden = (...seeds) => {
  const S = blankState(1);
  S.processed = 100;
  seeds.forEach((seed, i) => { S.plots[i * 3] = { ...newPlant(seed, 90), status: 'ripe', ripeRound: 99 }; });
  return S;
};
const pick = (S, plot, cur = 101) => { const r = doAction(S, { type: 'harvest', plot }, cur); assert.equal(r.error, undefined); return r; };
const withDaily = (S, ...ids) => { S.daily = { day: 5, items: ids.map(id => ({ id, progress: 0, done: false })) }; return S; };

test('each day has three different challenges, the same for everyone', () => {
  for (let day = 20000; day < 20100; day++) {
    const ids = dailyFor(day);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    assert.deepEqual(dailyFor(day), ids);
    ids.forEach(id => assert.ok(DAILY_CHALLENGES.some(d => d.id === id)));
  }
});

test('challenges vary from day to day and all of them come up', () => {
  const seen = new Set(), sets = new Set();
  for (let day = 20000; day < 20100; day++) { dailyFor(day).forEach(id => seen.add(id)); sets.add(dailyFor(day).join()); }
  assert.equal(seen.size, DAILY_CHALLENGES.length);
  assert.ok(sets.size > 30, `${sets.size} different sets in 100 days`);
});

test('challenges reset with the day and keep their progress within it', () => {
  const S = blankState(1);
  rollPeriods(S, 1, 20000);
  S.daily.items[0].progress = 1;
  rollPeriods(S, 1, 20000);
  assert.equal(S.daily.items[0].progress, 1);
  rollPeriods(S, 1, 20001);
  assert.equal(S.daily.day, 20001);
  assert.ok(S.daily.items.every(x => x.progress === 0 && !x.done));
});

test('a finished challenge pays once, even after a reload', () => {
  let S = withDaily(ripeGarden('moonmoss', 'moonmoss'), 'moon1');
  pick(S, 0);
  assert.equal(S.pips, 60 + 30 + 20);
  S = JSON.parse(JSON.stringify(S));
  pick(S, 3, 110);
  assert.equal(S.pips, 60 + 30 + 20 + 30);
  assert.equal(S.daily.items[0].progress, 1);
});

test('a save from before challenges plays on without them until the day rolls', () => {
  const S = ripeGarden('moonmoss');
  delete S.daily; delete S.combo;
  pick(S, 0);
  assert.equal(S.pips, 90);
  rollPeriods(S, 1, 20000);
  assert.equal(S.daily.items.length, 3);
});

test('planting and watering count towards their challenges', () => {
  const S = withDaily(blankState(1), 'plant3', 'water1');
  S.processed = 100; S.pips = 200;
  for (const plot of [0, 1, 2]) doAction(S, { type: 'plant', plot, seed: 'moonmoss' }, 101);
  assert.deepEqual([S.daily.items[0].progress, S.daily.items[0].done], [3, true]);
  doAction(S, { type: 'water', plot: 0 }, 101);
  assert.equal(S.daily.items[1].done, true);
});

test('a refused action earns nothing', () => {
  const S = withDaily(blankState(1), 'plant3', 'pick1');
  S.pips = 0;
  assert.ok(doAction(S, { type: 'plant', plot: 0, seed: 'moonmoss' }, 101).error);
  assert.ok(doAction(S, { type: 'harvest', plot: 0 }, 101).error);
  assert.ok(S.daily.items.every(x => x.progress === 0));
});

test('a combo adds pips only: points, XP and the mixed-bed value do not change', () => {
  const S = ripeGarden('moonmoss', 'trotbean');
  S.plots[1] = newPlant('dreamcap', 90); S.plots[2] = newPlant('comet', 90);
  const before = harvestValue(S, 3);
  pick(S, 0, 101);
  assert.deepEqual(harvestValue(S, 3), before);
  const { seasonScore, xp, pips } = S;
  pick(S, 3, 102);
  assert.equal(S.seasonScore - seasonScore, 35);
  assert.equal(S.xp - xp, 35);
  assert.equal(S.pips - pips, 35 + Math.round(35 * .05));
});

test('the bonus climbs to 15% and stops there', () => {
  assert.deepEqual(COMBO_BONUS, [0, 0, .05, .10, .15]);
  const S = ripeGarden('moonmoss', 'trotbean');
  S.plots[4] = { ...newPlant('zoomflower', 90), status: 'ripe', ripeRound: 99 };
  S.plots[1] = { ...newPlant('mileoak', 90), status: 'ripe', ripeRound: 99 };
  S.plots[2] = { ...newPlant('moonmoss', 90), status: 'ripe', ripeRound: 99 };
  // the bed is mixed, so each pick's value comes from the points it scored
  const bonusOn = (plot, pct) => {
    const pips = S.pips, score = S.seasonScore;
    pick(S, plot, 101);
    const value = S.seasonScore - score;
    assert.equal(S.pips - pips, value + Math.round(value * pct));
  };
  bonusOn(0, 0);    // Moonmoss starts it
  bonusOn(3, .05);  // Trotbean
  bonusOn(4, .10);  // Zoomflower
  bonusOn(1, .15);  // Mile Oak
  bonusOn(2, .15);  // Moonmoss again, still capped
  assert.equal(S.combo.count, 5);
});

test('the same species twice restarts the combo', () => {
  const S = ripeGarden('moonmoss', 'moonmoss');
  pick(S, 0);
  const before = S.pips;
  pick(S, 3);
  assert.equal(S.pips - before, 30);
  assert.equal(S.combo.count, 1);
});

test('the combo window is three rounds', () => {
  const near = ripeGarden('moonmoss', 'trotbean');
  pick(near, 0, 100); pick(near, 3, 103);
  assert.equal(near.combo.count, 2);
  const far = ripeGarden('moonmoss', 'trotbean');
  pick(far, 0, 100); pick(far, 3, 104);
  assert.equal(far.combo.count, 1);
});

test('a combo does not span rounds with unknown work', () => {
  const S = ripeGarden('moonmoss', 'trotbean');
  pick(S, 0, 101);
  settleRounds(S, new Map([[101, { work: null }]]), 101);
  assert.equal(S.combo, null);
  pick(S, 3, 102);
  assert.equal(S.combo.count, 1);
});

test('known rounds keep the combo going', () => {
  const S = ripeGarden('moonmoss', 'trotbean');
  pick(S, 0, 101);
  settleRounds(S, new Map([[101, { work: 0 }]]), 101);
  assert.equal(S.combo.count, 1);
  pick(S, 3, 102);
  assert.equal(S.combo.count, 2);
});

test('reaching a combo counts towards its challenge', () => {
  const S = withDaily(ripeGarden('moonmoss', 'trotbean'), 'combo2');
  pick(S, 0, 101);
  assert.equal(S.daily.items[0].done, false);
  pick(S, 3, 102);
  assert.equal(S.daily.items[0].done, true);
});

test('a combo cannot run away: each pick still needs a plant that really ripened', () => {
  const S = ripeGarden('moonmoss');
  pick(S, 0, 101);
  assert.ok(doAction(S, { type: 'harvest', plot: 0 }, 101).error);
  assert.equal(S.combo.count, 1);
});

test('a chain restart ends a running combo and keeps the daily challenges', () => {
  const S = oldGarden();
  S.combo = { count: 3, lastSeed: 'moonmoss', lastRound: 1305 };
  S.daily = { day: 20000, items: [{ id: 'pick3', progress: 2, done: false }] };
  syncChain(S, 'new-chain', 165);
  assert.equal(S.combo, null);
  assert.equal(S.daily.items[0].progress, 2);
});
