import { ACHIEVEMENTS, ANIMALS, CLASS_NAME, FEED_PACK, FEED_PACK_PRICE, FERTILIZER_BONUS, FERTILIZER_PRICE, WATER_PRICE, COMBO_BONUS, COMBO_WINDOW, DAILY_CHALLENGES, DECOR, LEVELS, PLOT_PRICES, QUESTS, SEEDS, SEED_KEYS, START_PLOTS,
  MAX_PENS, PEN_STOCK, addLog as logTo, blankState, classify, doAction, harvestValue, levelOf, progress, progressText, ripeWindow, rollPeriods as rollStatePeriods, seasonEndsAt, seasonId, settleRounds, syncChain } from './engine.js';
import { DEMO_ROUNDS, demoStart } from './demo.js';
import { RoundLedger, fetchHistory } from './settlement.js';
import { applyImport, exportSave, loadSave, parseImport, writeSave } from './save.js';
import { api, connectWallet } from './wallet.js';

(() => {
'use strict';

const API = 'https://api.squeekchain.com/v1';
const ROUND_S = 600, STRIP = 24;
let GENESIS = 1793022600; // replaced by /v1/core configuration.genesisTimestamp

// ---------- persistence ----------
const storage = (() => { try { return localStorage; } catch (_) { return null; } })(); // null when storage is blocked
let saveProblem = null;
function load(m) {
  if (m === 'demo') return blankState();
  const { state: s, report } = loadSave(storage, () => blankState());
  if (report.source === 'corrupt') saveProblem = 'Your old save could not be read, so a copy was kept and a new garden started.';
  return s;
}
function save() {
  if (mode === 'live' && !wallet) writeSave(storage, state);
}
const addLog = (kind, text, round) => logTo(state, kind, text, round);

// ---------- data sources ----------
async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const ledger = new RoundLedger();
const live = {
  rounds: ledger.rounds,
  get oldest() { return ledger.oldest; },
  get latest() { return ledger.latest; },
  status: null, error: null, lastFetch: 0, historyEnded: false, syncing: false, installation: null, paused: false, lastCore: 0,
  currentRound() { return Math.floor((Date.now() / 1000 - GENESIS) / ROUND_S) + 1; },
  roundEndsAt(r) { return (GENESIS + r * ROUND_S) * 1000; },
  questKey() { return Math.floor(Date.now() / 86400000); },
  async init() {
    try { await this.readCore(); } catch (e) { this.error = e; }
  },
  /** Notices a redeployed chain: its rounds start over, so the old ones must go. */
  async readCore() {
    const c = await getJSON(`${API}/core`);
    this.lastCore = Date.now();
    GENESIS = +c.configuration.genesisTimestamp || GENESIS;
    this.paused = !!(c.core && c.core.paused);
    if (this.installation && this.installation !== c.installationId) { ledger.clear(); this.historyEnded = false; }
    this.installation = c.installationId || null;
  },
  async refreshRounds(needFrom) {
    const { exhausted } = await fetchHistory({ getJSON, url: `${API}/events?limit=100&category=protocol`, ledger, needFrom });
    this.historyEnded = exhausted;
    this.lastFetch = Date.now();
  },
  async refreshStatus() {
    const d = await getJSON(`${API}/status`), m = d.measurement || {};
    const prev = this.rounds.get(this.currentRound() - 1);
    const anchor = d.builder && d.builder.anchor ? +d.builder.anchor.cumulativeWork : null;
    const base = prev && prev.cum != null ? prev.cum : anchor;
    this.status = {
      online: m.freshness === 'online',
      running: (m.speedMmPerSecond || 0) > 0 || (m.rpmMilli || 0) > 0 || (m.coreStatus && m.coreStatus !== 'IDLE'),
      rpm: (m.rpmMilli || 0) / 1000,
      liveWork: base != null ? Math.max(0, +m.cumulativeWorkUnits - base) : null,
    };
  },
};

const demo = {
  rounds: new Map(), oldest: 1, latest: 0, roundMs: 8000, start: Date.now(), at: demoStart(), status: null,
  reset() { this.rounds.clear(); this.latest = 0; this.start = Date.now(); this.at = demoStart(); },
  currentRound() { return Math.floor((Date.now() - this.start) / this.roundMs) + 1; },
  roundEndsAt(r) { return this.start + r * this.roundMs; },
  questKey() { return Math.floor(this.currentRound() / 15); },
  tick() {
    const cur = this.currentRound();
    while (this.latest < cur - 1) {
      this.rounds.set(++this.latest, { work: DEMO_ROUNDS[this.at++ % DEMO_ROUNDS.length], cum: null });
    }
    const work = DEMO_ROUNDS[this.at % DEMO_ROUNDS.length];
    const frac = 1 - (this.roundEndsAt(cur) - Date.now()) / this.roundMs;
    this.status = { online: true, running: work > 0, rpm: work === 0 ? 0 : work < 500 ? 38 : 71, liveWork: Math.round(work * frac) };
  },
};

// ---------- game actions ----------
let mode = 'live', src = live, wallet = null, state = load('live'), selected = null, armed = null;

function rollPeriods() { rollStatePeriods(state, seasonId(), src.questKey()); }
function processRounds() {
  if (src.installation) syncChain(state, src.installation, src.currentRound());
  src.syncing = settleRounds(state, src.rounds, src.latest, src.historyEnded);
}

// With a wallet connected the server decides: every action goes there in order, and its garden replaces ours.
let queue = Promise.resolve(), pending = 0;
function pushAction(a) {
  pending++;
  queue = queue.then(async () => {
    let fresh = null;
    try { fresh = (await api('/api/action', { id: crypto.randomUUID(), ...a })).state; }
    catch (e) { toast(e.message); try { fresh = (await api('/api/garden')).state; } catch (_) { /* keep what is on screen */ } }
    pending--;
    if (fresh && wallet && mode === 'live' && !pending) { state = fresh; processRounds(); render(); }
  });
}

/** Practice scores are unofficial, but a connected player still gets a place on the practice board. */
function reportPractice() {
  if (wallet && mode === 'demo') api('/api/practice', { score: state.seasonScore }).catch(() => {});
}

function act(a) {
  const res = doAction(state, a, src.currentRound());
  if (res.error) { flashHint(res.error); return false; }
  if (res.gained) floatText(a.plot, `+${res.gained}`);
  res.toasts.forEach(toast);
  if (wallet && mode === 'live') pushAction(a);
  if (a.type === 'harvest') reportPractice();
  save();
  return true;
}

function plotClick(i) {
  if (i >= state.open) return;
  const p = state.plots[i];
  if (selected === 'fertilizer') {
    if (act({ type: 'fertilize', plot: i }) && state.pips < FERTILIZER_PRICE) selected = null;
  } else if (selected === 'gloves') {
    if (act({ type: 'glove', plot: i }) && !state.gloves) selected = null;
  } else if (selected === 'water' || selected === 'cloche') {
    if (selected === 'water') { if (act({ type: 'water', plot: i })) selected = null; }
    else if (act({ type: 'cover', plot: i }) && !state.cloches) selected = null;
  } else if (!p) {
    if (!selected) { flashHint('Pick a seed packet first.'); return; }
    if (act({ type: 'plant', plot: i, seed: selected }) && state.pips < SEEDS[selected].price) selected = null;
  } else if (p.status === 'ripe') {
    act({ type: 'harvest', plot: i });
  } else if (p.status === 'wilted' || p.status === 'rotten') {
    act({ type: 'clear', plot: i });
  } else if (armed === i) {
    act({ type: 'dig', plot: i }); armed = null;
  } else { armed = i; setTimeout(() => { if (armed === i) { armed = null; render(); } }, 3000); }
  render();
}

function buyPlot() { act({ type: 'buyPlot' }); render(); }
function buyCloche() { act({ type: 'buyCloche' }); render(); }

// ---------- rendering ----------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let hintTimer = null;
const hintText = () => {
  if (selected === 'water') return `Tap a growing plant to water it for ${WATER_PRICE} pips.`;
  if (selected === 'fertilizer') return `Tap a living plant. For ${FERTILIZER_PRICE} pips it pays ${Math.round(FERTILIZER_BONUS * 100)}% more pips when picked.`;
  if (selected === 'cloche') return 'Tap a growing plant to cover it.';
  if (selected === 'gloves') return 'Tap a growing or ripe plant. Once ripe it keeps for 24 hours instead of 2.';
  if (selected) return SEEDS[selected].blurb;
  return 'Pick a packet or tool, then tap a plot.';
};
function flashHint(text) {
  const el = $('plotHint'); el.textContent = text; el.classList.add('warn');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => { el.classList.remove('warn'); el.textContent = hintText(); }, 2500);
}
let toastTimer = null;
function toast(text) {
  const el = $('toast'); el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
function floatText(i, text) {
  const host = document.querySelector(`.plot[data-i="${i}"]`);
  if (!host) return;
  const r = host.getBoundingClientRect(), f = document.createElement('span');
  f.className = 'float'; f.textContent = text;
  f.style.left = `${r.left + r.width / 2 + scrollX}px`; f.style.top = `${r.top + 30 + scrollY}px`;
  document.body.appendChild(f); setTimeout(() => f.remove(), 1100);
}

function plantArt(seed, frac, status) {
  const dead = status === 'wilted' || status === 'rotten';
  const name = dead ? 'wilted' : status === 'ripe' || frac >= .75 ? seed : frac >= .34 ? 'young' : 'sprout';
  return `<img class="spr" src="${Pixel.sprite(name)}" alt="">`;
}
const icon = (name, cls = 'ico') => `<img class="${cls}" src="${Pixel.sprite(name)}" alt="">`;
const MOOD_ICON = { nap: 'moon', jog: 'paw', zoom: 'bolt' };
const SEED_FEEDS = { moonmoss: 'Naps', trotbean: 'Jogs', zoomflower: 'Zoomies', mileoak: 'All work', comet: 'Nap, then zoomies', dreamcap: 'Naps in a row', twinvine: 'Even jogs', wheelbloom: 'Every mood' };


function renderStrip() {
  const svg = $('strip'), last = [];
  for (let r = src.latest - STRIP + 1; r <= src.latest; r++) if (r > 0) last.push([r, src.rounds.get(r)]);
  const max = Math.max(800, ...last.map(([, d]) => (d ? d.work : 0)));
  const bw = 480 / STRIP;
  svg.innerHTML = last.map(([r, d], i) => {
    const x = i * bw + 2, w = bw - 4;
    if (!d) return `<rect x="${x}" y="78" width="${w}" height="2" style="fill:var(--line)"/>`;
    if (d.work === null) return `<rect x="${x}" y="52" width="${w}" height="30" style="fill:var(--line)"><title>Round ${r}: settled in a batch, work per round unknown</title></rect>`;
    const c = classify(d.work), h = c === 'nap' ? 4 : Math.max(6, d.work / max * 78);
    const label = i % 6 === 5 ? `<text x="${x + w / 2}" y="104" text-anchor="middle" style="fill:var(--muted);font:16px var(--mono)">${r}</text>` : '';
    return `<rect x="${x}" y="${82 - h}" width="${w}" height="${h}" style="fill:var(--m-${c})"><title>Round ${r}: ${d.work} work (${CLASS_NAME[c]})</title></rect>${label}`;
  }).join('') + `<line x1="0" y1="82.5" x2="480" y2="82.5" style="stroke:var(--line)"/>`;
}

/** Tells the player when this week's scores lock. The garden itself never ends. */
function renderSeasonEnd() {
  const el = $('seasonEnd');
  if (mode !== 'live') { el.textContent = "Demo replays Squeektoshi's past rounds at 8 seconds each. It has no season end."; return; }
  const end = seasonEndsAt(seasonId()), mins = Math.max(0, Math.floor((end - Date.now()) / 60000));
  const left = mins >= 1440 ? `${Math.floor(mins / 1440)}d ${Math.floor(mins % 1440 / 60)}h` : mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  const when = new Date(end).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  el.textContent = `${live.paused ? 'Squeekchain is paused, so plants wait until rounds resume. ' : ''}This week's scores lock in ${left} (${when}). Your garden carries on after that.`;
}

function renderWheel() {
  const st = src.status, pill = $('wheelPill'), cur = src.currentRound();
  if (!st) { pill.className = 'pill'; pill.textContent = live.error && mode === 'live' ? 'Wheel data is unreachable. Try Demo.' : 'Connecting…'; }
  else if (mode === 'live' && live.error) { pill.className = 'pill'; pill.textContent = 'Wheel data paused, retrying'; }
  else if (mode === 'live' && live.paused) { pill.className = 'pill'; pill.textContent = 'Squeekchain is paused'; }
  else if (mode === 'live' && live.syncing) { pill.className = 'pill'; pill.textContent = 'Catching up on rounds'; }
  else if (!st.online) { pill.className = 'pill'; pill.textContent = 'Wheel sensor offline'; }
  else if (st.running) { pill.className = 'pill run'; pill.textContent = `Running at ${Math.round(st.rpm)} rpm`; }
  else { pill.className = 'pill nap'; pill.textContent = 'Napping'; }
  document.body.dataset.sky = st && st.running ? 'day' : 'night';
  $('rNum').textContent = `#${cur}`;
  const left = Math.max(0, (src.roundEndsAt(cur) - Date.now()) / 1000);
  $('rLeft').textContent = mode === 'demo' ? `${left.toFixed(0)}s` : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  const lw = st && st.liveWork != null ? st.liveWork : null;
  $('rWork').textContent = lw == null ? '-' : lw.toLocaleString();
  $('rClass').innerHTML = lw == null ? '-' : `<span class="chip ${classify(lw)}">${icon(MOOD_ICON[classify(lw)])}${CLASS_NAME[classify(lw)]}</span>`;
  renderSeasonEnd();
  const wl = Math.max(0, state.waterAt - state.processed);
  $('waterState').textContent = wl ? `refills in ${wl} round${wl > 1 ? 's' : ''}` : 'ready';
}

function renderDaily() {
  const items = state.daily ? state.daily.items : [];
  const c = state.combo, cur = src.currentRound();
  const live = c && cur - c.lastRound <= COMBO_WINDOW;
  const next = live ? Math.round(COMBO_BONUS[Math.min(c.count + 1, COMBO_BONUS.length - 1)] * 100) : 0;
  $('dailySummary').textContent = `Daily challenges, ${items.filter(x => x.done).length} of ${items.length} done${live && c.count >= 2 ? `, combo of ${c.count}` : ''}`;
  $('dailyList').innerHTML = items.map(x => {
    const d = DAILY_CHALLENGES.find(y => y.id === x.id);
    return `<li class="${x.done ? 'done' : ''}"><span>${esc(d.text)}</span><b>${x.done ? 'Done ✓' : `${x.progress}/${d.n}, +${d.reward} pips`}</b></li>`;
  }).join('');
  $('comboNote').textContent = live
    ? `Pick a plant other than ${SEEDS[c.lastSeed].name} by round ${c.lastRound + COMBO_WINDOW} for ${next}% extra pips.`
    : `Pick different plants within ${COMBO_WINDOW} rounds of each other for up to 15% extra pips. Points stay the same.`;
}

function renderBarn(lv) {
  const barn = state.barn || Array(MAX_PENS).fill(null);
  const feed = state.feed || 0;
  $('barnSummary').textContent = `Barn, ${barn.filter(Boolean).length} of ${MAX_PENS} pens used, ${feed} feed`;
  $('bFeed').textContent = `Buy ${FEED_PACK} feed, ${FEED_PACK_PRICE} pips (you have ${feed})`;
  $('pens').innerHTML = barn.map((a, i) => {
    if (!a) return '<li class="pen empty"><span>Empty pen</span></li>';
    const d = ANIMALS[a.kind], word = { nap: 'naps', jog: 'jogs', zoom: 'zoomies' }[d.mood];
    return `<li class="pen"><img class="spr" src="${Pixel.sprite(a.kind)}" alt=""><span><b>${d.name}</b><small>${a.stock}/${PEN_STOCK} ${d.plural}. ${a.stock >= PEN_STOCK ? 'Full.' : a.progress >= d.need ? `Hungry: needs ${d.feed} feed.` : `Next: ${a.progress}/${d.need} ${word}.`}</small></span>`
      + `<button data-collect="${i}" ${a.stock ? '' : 'disabled'}>Collect ${a.stock * d.pay} pips</button></li>`;
  }).join('');
  $('animals').innerHTML = Object.entries(ANIMALS).map(([k, d]) => {
    const locked = d.level > lv;
    return `<button class="animal${locked ? ' locked' : ''}" data-animal="${k}" title="${esc(d.blurb)}" ${locked ? 'disabled' : ''}><img class="spr" src="${Pixel.sprite(k)}" alt=""><span><b>${d.name}</b><small>${locked ? `Unlocks at level ${d.level}` : `${d.price} pips. ${esc(d.blurb)}`}</small></span></button>`;
  }).join('');
}

function render() {
  renderWheel(); renderStrip();
  const lv = levelOf(state.xp), nextXp = LEVELS[lv];
  $('sLevel').textContent = lv;
  $('xpBar').style.width = nextXp ? `${Math.round((state.xp - LEVELS[lv - 1]) / (nextXp - LEVELS[lv - 1]) * 100)}%` : '100%';
  $('xpText').textContent = nextXp ? `${state.xp} / ${nextXp} xp` : `${state.xp} xp, max level`;
  $('sPips').textContent = state.pips;

  $('plots').innerHTML = state.plots.map((p, i) => {
    if (i >= state.open) {
      const price = PLOT_PRICES[i - START_PLOTS], nextToBuy = i === state.open;
      return `<div class="plot locked">${nextToBuy ? `<button class="buyplot" data-buy="plot">Dig plot, ${price} pips</button>` : '<span class="pstat">Locked</span>'}</div>`;
    }
    if (!p) {
      const sd = SEEDS[selected];
      return `<button class="plot empty" data-i="${i}" aria-label="Plot ${i + 1}, empty${sd ? `, plant ${esc(sd.name)}` : ''}">${sd ? plantArt(selected, 1, 'ripe').replace('class="spr"', 'class="spr ghost"') : '<span></span>'}${sd ? `<span class="plate"><span class="pstat">${sd.price} pips</span></span>` : ''}</button>`;
    }
    const sd = SEEDS[p.seed], f = progress(p);
    let stat, extra = '';
    if (p.status === 'ripe') { const { value, diverse } = harvestValue(state, i); stat = `Ripe, pick for ${value}${diverse ? ' (mixed +20%)' : ''}`; extra = `<span class="pstat">rots in ${ripeWindow(p) - (state.processed - p.ripeRound)} rounds${p.gloved ? ', gloved' : ''}${p.fertilized ? ', fertilized' : ''}</span>`; }
    else if (p.status === 'wilted') stat = `Wilted, tap to compost for ${Math.ceil(sd.price / 2)}`;
    else if (p.status === 'rotten') stat = `Rotten, tap to compost for ${Math.ceil(sd.price / 2)}`;
    else { stat = progressText(p); extra = armed === i ? '<span class="pstat"><b>Tap again to dig up</b></span>' : (p.gloved || p.fertilized) ? `<span class="pstat">${[p.gloved && 'Gloved', p.fertilized && 'Fertilized'].filter(Boolean).join(', ')}</span>` : ''; }
    return `<button class="plot ${p.status}${p.cloche ? ' covered' : ''}" data-i="${i}" aria-label="Plot ${i + 1}, ${esc(sd.name)}, ${esc(stat)}">${p.cloche ? icon('dome', 'dome') : ''}${p.status === 'ripe' ? icon('sparkle', 'sparkle') : ''}${plantArt(p.seed, f, p.status)}<span class="plate"><span class="pname">${esc(sd.name)}</span><span class="pstat">${esc(stat)}</span>${p.status === 'growing' ? `<span class="gbar"><i style="width:${Math.round(f * 100)}%"></i></span>` : ''}${extra}</span></button>`;
  }).join('');
  $('plots').classList.toggle('planting', !!SEEDS[selected]);
  if (!$('plotHint').classList.contains('warn')) $('plotHint').textContent = hintText();

  $('seeds').innerHTML = SEED_KEYS.map(k => {
    const s = SEEDS[k], locked = s.level > lv;
    return `<button class="seed${locked ? ' locked' : ''}" data-seed="${k}" title="${esc(s.blurb)}" aria-pressed="${selected === k}" ${locked ? 'disabled' : ''}><span class="band band-${s.color.slice(2)}">${SEED_FEEDS[k]}</span>${plantArt(k, 1, 'ripe')}<b>${s.name}</b><small>${locked ? `Unlocks at level ${s.level}` : `${s.price} pips, pays ${s.value}`}</small></button>`;
  }).join('');
  $('tWater').setAttribute('aria-pressed', selected === 'water');
  $('tCloche').setAttribute('aria-pressed', selected === 'cloche');
  $('tCloche').querySelector('b').textContent = `Glass cloche ×${state.cloches}`;
  $('tFertilizer').setAttribute('aria-pressed', selected === 'fertilizer');
  $('tGloves').setAttribute('aria-pressed', selected === 'gloves');
  $('tGloves').querySelector('b').textContent = `Harvest gloves ×${state.gloves || 0}`;
  renderBarn(lv);
  const owned = state.decor || {};
  $('decorSummary').textContent = `Garden shop, ${Object.keys(owned).length} of ${DECOR.length} owned`;
  $('decor').innerHTML = DECOR.map(d => `<button class="decorbtn" data-decor="${d.id}" ${owned[d.id] ? 'disabled' : ''}>${esc(d.name)}<small>${owned[d.id] ? 'In your garden' : `${d.price} pips`}</small></button>`).join('');

  const q = state.quest, qd = q && QUESTS.find(x => x.id === q.id);
  $('quest').innerHTML = qd ? `<b>${esc(qd.text)}</b><span>${q.done ? 'Done ✓' : `${q.progress}/${qd.n}, +${qd.reward} pips`}</span>` : '';
  $('quest').classList.toggle('done', !!(q && q.done));
  renderDaily();

  $('sSeason').textContent = state.seasonScore.toLocaleString();
  $('sBest').textContent = Math.max(state.best, state.seasonScore).toLocaleString();
  $('sHarvests').textContent = state.harvests;
  $('seasonNote').textContent = mode === 'demo' ? 'Demo progress is not saved. Quests change every 15 demo rounds.'
    : wallet ? 'This garden is kept by the server, so its score counts on the Live board. Weeks reset Monday 00:00 UTC.'
    : 'Weeks reset Monday 00:00 UTC, quests daily. Saved in this browser. Connect a wallet to join the leaderboard.';
  $('bWallet').textContent = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}, disconnect` : 'Connect wallet';
  $('bExport').hidden = $('bImport').hidden = !!wallet;
  $('herb').innerHTML = SEED_KEYS.map(k => `<li class="${state.herb[k] ? '' : 'missing'}" title="${SEEDS[k].name}">${plantArt(k, 1, 'ripe')}<span>${state.herb[k] || 0}</span></li>`).join('');
  $('ach').innerHTML = Object.entries(ACHIEVEMENTS).map(([id, [name, how]]) => `<li class="${state.ach[id] ? 'got' : ''}" title="${esc(how)}"><b>${esc(name)}</b><small>${esc(how)}</small></li>`).join('');
  $('log').innerHTML = state.log.slice(0, 40).map(e => `<li class="${e.kind}"><time>${e.round ? 'R' + e.round : ''}</time><span>${esc(e.text)}</span></li>`).join('');
}

// ---------- scene: 160x48 pixels; the wheel spins at the hamster's real rpm ----------
const scene = $('scene'), sctx = scene.getContext('2d');
const SH = 56, GROUND = 48, PC = Pixel.C;
let SW = 160, WX = 138, STARS = [];
function sizeScene() {
  const w = document.documentElement.clientWidth, px = w < 1700 ? 3 : 4;
  SW = Math.ceil(w / px);
  WX = Math.min(SW - 18, Math.floor((w + 1180) / 2 / px) - 20); // the wheel lines up with the page's right edge
  STARS = Array.from({ length: Math.ceil(SW / 5) }, (_, i) => [(i * 53 + 7) % SW, (i * 29) % 36]);
  scene.width = SW; scene.height = SH;
  scene.style.width = `${SW * px}px`; scene.style.height = `${SH * px}px`;
}
sizeScene();
addEventListener('resize', sizeScene);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let angle = 0, lastT = performance.now(), stepT = 0, runFrame = 0;
const hamCache = new Map();
const ham = (kind, f) => { const k = kind + f; if (!hamCache.has(k)) hamCache.set(k, Pixel.hamsterGrid(kind, f)); return hamCache.get(k); };
function dot(x, y, c) { sctx.fillStyle = c; sctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
function band(y, h, c) { sctx.fillStyle = c; sctx.fillRect(0, y, SW, h); }
function blit(P, ox, oy) { for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) { const v = P.g[y][x]; if (v) dot(ox + x, oy + y, v); } }
function sline(x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) { dot(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
function sdisc(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + .3) dot(cx + x, cy + y, c); }
function cloud(x, y) { sctx.fillStyle = PC.white; sctx.fillRect(x, y, 10, 2); sctx.fillRect(x + 2, y - 1, 5, 1); sctx.fillStyle = '#d4f1ff'; sctx.fillRect(x, y + 2, 10, 1); }

/** Bought decorations stand at the left of the garden, away from the plants and the wheel. */
function drawDecor(day) {
  const d = state.decor || {}, G = GROUND, box = (x, y, w, h, c) => { sctx.fillStyle = c; sctx.fillRect(x, y, w, h); };
  if (d.fence) for (let x = 2; x < Math.min(44, WX - 90); x += 4) { box(x, G - 5, 1, 5, PC.cream); box(x + 1, G - 4, 3, 1, PC.cream); }
  if (d.flag) { box(6, G - 14, 1, 14, PC.woodDark); box(7, G - 14, 5, 3, PC.red); }
  if (d.lantern) { box(16, G - 10, 1, 10, PC.woodDark); box(15, G - 12, 3, 3, day ? PC.gold : PC.yellow); }
  if (d.gnome) { box(23, G - 3, 3, 3, PC.blue); box(23, G - 4, 3, 1, PC.furLight); box(23, G - 5, 3, 1, PC.red); box(24, G - 7, 1, 2, PC.red); }
  if (d.scarecrow) { box(31, G - 10, 1, 10, PC.woodDark); box(28, G - 8, 7, 1, PC.wood); box(30, G - 12, 3, 3, PC.yellow); box(29, G - 13, 5, 1, PC.woodDark); }
  if (d.pond) { box(38, G + 2, 9, 2, day ? '#6ec3ef' : '#28366b'); box(39, G + 4, 7, 1, day ? '#6ec3ef' : '#28366b'); }
}

function drawScene(t) {
  const dt = Math.min(.1, (t - lastT) / 1000); lastT = t;
  const st = src.status, running = !!(st && st.running), rpm = st ? st.rpm : 0, still = reduceMotion.matches;
  if (!still) angle += (rpm / 60) * Math.PI * 2 * dt;
  stepT += dt; if (running && stepT > Math.max(.07, 4 / Math.max(rpm, 1))) { stepT = 0; runFrame ^= 1; }

  // sky: day while he runs, night while he naps (stepped bands, no smooth gradients)
  if (running) {
    band(0, 18, '#6ec3ef'); band(18, 9, '#8fd3f4'); band(27, 9, '#b4e3f8'); band(36, 12, '#d4f1ff');
    sdisc(WX - 30, 14, 5, PC.yellow); dot(WX - 32, 12, PC.white); dot(WX - 31, 12, PC.white);
    for (let a = 0; a < 8; a++) { const r = a * Math.PI / 4 + (still ? 0 : t / 5000); dot(WX - 30 + Math.cos(r) * 8, 14 + Math.sin(r) * 8, PC.gold); }
    const drift = still ? 0 : (t / 400) % (SW + 20);
    cloud(((50 + drift) % (SW + 20)) - 20, 11); cloud(((100 + drift * .7) % (SW + 20)) - 20, 19);
  } else {
    band(0, 20, '#141a3a'); band(20, 10, '#1d2752'); band(30, 18, '#28366b');
    for (const [x, y] of STARS) if (still || Math.sin(t / 500 + x * 1.7) > -.5) dot(x, y, x % 3 ? '#9cc3ff' : PC.white);
    sdisc(WX - 30, 14, 5, PC.moon); sdisc(WX - 28, 12, 4, '#141a3a');
  }
  // two layers of hills
  for (let x = 0; x < SW; x++) {
    const far = 35 + Math.round(Math.sin(x / 19 + 2) * 3);
    const near = 40 + Math.round(Math.sin(x / 12) * 2.5 + Math.sin(x / 5.3 + 1) * 1);
    sctx.fillStyle = running ? '#7cc576' : '#2e4f5e'; sctx.fillRect(x, far, 1, GROUND - far);
    sctx.fillStyle = running ? '#4da55a' : '#24414c'; sctx.fillRect(x, near, 1, GROUND - near);
    if (running && x % 9 === 3) dot(x, near, '#8fdc5e');
  }
  // grass lip and tilled soil
  band(GROUND - 1, 2, running ? PC.leaf : '#2f6b45');
  for (let x = 0; x < SW; x += 3) dot(x, GROUND - 2, running ? PC.leafLight : '#3f8a5a');
  band(GROUND + 1, SH - GROUND - 1, running ? PC.soil : '#4a2f26');
  band(SH - 3, 3, running ? '#6b4130' : '#2e1e1f'); // the same earth the page continues in
  for (let y = GROUND + 2; y < SH - 2; y++) for (let x = (y % 2) * 2; x < SW; x += 4) dot(x, y, running ? PC.soilDark : '#33201b');

  drawDecor(running);
  (state.barn || []).forEach((a, i) => { if (a && WX > 120) blit(Pixel.spriteGrid(a.kind), 48 + i * 17, GROUND - 14); });

  // the player's plots as a row of plants
  const n = state.open, step = Math.min(14, (WX - 24) / n), x0 = WX - 24 - n * step;
  state.plots.slice(0, n).forEach((p, i) => {
    if (!p) return;
    const dead = p.status === 'wilted' || p.status === 'rotten', f = progress(p);
    const name = dead ? 'wilted' : p.status === 'ripe' || f >= .75 ? p.seed : f >= .34 ? 'young' : 'sprout';
    blit(Pixel.spriteGrid(name), x0 + i * step, GROUND - 14);
    if (p.status === 'ripe' && !still && Math.floor(t / 300 + i) % 2) dot(x0 + i * step + 13, GROUND - 13, PC.yellow);
  });

  // wheel on its stand
  const cx = WX, cy = GROUND - 18, R = 15;
  sline(cx, cy, cx - 8, GROUND, PC.woodDark); sline(cx + 1, cy, cx - 7, GROUND, PC.wood);
  sline(cx, cy, cx + 8, GROUND, PC.woodDark); sline(cx - 1, cy, cx + 7, GROUND, PC.wood);
  for (let a = 0; a < 360; a += 2) {
    const r = a * Math.PI / 180;
    dot(cx + Math.cos(r) * (R + 1), cy + Math.sin(r) * (R + 1), PC.ink);
    dot(cx + Math.cos(r) * R, cy + Math.sin(r) * R, PC.steel);
    dot(cx + Math.cos(r) * (R - 1), cy + Math.sin(r) * (R - 1), PC.steelDark);
  }
  for (let i = 0; i < 10; i++) { const r = angle + i * Math.PI / 5; sline(cx + Math.cos(r) * 3, cy + Math.sin(r) * 3, cx + Math.cos(r) * (R - 2), cy + Math.sin(r) * (R - 2), PC.steelDark); }
  sdisc(cx, cy, 2, PC.steel); dot(cx, cy, PC.ink);
  // hamster, bobbing while running
  blit(ham(running ? 'run' : 'sleep', runFrame), cx - 6, cy + R - 11 - (running && runFrame ? 1 : 0));
  if (!running) {
    const z = still ? 0 : Math.floor(t / 400) % 3;
    const zz = (x, y) => { sctx.fillStyle = PC.white; sctx.fillRect(x, y, 3, 1); dot(x + 1, y + 1, PC.white); sctx.fillRect(x, y + 2, 3, 1); };
    zz(cx + 7, cy - 1 - z); zz(cx + 11, cy - 6 - z);
  }
  requestAnimationFrame(drawScene);
}

// ---------- wiring ----------
$('plots').addEventListener('click', e => {
  if (e.target.closest('[data-buy="plot"]')) { buyPlot(); return; }
  const b = e.target.closest('.plot[data-i]'); if (b) plotClick(+b.dataset.i);
});
$('seeds').addEventListener('click', e => { const b = e.target.closest('.seed'); if (!b || b.disabled) return; selected = selected === b.dataset.seed ? null : b.dataset.seed; render(); });
$('tWater').onclick = () => { selected = selected === 'water' ? null : 'water'; render(); };
function applyIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => { el.src = Pixel.sprite(el.dataset.icon); });
  $('fav').href = Pixel.sprite('moonmoss');
}
$('tCloche').onclick = () => { if (!state.cloches) { flashHint('Buy a cloche first.'); return; } selected = selected === 'cloche' ? null : 'cloche'; render(); };
$('bCloche').onclick = buyCloche;
$('tGloves').onclick = () => { if (!state.gloves) { flashHint('Buy gloves first.'); return; } selected = selected === 'gloves' ? null : 'gloves'; render(); };
$('tFertilizer').onclick = () => { selected = selected === 'fertilizer' ? null : 'fertilizer'; render(); };
$('bFeed').onclick = () => { act({ type: 'buyFeed' }); render(); };
$('bGloves').onclick = () => { act({ type: 'buyGloves' }); render(); };
$('pens').addEventListener('click', e => { const b = e.target.closest('[data-collect]'); if (b && !b.disabled) { act({ type: 'collect', plot: +b.dataset.collect }); render(); } });
$('animals').addEventListener('click', e => { const b = e.target.closest('[data-animal]'); if (b && !b.disabled) { act({ type: 'buyAnimal', item: b.dataset.animal }); render(); } });
$('decor').addEventListener('click', e => { const b = e.target.closest('[data-decor]'); if (b && !b.disabled) { act({ type: 'buyDecor', item: b.dataset.decor }); render(); } });

function setMode(m) {
  mode = m; src = m === 'live' ? live : demo; selected = null; armed = null;
  if (m === 'demo') { demo.reset(); demo.tick(); }
  state = load(m);
  if (m === 'live' && wallet) api('/api/garden').then(d => { if (mode === 'live' && wallet) { state = d.state; rollPeriods(); processRounds(); render(); } }).catch(e => toast(e.message));
  $('mLive').setAttribute('aria-pressed', m === 'live'); $('mDemo').setAttribute('aria-pressed', m === 'demo');
  if (m === 'demo') { state.processed = 0; state.pips = 200; addLog('', "Demo garden: Squeektoshi's past rounds replay at 8 seconds each, and you start with 200 pips.", 1); rollPeriods(); }
  else syncLive();
  render();
}
/** Switches to the server's garden for this wallet. The browser's own garden stays saved for when you disconnect. */
async function enterWallet(address) {
  const d = await api('/api/garden');
  wallet = address;
  selected = null; armed = null;
  if (mode !== 'live') { mode = 'live'; src = live; $('mLive').setAttribute('aria-pressed', true); $('mDemo').setAttribute('aria-pressed', false); }
  state = d.state;
  rollPeriods(); processRounds(); render();
}
$('bWallet').onclick = async () => {
  try {
    if (wallet) {
      await api('/api/logout', {});
      wallet = null; selected = null; armed = null;
      if (mode === 'live') state = load('live');
      syncLive(true);
      render();
      toast('Disconnected. This is the garden saved in your browser.');
      return;
    }
    await enterWallet(await connectWallet());
    toast('Connected. This is your verified garden. Your browser garden stays saved.');
  } catch (e) { toast(e.message); }
};
$('bExport').onclick = () => {
  const url = URL.createObjectURL(new Blob([exportSave(state)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `squeek-garden-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('bImport').onclick = () => $('fImport').click();
$('fImport').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const next = parseImport(await file.text());
    if (!storage) throw new Error('This browser is blocking saved data.');
    applyImport(storage, next);
    if (mode !== 'live') setMode('live');
    state = next; selected = null; armed = null;
    rollPeriods(); processRounds(); save(); render();
    toast('Save imported. Your previous garden was kept as a backup.');
  } catch (err) { toast(err.message); }
};
$('mLive').onclick = () => setMode('live');
$('mDemo').onclick = () => setMode('demo');

async function syncLive(force) {
  try {
    if (Date.now() - live.lastCore > 60000) await live.readCore();
    if (live.installation) syncChain(state, live.installation, live.currentRound());
    const need = state.processed === null ? live.currentRound() - 2 : state.processed + 1;
    if (force || live.latest < live.currentRound() - 1 || ledger.firstGap(need) !== null) {
      if (Date.now() - live.lastFetch > 20000 || force) await live.refreshRounds(need);
    }
    await live.refreshStatus();
    live.error = null;
  } catch (e) { live.error = e; }
  if (mode === 'live') { rollPeriods(); processRounds(); save(); render(); }
}

(async () => {
  await live.init();
  await syncLive(true);
  setInterval(() => { if (mode === 'live') syncLive(); }, 15000);
  setInterval(() => {
    if (mode === 'demo') { const before = demo.latest; demo.tick(); if (demo.latest !== before) { rollPeriods(); processRounds(); } render(); }
    else renderWheel();
  }, 1000);
})();
// The session check does not wait for Squeekchain: a returning player should see their own garden straight away.
api('/api/me').then(me => (me.address ? enterWallet(me.address) : null)).catch(() => { /* no server: the garden still works in this browser */ });
rollPeriods();
applyIcons();
render();
if (saveProblem) toast(saveProblem);
requestAnimationFrame(drawScene);
})();
