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
  harvests: 0, pips: 60, xp: 0, cloches: 0, waterAt: 0, herb: {}, ach: {}, quest: null, log: [], daily: null, combo: null });

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
    S.plots.forEach((p, i) => { const ev = applyRound(p, r, rd.work); if (ev) addLog(S, ev[0], `Plot ${i + 1}: ${ev[1]}`, r); });
    S.processed = r;
  }
  if (missing) addLog(S, 'bad', `${missing} old rounds are gone from the API history. Growing plants waited.`, null);
  return waiting;
}

// ---------- player actions ----------
function harvestPlot(S, i, cur) {
  const p = S.plots[i], toasts = [];
  const { value, diverse } = harvestValue(S, i);
  const lvBefore = levelOf(S.xp);
  S.seasonScore += value; S.pips += value; S.xp += value; S.harvests++;
  S.best = Math.max(S.best, S.seasonScore);
  S.herb[p.seed] = (S.herb[p.seed] || 0) + 1;
  const comboPips = advanceCombo(S, p.seed, value, cur);
  S.pips += comboPips;
  addLog(S, 'good', `Plot ${i + 1}: picked ${SEEDS[p.seed].name} for ${value} pts and ${value} pips${diverse ? ' (mixed bed +20%)' : ''}${comboPips ? `, plus ${comboPips} combo pips` : ''}.`, cur);
  S.plots[i] = null;

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

/** Applies one action, checking every rule. Returns { error } or { toasts, gained? }. Input may come from anyone. */
export function doAction(S, a, cur) {
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
      advanceDaily(S, 'plant', { seed: a.seed }, cur, done.toasts);
      return done;
    }
    case 'harvest':
      if (!p || p.status !== 'ripe') return { error: 'That plant is not ripe yet.' };
      return harvestPlot(S, i, cur);
    case 'clear':
      if (!p || (p.status !== 'wilted' && p.status !== 'rotten')) return { error: 'There is nothing to clear.' };
      S.plots[i] = null;
      return done;
    case 'dig':
      if (!p || p.status !== 'growing') return { error: 'There is nothing to dig up.' };
      addLog(S, 'bad', `Plot ${i + 1}: dug up ${SEEDS[p.seed].name}.`, cur);
      S.plots[i] = null;
      return done;
    case 'water': {
      if (!p || p.status !== 'growing') return { error: 'Tools work on growing plants.' };
      if (S.processed < S.waterAt) return { error: 'The watering can is still refilling.' };
      const ev = water(p, S.processed);
      S.waterAt = S.processed + WATER_COOLDOWN;
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
