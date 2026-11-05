import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { handleApi } from '../server/index.js';
import { checksumAddress, recoverAddress } from '../server/siwe.js';

const ORIGIN = 'https://garden.test';
const NOW = Date.UTC(2026, 10, 4, 12);

// ---------- a D1 stand-in over real SQLite ----------
class Statement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
}
function makeEnv(events = [], extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const env = {
    sqlite: db,
    events,
    DB: {
      prepare: sql => new Statement(db, sql),
      batch: async list => { db.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    },
    installation: 'chain-a',
    genesis: '1793022600',
    fetchUpstream: async url => new Response(JSON.stringify(url.includes('/core') ? { installationId: env.installation, configuration: { genesisTimestamp: env.genesis } } : { events: env.events, nextCursor: null })),
    ...extra,
  };
  return env;
}
const settled = (prev, thr, work, active = work ? thr - prev : 0) => ({
  id: `e${thr}`, type: 'system.settlement_completed',
  payload: { previousSettledThroughRound: String(prev), settledThroughRound: String(thr), workAdded: String(work), activeRoundCount: String(active), cumulativeWork: '0' },
});

// ---------- a wallet and a browser ----------
function makeWallet(seed = 1) {
  const key = new Uint8Array(32).fill(seed);
  const address = checksumAddress(`0x${bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20))}`);
  const sign = message => {
    const body = utf8ToBytes(message), prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`);
    const joined = new Uint8Array(prefix.length + body.length);
    joined.set(prefix); joined.set(body, prefix.length);
    const sig = secp256k1.sign(keccak_256(joined), key);
    return `0x${sig.toCompactHex()}${(27 + sig.recovery).toString(16)}`;
  };
  return { address, sign };
}
function siwe(address, nonce, over = {}) {
  const f = { domain: 'garden.test', uri: ORIGIN, version: '1', issued: new Date(NOW).toISOString(), expires: new Date(NOW + 600000).toISOString(), ...over };
  return `${f.domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Squeek Garden.\n\nURI: ${f.uri}\nVersion: ${f.version}\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${f.issued}\nExpiration Time: ${f.expires}`;
}
function client(env, now = () => NOW) {
  let cookie = null;
  const call = async (path, body, headers = {}) => {
    const res = await handleApi(new Request(ORIGIN + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { Origin: ORIGIN }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env, now());
    const set = res.headers.get('Set-Cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json(), setCookie: set };
  };
  return { call, get cookie() { return cookie; } };
}
async function signIn(env, wallet = makeWallet(), now) {
  const c = client(env, now);
  const { body: { nonce } } = await c.call(`/api/nonce?address=${wallet.address}`);
  const message = siwe(wallet.address, nonce);
  const res = await c.call('/api/login', { message, signature: wallet.sign(message) });
  assert.equal(res.status, 200);
  return Object.assign(c, { wallet, message, nonce });
}
let uid = 0;
const action = a => ({ id: `action-${++uid}-test`, ...a });
const sqlOne = (env, sql, ...args) => env.sqlite.prepare(sql).get(...args);

// ---------- sign-in ----------
test('a real signature recovers the signer', () => {
  const w = makeWallet();
  assert.equal(recoverAddress('hello', w.sign('hello')), w.address);
  assert.notEqual(recoverAddress('hello!', w.sign('hello')), w.address);
  assert.equal(recoverAddress('hello', '0x12'), null);
});

test('signing in opens a session in an HttpOnly, Secure cookie', async () => {
  const env = makeEnv(), w = makeWallet(), c = client(env);
  const { body } = await c.call(`/api/nonce?address=${w.address.toLowerCase()}`);
  assert.equal(body.address, w.address, 'the server hands back the checksummed address');
  const message = siwe(w.address, body.nonce);
  const res = await c.call('/api/login', { message, signature: w.sign(message) });
  assert.equal(res.body.address, w.address);
  assert.match(res.setCookie, /HttpOnly/);
  assert.match(res.setCookie, /Secure/);
  assert.match(res.setCookie, /SameSite=Lax/);
  assert.equal((await c.call('/api/me')).body.address, w.address);
});

test('the session token is not stored in the clear', async () => {
  const env = makeEnv(), c = await signIn(env);
  const token = c.cookie.split('=')[1];
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').get(token).n, 0);
});

test('a nonce works only once', async () => {
  const env = makeEnv(), c = await signIn(env);
  const again = await client(env).call('/api/login', { message: c.message, signature: c.wallet.sign(c.message) });
  assert.equal(again.status, 401);
  assert.match(again.body.error, /already used/);
});

test('a made-up nonce is refused', async () => {
  const env = makeEnv(), w = makeWallet(), message = siwe(w.address, 'deadbeef');
  assert.equal((await client(env).call('/api/login', { message, signature: w.sign(message) })).status, 401);
});

test('a signature from another wallet is refused and keeps the nonce alive', async () => {
  const env = makeEnv(), victim = makeWallet(1), thief = makeWallet(2), c = client(env);
  const { body: { nonce } } = await c.call(`/api/nonce?address=${victim.address}`);
  const message = siwe(victim.address, nonce);
  assert.equal((await c.call('/api/login', { message, signature: thief.sign(message) })).status, 401);
  assert.equal((await c.call('/api/me')).body.address, null);
  assert.equal((await c.call('/api/login', { message, signature: victim.sign(message) })).status, 200);
});

test('a message signed for another site, address or time is refused', async () => {
  const env = makeEnv(), w = makeWallet();
  for (const over of [
    { domain: 'evil.test' },
    { uri: 'https://evil.test' },
    { version: '2' },
    { expires: new Date(NOW - 1).toISOString() },
    { issued: new Date(NOW + 3600000).toISOString() },
    { issued: 'yesterday' },
  ]) {
    const c = client(env);
    const { body: { nonce } } = await c.call(`/api/nonce?address=${w.address}`);
    const message = siwe(w.address, nonce, over);
    assert.equal((await c.call('/api/login', { message, signature: w.sign(message) })).status, 401, JSON.stringify(over));
  }
});

test('a message that is not EIP-4361 is refused', async () => {
  const env = makeEnv(), w = makeWallet();
  assert.equal((await client(env).call('/api/login', { message: 'let me in', signature: w.sign('let me in') })).status, 400);
});

test('a POST from another site is refused', async () => {
  const env = makeEnv(), c = await signIn(env);
  const res = await c.call('/api/action', action({ type: 'buyCloche' }), { Origin: 'https://evil.test' });
  assert.equal(res.status, 403);
});

test('logging out ends the session on the server', async () => {
  const env = makeEnv(), c = await signIn(env), stolen = c.cookie;
  await c.call('/api/logout', {});
  const res = await client(env).call('/api/me', undefined, { Cookie: stolen });
  assert.equal(res.body.address, null);
});

test('an expired session is refused', async () => {
  const env = makeEnv();
  let t = NOW;
  const c = await signIn(env, makeWallet(), () => t);
  t = NOW + 15 * 86400000;
  assert.equal((await c.call('/api/garden')).status, 401);
});

test('without a session there is no garden and no action', async () => {
  const env = makeEnv(), c = client(env);
  assert.equal((await c.call('/api/garden')).status, 401);
  assert.equal((await c.call('/api/action', action({ type: 'buyCloche' }))).status, 401);
  assert.equal((await c.call('/api/practice', { score: 1 })).status, 401);
});

// ---------- gardens and scores ----------
/** A signed-in player whose garden has opened at round 100. */
async function player(env, wallet, now) {
  const c = await signIn(env, wallet, now);
  await c.call('/api/garden');
  return c;
}
const playEnv = () => makeEnv([settled(99, 100, 0)]);

test('a new garden opens on the latest settled round', async () => {
  const env = playEnv(), c = await signIn(env);
  const { body: { state } } = await c.call('/api/garden');
  assert.equal(state.processed, 100);
  assert.equal(state.pips, 60);
});

test('a harvest scores on the server and reaches the Live board', async () => {
  const env = playEnv();
  let t = NOW;
  const c = await player(env, makeWallet(), () => t);
  const plant = await c.call('/api/action', action({ type: 'plant', plot: 0, seed: 'zoomflower' }));
  assert.equal(plant.status, 200);
  const planted = plant.body.state.plots[0].plantedRound;
  // the planting round and the one after it settle, the second one with zoomies
  env.events = [settled(100, planted, 0), settled(planted, planted + 1, 700)];
  t += 60000;
  const res = await c.call('/api/action', action({ type: 'harvest', plot: 0 }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.state.seasonScore, 70);
  const board = await c.call('/api/leaderboard?board=live');
  assert.equal(board.body.rows[0].score, 70);
  assert.equal(board.body.rows[0].me, true);
  assert.equal(board.body.mine.rank, 1);
});

test('a plant that is not ripe cannot be harvested, however the request is written', async () => {
  const env = playEnv(), c = await player(env);
  await c.call('/api/action', action({ type: 'plant', plot: 0, seed: 'zoomflower' }));
  const res = await c.call('/api/action', action({ type: 'harvest', plot: 0, score: 9999, value: 9999, state: { seasonScore: 9999 } }));
  assert.equal(res.status, 422);
  assert.equal((await c.call('/api/leaderboard?board=live')).body.rows.length, 0);
});

test('a score cannot be posted to the Live board', async () => {
  const env = playEnv(), c = await player(env);
  await c.call('/api/practice', { score: 5000, board: 'live' });
  assert.equal((await c.call('/api/leaderboard?board=live')).body.rows.length, 0);
  assert.equal((await c.call('/api/leaderboard?board=practice')).body.rows[0].score, 5000);
});

test('the same action id only ever counts once', async () => {
  const env = playEnv(), c = await player(env), a = action({ type: 'buyCloche' });
  const first = await c.call('/api/action', a), second = await c.call('/api/action', a);
  assert.equal(first.body.state.pips, 35);
  assert.equal(second.body.state.pips, 35);
  assert.equal(second.body.repeated, true);
});

test('rules are enforced: price, plots, levels and unknown input', async () => {
  const env = playEnv(), c = await player(env);
  for (const [a, why] of [
    [{ type: 'plant', plot: 0, seed: 'comet' }, 'locked seed'],
    [{ type: 'plant', plot: 7, seed: 'moonmoss' }, 'locked plot'],
    [{ type: 'plant', plot: -1, seed: 'moonmoss' }, 'negative plot'],
    [{ type: 'plant', plot: '0', seed: 'moonmoss' }, 'plot as text'],
    [{ type: 'plant', plot: 0, seed: 'constructor' }, 'inherited name as a seed'],
    [{ type: 'plant', plot: 0, seed: 'gold' }, 'unknown seed'],
    [{ type: 'buyPlot' }, 'cannot afford a plot'],
    [{ type: 'water', plot: 0 }, 'nothing to water'],
    [{ type: 'mint' }, 'unknown action'],
    [{}, 'no type'],
  ]) assert.equal((await c.call('/api/action', action(a))).status, 422, why);
  assert.equal((await c.call('/api/garden')).body.state.pips, 60);
});

test('a batch of rounds with work does not grow plants', async () => {
  const env = playEnv();
  let t = NOW;
  const c = await player(env, makeWallet(), () => t);
  const { body: { state } } = await c.call('/api/action', action({ type: 'plant', plot: 0, seed: 'moonmoss' }));
  const r = state.plots[0].plantedRound;
  env.events = [settled(100, r, 0), settled(r, r + 6, 3000, 3)];
  t += 60000;
  const after = (await c.call('/api/garden')).body.state;
  assert.equal(after.plots[0].growth, 0);
  assert.equal(after.plots[0].age, 0);
  assert.equal(after.processed, r + 6);
  assert.match(after.log[0].text, /settled together/);
});

test('one wallet sees the same garden on two devices', async () => {
  const env = playEnv(), w = makeWallet(), phone = await player(env, w), laptop = await signIn(env, w);
  await phone.call('/api/action', action({ type: 'plant', plot: 3, seed: 'trotbean' }));
  assert.equal((await laptop.call('/api/garden')).body.state.plots[3].seed, 'trotbean');
});

test('two wallets never touch each other\'s gardens', async () => {
  const env = playEnv(), a = await player(env, makeWallet(1)), b = await player(env, makeWallet(2));
  await a.call('/api/action', action({ type: 'plant', plot: 0, seed: 'moonmoss' }));
  const seen = (await b.call('/api/garden')).body.state;
  assert.equal(seen.plots[0], null);
  assert.equal(seen.pips, 60);
});

test('actions racing on one garden all land', async () => {
  const env = playEnv(), c = await player(env);
  const res = await Promise.all([0, 1, 2].map(plot => c.call('/api/action', action({ type: 'plant', plot, seed: 'moonmoss' }))));
  res.forEach(r => assert.equal(r.status, 200));
  const { state } = (await c.call('/api/garden')).body;
  assert.equal(state.pips, 30);
  assert.equal(state.plots.filter(Boolean).length, 3);
});

test('a lost race is retried from the newer garden, not written over it', async () => {
  const env = playEnv(), c = await player(env);
  const raw = env.DB.prepare;
  let bumped = false;
  env.DB.prepare = sql => {
    // another device saves just before this action writes
    if (sql.startsWith('UPDATE gardens') && !bumped) {
      bumped = true;
      const row = sqlOne(env, 'SELECT state, rev FROM gardens');
      const s = JSON.parse(row.state); s.cloches = 5;
      env.sqlite.prepare('UPDATE gardens SET state = ?, rev = rev + 1').run(JSON.stringify(s));
    }
    return raw(sql);
  };
  const res = await c.call('/api/action', action({ type: 'buyCloche' }));
  assert.equal(res.status, 200);
  assert.equal(res.body.state.cloches, 6);
});

test('rounds lost beyond the paging limit count as unknown, not as naps', async () => {
  const env = playEnv();
  let t = NOW;
  const c = await player(env, makeWallet(), () => t);
  const { body: { state } } = await c.call('/api/action', action({ type: 'plant', plot: 0, seed: 'moonmoss' }));
  const r = state.plots[0].plantedRound;
  // the history now starts far above our last round and has no older pages
  env.events = [settled(r + 10, r + 11, 0)];
  t += 60000;
  const after = (await c.call('/api/garden')).body.state;
  assert.equal(after.processed, r + 11);
  assert.equal(after.plots[0].age, 1, 'only the one round on record counts');
});

test('a garden survives Squeekchain restarting its rounds', async () => {
  const env = playEnv();
  let t = NOW;
  const c = await player(env, makeWallet(), () => t);
  await c.call('/api/action', action({ type: 'plant', plot: 0, seed: 'moonmoss' }));
  const before = (await c.call('/api/garden')).body.state;
  assert.equal(before.pips, 50);

  // the real change: a new installation, a later genesis and no settled rounds yet
  env.installation = 'chain-b';
  env.genesis = String(Math.floor(NOW / 1000) - 600 * 164);
  env.events = [];
  t += 60000;
  const moved = (await c.call('/api/garden')).body.state;
  assert.equal(moved.chain, 'chain-b');
  assert.equal(moved.pips, 50);
  assert.equal(moved.plots[0].seed, 'moonmoss');
  assert.equal(moved.processed, 164);
  assert.equal(sqlOne(env, 'SELECT COUNT(*) AS n FROM settlement_rounds').n, 0, 'old rounds are gone');

  // new rounds count straight away
  env.events = [settled(164, 165, 0), settled(165, 166, 0)];
  t += 60000;
  const grown = (await c.call('/api/garden')).body.state;
  assert.equal(grown.processed, 166);
  assert.ok(grown.plots[0].growth > 0);
});

test('a new garden on a paused chain can still plant', async () => {
  const env = makeEnv([]), c = await signIn(env);
  const { state } = (await c.call('/api/garden')).body;
  assert.equal(state.processed, null);
  assert.equal((await c.call('/api/action', action({ type: 'plant', plot: 0, seed: 'moonmoss' }))).status, 200);
});

test('a new garden gets today\'s challenges from the server', async () => {
  const env = playEnv(), c = await player(env);
  const { state } = (await c.call('/api/garden')).body;
  assert.equal(state.daily.items.length, 3);
  assert.equal(state.daily.day, Math.floor(NOW / 86400000));
});

test('repeating an action id cannot earn a challenge twice', async () => {
  const env = playEnv(), c = await player(env);
  const today = (await c.call('/api/garden')).body.state.daily.items.map(x => x.id);
  const a = action({ type: 'plant', plot: 0, seed: 'moonmoss' });
  const first = await c.call('/api/action', a), second = await c.call('/api/action', a);
  assert.equal(second.body.repeated, true);
  assert.deepEqual(second.body.state.daily, first.body.state.daily);
  assert.equal(second.body.state.pips, first.body.state.pips);
  assert.ok(today.length === 3);
});

test('a browser cannot claim a challenge or a combo in its request', async () => {
  const env = playEnv(), c = await player(env);
  const res = await c.call('/api/action', action({ type: 'buyCloche', daily: { items: [] }, combo: { count: 99 }, pips: 9999 }));
  assert.equal(res.status, 200);
  assert.equal(res.body.state.pips, 35);
  assert.equal(res.body.state.combo, null);
  assert.equal(res.body.state.daily.items.length, 3);
});

test('a garden saved before challenges picks them up without losing anything', async () => {
  const env = playEnv(), c = await player(env);
  const row = sqlOne(env, 'SELECT state FROM gardens');
  const old = JSON.parse(row.state);
  delete old.daily; delete old.combo;
  old.pips = 123;
  env.sqlite.prepare('UPDATE gardens SET state = ?').run(JSON.stringify(old));
  const { state } = (await c.call('/api/garden')).body;
  assert.equal(state.pips, 123);
  assert.equal(state.daily.items.length, 3);
});

test('the server sells gloves and decorations by its own prices', async () => {
  const env = playEnv(), c = await player(env);
  const g = await c.call('/api/action', action({ type: 'buyGloves', price: 0 }));
  assert.deepEqual([g.status, g.body.state.gloves, g.body.state.pips], [200, 1, 30]);
  const d = await c.call('/api/action', action({ type: 'buyDecor', item: 'pond', price: 0 }));
  assert.equal(d.status, 422);
  assert.equal(d.body.state, undefined);
  assert.equal((await c.call('/api/garden')).body.state.decor.pond, undefined);
});

test('badges cannot be claimed in a request', async () => {
  const env = playEnv(), c = await player(env);
  const res = await c.call('/api/action', action({ type: 'buyCloche', ach: { pick200: true }, decor: { pond: true }, gloves: 99 }));
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.state.ach.pick200, res.body.state.decor.pond, res.body.state.gloves], [undefined, undefined, 0]);
});

test('a garden from before these features can buy them', async () => {
  const env = playEnv(), c = await player(env);
  const old = JSON.parse(sqlOne(env, 'SELECT state FROM gardens').state);
  delete old.gloves; delete old.decor; delete old.composted;
  old.pips = 300;
  env.sqlite.prepare('UPDATE gardens SET state = ?').run(JSON.stringify(old));
  assert.equal((await c.call('/api/action', action({ type: 'buyGloves' }))).body.state.gloves, 1);
  assert.equal((await c.call('/api/action', action({ type: 'buyDecor', item: 'flag' }))).body.state.decor.flag, true);
});

test('the barn runs on the server from real rounds', async () => {
  const env = playEnv();
  let t = NOW;
  const c = await player(env, makeWallet(), () => t);
  const bought = (await c.call('/api/action', action({ type: 'buyAnimal', item: 'chicken', stock: 5, price: 0 }))).body.state;
  assert.deepEqual([bought.pips, bought.barn[0].kind, bought.barn[0].stock], [20, 'chicken', 0]);
  assert.equal((await c.call('/api/action', action({ type: 'collect', plot: 0 }))).status, 422);
  const fed = (await c.call('/api/action', action({ type: 'buyFeed', feed: 999, price: 0 }))).body.state;
  assert.deepEqual([fed.pips, fed.feed], [0, 5]);
  const r = bought.barn[0].boughtRound;
  env.events = [settled(100, r, 0), ...[1, 2, 3].map(i => settled(r + i - 1, r + i, 0))];
  t += 60000;
  const res = await c.call('/api/action', action({ type: 'collect', plot: 0, pay: 9999 }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.state.pips, 12);
  assert.equal(res.body.state.feed, 4);
  assert.equal(res.body.state.seasonScore, 0);
});

test('the server charges for water and fertilizer whatever the request says', async () => {
  const env = playEnv(), c = await player(env);
  const planted = (await c.call('/api/action', action({ type: 'plant', plot: 0, seed: 'moonmoss' }))).body.state;
  const w = (await c.call('/api/action', action({ type: 'water', plot: 0, price: 0, free: true }))).body.state;
  const reward = w.daily.items.some(x => x.id === 'water1') ? 10 : 0; // today's challenge may pay for watering
  assert.equal(w.pips, planted.pips - 5 + reward);
  const f = (await c.call('/api/action', action({ type: 'fertilize', plot: 0, price: 0 }))).body.state;
  assert.deepEqual([f.pips, f.plots[0].fertilized], [w.pips - 10, true]);
});

test('the server rolls for variants and a request cannot ask for one', async () => {
  const env = playEnv(), c = await player(env);
  env.roll = () => .99;
  const plain = (await c.call('/api/action', action({ type: 'plant', plot: 0, seed: 'moonmoss', variant: 'rainbow', roll: 0 }))).body.state;
  assert.equal(plain.plots[0].variant, undefined);
  env.roll = () => 0;
  const lucky = (await c.call('/api/action', action({ type: 'plant', plot: 1, seed: 'moonmoss', roll: .99 }))).body.state;
  assert.ok(lucky.plots[1].variant, 'the server roll decides');
});

test('with no test roll the server still rolls a real chance', async () => {
  const env = playEnv(), c = await player(env);
  const res = await c.call('/api/action', action({ type: 'plant', plot: 0, seed: 'moonmoss' }));
  assert.equal(res.status, 200);
});

test('repeating a planting cannot roll again', async () => {
  const env = playEnv(), c = await player(env);
  env.roll = () => .99;
  const a = action({ type: 'plant', plot: 0, seed: 'moonmoss' });
  await c.call('/api/action', a);
  env.roll = () => 0;
  const again = await c.call('/api/action', a);
  assert.equal(again.body.repeated, true);
  assert.equal(again.body.state.plots[0].variant, undefined);
});

test('the server sells skills at its own prices and ignores claims in the request', async () => {
  const env = playEnv(), c = await player(env);
  const res = await c.call('/api/action', action({ type: 'upgrade', item: 'farming', level: 5, price: 0, skills: { farming: 5 } }));
  assert.deepEqual([res.status, res.body.state.pips, res.body.state.skills.farming], [200, 10, 1]);
  assert.equal((await c.call('/api/action', action({ type: 'upgrade', item: 'points' }))).status, 422);
  assert.equal((await c.call('/api/action', action({ type: 'upgrade', item: 'economy' }))).status, 422);
  const claim = await c.call('/api/action', action({ type: 'buyCloche', nibbles: 999 }));
  assert.equal(claim.status, 422, 'only 10 pips left');
  assert.equal((await c.call('/api/garden')).body.state.nibbles, 0);
});

test('Squeekchain being down does not stop play', async () => {
  const env = playEnv(), c = await player(env);
  env.fetchUpstream = async () => { throw new Error('offline'); };
  assert.equal((await c.call('/api/action', action({ type: 'buyCloche' }))).status, 200);
});

test('flooding actions is refused', async () => {
  const env = playEnv(), c = await player(env);
  let last;
  for (let i = 0; i < 125; i++) last = await c.call('/api/action', action({ type: 'water', plot: 0 }));
  assert.equal(last.status, 429);
});

test('practice scores stay on their own board, within bounds', async () => {
  const env = playEnv(), c = await player(env);
  for (const score of [-1, 1.5, 'lots', 20001]) assert.equal((await c.call('/api/practice', { score })).status, 400);
  assert.equal((await c.call('/api/practice', { score: 300 })).status, 200);
  await c.call('/api/practice', { score: 100 });
  assert.equal((await c.call('/api/leaderboard?board=practice')).body.rows[0].score, 300, 'a lower score does not replace the best');
  assert.equal((await c.call('/api/leaderboard?board=live')).body.rows.length, 0);
});

test('the leaderboard is public and ranks by score', async () => {
  const env = playEnv(), a = await player(env, makeWallet(1)), b = await player(env, makeWallet(2));
  await a.call('/api/practice', { score: 10 });
  await b.call('/api/practice', { score: 20 });
  const { body } = await client(env).call('/api/leaderboard?board=practice');
  assert.deepEqual(body.rows.map(r => r.score), [20, 10]);
  assert.equal(body.mine, null);
  assert.ok(body.rows.every(r => r.me === false));
});

test('last week\'s board is separate', async () => {
  const env = playEnv(), c = await player(env);
  await c.call('/api/practice', { score: 10 });
  assert.equal((await c.call('/api/leaderboard?board=practice&back=1')).body.rows.length, 0);
});

test('bad JSON gets a clean error', async () => {
  const env = makeEnv();
  const res = await handleApi(new Request(`${ORIGIN}/api/login`, { method: 'POST', headers: { Origin: ORIGIN }, body: '{nope' }), env, NOW);
  assert.equal(res.status, 400);
});
