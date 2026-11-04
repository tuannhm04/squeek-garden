// Live garden persistence. Schema v2 stays untouched under its old key: v3 lives beside it,
// so going back to the previous build always finds the save it knows.
import { MAX_PLOTS, SEEDS, START_PLOTS } from './engine.js';

export const KEY_V2 = 'squeek-garden:live';
export const KEY_V3 = 'squeek-garden:live:v3';
const KEY_TMP = 'squeek-garden:live:v3:tmp';
const BACKUP_V2 = 'squeek-garden:backup:v2:';
const BACKUP_V3 = 'squeek-garden:backup:v3:';
const QUARANTINE = 'squeek-garden:corrupt:';
const EXPORT_FORMAT = 'squeek-garden-save';

const STATUSES = new Set(['growing', 'ripe', 'wilted', 'rotten']);
const isCount = n => Number.isFinite(n) && n >= 0;
const isObject = o => !!o && typeof o === 'object' && !Array.isArray(o);

function plantProblem(p, i) {
  if (!isObject(p)) return `plot ${i} is not a plant`;
  if (!SEEDS[p.seed]) return `plot ${i} has an unknown seed`;
  if (!STATUSES.has(p.status)) return `plot ${i} has an unknown status`;
  if (!['plantedRound', 'growth', 'age', 'work'].every(k => isCount(p[k]))) return `plot ${i} has a bad counter`;
  if (!isObject(p.seen) || !['nap', 'jog', 'zoom'].every(k => isCount(p.seen[k]))) return `plot ${i} has a bad mood count`;
  return null;
}

/** Everything wrong with a saved state; an empty list means it is safe to load. */
export function validateState(s) {
  if (!isObject(s)) return ['the save is not an object'];
  const out = [];
  if (s.v !== 2 && s.v !== 3) out.push(`unknown save version ${s.v}`);
  if (!Array.isArray(s.plots) || s.plots.length !== MAX_PLOTS) out.push('wrong number of plots');
  else s.plots.forEach((p, i) => { if (p !== null) { const bad = plantProblem(p, i); if (bad) out.push(bad); } });
  if (!Number.isInteger(s.open) || s.open < START_PLOTS || s.open > MAX_PLOTS) out.push('wrong number of open plots');
  if (s.processed !== null && !(Number.isInteger(s.processed) && s.processed >= 0)) out.push('bad processed round');
  if (!Number.isInteger(s.season)) out.push('bad season');
  for (const k of ['seasonScore', 'best', 'harvests', 'pips', 'xp', 'cloches', 'waterAt']) if (!isCount(s[k])) out.push(`bad ${k}`);
  if (!isObject(s.herb)) out.push('bad herbarium');
  if (!isObject(s.ach)) out.push('bad achievements');
  if (!Array.isArray(s.log)) out.push('bad diary');
  return out;
}

const parse = raw => { try { return JSON.parse(raw); } catch (_) { return undefined; } };

export const migrateV2 = s => ({ ...s, v: 3 });

/** Writes through a temporary key and reads it back, so a failed write never replaces a good save. */
function commitV3(storage, state) {
  const raw = JSON.stringify(state);
  storage.setItem(KEY_TMP, raw);
  if (storage.getItem(KEY_TMP) !== raw) throw new Error('The save did not read back correctly.');
  storage.setItem(KEY_V3, raw);
  storage.removeItem(KEY_TMP);
}

function keysWith(storage, prefix) {
  const out = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(prefix)) out.push(k); }
  return out;
}

/** An untouched copy of the v2 text. Reloading never makes a second copy of the same save. */
function backupV2(storage, raw, now) {
  const same = keysWith(storage, BACKUP_V2).find(k => storage.getItem(k) === raw);
  if (same) return same;
  const key = BACKUP_V2 + now;
  storage.setItem(key, raw);
  return key;
}

/** The garden to play, plus what happened on the way: { state, report }. */
export function loadSave(storage, blank, now = Date.now()) {
  const report = { source: 'new', migrated: false, backup: null, problems: [] };
  if (!storage) return { state: blank(), report: { ...report, source: 'memory' } };
  try {
    const rawV3 = storage.getItem(KEY_V3);
    if (rawV3 !== null) {
      const s = parse(rawV3), bad = s === undefined ? ['the v3 save is not JSON'] : validateState(s);
      if (!bad.length && s.v === 3) return { state: s, report: { ...report, source: 'v3' } };
      storage.setItem(QUARANTINE + now, rawV3);
      report.problems.push(...bad);
    }
    const rawV2 = storage.getItem(KEY_V2);
    if (rawV2 === null) return { state: blank(), report };
    report.backup = backupV2(storage, rawV2, now);
    const s = parse(rawV2), bad = s === undefined ? ['the v2 save is not JSON'] : validateState(s);
    if (bad.length || s.v !== 2) {
      report.problems.push(...bad);
      return { state: blank(), report: { ...report, source: 'corrupt' } };
    }
    const state = migrateV2(s);
    commitV3(storage, state);
    return { state, report: { ...report, source: 'v2', migrated: true } };
  } catch (e) {
    report.problems.push(String(e.message || e));
    return { state: blank(), report: { ...report, source: 'memory' } };
  }
}

export function writeSave(storage, state) {
  if (!storage) return false;
  try { storage.setItem(KEY_V3, JSON.stringify(state)); return true; } catch (_) { return false; }
}

/** Sets the v3 save aside so the next load migrates from the untouched v2 save again. */
export function rollbackV3(storage, now = Date.now()) {
  const raw = storage.getItem(KEY_V3);
  if (raw === null) return null;
  const key = BACKUP_V3 + now;
  storage.setItem(key, raw);
  storage.removeItem(KEY_V3);
  return key;
}

export const exportSave = (state, now = Date.now()) => JSON.stringify({ format: EXPORT_FORMAT, version: 3, exportedAt: new Date(now).toISOString(), state }, null, 2);

/** A checked v3 state from an exported file or a bare v2/v3 save. Throws a readable error. */
export function parseImport(text) {
  const d = parse(text);
  if (d === undefined) throw new Error('That file is not JSON.');
  const s = isObject(d) && d.format === EXPORT_FORMAT ? d.state : d;
  const bad = validateState(s);
  if (bad.length) throw new Error(`That save can't be used: ${bad[0]}.`);
  return s.v === 2 ? migrateV2(s) : s;
}

/** Replaces the current garden, keeping a copy of it first. */
export function applyImport(storage, state, now = Date.now()) {
  const current = storage.getItem(KEY_V3);
  if (current !== null) storage.setItem(BACKUP_V3 + now, current);
  commitV3(storage, state);
}
