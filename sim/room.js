// L3: the room as you find it. What is lying here, what you walk around,
// the grid with what the caps have done to it, what is within reach, and where
// a thing you let go of lands. Shared by apply and by the renderer, so the
// prompt and the action can never disagree about what you are standing next to.
//
// One of four files that were `sim/interact.js` until 2026-09-25, when it had
// grown to six questions in one place. This one answers: what is HERE?

import { contentsOf, insideOf, roomTiles, groundTile, FIELD_CAMP, COLS, ROWS, TILE, T } from '../core/gen.js';
import { campStations } from '../core/camp.js';
import { isContainer, footOf, verbFor } from '../core/items.js';
import { UNITS } from './state.js';

const REACH = 1;                                  // tiles, Chebyshev

export const keyAt = (site, floor, room, slot, idx) =>
  idx === undefined ? `${site}:${floor}:${room}:${slot}` : `${site}:${floor}:${room}:${slot}.${idx}`;
export const keyOf = (s, slot, idx) => keyAt(s.site, s.floor, s.room, slot, idx);

// What is lying in ANY room, from the lists alone: the generator's contents
// minus what was taken, plus what was put down there. Uncached; `roomView`
// is the cached form for the room you are in. A cap set in a room you have
// since left still has to know what it is about to break.
export function thingsIn(s, site, floor, room, taken = new Set(s.taken), opened = new Set(s.opened)) {
  const out = [];
  for (const c of contentsOf(s.seed, site, floor, room)) {
    const k = keyAt(site, floor, room, c.slot);
    if (!taken.has(k)) out.push({ ...c, key: k, open: opened.has(k) });
  }
  for (const d of s.dropped)
    if (d.site === site && d.floor === floor && d.room === room)
      out.push({ slot: -1, tile: d.tile, kind: d.kind, key: d.key, dropped: true });
  return out;
}

// ONE VIEW PER TICK. What is in this room — the things still lying here, and
// the boxes you walk around — computed once and cached on a transient field.
//
// It used to be rebuilt five times a tick, each time turning `taken` and
// `opened` (lists that grow for the life of a save) into fresh Sets. The cache
// is valid while nothing that changes the room's contents has changed, and
// every such change alters one of three list lengths — so validity is a string
// compare and needs no invalidation calls. plans/review-2026-09-24.md.
export function roomView(s) {
  const stamp = `${s.site}|${s.floor}|${s.room}|${s.taken.length}|${s.opened.length}|${s.dropped.length}|${s.broken.length}|${s.scars.length}`;
  const v = s._view;
  if (v && v.stamp === stamp) return v;

  const taken = new Set(s.taken), opened = new Set(s.opened);
  // What is here, and what you put down. A dropped thing keeps its own
  // address, so its whole history follows it across the world — which is
  // what `inherit` will need when a corpse starts writing provenance.
  const visible = thingsIn(s, s.site, s.floor, s.room, taken, opened);

  const bodies = [];
  for (const c of visible) {
    const f = footOf(c.kind);
    if (!f) continue;
    const tx = c.tile % COLS, ty = (c.tile / COLS) | 0;
    bodies.push({ cx: (tx * TILE + TILE / 2) * UNITS, cy: (ty * TILE + TILE / 2) * UNITS, f: f * UNITS, tile: c.tile });
  }

  // The grid, with what the caps have done to it. The generator's grid is
  // pure and untouched; this is the one everything that walks or draws uses.
  const pure = roomTiles(s.seed, s.site, s.floor, s.room).grid;
  const here = `${s.site}:${s.floor}:${s.room}:`;
  let grid = pure;
  for (const k of s.broken) {
    if (!k.startsWith(here)) continue;
    if (grid === pure) grid = pure.slice();
    grid[Number(k.slice(here.length))] = T.FLOOR;
  }

  // Where furniture was blasted, as tiles of this room. The floor, remembered.
  const scars = new Set();
  for (const k of s.scars) if (k.startsWith(here)) scars.add(Number(k.slice(here.length)));

  s._view = { stamp, taken, opened, visible, bodies, grid, scars };
  return s._view;
}

export const visible = (s) => roomView(s).visible;
export const gridOf = (s) => roomView(s).grid;

// Where a thing you let go of lands: the tile under you, or the nearest free
// floor to it, searched in rings so the result is the same every replay.
export function dropTile(s) {
  const { grid } = roomTiles(s.seed, s.site, s.floor, s.room);
  const used = new Set(roomView(s).visible.map((c) => c.tile));
  const tx = Math.floor(s.x / (TILE * UNITS)), ty = Math.floor(s.y / (TILE * UNITS));
  const free = (x, y) => {
    if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) return false;
    const i = y * COLS + x;
    return groundTile(grid[i]) && !used.has(i);
  };
  for (let r = 0; r < Math.max(COLS, ROWS); r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(tx + dx, ty + dy)) return (ty + dy) * COLS + (tx + dx);
      }
  return -1;
}

// What is still inside a container. Contents stay in it until taken — spilling
// them across the floor made an opened chest look like it had done nothing.
export function containerItems(s, key) {
  const slot = Number(String(key).split(':')[3]);
  const { taken } = roomView(s);
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

// A station you are standing at. Camp only, and reachable from a tile away so
// you do not have to stand exactly on the counter.
export function stationAt(s) {
  if (s.floor >= 0 || s.room !== FIELD_CAMP) return null;   // the camp's counters are in the camp
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
