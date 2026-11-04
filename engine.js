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
};

export const QUESTS = [
  { id: 'trot2',  text: 'Pick 2 Trotbeans',                      n: 2, reward: 40, test: h => h.seed === 'trotbean' },
  { id: 'zoom1',  text: 'Pick a Zoomflower',                     n: 1, reward: 40, test: h => h.seed === 'zoomflower' },
  { id: 'moon2',  text: 'Pick 2 Moonmoss',                       n: 2, reward: 40, test: h => h.seed === 'moonmoss' },
  { id: 'mixed2', text: 'Pick 2 plants with the mixed-bed bonus', n: 2, reward: 50, test: h => h.diverse },
  { id: 'any4',   text: 'Pick any 4 plants',                     n: 4, reward: 50, test: () => true },
  { id: 'oak1',   text: 'Pick a Mile Oak',                       n: 1, reward: 70, test: h => h.seed === 'mileoak' },
];

// ---------- plant rules (pure) ----------
export const newPlant = (seed, round) => ({ seed, plantedRound: round, status: 'growing', growth: 0, age: 0, work: 0,
  zoomRun: 0, napRun: 0, lastClass: null, lastWork: 0, seen: { nap: 0, jog: 0, zoom: 0 }, cloche: false, ripeRound: null });

function ripen(p, r) { p.status = 'ripe'; p.ripeRound = r; return ['good', `${SEEDS[p.seed].name} is ripe. Pick it within ${RIPE_WINDOW} rounds.`]; }
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
    if (r - p.ripeRound >= RIPE_WINDOW) { p.status = 'rotten'; return ['bad', `${SEEDS[p.seed].name} rotted before it was picked.`]; }
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
  harvests: 0, pips: 60, xp: 0, cloches: 0, waterAt: 0, herb: {}, ach: {}, quest: null, log: [] });

/** Starts a new week when the season changed. Returns true if it did. */
export function rollSeason(S, id) {
  if (S.season === id) return false;
  S.best = Math.max(S.best, S.seasonScore);
  S.season = id; S.seasonScore = 0;
  return true;
}
