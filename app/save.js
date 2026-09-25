// L5: saves. Three slots in localStorage. A save is the delta — every field of
// the state that does not begin with an underscore — plus the version that
// wrote it and a schema number that changes only when the delta's SHAPE does.
//
// The frame log is deliberately NOT the save. It is the bug-report format:
// four bytes a tick, 400 KiB an hour. The delta is a few hundred bytes and it
// is what specs/spec-layer-contract.md always said the save was.
//
// localStorage can throw (private windows, cleared site data) and can come back
// empty. Every touch is wrapped, and the game runs without it.

import { createState, toDelta } from '../sim/state.js';
import { enterRoom } from '../sim/step.js';
import { VERSION } from '../core/version.js';
import { placeLabel } from '../sim/record.js';

export const SLOT_COUNT = 3;
// Bump when the delta's shape changes incompatibly. A mismatched save is shown
// as "older" and can be deleted; it is never silently reinterpreted.
export const SCHEMA = 1;

const KEY = (n) => `paramyth.slot.${n}`;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export function readSlot(n) {
  const raw = store.get(KEY(n));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { bad: true }; }
}

export function writeSlot(n, s) {
  return store.set(KEY(n), JSON.stringify({
    version: VERSION, schema: SCHEMA, saved: Date.now(), delta: toDelta(s),
  }));
}

export function clearSlot(n) { store.del(KEY(n)); }

export const compatible = (save) => !!save && !save.bad && save.schema === SCHEMA && !!save.delta;

// What the title screen prints for a slot.
export function summarize(save) {
  if (!compatible(save)) return null;
  const d = save.delta;
  return {
    scrap: d.scrap || 0,
    deaths: d.deaths || 0,
    moves: d.moves || 0,
    where: d.floor < 0 ? (d.room === 0 ? 'in camp' : 'on the Field') : `at ${placeLabel(`${d.site}:${d.floor}:${d.room}`)}`,
    version: save.version,
  };
}

// A fresh state from a save. createState supplies every default, the delta
// overwrites what it has, and the room's live roster is rebuilt — it is delta
// too, but rebuilding is what enterRoom is for and it keeps `foes` honest if a
// save predates a foe kind.
// Three stats were renamed on 2026-09-25 (Finesse → Swift, Keen → Insight,
// Bearing → Charm). A run in progress keeps its numbers under the new names.
const RENAMED = { finesse: 'swift', keen: 'insight', bearing: 'charm' };
export function migrate(d) {
  if (d && d.stats) for (const [old, now] of Object.entries(RENAMED))
    if (old in d.stats) { if (!(now in d.stats)) d.stats[now] = d.stats[old]; delete d.stats[old]; }
  return d;
}

export function restore(save) {
  const d = migrate(save.delta);
  const s = createState(d.seed >>> 0);
  Object.assign(s, d);
  enterRoom(s);
  return s;
}

// A new world for an empty slot. The seed is stored in the save; nothing about
// determinism depends on how it was chosen.
export const freshSeed = (n) => ((Date.now() ^ Math.imul(n + 1, 0x9e3779b9)) >>> 0) || 1;

export function listSlots() {
  const out = [];
  for (let n = 0; n < SLOT_COUNT; n++) {
    const save = readSlot(n);
    out.push({ n, save, summary: summarize(save), bad: !!save && !compatible(save) });
  }
  return out;
}

// When to write. Not on a timer and not every tick: at the moments that are
// natural checkpoints — a room crossed, a screen closed, a death, a sale. This
// stamp changes at exactly those moments and nowhere else.
export const checkpoint = (s) =>
  `${s.moves}|${s.deaths || 0}|${s.scrap}|${s.screen ? 1 : 0}|${s.stash.length}|${s.known.length}|${s.floor}`;
