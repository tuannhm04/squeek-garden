// Squeek Garden rules: pure functions with no DOM, network or clock of their own,
// shared by the page and the tests.
export const RIPE_WINDOW = 12, MAX_PLOTS = 9, START_PLOTS = 6;
export const OAK_WORK = 3000, WATER_COOLDOWN = 6, CLOCHE_PRICE = 25, PLOT_PRICES = [80, 150, 250];
export const LEVELS = [0, 150, 400, 800, 1500, 2500];

export const classify = w => (w === 0 ? 'nap' : w < 500 ? 'jog' : 'zoom');
export const CLASS_NAME = { nap: 'Nap', jog: 'Jog', zoom: 'Zoomies' };

export const SEEDS = {
  moonmoss:   { name: 'Moonmoss',          color: '--nap',  value: 30,  price: 10, level: 1, blurb: 'Grows one step every nap round. Ripe after 4. Two zoomies rounds in a row shrivel it.' },
  trotbean:   { name: 'Trotbean',          color: '--jog',  value: 35,  price: 10, level: 1, blurb: 'Grows on jog rounds (1–499 work). Ripe after 3. Three naps in a row and it wilts.' },
  zoomflower: { name: 'Zoomflower',        color: '--zoom', value: 70,  price: 20, level: 1, blurb: 'Blooms on the first zoomies round (500+). Wilts if none comes within 9 rounds.' },
  mileoak:    { name: 'Mile Oak',          color: '--leaf', value: 100, price: 30, level: 1, blurb: 'Banks every unit of work. Ripe at 3,000 total. Never wilts, just slow.' },
  comet:      { name: 'Comet Pepper',      color: '--zoom', value: 95,  price: 25, level: 2, blurb: 'Needs a nap round followed straight away by zoomies. Wilts after 12 rounds.' },
  dreamcap:   { name: 'Dreamcap',          color: '--nap',  value: 85,  price: 30, level: 3, blurb: 'Needs 3 naps in a row. Any run resets the count. Wilts after 15 rounds.' },
  twinvine:   { name: 'Twinvine',          color: '--jog',  value: 90,  price: 35, level: 4, blurb: 'Needs two jog rounds in a row within 100 work of each other. Wilts after 12 rounds.' },
  wheelbloom: { name: 'Golden Wheelbloom', color: '--gold', value: 160, price: 60, level: 5, blurb: 'Must see every mood twice: 2 naps, 2 jogs, 2 zoomies. Never wilts.' },
};
export const SEED_KEYS = Object.keys(SEEDS);

export const ACHIEVEMENTS = {
  first:     ['First harvest', 'Pick your first plant.'],
  mixed:     ['Mixed bed', 'Pick a plant with the +20% mixed-bed bonus.'],
  night:     ['Night gardener', 'Pick 5 Moonmoss.'],
  comet:     ['Comet catcher', 'Pick a Comet Pepper.'],
  bloom:     ['Golden hour', 'Pick a Golden Wheelbloom.'],
  herbarium: ['Full herbarium', 'Pick every species at least once.'],
  fullbed:   ['Full bed', 'Unlock all 9 plots.'],
  week500:   ['Green thumb', 'Score 500 in one week.'],
  pick10:    ['Green fingers', 'Pick 10 plants.'],
  pick50:    ['Market gardener', 'Pick 50 plants.'],
  pick200:   ['Harvest legend', 'Pick 200 plants.'],
  combo3:    ['Hat trick', 'Reach a combo of 3 plants.'],
  combo5:    ['Bumper crop', 'Reach a combo of 5 plants.'],
  daily3:    ['Full day', 'Finish all three daily challenges in one day.'],
  week1000:  ['Golden thumb', 'Score 1,000 in one week.'],
  level5:    ['Master gardener', 'Reach level 5.'],
  pips1000:  ['Full purse', 'Hold 1,000 pips.'],
  saved:     ['Close call', 'Let a cloche save a plant.'],
  gloved:    ['Soft hands', 'Pick a plant you put gloves on.'],
  decor3:    ['Landscaper', 'Own 3 garden decorations.'],
  compost10: ['Composter', 'Compost 10 dead plants.'],
  rancher:   ['Rancher', 'Keep a chicken, a pig and a cow at once.'],
  produce50: ['Farm stand', 'Collect 50 eggs, cuts of pork or milk cans.'],
  mutant:    ['Odd one out', 'Pick a plant that sprouted as a variant.'],
  variants4: ['Rare collector', 'Pick all four variants: Golden, Crystal, Lunar and Rainbow.'],
};

export const QUESTS = [
  { id: 'trot2',  text: 'Pick 2 Trotbeans',                      n: 2, reward: 40, test: h => h.seed === 'trotbean' },
  { id: 'zoom1',  text: 'Pick a Zoomflower',                     n: 1, reward: 40, test: h => h.seed === 'zoomflower' },
  { id: 'moon2',  text: 'Pick 2 Moonmoss',                       n: 2, reward: 40, test: h => h.seed === 'moonmoss' },
  { id: 'mixed2', text: 'Pick 2 plants with the mixed-bed bonus', n: 2, reward: 50, test: h => h.diverse },
  { id: 'any4',   text: 'Pick any 4 plants',                     n: 4, reward: 50, test: () => true },
  { id: 'oak1',   text: 'Pick a Mile Oak',                       n: 1, reward: 70, test: h => h.seed === 'mileoak' },
];

// Three a day on top of the quest, picked from the day number, so the page and the server always agree.
export const DAILY_CHALLENGES = [
  { id: 'plant3',  text: 'Plant 3 seeds',                            n: 3, reward: 15, on: 'plant',   test: () => true },
  { id: 'water1',  text: 'Use the watering can',                     n: 1, reward: 10, on: 'water',   test: () => true },
  { id: 'pick1',   text: 'Pick any plant',                           n: 1, reward: 15, on: 'harvest', test: () => true },
  { id: 'pick3',   text: 'Pick any 3 plants',                        n: 3, reward: 35, on: 'harvest', test: () => true },
  { id: 'moon1',   text: 'Pick a Moonmoss',                          n: 1, reward: 20, on: 'harvest', test: h => h.seed === 'moonmoss' },
  { id: 'trot1',   text: 'Pick a Trotbean',                          n: 1, reward: 20, on: 'harvest', test: h => h.seed === 'trotbean' },
  { id: 'zoom1',   text: 'Pick a Zoomflower',                        n: 1, reward: 25, on: 'harvest', test: h => h.seed === 'zoomflower' },
  { id: 'mixed1',  text: 'Pick a plant with the mixed-bed bonus',    n: 1, reward: 30, on: 'harvest', test: h => h.diverse },
  { id: 'combo2',  text: 'Reach a combo of 2 plants',                n: 1, reward: 30, on: 'combo',   test: () => true },
];
export const DAILY_COUNT = 3;

// Picking different species close together pays extra pips. It never changes points or XP.
export const COMBO_WINDOW = 3, COMBO_BONUS = [0, 0, .05, .10, .15];

// Farming costs pips. Watering keeps its effect, and fertilizer pays back in pips only:
// neither makes pips buy points, so a full purse cannot buy a place on the leaderboard.
export const WATER_PRICE = 5, FERTILIZER_PRICE = 10, FERTILIZER_BONUS = .3, FEED_PACK = 5, FEED_PACK_PRICE = 20;

// Weather comes from the round number alone, so everyone sees the same sky and can plan for the next hour.
// It only decides which variant a seed can become. Variants pay extra pips and fill a collection, never points.
export const WEATHER_ROUNDS = 6, WEATHER_VERSION = 1, MUTATION_CHANCE = .1, VARIANT_BONUS = .25;
export const WEATHER = {
  sunny:   { name: 'Clear',   weight: 40, variant: 'golden' },
  rainy:   { name: 'Rainy',   weight: 25, variant: 'rainbow' },
  foggy:   { name: 'Foggy',   weight: 20, variant: 'crystal' },
  moonlit: { name: 'Moonlit', weight: 15, variant: 'lunar' },
};
export const VARIANTS = { golden: 'Golden', crystal: 'Crystal', lunar: 'Lunar', rainbow: 'Rainbow' };

/** The weather during a round. */
export function weatherAt(round) {
  let x = Math.imul(Math.floor(round / WEATHER_ROUNDS) + 1, 2654435761) ^ Math.imul(WEATHER_VERSION, 40503) | 1;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  let pick = (x >>> 0) % 100;
  for (const [k, w] of Object.entries(WEATHER)) { if (pick < w.weight) return k; pick -= w.weight; }
  return 'sunny';
}
/** The first round after the current weather spell. */
export const weatherEnds = round => (Math.floor(round / WEATHER_ROUNDS) + 1) * WEATHER_ROUNDS;

// Gloves buy time on one plant. They never change its points or what it needs to ripen.
export const GLOVE_PRICE = 30, GLOVE_WINDOW = 144, MAX_GLOVED = 3;
export const ripeWindow = p => (p.gloved ? GLOVE_WINDOW : RIPE_WINDOW);

// Decorations only change how the garden looks, so spare pips can never buy points.
export const DECOR = [
  { id: 'flag',      name: 'Garden flag', price: 100 },
  { id: 'fence',     name: 'Picket fence', price: 200 },
  { id: 'lantern',   name: 'Lantern',     price: 400 },
  { id: 'gnome',     name: 'Garden gnome', price: 700 },
  { id: 'scarecrow', name: 'Scarecrow',   price: 1200 },
  { id: 'pond',      name: 'Little pond', price: 2000 },
];

// Animals earn pips from his real rounds and never points, so the leaderboard stays about the plants.
// Each product eats feed. A hungry animal or a full pen just waits, so going away costs nothing.
export const MAX_PENS = 3, PEN_STOCK = 5;
export const ANIMALS = {
  chicken: { name: 'Chicken', product: 'egg',    plural: 'eggs',     mood: 'nap',  need: 3, pay: 12, feed: 1, price: 40,  level: 1, blurb: 'Lays an egg every 3 nap rounds. Each egg eats 1 feed and pays 12 pips.' },
  pig:     { name: 'Pig',     product: 'cut of pork', plural: 'cuts of pork', mood: 'jog',  need: 2, pay: 30, feed: 2, price: 120, level: 2, blurb: 'Gives a cut of pork every 2 jog rounds. Each cut eats 2 feed and pays 30 pips.' },
  cow:     { name: 'Cow',     product: 'milk can', plural: 'milk cans', mood: 'zoom', need: 1, pay: 50, feed: 4, price: 250, level: 3, blurb: 'Gives a can of milk every zoomies round. Each can eats 4 feed and pays 50 pips.' },
};

// ---------- plant rules (pure) ----------
export const newPlant = (seed, round) => ({ seed, plantedRound: round, status: 'growing', growth: 0, age: 0, work: 0,
  zoomRun: 0, napRun: 0, lastClass: null, lastWork: 0, seen: { nap: 0, jog: 0, zoom: 0 }, cloche: false, ripeRound: null });

function ripen(p, r) { p.status = 'ripe'; p.ripeRound = r; return ['good', `${SEEDS[p.seed].name} is ripe. Pick it within ${ripeWindow(p)} rounds.`]; }
function wilt(p, why) {
  if (p.cloche) {
    p.cloche = false; p.zoomRun = 0; p.napRun = 0; p.age = 0;
    return ['good', `The cloche saved ${SEEDS[p.seed].name}. (${why})`];
  }
  p.status = 'wilted'; return ['bad', why];
}

/** Apply one settled round to a plant. Returns a diary entry [kind, text] or null. work is null when unknown. */
export function applyRound(p, r, work) {
  if (!p || r <= p.plantedRound) return null;
  if (p.status === 'ripe') {
    if (r - p.ripeRound >= ripeWindow(p)) { p.status = 'rotten'; return ['bad', `${SEEDS[p.seed].name} rotted before it was picked.`]; }
    return null;
  }
  if (p.status !== 'growing') return null;
  if (work === null) return null; // a round whose work is unknown: ripe plants still age, growing ones wait
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
export function water(p, r) {
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

export function progress(p) {
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
export function progressText(p) {
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

export function neighbours(i, open) {
  const out = [], col = i % 3;
  if (col > 0) out.push(i - 1);
  if (col < 2 && i + 1 < open) out.push(i + 1);
  if (i - 3 >= 0) out.push(i - 3);
  if (i + 3 < open) out.push(i + 3);
  return out;
}
export function harvestValue(S, i) {
  const p = S.plots[i];
  const kinds = new Set(neighbours(i, S.open).map(j => S.plots[j]).filter(n => n && (n.status === 'growing' || n.status === 'ripe') && n.seed !== p.seed).map(n => n.seed));
  const diverse = kinds.size >= 2;
  return { value: Math.round(SEEDS[p.seed].value * (diverse ? 1.2 : 1)), diverse };
}
export const levelOf = xp => LEVELS.filter(t => xp >= t).length;

// ---------- seasons and new gardens ----------
export const seasonId = (nowMs = Date.now()) => Math.floor((nowMs / 1000 - 345600) / 604800); // weeks from Monday 00:00 UTC
export const blankState = (season = seasonId()) => ({ v: 3, plots: Array(MAX_PLOTS).fill(null), open: START_PLOTS, processed: null, season, seasonScore: 0, best: 0,
  harvests: 0, pips: 60, xp: 0, cloches: 0, waterAt: 0, herb: {}, ach: {}, quest: null, log: [], daily: null, combo: null, gloves: 0, decor: {}, composted: 0, barn: [null, null, null], collected: 0, feed: 0, variants: {} });

/** When a season's scores lock, in milliseconds: the Monday 00:00 UTC that follows it. */
export const seasonEndsAt = id => ((id + 1) * 604800 + 345600) * 1000;

/** Starts a new week when the season changed. Returns true if it did. */
export function rollSeason(S, id) {
  if (S.season === id) return false;
  S.best = Math.max(S.best, S.seasonScore);
  S.season = id; S.seasonScore = 0;
  return true;
}

// ---------- diary, periods and rounds ----------
export function addLog(S, kind, text, round) {
  S.log.unshift({ kind, text, round });
  S.log.length = Math.min(S.log.length, 60);
}

function unlock(S, id, toasts) {
  if (S.ach[id]) return;
  S.ach[id] = true;
  addLog(S, 'good', `Achievement: ${ACHIEVEMENTS[id][0]}!`, null);
  toasts.push(`Achievement unlocked: ${ACHIEVEMENTS[id][0]}`);
}

/** The same three challenges for everyone on a given day. */
export function dailyFor(day) {
  const ids = DAILY_CHALLENGES.map(d => d.id);
  let x = Math.imul(day + 1, 2654435761) | 1;
  for (let i = ids.length - 1; i > 0; i--) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    const j = (x >>> 0) % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, DAILY_COUNT);
}

export function rollPeriods(S, season, questKey) {
  if (rollSeason(S, season)) addLog(S, 'good', 'A new week started. Season score reset.', null);
  if (!S.quest || S.quest.key !== questKey) {
    const q = QUESTS[((questKey % QUESTS.length) + QUESTS.length) % QUESTS.length];
    S.quest = { key: questKey, id: q.id, progress: 0, done: false };
  }
  if (!S.daily || S.daily.day !== questKey) {
    S.daily = { day: questKey, items: dailyFor(questKey).map(id => ({ id, progress: 0, done: false })) };
  }
}

/** Counts an event towards today's challenges. A finished one pays once and never again. */
function advanceDaily(S, on, info, cur, toasts) {
  if (!S.daily) return;
  for (const item of S.daily.items) {
    const d = DAILY_CHALLENGES.find(x => x.id === item.id);
    if (!d || item.done || d.on !== on || !d.test(info)) continue;
    item.progress++;
    if (item.progress >= d.n) {
      item.done = true;
      S.pips += d.reward;
      addLog(S, 'good', `Daily challenge done: ${d.text}. +${d.reward} pips.`, cur);
      toasts.push(`Daily challenge done! +${d.reward} pips`);
    }
  }
}

/** Extends or restarts the combo for a picked plant and returns the extra pips it earns. */
function advanceCombo(S, seed, value, cur) {
  const c = S.combo;
  const count = c && c.lastSeed !== seed && cur - c.lastRound <= COMBO_WINDOW ? c.count + 1 : 1;
  S.combo = { count, lastSeed: seed, lastRound: cur };
  return Math.round(value * COMBO_BONUS[Math.min(count, COMBO_BONUS.length - 1)]);
}

/** One settled round for an animal, eating from S.feed. Rounds with unknown work are skipped. */
export function applyAnimal(a, r, work, S) {
  if (!a || r <= a.boughtRound || work === null) return;
  const d = ANIMALS[a.kind];
  if (classify(work) === d.mood) a.progress++;
  if (a.progress >= d.need) {
    if (a.stock < PEN_STOCK && (S.feed || 0) >= d.feed) { S.feed -= d.feed; a.stock++; a.progress = 0; }
    else a.progress = d.need; // full or hungry: waits for you
  }
}

/** Plays every round the garden has not seen yet. Returns true when it stopped to wait for missing history. */
export function settleRounds(S, rounds, latest, historyEnded = false) {
  if (!latest) return false;
  if (S.processed === null) { S.processed = latest; addLog(S, '', `Garden opened at round ${latest + 1}. You have 60 pips to spend on seeds.`, latest + 1); return false; }
  let missing = 0, waiting = false;
  for (let r = S.processed + 1; r <= latest; r++) {
    let rd = rounds.get(r);
    if (!rd) {
      if (!historyEnded) { waiting = true; break; } // wait for the history instead of guessing
      rd = { work: null }; missing++;
    }
    if (rd.work === null) S.combo = null; // a combo cannot span rounds we know nothing about
    if (rd.batch && r === rd.batch.first && S.plots.some(p => p && p.status === 'growing')) {
      addLog(S, '', `Rounds ${rd.batch.first}-${rd.batch.last} settled together, so their work per round is unknown. Growing plants waited.`, r);
    }
    S.plots.forEach((p, i) => {
      const covered = !!(p && p.cloche);
      const ev = applyRound(p, r, rd.work);
      if (ev) addLog(S, ev[0], `Plot ${i + 1}: ${ev[1]}`, r);
      if (covered && !p.cloche) unlock(S, 'saved', []);
    });
    (S.barn || []).forEach(a => applyAnimal(a, r, rd.work, S));
    S.processed = r;
  }
  if (missing) addLog(S, 'bad', `${missing} old rounds are gone from the API history. Growing plants waited.`, null);
  return waiting;
}

/**
 * Squeekchain can redeploy and count rounds from the start again. The garden keeps everything,
 * moves its round marks to the new count, and waits for rounds from now on.
 * A save with no chain mark can only be told apart by being ahead of the clock.
 */
export function syncChain(S, chainId, cur) {
  if (!chainId || S.chain === chainId) return false;
  const changed = S.chain ? true : S.processed !== null && S.processed > cur;
  S.chain = chainId;
  if (!changed) return false;
  const base = Math.max(0, cur - 1), shift = base - (S.processed === null ? base : S.processed);
  for (const p of S.plots) {
    if (!p) continue;
    // Plants set in a round that had not settled yet must not end up ahead of the new count.
    p.plantedRound = Math.min(base, Math.max(0, p.plantedRound + shift));
    if (p.ripeRound !== null) p.ripeRound = Math.min(base, Math.max(0, p.ripeRound + shift));
  }
  S.waterAt = Math.min(base + WATER_COOLDOWN, Math.max(0, S.waterAt + shift));
  for (const a of S.barn || []) if (a) a.boughtRound = Math.min(base, Math.max(0, a.boughtRound + shift));
  if (S.processed !== null) S.processed = base;
  S.combo = null; // measured in the old count
  addLog(S, '', 'Squeekchain restarted its rounds. Your garden carried over and waits for new ones.', cur);
  return true;
}

// ---------- player actions ----------
function harvestPlot(S, i, cur) {
  const p = S.plots[i], toasts = [];
  const { value, diverse } = harvestValue(S, i);
  const lvBefore = levelOf(S.xp);
  S.seasonScore += value; S.pips += value; S.xp += value; S.harvests++;
  S.best = Math.max(S.best, S.seasonScore);
  S.herb[p.seed] = (S.herb[p.seed] || 0) + 1;
  const comboPips = advanceCombo(S, p.seed, value, cur) + (p.fertilized ? Math.round(value * FERTILIZER_BONUS) : 0) + (p.variant ? Math.round(value * VARIANT_BONUS) : 0);
  S.pips += comboPips;
  addLog(S, 'good', `Plot ${i + 1}: picked ${SEEDS[p.seed].name} for ${value} pts and ${value} pips${diverse ? ' (mixed bed +20%)' : ''}${comboPips ? `, plus ${comboPips} bonus pips` : ''}.`, cur);
  S.plots[i] = null;

  if (p.gloved) unlock(S, 'gloved', toasts);
  if (p.variant) {
    S.variants = S.variants || {};
    S.variants[p.variant] = (S.variants[p.variant] || 0) + 1;
    unlock(S, 'mutant', toasts);
    if (Object.keys(VARIANTS).every(v => S.variants[v])) unlock(S, 'variants4', toasts);
  }
  const q = S.quest, qd = q && QUESTS.find(x => x.id === q.id);
  if (qd && !q.done && qd.test({ seed: p.seed, diverse })) {
    q.progress++;
    if (q.progress >= qd.n) { q.done = true; S.pips += qd.reward; addLog(S, 'good', `Quest done: ${qd.text}. +${qd.reward} pips.`, cur); toasts.push(`Quest done! +${qd.reward} pips`); }
  }
  advanceDaily(S, 'harvest', { seed: p.seed, diverse }, cur, toasts);
  if (S.combo.count >= 2) advanceDaily(S, 'combo', {}, cur, toasts);
  unlock(S, 'first', toasts);
  if (diverse) unlock(S, 'mixed', toasts);
  if ((S.herb.moonmoss || 0) >= 5) unlock(S, 'night', toasts);
  if (p.seed === 'comet') unlock(S, 'comet', toasts);
  if (p.seed === 'wheelbloom') unlock(S, 'bloom', toasts);
  if (SEED_KEYS.every(k => S.herb[k])) unlock(S, 'herbarium', toasts);
  if (S.seasonScore >= 500) unlock(S, 'week500', toasts);
  const lv = levelOf(S.xp);
  if (lv > lvBefore) {
    const fresh = SEED_KEYS.filter(k => SEEDS[k].level === lv).map(k => SEEDS[k].name);
    addLog(S, 'good', `Level ${lv}!${fresh.length ? ` New seed: ${fresh.join(', ')}.` : ''}`, cur);
    toasts.push(`Level ${lv}!${fresh.length ? ` ${fresh.join(', ')} unlocked` : ''}`);
  }
  return { toasts, gained: value };
}

/** The badges that depend on totals rather than on one moment. */
function checkBadges(S, toasts) {
  const earn = (id, ok) => { if (ok) unlock(S, id, toasts); };
  earn('pick10', S.harvests >= 10);
  earn('pick50', S.harvests >= 50);
  earn('pick200', S.harvests >= 200);
  earn('combo3', !!S.combo && S.combo.count >= 3);
  earn('combo5', !!S.combo && S.combo.count >= 5);
  earn('daily3', !!S.daily && S.daily.items.length > 0 && S.daily.items.every(x => x.done));
  earn('week1000', S.seasonScore >= 1000);
  earn('level5', levelOf(S.xp) >= 5);
  earn('pips1000', S.pips >= 1000);
  earn('decor3', Object.keys(S.decor || {}).length >= 3);
  earn('compost10', (S.composted || 0) >= 10);
  const kinds = new Set((S.barn || []).filter(Boolean).map(a => a.kind));
  earn('rancher', Object.keys(ANIMALS).every(k => kinds.has(k)));
  earn('produce50', (S.collected || 0) >= 50);
}

/**
 * Applies one action, checking every rule. Returns { error } or { toasts, gained? }. Input may come from anyone.
 * roll is a random number from 0 to 1 for a seed's chance to mutate. The server supplies its own, so a
 * connected player's plants cannot be predicted from this public code or asked for in a request.
 */
export function doAction(S, a, cur, roll = Math.random()) {
  const res = runAction(S, a, cur, roll);
  if (!res.error) checkBadges(S, res.toasts);
  return res;
}

function runAction(S, a, cur, roll) {
  const done = { toasts: [] };
  if (!a || typeof a.type !== 'string') return { error: 'Unknown action.' };
  if (a.type === 'buyPlot') {
    const price = PLOT_PRICES[S.open - START_PLOTS];
    if (price == null) return { error: 'All plots are already dug.' };
    if (S.pips < price) return { error: `A new plot costs ${price} pips.` };
    S.pips -= price; S.open++;
    addLog(S, 'good', `Dug a new plot (−${price} pips). You now have ${S.open}.`, cur);
    if (S.open === MAX_PLOTS) unlock(S, 'fullbed', done.toasts);
    return done;
  }
  if (a.type === 'buyCloche') {
    if (S.pips < CLOCHE_PRICE) return { error: `A cloche costs ${CLOCHE_PRICE} pips.` };
    S.pips -= CLOCHE_PRICE; S.cloches++;
    addLog(S, '', `Bought a glass cloche (−${CLOCHE_PRICE} pips).`, cur);
    return done;
  }

  if (a.type === 'buyGloves') {
    if (S.pips < GLOVE_PRICE) return { error: `Gloves cost ${GLOVE_PRICE} pips.` };
    S.pips -= GLOVE_PRICE; S.gloves = (S.gloves || 0) + 1;
    addLog(S, '', `Bought harvest gloves (−${GLOVE_PRICE} pips).`, cur);
    return done;
  }
  if (a.type === 'buyDecor') {
    const d = DECOR.find(x => x.id === a.item);
    if (!d) return { error: 'That decoration is not for sale.' };
    S.decor = S.decor || {};
    if (S.decor[d.id]) return { error: `You already have the ${d.name.toLowerCase()}.` };
    if (S.pips < d.price) return { error: `The ${d.name.toLowerCase()} costs ${d.price} pips.` };
    S.pips -= d.price; S.decor[d.id] = true;
    addLog(S, 'good', `Added a ${d.name.toLowerCase()} to the garden (−${d.price} pips).`, cur);
    return done;
  }

  if (a.type === 'buyFeed') {
    if (S.pips < FEED_PACK_PRICE) return { error: `A bag of feed costs ${FEED_PACK_PRICE} pips.` };
    S.pips -= FEED_PACK_PRICE; S.feed = (S.feed || 0) + FEED_PACK;
    addLog(S, '', `Bought ${FEED_PACK} feed (−${FEED_PACK_PRICE} pips).`, cur);
    return done;
  }
  if (a.type === 'buyAnimal') {
    if (!Object.hasOwn(ANIMALS, a.item)) return { error: 'That animal is not for sale.' };
    const d = ANIMALS[a.item];
    if (d.level > levelOf(S.xp)) return { error: `The ${d.name.toLowerCase()} unlocks at level ${d.level}.` };
    if (S.pips < d.price) return { error: `A ${d.name.toLowerCase()} costs ${d.price} pips.` };
    S.barn = S.barn || [null, null, null];
    const pen = S.barn.indexOf(null);
    if (pen < 0) return { error: 'All your pens are full.' };
    S.pips -= d.price;
    S.barn[pen] = { kind: a.item, boughtRound: cur, progress: 0, stock: 0 };
    addLog(S, 'good', `A ${d.name.toLowerCase()} moved into pen ${pen + 1} (−${d.price} pips).`, cur);
    return done;
  }
  if (a.type === 'collect') {
    const pen = (S.barn || [])[a.plot];
    if (!pen) return { error: 'That pen is empty.' };
    if (pen.stock < 1) return { error: 'There is nothing to collect yet.' };
    const d = ANIMALS[pen.kind], earned = pen.stock * d.pay;
    addLog(S, 'good', `Collected ${pen.stock} ${pen.stock > 1 ? d.plural : d.product} for ${earned} pips.`, cur);
    S.pips += earned; S.collected = (S.collected || 0) + pen.stock; pen.stock = 0;
    return done;
  }

  const i = a.plot;
  if (!Number.isInteger(i) || i < 0 || i >= S.open) return { error: 'That plot is not open.' };
  const p = S.plots[i];
  switch (a.type) {
    case 'plant': {
      if (p) return { error: 'That plot is taken.' };
      if (!Object.hasOwn(SEEDS, a.seed)) return { error: 'Pick a seed packet first.' };
      const sd = SEEDS[a.seed];
      if (sd.level > levelOf(S.xp)) return { error: `${sd.name} unlocks at level ${sd.level}.` };
      if (S.pips < sd.price) return { error: `You need ${sd.price} pips for ${sd.name}.` };
      S.pips -= sd.price;
      S.plots[i] = newPlant(a.seed, cur);
      addLog(S, '', `Plot ${i + 1}: planted ${sd.name} (−${sd.price} pips). It reacts from round ${cur + 1}.`, cur);
      if (roll < MUTATION_CHANCE) {
        const v = WEATHER[weatherAt(cur)].variant;
        S.plots[i].variant = v;
        addLog(S, 'good', `Plot ${i + 1}: this seed sprouted as a ${VARIANTS[v]} variant!`, cur);
        done.toasts.push(`A ${VARIANTS[v]} ${sd.name} sprouted!`);
      }
      advanceDaily(S, 'plant', { seed: a.seed }, cur, done.toasts);
      return done;
    }
    case 'harvest':
      if (!p || p.status !== 'ripe') return { error: 'That plant is not ripe yet.' };
      return harvestPlot(S, i, cur);
    case 'clear':
      if (!p || (p.status !== 'wilted' && p.status !== 'rotten')) return { error: 'There is nothing to clear.' };
      {
        const back = Math.ceil(SEEDS[p.seed].price / 2); // always less than the seed cost, so it can't be farmed
        S.pips += back; S.composted = (S.composted || 0) + 1;
        addLog(S, '', `Plot ${i + 1}: composted ${SEEDS[p.seed].name} for ${back} pips.`, cur);
      }
      S.plots[i] = null;
      return done;
    case 'fertilize':
      if (!p || (p.status !== 'growing' && p.status !== 'ripe')) return { error: 'Fertilizer works on living plants.' };
      if (p.fertilized) return { error: 'That plant is already fertilized.' };
      if (S.pips < FERTILIZER_PRICE) return { error: `Fertilizer costs ${FERTILIZER_PRICE} pips.` };
      S.pips -= FERTILIZER_PRICE; p.fertilized = true;
      addLog(S, '', `Plot ${i + 1}: fertilized ${SEEDS[p.seed].name} (−${FERTILIZER_PRICE} pips). It pays ${Math.round(FERTILIZER_BONUS * 100)}% more pips when picked.`, cur);
      return done;
    case 'glove':
      if (!p || (p.status !== 'growing' && p.status !== 'ripe')) return { error: 'Gloves work on living plants.' };
      if (p.gloved) return { error: 'That plant already has gloves.' };
      if ((S.gloves || 0) < 1) return { error: 'Buy gloves first.' };
      if (S.plots.filter(x => x && x.gloved && (x.status === 'growing' || x.status === 'ripe')).length >= MAX_GLOVED) return { error: `Only ${MAX_GLOVED} plants can have gloves at once.` };
      S.gloves--; p.gloved = true;
      addLog(S, '', `Plot ${i + 1}: put gloves on ${SEEDS[p.seed].name}. Once ripe it keeps for ${GLOVE_WINDOW} rounds.`, cur);
      return done;
    case 'dig':
      if (!p || p.status !== 'growing') return { error: 'There is nothing to dig up.' };
      addLog(S, 'bad', `Plot ${i + 1}: dug up ${SEEDS[p.seed].name}.`, cur);
      S.plots[i] = null;
      return done;
    case 'water': {
      if (!p || p.status !== 'growing') return { error: 'Tools work on growing plants.' };
      const settled = S.processed === null ? cur : S.processed; // no round has settled yet on a new chain
      if (settled < S.waterAt) return { error: 'The watering can is still refilling.' };
      if (S.pips < WATER_PRICE) return { error: `Watering costs ${WATER_PRICE} pips.` };
      S.pips -= WATER_PRICE;
      const ev = water(p, settled);
      S.waterAt = settled + WATER_COOLDOWN;
      addLog(S, ev[0], `Plot ${i + 1}: ${ev[1]}`, cur);
      advanceDaily(S, 'water', {}, cur, done.toasts);
      return done;
    }
    case 'cover':
      if (!p || p.status !== 'growing') return { error: 'Tools work on growing plants.' };
      if (p.cloche) return { error: 'That plant already has a cloche.' };
      if (S.cloches < 1) return { error: 'Buy a cloche first.' };
      S.cloches--; p.cloche = true;
      addLog(S, '', `Plot ${i + 1}: covered ${SEEDS[p.seed].name} with a cloche.`, cur);
      return done;
  }
  return { error: 'Unknown action.' };
}
