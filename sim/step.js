// L3: apply. The single mutation chokepoint.
// step(state, frame) is total and deterministic: same state + same frame,
// same result, forever, on every device.

import { VERB, hasVerb } from './frame.js';
import { UNITS, spawnIn } from './state.js';
import { roomTiles, floorPlan, floorCount, isSolid, COLS, ROWS, TILE, GW, T } from '../core/gen.js';
import { isContainer, isPortable, isSolidItem, footOf, bulkOf } from '../core/items.js';
import { reachable, stairUnder, stationAt, visible, carriedBulk, containerItems,
         haulValue, BULK_BUDGET, STASH_SLOTS,
         PACK_COLS, PACK_ROWS, CONT_COLS, CONT_ROWS, STASH_COLS } from './interact.js';
import { STATION } from '../core/camp.js';

const SPEED = 192, SPEED_DIAG = 136;
const SPRINT_NUM = 5, SPRINT_DEN = 3;
const HALF = 5 * UNITS;
const RW = COLS * TILE * UNITS, RH = ROWS * TILE * UNITS;

function blocked(grid, bodies, x, y) {
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

// What you walk around, as boxes. Taken items stop blocking, so this is derived
// from the delta and never cached.
export function solidBodies(s) {
  const out = [];
  for (const c of visible(s)) {
    const f = footOf(c.kind);
    if (!f) continue;
    const tx = c.tile % COLS, ty = (c.tile / COLS) | 0;
    out.push({
      cx: (tx * TILE + TILE / 2) * UNITS,
      cy: (ty * TILE + TILE / 2) * UNITS,
      f: f * UNITS,
      tile: c.tile,
    });
  }
  return out;
}

// The generator still reasons in whole tiles, which is deliberately stricter
// than collision: being conservative about sealing a way out is correct.
export function solidTiles(s) {
  const out = new Set();
  for (const c of visible(s)) if (isSolidItem(c.kind)) out.add(c.tile);
  return out;
}

const tileUnder = (grid, x, y) => {
  const tx = Math.floor(x / (TILE*UNITS)), ty = Math.floor(y / (TILE*UNITS));
  return tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS ? grid[ty*COLS + tx] : T.WALL;
};

// You arrive STANDING ON the stair that answers the one you took. Landing at
// the room's centre instead left you in the dark with no visible way back —
// the rooms were linked, the position was not.
function enterFloor(s, floor) {
  const down = floor > s.floor;
  const plan = floorPlan(s.seed, s.site, floor);
  const room = down ? plan.stairUp : plan.stairDown;
  s.floor = floor;
  s.room = room >= 0 ? room : plan.cells[0];

  const want = down ? T.STAIR_U : T.STAIR_D;
  const { grid } = roomTiles(s.seed, s.site, s.floor, s.room);
  let at = -1;
  for (let i = 0; i < grid.length; i++) if (grid[i] === want) { at = i; break; }

  if (at >= 0) {
    s.x = ((at % COLS) * TILE + TILE / 2) * UNITS;
    s.y = (((at / COLS) | 0) * TILE + TILE / 2) * UNITS;
  } else {
    const p = spawnIn(s.seed, s.site, s.floor, s.room);
    s.x = p.x; s.y = p.y;
  }
  s.moves++;
}

// While a screen is open the world is still; the only verbs are the grid's.
// Movement stays blocked so a transfer can never be half-made in transit.
function screenStep(s, frame) {
  const press = (v) => hasVerb(frame, v) && !hasVerb(s.lastFrame, v);
  const isStash = s.screen === 'stash';
  const cont = s.screen === 'container' ? containerItems(s, s.screenKey)
             : isStash ? s.stash.map((kind, i) => ({ kind, idx: i }))
             : [];
  const twoSided = s.screen === 'container' || isStash;
  if (!twoSided) s.side = 1;

  if (press(VERB.CANCEL) || press(VERB.DODGE) || press(VERB.MAP) || press(VERB.INVENTORY)) {
    s.screen = ''; s.screenKey = ''; s.cur = 0; s.side = 0; return;
  }

  const leftCols = isStash ? STASH_COLS : CONT_COLS;
  const list = () => (s.side === 0 ? cont : s.carried);
  const cols = () => (s.side === 0 ? leftCols : PACK_COLS);

  if (press(VERB.LEFT)) {
    if (s.side === 1 && twoSided && s.cur % PACK_COLS === 0) { s.side = 0; s.cur = 0; }
    else s.cur = Math.max(0, s.cur - 1);
  }
  if (press(VERB.RIGHT)) {
    const n = list().length;
    if (s.side === 0 && twoSided && (s.cur % leftCols === leftCols - 1 || s.cur >= n - 1)) { s.side = 1; s.cur = 0; }
    else s.cur = Math.min(Math.max(0, n - 1), s.cur + 1);
  }
  if (press(VERB.UP))   s.cur = Math.max(0, s.cur - cols());
  if (press(VERB.DOWN)) s.cur = Math.min(Math.max(0, list().length - 1), s.cur + cols());
  s.cur = Math.min(s.cur, Math.max(0, list().length - 1));

  const take = (it) => {
    if (carriedBulk(s) + bulkOf(it.kind) > BULK_BUDGET) return false;
    s.carried.push(it.kind); s.taken.push(it.key);
    return true;
  };

  // The stash moves BOTH ways; a container only gives.
  const toPack = (kind) => {
    if (carriedBulk(s) + bulkOf(kind) > BULK_BUDGET) return false;
    s.carried.push(kind); return true;
  };
  const toStash = (i) => {
    if (s.stash.length >= STASH_SLOTS) return false;
    s.stash.push(s.carried[i]); s.carried.splice(i, 1); return true;
  };

  if (press(VERB.INTERACT)) {
    if (s.side === 0 && cont[s.cur]) {
      if (isStash) { if (toPack(cont[s.cur].kind)) s.stash.splice(s.cur, 1); }
      else take(cont[s.cur]);
      const left = isStash ? s.stash.length : containerItems(s, s.screenKey).length;
      s.cur = Math.min(s.cur, Math.max(0, left - 1));
    } else if (s.side === 1 && isStash && s.carried[s.cur]) {
      toStash(s.cur);
      s.cur = Math.min(s.cur, Math.max(0, s.carried.length - 1));
    }
  }
  if (press(VERB.TOOL) && twoSided) {
    if (isStash) {
      if (s.side === 0) { while (s.stash.length && toPack(s.stash[0])) s.stash.shift(); }
      else { while (s.carried.length && toStash(0)); }
    } else {
      for (const it of cont) if (!take(it)) break;
    }
    s.cur = 0;
  }
}

export function step(s, frame) {
  if (s.screen) { screenStep(s, frame); s.lastFrame = frame; s.tick++; return s; }
  const solids = solidBodies(s);

  const grid = roomTiles(s.seed, s.site, s.floor, s.room).grid;

  const dx = (hasVerb(frame, VERB.RIGHT) ? 1 : 0) - (hasVerb(frame, VERB.LEFT) ? 1 : 0);
  const dy = (hasVerb(frame, VERB.DOWN) ? 1 : 0) - (hasVerb(frame, VERB.UP) ? 1 : 0);

  let speed = dx && dy ? SPEED_DIAG : SPEED;
  if (hasVerb(frame, VERB.SPRINT)) speed = ((speed * SPRINT_NUM) / SPRINT_DEN) | 0;

  s.moving = dx !== 0 || dy !== 0;
  if (s.moving) {
    if (dy < 0) s.facing = 0; else if (dx > 0) s.facing = 1;
    else if (dy > 0) s.facing = 2; else if (dx < 0) s.facing = 3;
  }

  const nx = s.x + dx * speed;
  if (dx && !blocked(grid, solids, nx, s.y)) s.x = nx;
  const ny = s.y + dy * speed;
  if (dy && !blocked(grid, solids, s.x, ny)) s.y = ny;

  // Leaving the room. The border is solid except where a link opens it, so
  // crossing the bounds is only possible through a real doorway.
  const plan = floorPlan(s.seed, s.site, s.floor);
  const go = (next, ax, val) => {
    if (!plan.cells.includes(next)) return false;
    s.room = next; s[ax] = val; s.moves++;
    return true;
  };
  if (s.x < 0)       go(s.room - 1,  'x', RW - HALF - UNITS) || (s.x = HALF);
  else if (s.x > RW) go(s.room + 1,  'x', HALF + UNITS)      || (s.x = RW - HALF);
  if (s.y < 0)       go(s.room - GW, 'y', RH - HALF - UNITS) || (s.y = HALF);
  else if (s.y > RH) go(s.room + GW, 'y', HALF + UNITS)      || (s.y = RH - HALF);

  // One button. The stair UNDER YOUR FEET outranks anything lying beside it —
  // the reverse order let a pot next to the stairs strand you on a floor.
  // This order must match `prompt()`, and a gate holds them together.
  const pressed = hasVerb(frame, VERB.INTERACT) && !hasVerb(s.lastFrame, VERB.INTERACT);
  if (pressed) {
    // A station first, then the stair underfoot, then whatever is beside you.
    const station = stationAt(s);
    const st = stairUnder(s);
    if (station && station.kind === STATION.QUARTERMASTER) {
      if (s.carried.length) { s.scrap += haulValue(s); s.carried.length = 0; }
    } else if (station && station.kind === STATION.STASH) {
      s.screen = 'stash'; s.screenKey = ''; s.cur = 0; s.side = 0;
    } else if (station && station.kind === STATION.APPRAISER) {
      /* not built yet */
    } else if (st === 'down' && s.floor + 1 < floorCount(s.seed, s.site)) enterFloor(s, s.floor + 1);
    else if (st === 'up' && s.floor > -1) enterFloor(s, s.floor - 1);
    else {
      const c = reachable(s);
      if (c && isContainer(c.kind)) {
        if (!s.opened.includes(c.key)) s.opened.push(c.key);
        s.screen = 'container'; s.screenKey = c.key; s.cur = 0; s.side = 0;
      } else if (c && isPortable(c.kind)) {
        if (carriedBulk(s) + bulkOf(c.kind) <= BULK_BUDGET) {
          s.carried.push(c.kind);
          s.taken.push(c.key);
        }
      }
    }
  }

  // Drop the load and run. The best button in the game.
  if (hasVerb(frame, VERB.DROP) && !hasVerb(s.lastFrame, VERB.DROP) && s.carried.length) {
    s.carried.length = 0;
  }

  // The pack, on its own button — Start on a pad, I on a keyboard. It toggles.
  if (hasVerb(frame, VERB.INVENTORY) && !hasVerb(s.lastFrame, VERB.INVENTORY)) {
    s.screen = 'pack'; s.cur = 0; s.side = 1;
  }

  s.lastFrame = frame;
  s.tick++;
  return s;
}
