// Turns Squeekchain settlement events into per-round work the garden can trust.
// A batch that closes several rounds only reports its total work, so those rounds stay unverified.
const SETTLED = 'system.settlement_completed';

const toInt = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/** Validated settlement fields, or null when the event is not a usable settlement. */
export function normalizeSettlement(e) {
  if (!e || e.type !== SETTLED || !e.payload) return null;
  const p = e.payload;
  const prev = toInt(p.previousSettledThroughRound), thr = toInt(p.settledThroughRound);
  const work = toInt(p.workAdded), active = toInt(p.activeRoundCount);
  if (prev === null || thr === null || work === null || active === null || thr <= prev) return null;
  return { id: e.id, prev, thr, work, active, cum: toInt(p.cumulativeWork) };
}

/** The rounds a settlement closes, as [round, data] pairs. work is null when it is unknown. */
export function splitSettlement(s) {
  const out = [];
  for (let r = s.prev + 1; r <= s.thr; r++) {
    const cum = r === s.thr ? s.cum : null;
    if (s.thr - s.prev === 1) out.push([r, { work: s.work, cum, verified: true }]);
    else if (s.work === 0) out.push([r, { work: 0, cum, verified: true }]); // zero in total proves zero in each
    else out.push([r, { work: null, cum, verified: false, batch: { first: s.prev + 1, last: s.thr, work: s.work, active: s.active } }]);
  }
  return out;
}

export class RoundLedger {
  rounds = new Map(); // round -> { work, cum, verified, batch? }
  oldest = Infinity;
  latest = 0;

  /** Safe to call with repeated or out-of-order events: the first record of a round stands. */
  ingest(events) {
    const stats = { settled: 0, malformed: 0, duplicates: 0, conflicts: 0 };
    for (const e of events) {
      if (!e || e.type !== SETTLED) continue;
      const s = normalizeSettlement(e);
      if (!s) { stats.malformed++; continue; }
      stats.settled++;
      for (const [r, data] of splitSettlement(s)) {
        const had = this.rounds.get(r);
        if (had) { if (had.work === data.work) stats.duplicates++; else stats.conflicts++; continue; }
        this.rounds.set(r, data);
        this.oldest = Math.min(this.oldest, r);
        this.latest = Math.max(this.latest, r);
      }
    }
    return stats;
  }

  /** First round at or after `from` with no record, up to the latest known round. */
  firstGap(from) {
    for (let r = from; r <= this.latest; r++) if (!this.rounds.has(r)) return r;
    return null;
  }
}

/** Pages back until every round from needFrom is covered. Throws on a bad page; good pages stay ingested. */
export async function fetchHistory({ getJSON, url, ledger, needFrom, maxPages = 200 }) {
  let cursor = null, pages = 0;
  while (pages < maxPages) {
    const d = await getJSON(cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url);
    if (!Array.isArray(d.events)) throw new Error('The events API returned a page without events.');
    ledger.ingest(d.events);
    pages++;
    if (!d.nextCursor) return { pages, exhausted: true };
    if (ledger.latest && ledger.firstGap(needFrom) === null) return { pages, exhausted: false };
    cursor = d.nextCursor;
  }
  return { pages, exhausted: false };
}
