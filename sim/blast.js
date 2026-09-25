// L3: the Blasting Cap. Setting one is a player verb; the fuse, the break and
// the hurt are world physics, so they live here beside `carry()` and not in a
// system. A build with no systems can still blow a wall open — it just has
// nothing to blow up.
//
// A blast is a SQUARE, like the swing's box: integer, axis-aligned, and drawn
// exactly as tested. It lingers for `linger` ticks and hurts each body once.

import { UNITS, PLAYER_WEIGHT } from './state.js';
import { blastOf, forceOn, isContainer, isPortable } from '../core/items.js';
import { roomView, thingsIn, keyAt } from './room.js';
import { FACE } from './carry.js';
import { impulse, steer, PLAYER_ID } from './space.js';
import { roomTiles, insideOf, T, COLS, ROWS, TILE, solidTile } from '../core/gen.js';
import { hchance } from '../core/addr.js';
import { FOE } from '../core/foes.js';

export const brokenKey = (site, floor, room, tile) => `${site}:${floor}:${room}:${tile}`;
// A key is a string; the hash wants numbers. Folded the same way every time.
const fold = (key) => { let k = 0; for (let i = 0; i < key.length; i++) k = (Math.imul(k, 31) + key.charCodeAt(i)) | 0; return k; };
export const SURVIVOR_ODDS = [1, 3];              // one broken container in three leaves one thing
export const inBlast = (b, x, y) => Math.abs(x - b.x) <= b.r && Math.abs(y - b.y) <= b.r;
export const liveBlasts = (s) => s.blasts.filter((b) => b.site === s.site && b.floor === s.floor && b.room === s.room);
export const capsHere = (s) => s.charges.filter((c) => c.site === s.site && c.floor === s.floor && c.room === s.room);

// Where a cap goes: one tile ahead, the way the swing goes — or at your feet
// when the tile ahead is solid, which it usually is when you want one.
export function plantAt(s) {
  const [fx, fy] = FACE[s.facing];
  const grid = roomView(s).grid;
  const x = s.x + fx * TILE * UNITS, y = s.y + fy * TILE * UNITS;
  const tx = Math.floor(x / (TILE * UNITS)), ty = Math.floor(y / (TILE * UNITS));
  const ahead = tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS && !solidTile(grid[ty * COLS + tx]);
  return ahead ? { x, y } : { x: s.x, y: s.y };
}

export function plant(s, ref) {
  const p = plantAt(s);
  s.charges.push({ kind: ref.kind, key: ref.key, site: s.site, floor: s.floor, room: s.room, x: p.x, y: p.y, at: s.tick });
}

// What a blast does to the THINGS in it, on the tick it goes. Per
// plans/blast-interactions.md: what `force` breaks is destroyed — taken and
// never dropped, so it keeps its key and the record can still speak of it. A
// chest stands. Furniture and containers leave a scar on their tile. A broken
// container rolls once, keyed to itself so replay agrees, and one time in
// three leaves its first thing lying where it stood, history intact.
function breakThings(s, c, r) {
  const taken = new Set(s.taken);
  for (const it of thingsIn(s, c.site, c.floor, c.room, taken)) {
    const cx = ((it.tile % COLS) * TILE + TILE / 2) * UNITS, cy = (((it.tile / COLS) | 0) * TILE + TILE / 2) * UNITS;
    if (Math.abs(cx - c.x) > r || Math.abs(cy - c.y) > r) continue;
    if (forceOn(it.kind) !== 'breaks') continue;

    // Your remains, contents and all. The entry stays (its index is its key)
    // but it is gone from every room, and the floor remembers where it lay.
    if (it.remains !== undefined) {
      const r = s.remains[it.remains];
      if (r) { r.items = []; r.gone = true; }
      const k = brokenKey(c.site, c.floor, c.room, it.tile);
      if (!s.scars.includes(k)) s.scars.push(k);
      continue;
    }

    if (it.dropped) {
      const i = s.dropped.findIndex((d) => d.key === it.key && d.tile === it.tile && d.site === c.site && d.floor === c.floor && d.room === c.room);
      if (i >= 0) s.dropped.splice(i, 1);
    } else if (!taken.has(it.key)) { s.taken.push(it.key); taken.add(it.key); }

    if (isContainer(it.kind)) {
      // Its contents: one may survive; the rest are gone, and go to `taken` so
      // a trove stops advertising what a cap has already destroyed.
      const inside = insideOf(s.seed, c.site, c.floor, c.room, it.slot)
        .map((x) => ({ ...x, key: keyAt(c.site, c.floor, c.room, x.slot, x.idx) }))
        .filter((x) => !taken.has(x.key));
      const spared = inside.length && hchance(SURVIVOR_ODDS[0], SURVIVOR_ODDS[1], s.seed, fold(it.key), 0xb1a5) ? inside[0] : null;
      for (const x of inside) {
        if (!taken.has(x.key)) { s.taken.push(x.key); taken.add(x.key); }
        if (x === spared) s.dropped.push({ kind: x.kind, key: x.key, site: c.site, floor: c.floor, room: c.room, tile: it.tile });
      }
    }
    // The floor remembers furniture and pottery; a coin does not scorch stone.
    if (!isPortable(it.kind)) {
      const k = brokenKey(c.site, c.floor, c.room, it.tile);
      if (!s.scars.includes(k)) s.scars.push(k);
    }
  }
}

// One tick of fuses and blasts. `apply` is applyAction, handed in so this file
// does not import step.js (which imports it).
export function fuseStep(s, apply) {
  for (let i = s.charges.length - 1; i >= 0; i--) {
    const c = s.charges[i];
    const def = blastOf(c.kind);
    if (!def) { s.charges.splice(i, 1); continue; }
    if (s.tick - c.at < def.fuse) continue;
    s.charges.splice(i, 1);
    const r = def.radius * UNITS;
    s.blasts.push({ x: c.x, y: c.y, r, at: s.tick, site: c.site, floor: c.floor, room: c.room,
                    damage: def.damage, knock: def.knock, self: def.self, linger: def.linger, hit: [] });
    // Rubble in reach becomes floor, in whichever room the cap was set. This
    // is the one thing in the game that changes the map, and it is a list of
    // tiles in the delta: the world stays pure, the change stays small.
    const { grid } = roomTiles(s.seed, c.site, c.floor, c.room);
    for (let t = 0; t < grid.length; t++) {
      if (grid[t] !== T.RUBBLE) continue;
      const cx = ((t % COLS) * TILE + TILE / 2) * UNITS, cy = (((t / COLS) | 0) * TILE + TILE / 2) * UNITS;
      if (Math.abs(cx - c.x) > r || Math.abs(cy - c.y) > r) continue;
      const k = brokenKey(c.site, c.floor, c.room, t);
      if (!s.broken.includes(k)) s.broken.push(k);
    }
    breakThings(s, c, r);
  }

  for (let i = s.blasts.length - 1; i >= 0; i--) {
    const b = s.blasts[i];
    if (s.tick - b.at >= b.linger) { s.blasts.splice(i, 1); continue; }
    if (b.site !== s.site || b.floor !== s.floor || b.room !== s.room) continue;
    // Each body once, however long it lingers: the linger is a window for
    // walking INTO it, not a shredder for standing in it.
    for (const f of s.foes) {
      if (b.hit.includes(f.id) || !inBlast(b, f.x, f.y)) continue;
      b.hit.push(f.id);
      const [vx, vy] = steer(f.x - b.x, f.y - b.y, impulse(b.knock, (FOE[f.kind] || {}).weight || 1));
      apply({ k: 'hurtFoe', id: f.id, n: b.damage });
      apply({ k: 'shoveFoe', id: f.id, vx, vy });
    }
    if (!b.hit.includes(PLAYER_ID) && inBlast(b, s.x, s.y)) {
      b.hit.push(PLAYER_ID);
      const [vx, vy] = steer(s.x - b.x, s.y - b.y, impulse(b.knock, PLAYER_WEIGHT));
      apply({ k: 'hurt', n: b.self, vx, vy });
    }
  }
}
