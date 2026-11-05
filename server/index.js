// Squeek Garden game server. The garden of a connected wallet lives here: the browser only sends
// what the player did, and the score comes from replaying that against real settled rounds.
import { blankState, doAction, rollPeriods, seasonId, settleRounds, syncChain } from '../public/engine.js';
import { RoundLedger, fetchHistory } from '../public/settlement.js';
import { checkMessage, checksumAddress, isAddress, parseMessage } from './siwe.js';

const API = 'https://api.squeekchain.com/v1';
const FALLBACK_GENESIS = 1793022600, ROUND_S = 600;
const SESSION_S = 14 * 86400, NONCE_S = 600, SYNC_MS = 20000;
const MAX_PRACTICE = 20000, BOARD_SIZE = 100;
const COOKIE = 'sg_session';

class Refused extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});

const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async text => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));

async function limit(env, key, max, windowS, now) {
  const window = Math.floor(now / 1000 / windowS);
  const row = await env.DB.prepare(`INSERT INTO rate_limits (key, window, count) VALUES (?1, ?2, 1)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window = ?2 THEN count + 1 ELSE 1 END, window = ?2 RETURNING count`).bind(key, window).first();
  if (row.count > max) throw new Refused(429, 'Too many requests. Wait a moment and try again.');
}

// ---------- sessions ----------
function cookieToken(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{64})`).exec(req.headers.get('Cookie') || '');
  return m ? m[1] : null;
}
async function sessionAddress(req, env, now) {
  const token = cookieToken(req);
  if (!token) return null;
  const row = await env.DB.prepare('SELECT address, expires_at FROM sessions WHERE token_hash = ?').bind(await sha256(token)).first();
  return row && row.expires_at > now ? row.address : null;
}
async function requireAddress(req, env, now) {
  const address = await sessionAddress(req, env, now);
  if (!address) throw new Refused(401, 'Connect your wallet first.');
  return address;
}

async function nonceRoute(req, env, url, now) {
  await limit(env, `nonce:${req.headers.get('CF-Connecting-IP') || 'local'}`, 30, 60, now);
  const address = url.searchParams.get('address');
  if (!isAddress(address)) throw new Refused(400, 'That is not a wallet address.');
  const nonce = randomHex(16);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM nonces WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO nonces (nonce, expires_at) VALUES (?, ?)').bind(nonce, now + NONCE_S * 1000),
  ]);
  return json({ nonce, address: checksumAddress(address) });
}

async function loginRoute(req, env, url, now) {
  await limit(env, `login:${req.headers.get('CF-Connecting-IP') || 'local'}`, 30, 60, now);
  const { message, signature } = await req.json();
  const fields = parseMessage(message);
  if (!fields) throw new Refused(400, 'That is not a sign-in message.');
  const bad = checkMessage(fields, signature, message, { host: url.host, origin: url.origin, now });
  if (bad) throw new Refused(401, bad);
  // Deleting the nonce is the check: a second use of the same message finds nothing to delete.
  const used = await env.DB.prepare('DELETE FROM nonces WHERE nonce = ? AND expires_at > ? RETURNING nonce').bind(fields.nonce, now).first();
  if (!used) throw new Refused(401, 'This sign-in was already used or has expired. Try again.');
  const address = checksumAddress(fields.address), token = randomHex(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT OR IGNORE INTO users (address, created_at) VALUES (?, ?)').bind(address, now),
    env.DB.prepare('INSERT INTO sessions (token_hash, address, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), address, now + SESSION_S * 1000),
  ]);
  const secure = url.protocol === 'https:' ? ' Secure;' : '';
  return json({ address }, 200, { 'Set-Cookie': `${COOKIE}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${SESSION_S}` });
}

async function logoutRoute(req, env) {
  const token = cookieToken(req);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  const secure = new URL(req.url).protocol === 'https:' ? ' Secure;' : '';
  return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0` });
}

// ---------- rounds ----------
async function metaGet(env, key) {
  const row = await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}
const metaSet = (env, key, value) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2').bind(key, String(value));

async function getJSON(url, fetcher) {
  const res = await fetcher(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Copies newly settled rounds from Squeekchain, at most once per SYNC_MS unless forced. */
async function syncRounds(env, now, force = false) {
  const fetcher = env.fetchUpstream || fetch;
  const last = +(await metaGet(env, 'last_sync')) || 0;
  if (!force && now - last < SYNC_MS) return;
  // A redeployed chain counts rounds from the start, so rounds on record belong to the old one.
  const core = await getJSON(`${API}/core`, fetcher);
  const installation = core.installationId || null;
  const moved = !!installation && installation !== (await metaGet(env, 'installation'));
  if (moved) await env.DB.prepare('DELETE FROM settlement_rounds').run();
  const top = await env.DB.prepare('SELECT MAX(round) AS latest FROM settlement_rounds').first();
  const have = top && top.latest ? top.latest : 0;
  const ledger = new RoundLedger();
  await fetchHistory({ getJSON: u => getJSON(u, fetcher), url: `${API}/events?limit=100&category=protocol`, ledger, needFrom: have ? have + 1 : Infinity, maxPages: 40 });
  const insert = (round, work, verified, batch) => env.DB.prepare('INSERT OR IGNORE INTO settlement_rounds (round, work, verified, batch) VALUES (?, ?, ?, ?)').bind(round, work, verified, batch);
  const writes = [metaSet(env, 'last_sync', now)];
  for (const [round, d] of ledger.rounds) {
    if (round > have) writes.push(insert(round, d.work, d.verified ? 1 : 0, d.batch ? JSON.stringify(d.batch) : null));
  }
  // After a very long outage the pages may run out above our last round: those rounds count as unknown.
  if (have) for (let r = have + 1; r < ledger.oldest && r <= ledger.latest; r++) writes.push(insert(r, null, 0, null));
  if (+core.configuration.genesisTimestamp) writes.push(metaSet(env, 'genesis', core.configuration.genesisTimestamp));
  if (installation) writes.push(metaSet(env, 'installation', installation));
  await env.DB.batch(writes);
}

async function currentRound(env, now) {
  const genesis = +(await metaGet(env, 'genesis')) || FALLBACK_GENESIS;
  return Math.floor((now / 1000 - genesis) / ROUND_S) + 1;
}

/** Brings a garden up to date with the calendar and with every round on record. */
async function settle(env, S, now) {
  rollPeriods(S, seasonId(now), Math.floor(now / 86400000));
  syncChain(S, await metaGet(env, 'installation'), await currentRound(env, now));
  const top = await env.DB.prepare('SELECT MAX(round) AS latest FROM settlement_rounds').first();
  const latest = top && top.latest ? top.latest : 0;
  const rows = S.processed === null ? { results: [] }
    : await env.DB.prepare('SELECT round, work, batch FROM settlement_rounds WHERE round > ? ORDER BY round').bind(S.processed).all();
  const rounds = new Map(rows.results.map(r => [r.round, { work: r.work, batch: r.batch ? JSON.parse(r.batch) : undefined }]));
  settleRounds(S, rounds, latest);
}

// ---------- gardens ----------
async function loadGarden(env, address, now) {
  const row = await env.DB.prepare('SELECT state, rev FROM gardens WHERE address = ?').bind(address).first();
  return row ? { state: JSON.parse(row.state), rev: row.rev } : { state: blankState(seasonId(now)), rev: 0 };
}

/** Writes only if nobody saved since we read rev; zero changes means the caller must start over. */
function saveGarden(env, address, S, rev, now) {
  const raw = JSON.stringify(S);
  return rev === 0
    ? env.DB.prepare('INSERT INTO gardens (address, state, rev, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(address) DO NOTHING').bind(address, raw, now)
    : env.DB.prepare('UPDATE gardens SET state = ?, rev = rev + 1, updated_at = ? WHERE address = ? AND rev = ?').bind(raw, now, address, rev);
}

const scoreStatement = (env, board, season, address, score, harvests, now) => env.DB.prepare(`INSERT INTO weekly_scores (board, season, address, score, harvests, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT(board, season, address) DO UPDATE SET score = ?4, harvests = ?5, updated_at = ?6 WHERE excluded.score > weekly_scores.score`).bind(board, season, address, score, harvests, now);

async function gardenRoute(req, env, now) {
  const address = await requireAddress(req, env, now);
  await syncRounds(env, now).catch(() => {}); // old rounds are still good if Squeekchain is down
  for (let attempt = 0; attempt < 4; attempt++) {
    const { state, rev } = await loadGarden(env, address, now);
    await settle(env, state, now);
    const res = await saveGarden(env, address, state, rev, now).run();
    if (res.meta.changes) return json({ state });
  }
  throw new Refused(409, 'Your garden is busy. Try again.');
}

async function actionRoute(req, env, now) {
  const address = await requireAddress(req, env, now);
  await limit(env, `action:${address}`, 120, 60, now);
  const body = await req.json();
  if (typeof body.id !== 'string' || !/^[\w-]{8,64}$/.test(body.id)) throw new Refused(400, 'That action has no valid id.');
  const action = { type: body.type, plot: body.plot, seed: body.seed, item: body.item };
  const seen = await env.DB.prepare('SELECT 1 AS yes FROM game_actions WHERE address = ? AND id = ?').bind(address, body.id).first();
  if (seen) return json({ state: (await loadGarden(env, address, now)).state, repeated: true });

  await syncRounds(env, now).catch(() => {});
  let forced = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { state, rev } = await loadGarden(env, address, now);
    await settle(env, state, now);
    const round = await currentRound(env, now);
    const res = doAction(state, action, round);
    if (res.error) {
      // The browser may have seen a round before this server did.
      if (!forced) { forced = true; await syncRounds(env, now, true).catch(() => {}); continue; }
      throw new Refused(422, res.error);
    }
    const garden = await saveGarden(env, address, state, rev, now).run();
    if (!garden.meta.changes) continue; // someone else moved the garden on: start again from their copy
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO game_actions (address, id, action, round, at) VALUES (?, ?, ?, ?, ?)').bind(address, body.id, JSON.stringify(action), round, now),
      ...(action.type === 'harvest' ? [scoreStatement(env, 'live', state.season, address, state.seasonScore, state.harvests, now)] : []),
    ]);
    return json({ state });
  }
  throw new Refused(409, 'Your garden is busy. Try again.');
}

async function practiceRoute(req, env, now) {
  const address = await requireAddress(req, env, now);
  await limit(env, `practice:${address}`, 30, 60, now);
  const { score } = await req.json();
  if (!Number.isInteger(score) || score < 0 || score > MAX_PRACTICE) throw new Refused(400, 'That is not a practice score.');
  await scoreStatement(env, 'practice', seasonId(now), address, score, 0, now).run();
  return json({ ok: true });
}

async function leaderboardRoute(req, env, url, now) {
  const board = url.searchParams.get('board') === 'practice' ? 'practice' : 'live';
  const season = seasonId(now) - (url.searchParams.get('back') === '1' ? 1 : 0);
  const me = await sessionAddress(req, env, now);
  const { results } = await env.DB.prepare('SELECT address, score, harvests FROM weekly_scores WHERE board = ? AND season = ? ORDER BY score DESC, updated_at ASC LIMIT ?').bind(board, season, BOARD_SIZE).all();
  let mine = null;
  if (me) {
    const row = await env.DB.prepare('SELECT score, updated_at FROM weekly_scores WHERE board = ? AND season = ? AND address = ?').bind(board, season, me).first();
    if (row) {
      const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM weekly_scores WHERE board = ? AND season = ? AND (score > ? OR (score = ? AND updated_at < ?))').bind(board, season, row.score, row.score, row.updated_at).first();
      mine = { rank: above.n + 1, score: row.score };
    }
  }
  return json({ board, season, rows: results.map((r, i) => ({ rank: i + 1, address: r.address, score: r.score, harvests: r.harvests, me: r.address === me })), mine });
}

// ---------- routing ----------
export async function handleApi(req, env, now = Date.now()) {
  const url = new URL(req.url);
  try {
    if (req.method === 'POST') {
      // Browsers always send Origin on POST, so a request from another site is refused here.
      if (req.headers.get('Origin') !== url.origin) throw new Refused(403, 'That request came from another site.');
      switch (url.pathname) {
        case '/api/login': return await loginRoute(req, env, url, now);
        case '/api/logout': return await logoutRoute(req, env);
        case '/api/action': return await actionRoute(req, env, now);
        case '/api/practice': return await practiceRoute(req, env, now);
      }
    } else if (req.method === 'GET') {
      switch (url.pathname) {
        case '/api/me': return json({ address: await sessionAddress(req, env, now) });
        case '/api/nonce': return await nonceRoute(req, env, url, now);
        case '/api/garden': return await gardenRoute(req, env, now);
        case '/api/leaderboard': return await leaderboardRoute(req, env, url, now);
      }
    }
    return json({ error: 'Not found.' }, 404);
  } catch (e) {
    if (e instanceof Refused) return json({ error: e.message }, e.status);
    if (e instanceof SyntaxError) return json({ error: 'That request is not valid JSON.' }, 400);
    console.error(e);
    return json({ error: 'Something went wrong on the game server.' }, 500);
  }
}

export default {
  async fetch(req, env) {
    return new URL(req.url).pathname.startsWith('/api/') ? handleApi(req, env) : env.ASSETS.fetch(req);
  },
};
