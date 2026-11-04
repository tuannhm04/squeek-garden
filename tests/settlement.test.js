import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RoundLedger, fetchHistory, normalizeSettlement, splitSettlement } from '../public/settlement.js';

// Real events captured from api.squeekchain.com on 2026-11-04, see tests/fixtures/README.md
const real = JSON.parse(readFileSync(new URL('./fixtures/settlements.json', import.meta.url)));
const event = (prev, thr, work, active = work ? thr - prev : 0, id = `e${thr}`) => ({
  id, type: 'system.settlement_completed',
  payload: { previousSettledThroughRound: String(prev), settledThroughRound: String(thr), workAdded: String(work), activeRoundCount: String(active), cumulativeWork: '0' },
});
const ledgerOf = events => { const l = new RoundLedger(); l.ingest(events); return l; };

test('a real single-round settlement gives verified work', () => {
  const s = real.find(e => +e.payload.settledThroughRound - +e.payload.previousSettledThroughRound === 1 && +e.payload.workAdded > 0);
  const [[round, data]] = splitSettlement(normalizeSettlement(s));
  assert.equal(round, +s.payload.settledThroughRound);
  assert.equal(data.work, +s.payload.workAdded);
  assert.equal(data.verified, true);
});

test('the real 16-round batch with work is not split evenly', () => {
  const l = ledgerOf(real);
  for (let r = 191; r <= 206; r++) {
    const d = l.rounds.get(r);
    assert.equal(d.work, null, `round ${r}`);
    assert.equal(d.verified, false);
    assert.deepEqual(d.batch, { first: 191, last: 206, work: 2932, active: 7 });
  }
  assert.equal(l.rounds.get(206).cum, 14828);
});

test('the real 6-round batch stays unverified even with every round active', () => {
  const l = ledgerOf(real);
  for (let r = 45; r <= 50; r++) assert.equal(l.rounds.get(r).work, null, `round ${r}`);
});

test('a real multi-round batch with no work proves a nap in each round', () => {
  const s = real.find(e => +e.payload.settledThroughRound - +e.payload.previousSettledThroughRound > 1 && +e.payload.workAdded === 0);
  assert.ok(s, 'fixture holds a zero-work batch');
  for (const [, d] of splitSettlement(normalizeSettlement(s))) assert.deepEqual([d.work, d.verified], [0, true]);
});

test('malformed settlements are counted, not trusted', () => {
  const bad = [
    { type: 'system.settlement_completed' },
    event(5, 5, 0),
    event(6, 5, 0),
    { ...event(1, 2, 0), payload: { ...event(1, 2, 0).payload, workAdded: 'many' } },
    { ...event(1, 2, 0), payload: { ...event(1, 2, 0).payload, workAdded: '-4' } },
    { ...event(1, 2, 0), payload: { ...event(1, 2, 0).payload, workAdded: null } },
  ];
  const l = new RoundLedger();
  assert.equal(l.ingest(bad).malformed, bad.length);
  assert.equal(l.rounds.size, 0);
});

test('other event types are ignored', () => {
  const l = new RoundLedger();
  const stats = l.ingest([{ type: 'system.mining_checkpointed', payload: {} }]);
  assert.deepEqual([stats.settled, stats.malformed, l.rounds.size], [0, 0, 0]);
});

test('duplicates change nothing', () => {
  const l = ledgerOf([event(1, 2, 100)]);
  const stats = l.ingest([event(1, 2, 100)]);
  assert.equal(stats.duplicates, 1);
  assert.equal(l.rounds.size, 1);
});

test('a conflicting record is flagged and the first one stands', () => {
  const l = ledgerOf([event(1, 2, 100)]);
  assert.equal(l.ingest([event(1, 2, 999)]).conflicts, 1);
  assert.equal(l.rounds.get(2).work, 100);
});

test('out-of-order pages build the same ledger', () => {
  const a = ledgerOf([event(1, 2, 10), event(2, 3, 20), event(3, 4, 30)]);
  const b = ledgerOf([event(3, 4, 30), event(1, 2, 10), event(2, 3, 20)]);
  assert.deepEqual([...b.rounds].sort((x, y) => x[0] - y[0]), [...a.rounds].sort((x, y) => x[0] - y[0]));
  assert.deepEqual([b.oldest, b.latest], [2, 4]);
});

test('firstGap finds a hole in the middle', () => {
  const l = ledgerOf([event(1, 2, 0), event(3, 4, 0)]);
  assert.equal(l.firstGap(2), 3);
  assert.equal(l.firstGap(4), null);
  assert.equal(l.firstGap(1), 1);
});

/** A paged API over events sorted newest first. */
function api(events, size = 2) {
  const sorted = [...events].sort((a, b) => +b.payload.settledThroughRound - +a.payload.settledThroughRound);
  const calls = [];
  const getJSON = async url => {
    calls.push(url);
    const from = +(new URL(url, 'http://x').searchParams.get('cursor') || 0);
    const page = sorted.slice(from, from + size);
    return { events: page, nextCursor: from + size < sorted.length ? String(from + size) : null };
  };
  return { getJSON, calls };
}
const url = 'http://x/events?limit=2';
const run = n => Array.from({ length: n }, (_, i) => event(i, i + 1, 0));

test('backfill keeps paging until the needed round is covered', async () => {
  const { getJSON } = api(run(10));
  const l = new RoundLedger();
  const r = await fetchHistory({ getJSON, url, ledger: l, needFrom: 3 });
  assert.equal(l.firstGap(3), null);
  assert.equal(r.exhausted, false);
});

test('backfill stops after one page when nothing older is needed', async () => {
  const { getJSON, calls } = api(run(10));
  await fetchHistory({ getJSON, url, ledger: new RoundLedger(), needFrom: 9 });
  assert.equal(calls.length, 1);
});

test('a tab that slept fills the hole between old and new rounds', async () => {
  const l = ledgerOf(run(3));
  const { getJSON } = api(run(12));
  await fetchHistory({ getJSON, url, ledger: l, needFrom: 3 });
  assert.equal(l.firstGap(3), null);
  assert.equal(l.latest, 12);
});

test('reaching the end of the history is reported', async () => {
  const { getJSON } = api(run(4));
  const r = await fetchHistory({ getJSON, url, ledger: new RoundLedger(), needFrom: 1 });
  assert.equal(r.exhausted, true);
});

test('an outage page throws and keeps the good pages', async () => {
  let n = 0;
  const getJSON = async () => (n++ ? { status: 'unavailable' } : { events: [event(9, 10, 5)], nextCursor: 'more' });
  const l = new RoundLedger();
  await assert.rejects(fetchHistory({ getJSON, url, ledger: l, needFrom: 1 }));
  assert.equal(l.rounds.get(10).work, 5);
});

test('a network failure leaves the ledger usable', async () => {
  const l = ledgerOf([event(1, 2, 10)]);
  await assert.rejects(fetchHistory({ getJSON: async () => { throw new Error('offline'); }, url, ledger: l, needFrom: 1 }));
  assert.equal(l.rounds.get(2).work, 10);
});

test('clearing a ledger forgets the old chain but keeps the same map', () => {
  const l = ledgerOf([event(1, 2, 10)]), map = l.rounds;
  l.clear();
  assert.equal(l.rounds, map);
  assert.deepEqual([map.size, l.oldest, l.latest], [0, Infinity, 0]);
  l.ingest([event(0, 1, 5)]);
  assert.deepEqual([l.oldest, l.latest, l.rounds.get(1).work], [1, 1, 5]);
});
