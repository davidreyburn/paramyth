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

// `fx, fy` is where the body is coming FROM, when known. A body that already
// overlaps an obstacle — you put a table down on your own tile — may still
// move, so long as the move takes it no deeper into that obstacle. Without
// this every position inside the box is blocked, including the ones that lead
// out, and you are stuck in your own furniture. Off a table, never onto it.
export function blocked(grid, bodies, x, y, fx, fy) {
  const x0 = Math.floor((x - HALF) / (TILE*UNITS)), x1 = Math.floor((x + HALF - 1) / (TILE*UNITS));
  const y0 = Math.floor((y - HALF) / (TILE*UNITS)), y1 = Math.floor((y + HALF - 1) / (TILE*UNITS));
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (isSolid(grid, tx, ty)) return true;

  // Objects are smaller than the squares they sit on, so they collide as boxes
  // of their own size rather than claiming a whole tile.
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (Math.abs(x - b.cx) < b.f + HALF && Math.abs(y - b.cy) < b.f + HALF) {
      const inside = fx !== undefined && Math.abs(fx - b.cx) < b.f + HALF && Math.abs(fy - b.cy) < b.f + HALF;
      const deeper = Math.abs(x - b.cx) < Math.abs(fx - b.cx) || Math.abs(y - b.cy) < Math.abs(fy - b.cy);
      if (!inside || deeper) return true;
    }
  }
  return false;
}

// Move as far as the geometry allows, one axis at a time, so a body that cannot
// go diagonally still slides along the wall it is pressed against. Returns the
// position it reached; it never returns a fractional one.
export function slide(grid, bodies, x, y, dx, dy) {
  let nx = x, ny = y;
  if (dx && !blocked(grid, bodies, nx + dx, ny, nx, ny)) nx += dx;
  if (dy && !blocked(grid, bodies, nx, ny + dy, nx, ny)) ny += dy;
  return { x: nx, y: ny };
}

// Actors are bodies too. Until now `blocked()` walked walls and barrels and
// nothing else, so the dog's move was never tested against the player — which
// is why it walked INTO you. Every actor is a HALF-extent box; a mover passes
// everyone but itself. Never cached: they move every tick.
export const PLAYER_ID = 'player';
export function actorBodies(s, exceptId) {
  const out = [];
  if (exceptId !== PLAYER_ID) out.push({ cx: s.x, cy: s.y, f: HALF, id: PLAYER_ID });
  for (const f of s.foes) if (f.id !== exceptId) out.push({ cx: f.x, cy: f.y, f: HALF, id: f.id });
  return out;
}

// Contact is TOUCHING, not overlap. Two bodies that cannot overlap stop just
// short of 2·HALF apart on the axis of approach, so an overlap test would never
// fire again and the dog would be silently harmless. The margin covers one
// movement step plus a little.
export const TOUCH = 2 * UNITS;
export const touching = (ax, ay, bx, by) =>
  Math.abs(ax - bx) < 2 * HALF + TOUCH && Math.abs(ay - by) < 2 * HALF + TOUCH;

// Knockback. A `knock` is a DISTANCE in px: how far a shove carries a body of
// weight 1 with nothing in the way. The velocity that produces it decays by
// KNOCK_DECAY each tick, so the total travel is the geometric series
// v0 * den/(den-num); solving for v0 gives the impulse. Weight divides it.
// Integer throughout; a rooted foe (weight Infinity) gets zero and stays put.
export const KNOCK_DECAY = [3, 4];
export function impulse(knock, weight) {
  if (!(weight > 0) || weight === Infinity) return 0;
  return ((knock * UNITS * (KNOCK_DECAY[1] - KNOCK_DECAY[0])) / (KNOCK_DECAY[1] * weight)) | 0;
}
export function decay(v) {
  const n = ((v * KNOCK_DECAY[0]) / KNOCK_DECAY[1]) | 0;
  return Math.abs(n) < UNITS >> 3 ? 0 : n;
}

// One tick of a shove in flight, for anything with x, y, vx, vy. Walls and
// bodies stop it through `slide()`, and a component that was stopped is
// zeroed. `slammed` reports that: it is the wall-slam hook (backlog 12) and is
// not acted on yet. Returns null when nothing is in flight.
export function carry(grid, bodies, b) {
  if (!b.vx && !b.vy) return null;
  const to = slide(grid, bodies, b.x, b.y, b.vx, b.vy);
  const fullX = to.x === b.x + b.vx, fullY = to.y === b.y + b.vy;
  return { x: to.x, y: to.y, vx: fullX ? decay(b.vx) : 0, vy: fullY ? decay(b.vy) : 0,
           slammed: (!!b.vx && !fullX) || (!!b.vy && !fullY) };
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
