// L3: apply. The single mutation chokepoint.
// step(state, frame) is total and deterministic: same state + same frame,
// same result, forever, on every device.

import { VERB, hasVerb } from './frame.js';
import { UNITS, spawnIn, MAX_HP, SWING_TICKS, swingPhase } from './state.js';
import { roomTiles, floorPlan, floorCount, CAMP, COLS, ROWS, TILE, GW, T } from '../core/gen.js';
import { isContainer, isPortable, isWeapon, bulkOf } from '../core/items.js';
import { reachable, stairUnder, stationAt, visible, carriedBulk, containerItems,
         haulValue, assessed, dropTile, tier, mostFragile, bestWeapon,
         APPRAISAL_FEE, BULK_BUDGET, STASH_SLOTS,
         PACK_COLS, PACK_ROWS, CONT_COLS, CONT_ROWS, STASH_COLS } from './interact.js';
import { blocked, solidBodies, solidTiles, HALF, centreOf } from './space.js';
import { hchance } from '../core/addr.js';
import { fragilityOf } from '../core/items.js';
import { foesOf, FOE } from '../core/foes.js';
import { STATION } from '../core/camp.js';
// NOTE: nothing here imports `systems/`. L3 must not read L4 — the tick loop in
// app/main.js owns the system list and hands it down, which is what makes
// `step(s, frame)` a complete, peaceful game on its own. A gate greps for this.

// Re-exported so the gates and the renderer keep their existing import site
// while the code itself lives in space.js, where a foe can reach it too.
export { solidBodies, solidTiles };

const SPEED = 192, SPEED_DIAG = 136;
const SPRINT_NUM = 5, SPRINT_DEN = 3;
const RW = COLS * TILE * UNITS, RH = ROWS * TILE * UNITS;

// The encumbrance table from design/combat-and-tools.md, which had never been
// implemented: `tier()` existed and changed nothing. It matters now, because it
// is the only reason a dog at speed 170 is frightening — light you outrun it,
// laden you do not. Integer ratios, so no float enters the movement path.
const LOAD = { light: [1, 1], laden: [4, 5], overloaded: [11, 20] };

// A hit rolls fragility/FRAGILE_DEN against the most fragile thing you carry.
// The denominator is the dial: at 8 an urn broke on roughly two hits in five,
// which made the cargo worth carrying impossible to bring home and turned every
// fight into a total loss. At 24 an urn is one-in-eight per hit — a real reason
// to avoid the fight, not a guarantee that fighting ruins the run.
const FRAGILE_DEN = 24;

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
  enterRoom(s);
}

// Putting a thing down. It lands on a real tile and it keeps its own address,
// so its history follows it and picking it up again is picking up THAT object,
// not another of the same kind. Refuses when there is nowhere for it to go,
// which is the honest answer in a room packed to the walls.
//
// This is the half of container transfer that was missing, and it is the same
// list the corpse run will need — built once, per design/world-shape.md.
export function putDown(s, i) {
  const ref = s.carried[i];
  if (!ref) return false;
  const tile = dropTile(s);
  if (tile < 0) return false;
  s.dropped.push({ kind: ref.kind, key: ref.key, site: s.site, floor: s.floor, room: s.room, tile });
  s.carried.splice(i, 1);
  return true;
}

// Taking a thing back up. A dropped thing is already in `taken` — the world
// stopped offering it long ago — so recovering it is a matter of the dropped
// list alone.
function pickUp(s, c) {
  if (carriedBulk(s) + bulkOf(c.kind) > BULK_BUDGET) return false;
  if (c.dropped) {
    const i = s.dropped.findIndex((d) => d.key === c.key && d.tile === c.tile
      && d.site === s.site && d.floor === s.floor && d.room === s.room);
    if (i < 0) return false;
    s.dropped.splice(i, 1);
  } else {
    s.taken.push(c.key);
  }
  s.carried.push({ kind: c.kind, key: c.key });
  return true;
}

// The live roster for the room you are standing in: computed from the address,
// minus whatever you already killed. Rebuilt on entry rather than stored, which
// is what keeps the storage invariant — a hundred rooms walked and nothing
// killed grows the save by nothing.
export function enterRoom(s) {
  const slain = new Set(s.slain);
  s.foes = foesOf(s.seed, s.site, s.floor, s.room)
    .filter((f) => !slain.has(f.id))
    .map((f) => {
      const p = centreOf(f.tile);
      return { id: f.id, kind: f.kind, x: p.x, y: p.y, hp: FOE[f.kind].hp, awake: false, bitAt: -9999 };
    });
}

// Everything you drop when you die, including the blade. `putDown` refuses when
// the floor is full, so anything that will not fit is lost rather than silently
// kept — dying in a packed room costs you more, which is correct.
function die(s) {
  while (s.carried.length && putDown(s, 0));
  s.carried.length = 0;
  s.hp = MAX_HP;
  s.hurtAt = -9999;
  s.swing = null;
  s.deaths = (s.deaths || 0) + 1;
  s.site = 0; s.floor = CAMP; s.room = 0;
  const p = spawnIn(s.seed, s.site, s.floor, s.room);
  s.x = p.x; s.y = p.y;
  s.foes = [];
  s.screen = ''; s.screenKey = '';
}

// apply: the only writer. A system proposes; this folds it in. Keeping the
// vocabulary small is deliberate — every entry here is a thing that can happen
// to the world, and a long list is a system that has started writing state.
export function applyAction(s, a) {
  const foe = (id) => s.foes.find((f) => f.id === id);
  switch (a.k) {
    case 'swing':
      s.swing = { at: s.tick, dir: a.dir, hit: [] };
      break;
    case 'say':
      s.say = { text: a.text, at: s.tick };
      break;
    case 'wake': {
      const f = foe(a.id); if (f) f.awake = true;
      break;
    }
    case 'moveFoe': {
      const f = foe(a.id); if (f) { f.x = a.x; f.y = a.y; }
      break;
    }
    case 'hurtFoe': {
      const f = foe(a.id); if (!f) break;
      s.swing.hit.push(f.id);
      f.hp -= a.n;
      f.awake = true;                       // hitting a sleeping dog wakes it
      if (f.hp <= 0) {
        s.slain.push(f.id);
        s.foes = s.foes.filter((x) => x.id !== f.id);
      }
      break;
    }
    case 'bite': {
      const f = foe(a.id); if (f) f.bitAt = s.tick;
      s.hp -= a.n;
      s.hurtAt = s.tick;
      // Threat is denominated in cargo as well as health: a hit rolls against
      // the most fragile thing you carry, and a break DESTROYS it. It does not
      // go to the dropped list — there is nothing left to pick up.
      const i = mostFragile(s);
      if (i >= 0 && hchance(fragilityOf(s.carried[i].kind), FRAGILE_DEN, s.seed, s.tick, s.hp, 0xd100))
        s.carried.splice(i, 1);
      if (s.hp <= 0) die(s);
      break;
    }
  }
  return s;
}

// While a screen is open the world is still; the only verbs are the grid's.
// Movement stays blocked so a transfer can never be half-made in transit.
function screenStep(s, frame) {
  const press = (v) => hasVerb(frame, v) && !hasVerb(s.lastFrame, v);
  const isStash = s.screen === 'stash';
  const isAppraiser = s.screen === 'appraiser';
  const cont = s.screen === 'container' ? containerItems(s, s.screenKey)
             : isStash ? s.stash
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
    s.carried.push({ kind: it.kind, key: it.key });
    s.taken.push(it.key);
    return true;
  };

  // The stash moves BOTH ways; a container only gives.
  const toPack = (ref) => {
    if (carriedBulk(s) + bulkOf(ref.kind) > BULK_BUDGET) return false;
    s.carried.push(ref); return true;
  };
  const toStash = (i) => {
    if (s.stash.length >= STASH_SLOTS) return false;
    s.stash.push(s.carried[i]); s.carried.splice(i, 1); return true;
  };

  // The appraiser reads one item's record for a fee.
  if (isAppraiser) {
    if (press(VERB.INTERACT)) {
      const ref = s.carried[s.cur];
      if (ref && !assessed(s, ref.key) && s.scrap >= APPRAISAL_FEE) {
        s.scrap -= APPRAISAL_FEE;
        s.known.push(ref.key);
      }
    }
    return;
  }

  if (press(VERB.INTERACT)) {
    if (s.side === 0 && cont[s.cur]) {
      if (isStash) { if (toPack(cont[s.cur])) s.stash.splice(s.cur, 1); }
      else take(cont[s.cur]);
      const left = isStash ? s.stash.length : containerItems(s, s.screenKey).length;
      s.cur = Math.min(s.cur, Math.max(0, left - 1));
    } else if (s.side === 1 && s.carried[s.cur]) {
      // The stash keeps what you hand it; anywhere else, handing a thing back
      // means putting it on the floor.
      if (isStash) toStash(s.cur); else putDown(s, s.cur);
      s.cur = Math.min(s.cur, Math.max(0, s.carried.length - 1));
    }
  }
  if (press(VERB.TOOL)) {
    if (isStash) {
      if (s.side === 0) { while (s.stash.length && toPack(s.stash[0])) s.stash.shift(); }
      else { while (s.carried.length && toStash(0)); }
    } else if (s.side === 0 && twoSided) {
      for (const it of cont) if (!take(it)) break;
    } else {
      while (s.carried.length && putDown(s, 0));
    }
    s.cur = 0;
  }
}

export function step(s, frame, systems = []) {
  if (s.screen) { screenStep(s, frame); s.lastFrame = frame; s.tick++; return s; }
  const solids = solidBodies(s);

  const grid = roomTiles(s.seed, s.site, s.floor, s.room).grid;

  const dx = (hasVerb(frame, VERB.RIGHT) ? 1 : 0) - (hasVerb(frame, VERB.LEFT) ? 1 : 0);
  const dy = (hasVerb(frame, VERB.DOWN) ? 1 : 0) - (hasVerb(frame, VERB.UP) ? 1 : 0);

  let speed = dx && dy ? SPEED_DIAG : SPEED;
  if (hasVerb(frame, VERB.SPRINT)) speed = ((speed * SPRINT_NUM) / SPRINT_DEN) | 0;
  // What you carry is what you cannot outrun.
  const [ln, ld] = LOAD[tier(carriedBulk(s))];
  speed = ((speed * ln) / ld) | 0;
  // A swing commits you without freezing you.
  if (swingPhase(s)) speed = ((speed * 2) / 5) | 0;

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
    enterRoom(s);
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
      if (s.carried.length) { s.screen = 'appraiser'; s.screenKey = ''; s.cur = 0; s.side = 1; }
    } else if (st === 'down' && s.floor + 1 < floorCount(s.seed, s.site)) enterFloor(s, s.floor + 1);
    else if (st === 'up' && s.floor > -1) enterFloor(s, s.floor - 1);
    else {
      const c = reachable(s);
      if (c && isContainer(c.kind)) {
        if (!s.opened.includes(c.key)) s.opened.push(c.key);
        s.screen = 'container'; s.screenKey = c.key; s.cur = 0; s.side = 0;
      } else if (c && isPortable(c.kind)) {
        pickUp(s, c);
      }
    }
  }

  // Drop the load and run. The best button in the game — and now it is a
  // decision rather than a penalty: the haul lands at your feet and is still
  // there when whatever you ran from is dealt with.
  // It jettisons CARGO. It does not disarm you: the button exists so you can
  // survive, and dropping your only blade while a dog runs you down is the
  // opposite of surviving. Death still takes everything, per the design.
  if (hasVerb(frame, VERB.DROP) && !hasVerb(s.lastFrame, VERB.DROP) && s.carried.length) {
    const keep = bestWeapon(s);
    for (let i = s.carried.length - 1; i >= 0; i--)
      if (s.carried[i] !== keep) putDown(s, i);
  }

  // The pack, on its own button — Start on a pad, I on a keyboard. It toggles.
  if (hasVerb(frame, VERB.INVENTORY) && !hasVerb(s.lastFrame, VERB.INVENTORY)) {
    s.screen = 'pack'; s.cur = 0; s.side = 1;
  }

  // The systems propose; apply folds it in. They run after the player has moved,
  // in declared order, and none of them may see another's proposals.
  for (const sys of systems)
    for (const a of sys(s, frame)) applyAction(s, a);

  if (s.swing && s.tick - s.swing.at >= SWING_TICKS) s.swing = null;

  s.lastFrame = frame;
  s.tick++;
  return s;
}
