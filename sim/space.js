// L3: space. Where a body may stand, and how far it gets when it tries to move.
//
// This lives apart from `step.js` for one structural reason: an L4 system has to
// move things too, and `step.js` imports the systems list. A system reaching
// back into `step.js` for collision would close a cycle — the exact "small
// reasonable convenience" that `specs/spec-layer-contract.md` names as how a
// module becomes permanent. Both sides import this instead.
//
// Everything here is integer arithmetic in subpixel UNITS. No float enters the
// simulation path, which is what makes replay hold across devices.

import { UNITS } from './state.js';
import { isSolid, COLS, ROWS, TILE } from '../core/gen.js';
import { roomView } from './interact.js';
import { isSolidItem } from '../core/items.js';

// The half-extent of a walking body, in subpixel units. Player and foe share it:
// two things that move through the same doorways should measure the same.
export const HALF = 5 * UNITS;

export function blocked(grid, bodies, x, y) {
  const x0 = Math.floor((x - HALF) / (TILE*UNITS)), x1 = Math.floor((x + HALF - 1) / (TILE*UNITS));
  const y0 = Math.floor((y - HALF) / (TILE*UNITS)), y1 = Math.floor((y + HALF - 1) / (TILE*UNITS));
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (isSolid(grid, tx, ty)) return true;

  // Objects are smaller than the squares they sit on, so they collide as boxes
  // of their own size rather than claiming a whole tile.
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (Math.abs(x - b.cx) < b.f + HALF && Math.abs(y - b.cy) < b.f + HALF) return true;
  }
  return false;
}

// Move as far as the geometry allows, one axis at a time, so a body that cannot
// go diagonally still slides along the wall it is pressed against. Returns the
// position it reached; it never returns a fractional one.
export function slide(grid, bodies, x, y, dx, dy) {
  let nx = x, ny = y;
  if (dx && !blocked(grid, bodies, nx + dx, ny)) nx += dx;
  if (dy && !blocked(grid, bodies, nx, ny + dy)) ny += dy;
  return { x: nx, y: ny };
}

// Tile coordinates of a subpixel position. One definition, because three
// different roundings of the same idea is how a prompt and a button disagree.
export const tileOf = (x, y) => [Math.floor(x / (TILE*UNITS)), Math.floor(y / (TILE*UNITS))];
export const centreOf = (tile) =>
  ({ x: ((tile % COLS) * TILE + TILE/2) * UNITS, y: (((tile / COLS) | 0) * TILE + TILE/2) * UNITS });
export const inBounds = (tx, ty) => tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS;

// What you walk around, as boxes. Taken items stop blocking, so this is derived
// from the delta and never cached. It lives here rather than in `step.js`
// because a foe has to walk around the same barrels the player does.
export const solidBodies = (s) => roomView(s).bodies;

// The generator still reasons in whole tiles, which is deliberately stricter
// than collision: being conservative about sealing a way out is correct.
export function solidTiles(s) {
  const out = new Set();
  for (const c of roomView(s).visible) if (isSolidItem(c.kind)) out.add(c.tile);
  return out;
}
