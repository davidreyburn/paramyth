// L4: combat. The first system, and therefore the first real test of the claim
// `specs/spec-layer-contract.md` is built on.
//
// It reads L0-L3 and NOTHING sideways. It returns actions and mutates nothing —
// not the state, not the foes, not its own arguments. `sim/step.js` folds the
// actions in, because apply is the only writer in the program.
//
// That purity is not ceremony. It means this file can be tested by calling it
// and looking at what comes back, and it means deleting `systems/` leaves a
// peaceful salvage game rather than a pile of dangling references.

import { VERB, hasVerb } from '../../sim/frame.js';
import { UNITS, WINDUP, ACTIVE, RECOVER, SWING_TICKS, HURT_INVULN, swingPhase, friendly } from '../../sim/state.js';
import { blocked, solidBodies, actorBodies, touching, tileOf, HALF } from '../../sim/space.js';
import { roomTiles, TILE, COLS } from '../../core/gen.js';
import { FOE } from '../../core/foes.js';
import { weaponOf, hitBox, inHitBox } from '../../sim/interact.js';

// The swing's timing and its phase function live in L3 beside the delta field
// they describe; re-exported here so a reader of this file still sees them.
export { WINDUP, ACTIVE, RECOVER, SWING_TICKS, HURT_INVULN, swingPhase };

export { hitBox };

export function combat(s, frame) {
  const out = [];
  if (s.screen) return out;                       // the world is still behind a menu

  const grid = roomTiles(s.seed, s.site, s.floor, s.room).grid;
  const bodies = solidBodies(s);
  const phase = swingPhase(s);

  // --- the swing -----------------------------------------------------------
  const pressed = hasVerb(frame, VERB.ATTACK) && !hasVerb(s.lastFrame, VERB.ATTACK);
  if (pressed && !phase) {
    // Steel stays sheathed in camp. But SAY so: a button that does nothing at
    // all is indistinguishable from a button that is broken, and camp is the
    // first place a player presses this one.
    if (friendly(s)) out.push({ k: 'say', text: 'Not in camp \u2014 the Company frowns on drawn steel' });
    else out.push({ k: 'swing', dir: s.facing });   // empty-handed is fists, not nothing
  }

  if (phase === 'active') {
    const box = hitBox(s);
    const dmg = weaponOf(s).damage;
    for (const f of s.foes) {
      if (s.swing.hit.includes(f.id)) continue;   // one hit per foe per swing
      if (!inHitBox(box, f.x, f.y)) continue;
      out.push({ k: 'hurtFoe', id: f.id, n: dmg });
    }
  }

  // --- the dogs ------------------------------------------------------------
  const [px, py] = tileOf(s.x, s.y);
  for (const f of s.foes) {
    const def = FOE[f.kind];
    if (!def) continue;

    const [fx, fy] = tileOf(f.x, f.y);
    const near = Math.max(Math.abs(fx - px), Math.abs(fy - py));
    if (!f.awake) {
      if (near <= def.wake) out.push({ k: 'wake', id: f.id });
      continue;                                    // an asleep dog does nothing else
    }

    // Pursuit, one axis at a time so it slides along walls instead of sticking.
    // Integer steps only: a foe position is never fractional, and a gate says so.
    // Walls, barrels, the player, and every OTHER foe. A dog stops at you now
    // instead of standing inside you, and a pack cannot stack into one dog.
    const walls = [...bodies, ...actorBodies(s, f.id)];
    const dx = Math.sign(s.x - f.x), dy = Math.sign(s.y - f.y);
    const step = def.speed;
    let nx = f.x, ny = f.y;
    if (dx && !blocked(grid, walls, nx + dx * step, ny)) nx += dx * step;
    if (dy && !blocked(grid, walls, nx, ny + dy * step)) ny += dy * step;
    if (nx !== f.x || ny !== f.y) out.push({ k: 'moveFoe', id: f.id, x: nx, y: ny });

    // Contact is TOUCHING — bodies cannot overlap any more, so an overlap test
    // here would never fire. It costs you health and, more expensively, cargo:
    // the fragility roll is what makes a fight cost the haul and not just the bar.
    const ready = s.tick - (f.bitAt || -9999) >= def.bite;
    const grace = s.tick - s.hurtAt < HURT_INVULN;
    if (touching(s.x, s.y, nx, ny) && ready && !grace) out.push({ k: 'bite', id: f.id, n: def.damage });
  }

  return out;
}

export default combat;
