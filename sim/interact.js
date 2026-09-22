// What can be reached, and what the toast should say about it.
// Shared by apply and by the renderer, so the prompt and the action can never
// disagree about what you are standing next to.

import { contentsOf, insideOf, roomTiles, COLS, ROWS, TILE, T } from '../core/gen.js';
import { campStations, STATION } from '../core/camp.js';
import { KIND, isContainer, isPortable, bulkOf, valueOf, verbFor } from '../core/items.js';
import { UNITS } from './state.js';

export const BULK_BUDGET = 20;
export const PACK_COLS = 6, PACK_ROWS = 4;
export const CONT_COLS = 4, CONT_ROWS = 3;
export const STASH_COLS = 6, STASH_ROWS = 4;
export const STASH_SLOTS = STASH_COLS * STASH_ROWS;
const REACH = 1;                                  // tiles, Chebyshev

export const keyOf = (s, slot, idx) =>
  idx === undefined ? `${s.site}:${s.floor}:${s.room}:${slot}`
                    : `${s.site}:${s.floor}:${s.room}:${slot}.${idx}`;

export const carriedBulk = (s) => s.carried.reduce((n, k) => n + bulkOf(k), 0);

export function tier(bulk) {
  if (bulk <= 8) return 'light';
  if (bulk <= 16) return 'laden';
  return 'overloaded';
}

// Everything in this room that still exists: placed contents that have not been
// taken, plus whatever an opened container spilled.
export function visible(s) {
  const out = [];
  const taken = new Set(s.taken), opened = new Set(s.opened);

  for (const c of contentsOf(s.seed, s.site, s.floor, s.room)) {
    const k = keyOf(s, c.slot);
    if (!taken.has(k)) out.push({ ...c, key: k, open: opened.has(k) });
  }
  return out;
}

// What is still inside a container. Contents stay in it until taken — spilling
// them across the floor made an opened chest look like it had done nothing.
export function containerItems(s, key) {
  const slot = Number(String(key).split(':')[3]);
  const taken = new Set(s.taken);
  return insideOf(s.seed, s.site, s.floor, s.room, slot)
    .map((it) => ({ ...it, key: keyOf(s, it.slot, it.idx) }))
    .filter((it) => !taken.has(it.key));
}

// The nearest thing with a verb, within reach.
export function reachable(s) {
  const px = Math.floor(s.x / (TILE * UNITS)), py = Math.floor(s.y / (TILE * UNITS));
  let best = null, bd = Infinity;

  for (const c of visible(s)) {
    if (isContainer(c.kind) && c.open && !containerItems(s, c.key).length) continue;  // open and empty
    if (!verbFor(c.kind)) continue;                     // a fixture has no verb
    const cx = c.tile % COLS, cy = (c.tile / COLS) | 0;
    const d = Math.max(Math.abs(cx - px), Math.abs(cy - py));
    if (d > REACH) continue;
    const t = Math.abs(cx - px) + Math.abs(cy - py);
    if (t < bd) { bd = t; best = c; }
  }
  return best;
}

// The stair you are standing on. It outranks anything lying beside it: an item
// dropped next to a staircase used to capture the button entirely, which is how
// a descent became a one-way trip.
export function stairUnder(s) {
  const { grid } = roomTiles(s.seed, s.site, s.floor, s.room);
  const tx = Math.floor(s.x / (TILE * UNITS)), ty = Math.floor(s.y / (TILE * UNITS));
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
  const t = grid[ty * COLS + tx];
  return t === T.STAIR_D ? 'down' : t === T.STAIR_U ? 'up' : null;
}

export const haulValue = (s) => s.carried.reduce((n, k) => n + valueOf(k), 0);

// A station you are standing at. Camp only, and reachable from a tile away so
// you do not have to stand exactly on the counter.
export function stationAt(s) {
  if (s.floor >= 0) return null;
  const px = Math.floor(s.x / (TILE * UNITS)), py = Math.floor(s.y / (TILE * UNITS));
  let best = null, bd = Infinity;
  for (const st of campStations()) {
    const cx = st.tile % COLS, cy = (st.tile / COLS) | 0;
    const d = Math.max(Math.abs(cx - px), Math.abs(cy - py));
    if (d > 1) continue;
    const t = Math.abs(cx - px) + Math.abs(cy - py);
    if (t < bd) { bd = t; best = st; }
  }
  return best;
}

// The toast line. One button, one verb, and the one refusal that matters.
export function prompt(s) {
  const station = stationAt(s);
  if (station) {
    if (station.kind === STATION.QUARTERMASTER) {
      const v = haulValue(s);
      return v > 0
        ? { text: `Sell salvage \u2014 ${v} scrap`, station }
        : { text: 'Nothing to sell', refuse: true, station };
    }
    if (station.kind === STATION.STASH) return { text: 'Open stash', station };
    if (station.kind === STATION.APPRAISER) return { text: 'The appraiser is not in', refuse: true, station };
  }

  const st = stairUnder(s);
  if (st) return { text: st === 'down' ? 'Descend' : 'Ascend', stair: st };
  const c = reachable(s);
  if (!c) return null;
  if (isPortable(c.kind) && carriedBulk(s) + bulkOf(c.kind) > BULK_BUDGET)
    return { text: `Too heavy — drop something first`, refuse: true, target: c };
  if (isContainer(c.kind) && c.open) return { text: `Search ${KIND[c.kind].label}`, target: c };
  return { text: verbFor(c.kind), target: c };
}
