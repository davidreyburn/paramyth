// L3: apply. The single mutation chokepoint.
// step(state, frame) is total and deterministic: same state + same frame,
// same result, forever, on every device.

import { VERB, hasVerb } from './frame.js';
import { UNITS, spawnIn, MAX_HP, SWING_TICKS, POP_TICKS, swingPhase, lampStep, friendly } from './state.js';
import { plant, fuseStep } from './blast.js';
import { roomTiles, floorPlan, floorCount, CAMP, COLS, ROWS, TILE, GW, T } from '../core/gen.js';
import { isContainer, isPortable, isWeapon, bulkOf, SLOTS, slotOf, blastOf, KIND } from '../core/items.js';
import { reachable, stairUnder, stationAt, visible, carriedBulk, containerItems,
         haulValue, assessed, dropTile, tier, mostFragile, bestWeapon, equippedRefs,
         APPRAISAL_FEE, BULK_BUDGET, STASH_SLOTS,
         PACK_COLS, PACK_ROWS, CONT_COLS, CONT_ROWS, STASH_COLS, gridOf } from './interact.js';
import { blocked, solidBodies, solidTiles, actorBodies, PLAYER_ID, HALF, centreOf, carry } from './space.js';
import { hchance } from '../core/addr.js';
import { fragilityOf } from '../core/items.js';
import { foesOf, FOE, spinOf } from '../core/foes.js';
import { STATION } from '../core/camp.js';
// NOTE: nothing here imports `systems/`. L3 must not read L4 — the tick loop in
// app/main.js owns the system list and hands it down, which is what makes
// `step(s, frame)` a complete, peaceful game on its own. A gate greps for this.

// Re-exported so the gates and the renderer keep their existing import site
// while the code itself lives in space.js, where a foe can reach it too.
export { solidBodies, solidTiles };

export const SPEED = 288, SPEED_DIAG = 204;   // diag = round(SPEED * 0.7071)
const SPRINT_NUM = 5, SPRINT_DEN = 3;
const RW = COLS * TILE * UNITS, RH = ROWS * TILE * UNITS;

// The encumbrance table from design/combat-and-tools.md, which had never been
// implemented: `tier()` existed and changed nothing. It matters now, because it
// is the only reason a dog at speed 170 is frightening — light you outrun it,
// laden you do not. Integer ratios, so no float enters the movement path.
export const LOAD = { light: [1, 1], laden: [3, 4], overloaded: [11, 20] };

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
  s.arrivedAt = s.tick;                 // the fade starts here
  enterRoom(s);
}

// Putting a thing down. It lands on a real tile and it keeps its own address,
// so its history follows it and picking it up again is picking up THAT object,
// not another of the same kind. Refuses when there is nowhere for it to go,
// which is the honest answer in a room packed to the walls.
//
// This is the half of container transfer that was missing, and it is the same
// list the corpse run will need — built once, per design/world-shape.md.
export function putDownRef(s, ref) {
  if (!ref) return false;
  const tile = dropTile(s);
  if (tile < 0) return false;
  s.dropped.push({ kind: ref.kind, key: ref.key, site: s.site, floor: s.floor, room: s.room, tile });
  return true;
}
export function putDown(s, i) {
  const ref = s.carried[i];
  if (!ref || !putDownRef(s, ref)) return false;
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
      // The machine's state, per plans/foe-behaviour.md: asleep, circle,
      // lunge, recover, stagger. `aim` is where a lunge is going; `spin` is
      // which way round it circles. All delta, all hashed.
      return { id: f.id, kind: f.kind, x: p.x, y: p.y, hp: FOE[f.kind].hp,
               mode: 'asleep', modeAt: s.tick, spin: spinOf(s.seed, f.id), aimX: 0, aimY: 0, vx: 0, vy: 0 };
    });

  // You arrive where the stair or door puts you; that is a promise. A foe whose
  // roster tile coincides is the one that moves — to the nearest free tile,
  // searched in rings so replay puts it in the same place.
  const grid = gridOf(s);
  const solids = solidBodies(s);
  for (const f of s.foes) {
    const others = [...solids, ...actorBodies(s, f.id)];
    if (!blocked(grid, others, f.x, f.y)) continue;
    const tx = Math.floor(f.x / (TILE*UNITS)), ty = Math.floor(f.y / (TILE*UNITS));
    let moved = false;
    for (let r = 1; r < Math.max(COLS, ROWS) && !moved; r++)
      for (let ddy = -r; ddy <= r && !moved; ddy++)
        for (let ddx = -r; ddx <= r && !moved; ddx++) {
          if (Math.max(Math.abs(ddx), Math.abs(ddy)) !== r) continue;
          const x = tx + ddx, y = ty + ddy;
          if (x < 1 || y < 1 || x >= COLS-1 || y >= ROWS-1) continue;
          const p = centreOf(y * COLS + x);
          if (grid[y*COLS + x] !== T.FLOOR || blocked(grid, others, p.x, p.y)) continue;
          f.x = p.x; f.y = p.y; moved = true;
        }
  }
}

// Everything you drop when you die, including the blade. `putDown` refuses when
// the floor is full, so anything that will not fit is lost rather than silently
// kept — dying in a packed room costs you more, which is correct.
function die(s) {
  while (s.carried.length && putDown(s, 0));
  s.carried.length = 0;
  for (const slot of SLOTS) {
    if (s.equipped[slot]) putDownRef(s, s.equipped[slot]);
    s.equipped[slot] = null;
  }
  s.hp = MAX_HP;
  s.hurtAt = -9999;
  s.swing = null;
  s.vx = 0; s.vy = 0;
  s.deaths = (s.deaths || 0) + 1;
  s.site = 0; s.floor = CAMP; s.room = 0;
  const p = spawnIn(s.seed, s.site, s.floor, s.room);
  s.x = p.x; s.y = p.y;
  s.foes = [];
  s.arrivedAt = s.tick;                 // waking in camp is a change of floor
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
      const f = foe(a.id); if (f && f.mode === 'asleep') { f.mode = 'circle'; f.modeAt = s.tick; }
      break;
    }
    case 'setMode': {
      const f = foe(a.id); if (!f) break;
      f.mode = a.mode; f.modeAt = s.tick;
      if (a.mode === 'lunge') { f.aimX = a.aimX; f.aimY = a.aimY; }   // fixed at the decision: not homing
      break;
    }
    // A shove: a velocity, not a teleport, worked off by carry() each tick.
    // It staggers — the back-off you can FORCE — unless it moved nothing,
    // which is what hitting a rooted thing feels like.
    case 'shoveFoe': {
      const f = foe(a.id); if (!f) break;
      f.vx = a.vx; f.vy = a.vy;
      if (a.vx || a.vy) { f.mode = 'stagger'; f.modeAt = s.tick; }
      break;
    }
    case 'moveFoe': {
      const f = foe(a.id); if (f) { f.x = a.x; f.y = a.y; if (a.spin) f.spin = a.spin; }
      break;
    }
    case 'hurtFoe': {
      const f = foe(a.id); if (!f) break;
      if (s.swing) s.swing.hit.push(f.id);      // a blast hurts without a swing
      f.hp -= a.n;
      if (f.mode === 'asleep') { f.mode = 'circle'; f.modeAt = s.tick; }   // hitting a sleeping dog wakes it
      if (f.hp <= 0) {
        s.slain.push(f.id);
        s.foes = s.foes.filter((x) => x.id !== f.id);
        s.pops.push({ x: f.x, y: f.y, at: s.tick, kind: f.kind });   // where it died, for the glass
      }
      break;
    }
    case 'bite':
    case 'hurt': {                              // a blast is a bite with no biter
      s.hp -= a.n;
      s.hurtAt = s.tick;
      s.vx = a.vx || 0; s.vy = a.vy || 0;   // knockback runs both ways
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
  const isPack = s.screen === 'pack';
  const isStatus = s.screen === 'status';
  const cont = s.screen === 'container' ? containerItems(s, s.screenKey)
             : isStash ? s.stash
             : [];
  const twoSided = s.screen === 'container' || isStash;

  if (press(VERB.CANCEL) || press(VERB.DODGE) || press(VERB.INVENTORY)) {
    s.screen = ''; s.screenKey = ''; s.cur = 0; s.side = 0; return;
  }
  // Tab flips between the two pages of the menu; elsewhere it still closes.
  if (press(VERB.MAP)) {
    if (isPack) { s.screen = 'status'; return; }
    if (isStatus) { s.screen = 'pack'; s.cur = 0; s.side = 1; return; }
    s.screen = ''; s.screenKey = ''; s.cur = 0; s.side = 0; return;
  }
  if (isStatus) return;                            // nothing to move on that page

  // Side 2 is the equipment row. Only the pack screen has one.
  if (!twoSided && s.side !== 2) s.side = 1;
  if (!isPack && s.side === 2) s.side = 1;

  const leftCols = isStash ? STASH_COLS : CONT_COLS;
  const list = () => (s.side === 0 ? cont : s.side === 2 ? SLOTS : s.carried);
  const cols = () => (s.side === 0 ? leftCols : s.side === 2 ? SLOTS.length : PACK_COLS);

  if (press(VERB.LEFT)) {
    if (s.side === 1 && twoSided && s.cur % PACK_COLS === 0) { s.side = 0; s.cur = 0; }
    else s.cur = Math.max(0, s.cur - 1);
  }
  if (press(VERB.RIGHT)) {
    const n = list().length;
    if (s.side === 0 && twoSided && (s.cur % leftCols === leftCols - 1 || s.cur >= n - 1)) { s.side = 1; s.cur = 0; }
    else s.cur = Math.min(Math.max(0, n - 1), s.cur + 1);
  }
  if (press(VERB.UP)) {
    // Off the top of the pack grid is the equipment row.
    if (s.side === 1 && isPack && s.cur < PACK_COLS) { s.side = 2; s.cur = Math.min(s.cur, SLOTS.length - 1); }
    else s.cur = Math.max(0, s.cur - cols());
  }
  if (press(VERB.DOWN)) {
    if (s.side === 2) { s.side = 1; s.cur = Math.min(s.cur, Math.max(0, s.carried.length - 1)); }
    else s.cur = Math.min(Math.max(0, list().length - 1), s.cur + cols());
  }
  s.cur = Math.min(s.cur, Math.max(0, list().length - 1));

  // Equip and unequip. A slot swap puts the old piece back where the new one
  // came from, so equipping never loses anything and never changes bulk.
  if (isPack && press(VERB.INTERACT)) {
    if (s.side === 1 && s.carried[s.cur] && slotOf(s.carried[s.cur].kind)) {
      const ref = s.carried[s.cur], slot = slotOf(ref.kind);
      const old = s.equipped[slot];
      s.equipped[slot] = ref;
      if (old) s.carried[s.cur] = old; else s.carried.splice(s.cur, 1);
      s.cur = Math.min(s.cur, Math.max(0, s.carried.length - 1));
      return;
    }
    if (s.side === 2) {
      const slot = SLOTS[s.cur], ref = s.equipped[slot];
      if (ref) { s.equipped[slot] = null; s.carried.push(ref); }
      return;
    }
  }

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

  const grid = gridOf(s);

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
  // The body turns in one tick; the lamp in your hand takes eight to swing
  // round after it. That lag is the whole effect.
  s.lampDir = lampStep(s.lampDir, s.facing);

  // Walls, barrels, and whatever is hunting you — all in one list.
  const walls = [...solids, ...actorBodies(s, PLAYER_ID)];
  const nx = s.x + dx * speed;
  if (dx && !blocked(grid, walls, nx, s.y, s.x, s.y)) s.x = nx;
  const ny = s.y + dy * speed;
  if (dy && !blocked(grid, walls, s.x, ny, s.x, s.y)) s.y = ny;

  // Shoves in flight, yours and theirs. This is world physics and not a
  // system's decision: a build with no systems still finishes a shove that is
  // already moving, the way it still lets a thrown thing land.
  const mine = carry(grid, walls, s);
  if (mine) { s.x = mine.x; s.y = mine.y; s.vx = mine.vx; s.vy = mine.vy; }
  for (const f of s.foes) {
    const c = carry(grid, [...solids, ...actorBodies(s, f.id)], f);
    if (c) { f.x = c.x; f.y = c.y; f.vx = c.vx; f.vy = c.vy; }
  }
  fuseStep(s, (a) => applyAction(s, a));

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
    // Everything in the pack. What is worn or wielded stays on you: the row is
    // not cargo, and dropping your blade while a dog closes is not surviving.
    for (let i = s.carried.length - 1; i >= 0; i--) putDown(s, i);
  }

  // The tool in your hand. A cap is set one tile ahead and the next one from
  // the pack takes its place, so a pocketful is a pocketful. Not in camp: the
  // Company frowns on that too, and the camp has rubble it is fond of.
  if (hasVerb(frame, VERB.TOOL) && !hasVerb(s.lastFrame, VERB.TOOL)) {
    const tool = s.equipped.tool;
    if (!tool) applyAction(s, { k: 'say', text: 'Nothing in hand to use' });
    else if (!blastOf(tool.kind)) applyAction(s, { k: 'say', text: `Nothing to do with a ${KIND[tool.kind].label} here` });
    else if (friendly(s)) applyAction(s, { k: 'say', text: 'Not in camp \u2014 the Company frowns on that too' });
    else {
      plant(s, tool);
      const i = s.carried.findIndex((r) => r.kind === tool.kind);
      s.equipped.tool = i >= 0 ? s.carried.splice(i, 1)[0] : null;
    }
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
  // Pops age with the tick that just ended, so one lives exactly POP_TICKS.
  if (s.pops.length && s.tick - s.pops[0].at >= POP_TICKS) s.pops = s.pops.filter((p) => s.tick - p.at < POP_TICKS);
  return s;
}
