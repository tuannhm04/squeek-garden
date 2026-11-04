(() => {
'use strict';

const API = 'https://api.squeekchain.com/v1';
const ROUND_S = 600, RIPE_WINDOW = 12, MAX_PLOTS = 9, START_PLOTS = 6, MAX_PAGES = 8, STRIP = 24;
const OAK_WORK = 3000, WATER_COOLDOWN = 6, CLOCHE_PRICE = 25, PLOT_PRICES = [80, 150, 250];
const LEVELS = [0, 150, 400, 800, 1500, 2500];
let GENESIS = 1793022600; // replaced by /v1/core configuration.genesisTimestamp

const classify = w => (w === 0 ? 'nap' : w < 500 ? 'jog' : 'zoom');
const CLASS_NAME = { nap: 'Nap', jog: 'Jog', zoom: 'Zoomies' };

const SEEDS = {
  moonmoss:   { name: 'Moonmoss',          color: '--nap',  value: 30,  price: 10, level: 1, blurb: 'Grows one step every nap round. Ripe after 4. Two zoomies rounds in a row shrivel it.' },
  trotbean:   { name: 'Trotbean',          color: '--jog',  value: 35,  price: 10, level: 1, blurb: 'Grows on jog rounds (1–499 work). Ripe after 3. Three naps in a row and it wilts.' },
  zoomflower: { name: 'Zoomflower',        color: '--zoom', value: 70,  price: 20, level: 1, blurb: 'Blooms on the first zoomies round (500+). Wilts if none comes within 9 rounds.' },
  mileoak:    { name: 'Mile Oak',          color: '--leaf', value: 100, price: 30, level: 1, blurb: 'Banks every unit of work. Ripe at 3,000 total. Never wilts, just slow.' },
  comet:      { name: 'Comet Pepper',      color: '--zoom', value: 95,  price: 25, level: 2, blurb: 'Needs a nap round followed straight away by zoomies. Wilts after 12 rounds.' },
  dreamcap:   { name: 'Dreamcap',          color: '--nap',  value: 85,  price: 30, level: 3, blurb: 'Needs 3 naps in a row. Any run resets the count. Wilts after 15 rounds.' },
  twinvine:   { name: 'Twinvine',          color: '--jog',  value: 90,  price: 35, level: 4, blurb: 'Needs two jog rounds in a row within 100 work of each other. Wilts after 12 rounds.' },
  wheelbloom: { name: 'Golden Wheelbloom', color: '--gold', value: 160, price: 60, level: 5, blurb: 'Must see every mood twice: 2 naps, 2 jogs, 2 zoomies. Never wilts.' },
};
const SEED_KEYS = Object.keys(SEEDS);

const ACHIEVEMENTS = {
  first:     ['First harvest', 'Pick your first plant.'],
  mixed:     ['Mixed bed', 'Pick a plant with the +20% mixed-bed bonus.'],
  night:     ['Night gardener', 'Pick 5 Moonmoss.'],
  comet:     ['Comet catcher', 'Pick a Comet Pepper.'],
  bloom:     ['Golden hour', 'Pick a Golden Wheelbloom.'],
  herbarium: ['Full herbarium', 'Pick every species at least once.'],
  fullbed:   ['Full bed', 'Unlock all 9 plots.'],
  week500:   ['Green thumb', 'Score 500 in one week.'],
};

const QUESTS = [
  { id: 'trot2',  text: 'Pick 2 Trotbeans',                      n: 2, reward: 40, test: h => h.seed === 'trotbean' },
  { id: 'zoom1',  text: 'Pick a Zoomflower',                     n: 1, reward: 40, test: h => h.seed === 'zoomflower' },
  { id: 'moon2',  text: 'Pick 2 Moonmoss',                       n: 2, reward: 40, test: h => h.seed === 'moonmoss' },
  { id: 'mixed2', text: 'Pick 2 plants with the mixed-bed bonus', n: 2, reward: 50, test: h => h.diverse },
  { id: 'any4',   text: 'Pick any 4 plants',                     n: 4, reward: 50, test: () => true },
  { id: 'oak1',   text: 'Pick a Mile Oak',                       n: 1, reward: 70, test: h => h.seed === 'mileoak' },
];

// ---------- plant rules (pure) ----------
const newPlant = (seed, round) => ({ seed, plantedRound: round, status: 'growing', growth: 0, age: 0, work: 0,
  zoomRun: 0, napRun: 0, lastClass: null, lastWork: 0, seen: { nap: 0, jog: 0, zoom: 0 }, cloche: false, ripeRound: null });

function ripen(p, r) { p.status = 'ripe'; p.ripeRound = r; return ['good', `${SEEDS[p.seed].name} is ripe. Pick it within ${RIPE_WINDOW} rounds.`]; }
function wilt(p, why) {
  if (p.cloche) {
    p.cloche = false; p.zoomRun = 0; p.napRun = 0; p.age = 0;
    return ['good', `The cloche saved ${SEEDS[p.seed].name}. (${why})`];
  }
  p.status = 'wilted'; return ['bad', why];
}

/** Apply one settled round to a plant. Returns a diary entry [kind, text] or null. */
function applyRound(p, r, work) {
  if (!p || r <= p.plantedRound) return null;
  if (p.status === 'ripe') {
    if (r - p.ripeRound >= RIPE_WINDOW) { p.status = 'rotten'; return ['bad', `${SEEDS[p.seed].name} rotted before it was picked.`]; }
    return null;
  }
  if (p.status !== 'growing') return null;
  const c = classify(work), last = p.lastClass, lastWork = p.lastWork;
  p.age++; p.lastClass = c; p.lastWork = work; p.seen[c]++;
  switch (p.seed) {
    case 'moonmoss':
      if (c === 'nap') p.growth++;
      p.zoomRun = c === 'zoom' ? p.zoomRun + 1 : 0;
      if (p.zoomRun >= 2) return wilt(p, 'Moonmoss shrivelled after two zoomies rounds.');
      if (p.growth >= 4) return ripen(p, r);
      break;
    case 'trotbean':
      if (c === 'jog') p.growth++;
      p.napRun = c === 'nap' ? p.napRun + 1 : 0;
      if (p.napRun >= 3) return wilt(p, 'Trotbean wilted after three naps in a row.');
      if (p.growth >= 3) return ripen(p, r);
      break;
    case 'zoomflower':
      if (c === 'zoom') return ripen(p, r);
      if (p.age >= 9) return wilt(p, 'Zoomflower gave up waiting for zoomies.');
      break;
    case 'mileoak':
      p.work += work;
      if (p.work >= OAK_WORK) return ripen(p, r);
      break;
    case 'comet':
      if (last === 'nap' && c === 'zoom') return ripen(p, r);
      if (p.age >= 12) return wilt(p, 'Comet Pepper never saw a nap turn into zoomies.');
      break;
    case 'dreamcap':
      p.napRun = c === 'nap' ? p.napRun + 1 : 0;
      if (p.napRun >= 3) return ripen(p, r);
      if (p.age >= 15) return wilt(p, 'Dreamcap never got three naps in a row.');
      break;
    case 'twinvine':
      if (c === 'jog' && last === 'jog' && Math.abs(work - lastWork) <= 100) return ripen(p, r);
      if (p.age >= 12) return wilt(p, 'Twinvine never found its matching jog.');
      break;
    case 'wheelbloom':
      if (p.seen.nap >= 2 && p.seen.jog >= 2 && p.seen.zoom >= 2) return ripen(p, r);
      break;
  }
  return null;
}

/** Watering can: one step of help, different per species. */
function water(p, r) {
  switch (p.seed) {
    case 'moonmoss': p.growth++; if (p.growth >= 4) return ripen(p, r); break;
    case 'trotbean': p.growth++; if (p.growth >= 3) return ripen(p, r); break;
    case 'mileoak': p.work += 300; if (p.work >= OAK_WORK) return ripen(p, r); break;
    case 'dreamcap': p.napRun++; if (p.napRun >= 3) return ripen(p, r); break;
    case 'wheelbloom': { const k = ['nap', 'jog', 'zoom'].sort((a, b) => p.seen[a] - p.seen[b])[0]; p.seen[k]++; if (p.seen.nap >= 2 && p.seen.jog >= 2 && p.seen.zoom >= 2) return ripen(p, r); break; }
    default: p.age = Math.max(0, p.age - 4); // timed seeds get more time
  }
  return ['', `Watered ${SEEDS[p.seed].name}.`];
}

function progress(p) {
  if (p.status === 'ripe') return 1;
  switch (p.seed) {
    case 'moonmoss': return p.growth / 4;
    case 'trotbean': return p.growth / 3;
    case 'zoomflower': return Math.min(.8, .15 + p.age / 9 * .5);
    case 'mileoak': return Math.min(1, p.work / OAK_WORK);
    case 'comet': return p.lastClass === 'nap' ? .65 : .2;
    case 'dreamcap': return p.napRun / 3;
    case 'twinvine': return p.lastClass === 'jog' ? .6 : .2;
    case 'wheelbloom': return (Math.min(2, p.seen.nap) + Math.min(2, p.seen.jog) + Math.min(2, p.seen.zoom)) / 6;
  }
  return 0;
}
function progressText(p) {
  switch (p.seed) {
    case 'moonmoss': return `${p.growth}/4 naps`;
    case 'trotbean': return `${p.growth}/3 jogs`;
    case 'zoomflower': return `${Math.max(0, 9 - p.age)} rounds to catch zoomies`;
    case 'mileoak': return `${p.work.toLocaleString()} / ${OAK_WORK.toLocaleString()} work`;
    case 'comet': return p.lastClass === 'nap' ? 'Primed: zoomies now!' : `Wait for a nap · ${Math.max(0, 12 - p.age)} left`;
    case 'dreamcap': return `${p.napRun}/3 naps in a row`;
    case 'twinvine': return p.lastClass === 'jog' ? `Match ${p.lastWork} ±100` : `Needs a jog · ${Math.max(0, 12 - p.age)} left`;
    case 'wheelbloom': return `nap ${Math.min(2, p.seen.nap)} · jog ${Math.min(2, p.seen.jog)} · zoom ${Math.min(2, p.seen.zoom)}`;
  }
  return '';
}

function neighbours(i, open) {
  const out = [], col = i % 3;
  if (col > 0) out.push(i - 1);
  if (col < 2 && i + 1 < open) out.push(i + 1);
  if (i - 3 >= 0) out.push(i - 3);
  if (i + 3 < open) out.push(i + 3);
  return out;
}
function harvestValue(S, i) {
  const p = S.plots[i];
  const kinds = new Set(neighbours(i, S.open).map(j => S.plots[j]).filter(n => n && (n.status === 'growing' || n.status === 'ripe') && n.seed !== p.seed).map(n => n.seed));
  const diverse = kinds.size >= 2;
  return { value: Math.round(SEEDS[p.seed].value * (diverse ? 1.2 : 1)), diverse };
}
const levelOf = xp => LEVELS.filter(t => xp >= t).length;

// ---------- persistence ----------
const seasonId = () => Math.floor((Date.now() / 1000 - 345600) / 604800); // weeks from Monday 00:00 UTC
const blankState = () => ({ v: 2, plots: Array(MAX_PLOTS).fill(null), open: START_PLOTS, processed: null, season: seasonId(), seasonScore: 0, best: 0,
  harvests: 0, pips: 60, xp: 0, cloches: 0, waterAt: 0, herb: {}, ach: {}, quest: null, log: [] });
function load(m) {
  if (m === 'demo') return blankState();
  try { const s = JSON.parse(localStorage.getItem('squeek-garden:live')); if (s && s.v === 2) return s; } catch (_) { /* storage blocked */ }
  return blankState();
}
function save() {
  if (mode !== 'live') return;
  try { localStorage.setItem('squeek-garden:live', JSON.stringify(state)); } catch (_) { /* storage blocked */ }
}
function addLog(kind, text, round) {
  state.log.unshift({ kind, text, round });
  state.log.length = Math.min(state.log.length, 60);
}

// ---------- data sources ----------
async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const live = {
  rounds: new Map(), // round -> { work, cum }
  oldest: Infinity, latest: 0, status: null, error: null, lastFetch: 0,
  currentRound() { return Math.floor((Date.now() / 1000 - GENESIS) / ROUND_S) + 1; },
  roundEndsAt(r) { return (GENESIS + r * ROUND_S) * 1000; },
  questKey() { return Math.floor(Date.now() / 86400000); },
  async init() {
    try { const c = await getJSON(`${API}/core`); GENESIS = +c.configuration.genesisTimestamp || GENESIS; } catch (e) { this.error = e; }
  },
  ingest(events) {
    for (const e of events) {
      if (e.type !== 'system.settlement_completed') continue;
      const p = e.payload, prev = +p.previousSettledThroughRound, thr = +p.settledThroughRound, work = +p.workAdded;
      // One settlement normally closes one round; spread a rare multi-round batch evenly.
      const n = thr - prev;
      for (let r = prev + 1; r <= thr; r++) {
        const share = n === 1 ? work : (+p.activeRoundCount ? Math.round(work / n) : 0);
        this.rounds.set(r, { work: share, cum: r === thr && p.cumulativeWork != null ? +p.cumulativeWork : null });
        this.oldest = Math.min(this.oldest, r);
        this.latest = Math.max(this.latest, r);
      }
    }
  },
  async refreshRounds(needFrom) {
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const d = await getJSON(`${API}/events?limit=100&category=protocol${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      this.ingest(d.events || []);
      if (!d.nextCursor || this.oldest <= needFrom) break;
      cursor = d.nextCursor;
    }
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

function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const demo = {
  rounds: new Map(), oldest: 1, latest: 0, roundMs: 8000, start: Date.now(), mood: 'jog', R: mulberry(Date.now()), status: null,
  next: { nap: [.55, .25, .2], jog: [.25, .5, .25], zoom: [.25, .4, .35] },
  reset() { this.rounds.clear(); this.latest = 0; this.start = Date.now(); this.mood = 'jog'; },
  currentRound() { return Math.floor((Date.now() - this.start) / this.roundMs) + 1; },
  roundEndsAt(r) { return this.start + r * this.roundMs; },
  questKey() { return Math.floor(this.currentRound() / 15); },
  tick() {
    const cur = this.currentRound();
    while (this.latest < cur - 1) {
      const t = this.next[this.mood], x = this.R();
      this.mood = x < t[0] ? 'nap' : x < t[0] + t[1] ? 'jog' : 'zoom';
      const work = this.mood === 'nap' ? 0 : this.mood === 'jog' ? 40 + Math.floor(this.R() * 450) : 500 + Math.floor(this.R() * 260);
      this.rounds.set(++this.latest, { work, cum: null });
    }
    const frac = 1 - (this.roundEndsAt(cur) - Date.now()) / this.roundMs;
    const peek = this.mood === 'nap' ? 0 : Math.round((this.mood === 'jog' ? 300 : 650) * frac);
    this.status = { online: true, running: this.mood !== 'nap', rpm: this.mood === 'nap' ? 0 : this.mood === 'jog' ? 38 : 71, liveWork: peek };
  },
};

// ---------- game actions ----------
let mode = 'live', src = live, state = load('live'), selected = null, armed = null;

function unlock(id) {
  if (state.ach[id]) return;
  state.ach[id] = true;
  addLog('good', `Achievement: ${ACHIEVEMENTS[id][0]}!`, null);
  toast(`Achievement unlocked: ${ACHIEVEMENTS[id][0]}`);
}

function rollPeriods() {
  const id = seasonId();
  if (state.season !== id) {
    state.best = Math.max(state.best, state.seasonScore);
    state.season = id; state.seasonScore = 0;
    addLog('good', 'A new week started. Season score reset.', null);
  }
  const qk = src.questKey();
  if (!state.quest || state.quest.key !== qk) {
    const q = QUESTS[((qk % QUESTS.length) + QUESTS.length) % QUESTS.length];
    state.quest = { key: qk, id: q.id, progress: 0, done: false };
  }
}

function processRounds() {
  if (!src.latest) return;
  if (state.processed === null) { state.processed = src.latest; addLog('', `Garden opened at round ${src.latest + 1}. You have 60 pips to spend on seeds.`, src.latest + 1); return; }
  let skipped = 0;
  for (let r = state.processed + 1; r <= src.latest; r++) {
    const rd = src.rounds.get(r);
    if (!rd) { if (r < src.oldest) { skipped++; state.processed = r; continue; } break; }
    state.plots.forEach((p, i) => { const ev = applyRound(p, r, rd.work); if (ev) addLog(ev[0], `Plot ${i + 1}: ${ev[1]}`, r); });
    state.processed = r;
  }
  if (skipped) addLog('bad', `${skipped} old rounds were past the API history and were skipped.`, null);
}

function harvest(i) {
  const p = state.plots[i], cur = src.currentRound();
  const { value, diverse } = harvestValue(state, i);
  const lvBefore = levelOf(state.xp);
  state.seasonScore += value; state.pips += value; state.xp += value; state.harvests++;
  state.best = Math.max(state.best, state.seasonScore);
  state.herb[p.seed] = (state.herb[p.seed] || 0) + 1;
  addLog('good', `Plot ${i + 1}: picked ${SEEDS[p.seed].name} for ${value} pts and ${value} pips${diverse ? ' (mixed bed +20%)' : ''}.`, cur);
  state.plots[i] = null;
  floatText(i, `+${value}`);

  const q = state.quest, qd = q && QUESTS.find(x => x.id === q.id);
  if (qd && !q.done && qd.test({ seed: p.seed, diverse })) {
    q.progress++;
    if (q.progress >= qd.n) { q.done = true; state.pips += qd.reward; addLog('good', `Quest done: ${qd.text}. +${qd.reward} pips.`, cur); toast(`Quest done! +${qd.reward} pips`); }
  }
  unlock('first');
  if (diverse) unlock('mixed');
  if ((state.herb.moonmoss || 0) >= 5) unlock('night');
  if (p.seed === 'comet') unlock('comet');
  if (p.seed === 'wheelbloom') unlock('bloom');
  if (SEED_KEYS.every(k => state.herb[k])) unlock('herbarium');
  if (state.seasonScore >= 500) unlock('week500');
  const lv = levelOf(state.xp);
  if (lv > lvBefore) {
    const fresh = SEED_KEYS.filter(k => SEEDS[k].level === lv).map(k => SEEDS[k].name);
    addLog('good', `Level ${lv}!${fresh.length ? ` New seed: ${fresh.join(', ')}.` : ''}`, cur);
    toast(`Level ${lv}!${fresh.length ? ` ${fresh.join(', ')} unlocked` : ''}`);
  }
}

function plotClick(i) {
  if (i >= state.open) return;
  const p = state.plots[i], cur = src.currentRound();
  if (selected === 'water' || selected === 'cloche') {
    if (!p || p.status !== 'growing') { flashHint('Tools work on growing plants.'); return; }
    if (selected === 'water') {
      if (state.processed < state.waterAt) { flashHint('The watering can is still refilling.'); return; }
      const ev = water(p, state.processed); state.waterAt = state.processed + WATER_COOLDOWN;
      addLog(ev[0], `Plot ${i + 1}: ${ev[1]}`, cur); selected = null;
    } else {
      if (p.cloche) { flashHint('That plant already has a cloche.'); return; }
      if (state.cloches < 1) { flashHint('Buy a cloche first.'); return; }
      state.cloches--; p.cloche = true; addLog('', `Plot ${i + 1}: covered ${SEEDS[p.seed].name} with a cloche.`, cur);
      if (!state.cloches) selected = null;
    }
  } else if (!p) {
    if (!selected) { flashHint('Pick a seed packet first.'); return; }
    const sd = SEEDS[selected];
    if (state.pips < sd.price) { flashHint(`You need ${sd.price} pips for ${sd.name}.`); return; }
    state.pips -= sd.price;
    state.plots[i] = newPlant(selected, cur);
    addLog('', `Plot ${i + 1}: planted ${sd.name} (−${sd.price} pips). It reacts from round ${cur + 1}.`, cur);
    if (state.pips < sd.price) selected = null;
  } else if (p.status === 'ripe') {
    harvest(i);
  } else if (p.status === 'wilted' || p.status === 'rotten') {
    state.plots[i] = null;
  } else if (armed === i) {
    addLog('bad', `Plot ${i + 1}: dug up ${SEEDS[p.seed].name}.`, cur);
    state.plots[i] = null; armed = null;
  } else { armed = i; setTimeout(() => { if (armed === i) { armed = null; render(); } }, 3000); }
  save(); render();
}

function buyPlot() {
  const price = PLOT_PRICES[state.open - START_PLOTS];
  if (price == null) return;
  if (state.pips < price) { flashHint(`A new plot costs ${price} pips.`); return; }
  state.pips -= price; state.open++;
  addLog('good', `Dug a new plot (−${price} pips). You now have ${state.open}.`, src.currentRound());
  if (state.open === MAX_PLOTS) unlock('fullbed');
  save(); render();
}
function buyCloche() {
  if (state.pips < CLOCHE_PRICE) { flashHint(`A cloche costs ${CLOCHE_PRICE} pips.`); return; }
  state.pips -= CLOCHE_PRICE; state.cloches++;
  addLog('', `Bought a glass cloche (−${CLOCHE_PRICE} pips).`, src.currentRound());
  save(); render();
}

// ---------- rendering ----------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let hintTimer = null;
const hintText = () => {
  if (selected === 'water') return 'Tap a growing plant to water it.';
  if (selected === 'cloche') return 'Tap a growing plant to cover it.';
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
    const c = classify(d.work), h = c === 'nap' ? 4 : Math.max(6, d.work / max * 78);
    const label = i % 6 === 5 ? `<text x="${x + w / 2}" y="104" text-anchor="middle" style="fill:var(--muted);font:16px var(--mono)">${r}</text>` : '';
    return `<rect x="${x}" y="${82 - h}" width="${w}" height="${h}" style="fill:var(--m-${c})"><title>Round ${r}: ${d.work} work (${CLASS_NAME[c]})</title></rect>${label}`;
  }).join('') + `<line x1="0" y1="82.5" x2="480" y2="82.5" style="stroke:var(--line)"/>`;
}

function renderWheel() {
  const st = src.status, pill = $('wheelPill'), cur = src.currentRound();
  if (!st) { pill.className = 'pill'; pill.textContent = live.error && mode === 'live' ? 'Wheel data is unreachable. Try Demo.' : 'Connecting…'; }
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
  const wl = Math.max(0, state.waterAt - state.processed);
  $('waterState').textContent = wl ? `refills in ${wl} round${wl > 1 ? 's' : ''}` : 'ready';
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
    if (p.status === 'ripe') { const { value, diverse } = harvestValue(state, i); stat = `Ripe, pick for ${value}${diverse ? ' (mixed +20%)' : ''}`; extra = `<span class="pstat">rots in ${RIPE_WINDOW - (state.processed - p.ripeRound)} rounds</span>`; }
    else if (p.status === 'wilted') stat = 'Wilted, tap to clear';
    else if (p.status === 'rotten') stat = 'Rotten, tap to clear';
    else { stat = progressText(p); extra = armed === i ? '<span class="pstat"><b>Tap again to dig up</b></span>' : ''; }
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

  const q = state.quest, qd = q && QUESTS.find(x => x.id === q.id);
  $('quest').innerHTML = qd ? `<b>${esc(qd.text)}</b><span>${q.done ? 'Done ✓' : `${q.progress}/${qd.n}, +${qd.reward} pips`}</span>` : '';
  $('quest').classList.toggle('done', !!(q && q.done));

  $('sSeason').textContent = state.seasonScore.toLocaleString();
  $('sBest').textContent = Math.max(state.best, state.seasonScore).toLocaleString();
  $('sHarvests').textContent = state.harvests;
  $('seasonNote').textContent = mode === 'demo' ? 'Demo progress is not saved. Quests change every 15 demo rounds.' : 'Weeks reset Monday 00:00 UTC, quests daily. Your garden is saved in this browser.';
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

function setMode(m) {
  mode = m; src = m === 'live' ? live : demo; selected = null; armed = null;
  if (m === 'demo') { demo.reset(); demo.tick(); }
  state = load(m);
  $('mLive').setAttribute('aria-pressed', m === 'live'); $('mDemo').setAttribute('aria-pressed', m === 'demo');
  if (m === 'demo') { state.processed = 0; state.pips = 200; addLog('', 'Demo garden: rounds last 8 seconds, the hamster is simulated and you start with 200 pips.', 1); rollPeriods(); }
  else syncLive();
  render();
}
$('mLive').onclick = () => setMode('live');
$('mDemo').onclick = () => setMode('demo');

async function syncLive(force) {
  try {
    const need = state.processed === null ? live.currentRound() - 2 : state.processed + 1;
    if (force || live.latest < live.currentRound() - 1 || need < live.oldest) {
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
rollPeriods();
applyIcons();
render();
requestAnimationFrame(drawScene);
})();
