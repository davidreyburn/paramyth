// L3: the delta. The only mutable thing in the program.
// Positions are integers in subpixel UNITS, never floats — so the whole
// movement path is exact arithmetic and replay holds on any device.

import { roomTiles, floorPlan, COLS, ROWS, TILE, T } from '../core/gen.js';

export const UNITS = 256;
export const px = (u) => u / UNITS;

export function spawnIn(seed, site, floor, room) {
  const { grid, reach } = roomTiles(seed, site, floor, room);
  const cx = COLS >> 1, cy = ROWS >> 1;
  for (let r = 0; r < Math.max(COLS, ROWS); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 1 || y < 1 || x >= COLS-1 || y >= ROWS-1) continue;
      if (grid[y*COLS + x] === T.FLOOR && reach[y*COLS + x])
        return { x: (x*TILE + TILE/2) * UNITS, y: (y*TILE + TILE/2) * UNITS };
    }
  }
  return { x: cx*TILE*UNITS, y: cy*TILE*UNITS };
}

export function createState(seed) {
  seed = seed >>> 0;
  // You start in the camp, above the mausoleum, as the campaign itself begins.
  const site = 0, floor = -1;
  const room = 0;
  const p = spawnIn(seed, site, floor, room);
  return {
    seed, tick: 0,
    site, floor, room,
    x: p.x, y: p.y,
    facing: 2, moving: false,
    lamp: 112 * UNITS,
    lastFrame: 0,
    moves: 0,          // room transitions, so the HUD can show progress
    scrap: 0,          // the only currency
    stash: [],         // what is left in camp
    carried: [],       // item kinds, in the order taken
    taken: [],         // keys of contents removed from the world
    opened: [],        // keys of containers opened
    screen: '',        // '' | 'pack' | 'container'
    screenKey: '',     // which container, when screen is 'container'
    cur: 0,            // grid cursor
    side: 0,           // 0 container, 1 pack
  };
}

export function hashState(s) {
  let h = 0x811c9dc5;
  const mix = (v) => { v = v >>> 0; for (let i = 0; i < 4; i++) { h ^= (v >>> (i*8)) & 0xff; h = Math.imul(h, 0x01000193); } };
  mix(s.seed); mix(s.tick); mix(s.x); mix(s.y); mix(s.facing);
  mix(s.moving ? 1 : 0); mix(s.site); mix(s.floor); mix(s.room); mix(s.moves);
  const roll = (arr) => { mix(arr.length); for (const v of arr) for (let i = 0; i < v.length; i++) mix(v.charCodeAt(i)); };
  roll(s.carried); roll(s.taken); roll(s.opened); roll(s.stash);
  mix(s.scrap);
  mix(s.cur); mix(s.side); roll([s.screen, s.screenKey]);
  return h >>> 0;
}
