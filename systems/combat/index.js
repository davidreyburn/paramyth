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
import { UNITS, WINDUP, ACTIVE, RECOVER, SWING_TICKS, HURT_INVULN, PLAYER_WEIGHT, swingPhase, friendly } from '../../sim/state.js';
import { slide, blocked, solidBodies, actorBodies, touching, tileOf, HALF, impulse, steer, octLen } from '../../sim/space.js';
import { roomTiles, TILE } from '../../core/gen.js';
import { FOE, circleFor, orbitFor } from '../../core/foes.js';
import { weaponOf, hitBox, inHitBox, FACE } from '../../sim/interact.js';

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
    const w = weaponOf(s);
    const [fx, fy] = FACE[s.swing.dir];
    for (const f of s.foes) {
      if (s.swing.hit.includes(f.id)) continue;   // one hit per foe per swing
      if (!inHitBox(box, f.x, f.y)) continue;
      out.push({ k: 'hurtFoe', id: f.id, n: w.damage });
      // The shove goes along the swing, scaled by the weapon and divided by
      // what it hit. Proposed even when zero, so a rooted foe's stillness is
      // a decision apply can see rather than an action that went missing.
      const imp = impulse(w.knock, (FOE[f.kind] || {}).weight || 1);
      out.push({ k: 'shoveFoe', id: f.id, vx: fx * imp, vy: fy * imp });
    }
  }

  // --- the dogs ------------------------------------------------------------
  // The machine from plans/foe-behaviour.md. Read the mode, propose what happens
  // next; apply writes it. Circle, crouch, strike, back off, prepare.
  const [px, py] = tileOf(s.x, s.y);
  const grace = s.tick - s.hurtAt < HURT_INVULN;
  for (const f of s.foes) {
    const def = FOE[f.kind];
    if (!def) continue;
    const age = s.tick - f.modeAt;
    const setMode = (mode, extra) => out.push({ k: 'setMode', id: f.id, mode, ...extra });

    if (f.mode === 'asleep') {
      const [fx, fy] = tileOf(f.x, f.y);
      if (Math.max(Math.abs(fx - px), Math.abs(fy - py)) <= def.wake) out.push({ k: 'wake', id: f.id });
      continue;                                    // an asleep dog does nothing else
    }
    // Shoved and helpless: no step, no bite, until the stagger runs out.
    if (f.mode === 'stagger') {
      if (age >= def.staggerTicks) setMode('circle');
      continue;
    }

    // Walls, barrels, the player, and every OTHER foe. A dog stops at you
    // instead of standing inside you, and a pack cannot stack into one dog.
    const walls = [...bodies, ...actorBodies(s, f.id)];
    const rx = s.x - f.x, ry = s.y - f.y;          // foe -> player
    const go = (mx, my) => slide(grid, walls, f.x, f.y, mx, my);
    const moved = (to) => to.x !== f.x || to.y !== f.y;

    if (f.mode === 'circle') {
      // Commit. The aim is where you are NOW; the dash will not follow you.
      if (age >= circleFor(def, s.seed, f.id, f.modeAt)) { setMode('lunge', { aimX: s.x, aimY: s.y }); continue; }
      // A tangent step by `spin`, plus a radial correction toward orbit radius.
      const dist = octLen(rx, ry), want = orbitFor(def, f.id, s.tick) * UNITS;
      const radial = dist > want + 4 * UNITS ? 1 : dist < want - 4 * UNITS ? -1 : 0;
      const tangent = (spin) => steer(-ry * spin + rx * radial, rx * spin + ry * radial, def.speed);
      // A circle needs room to the side. Probe a whole tile along each tangent
      // rather than judging by whether a step moved: a wall lets a fraction of
      // a diagonal step through, and a dog judging by that crept forever in a
      // corridor without ever deciding it was in one.
      const room = (spin) => { const [tx, ty] = steer(-ry * spin, rx * spin, TILE * UNITS); return !blocked(grid, walls, f.x + tx, f.y + ty, f.x, f.y); };
      let to, spin = 0;
      if (room(f.spin)) to = go(...tangent(f.spin));
      // No room that way round? Try the other, and keep that habit.
      else if (room(-f.spin)) { to = go(...tangent(-f.spin)); spin = -f.spin; }
      // No room either side: come straight on, one axis at a time — which is
      // the old dog, and ONLY in the one place the design wants a player to
      // make a stand.
      else {
        const sx = Math.sign(rx) * def.speed, sy = Math.sign(ry) * def.speed;
        to = go(sx, 0); if (!moved(to)) to = go(0, sy);
      }
      if (!to) continue;
      if (moved(to)) out.push({ k: 'moveFoe', id: f.id, x: to.x, y: to.y, ...(spin ? { spin } : {}) });
      continue;
    }

    if (f.mode === 'lunge') {
      // The crouch: still, aim fixed. This is the window in which you step.
      if (age < def.lungeWindup) continue;
      const tx = f.aimX - f.x, ty = f.aimY - f.y;
      const left = octLen(tx, ty);
      const [mx, my] = left <= def.lungeSpeed ? [tx, ty] : steer(tx, ty, def.lungeSpeed);
      const to = go(mx, my);
      if (moved(to)) out.push({ k: 'moveFoe', id: f.id, x: to.x, y: to.y });
      // Contact is TOUCHING, not overlap: bodies cannot overlap any more. It
      // costs health and, more expensively, cargo — and it shoves you, along
      // the axis it mostly came from, one axis so a diagonal is not a longer
      // throw than a square one.
      const contact = touching(s.x, s.y, to.x, to.y);
      if (contact && !grace) {
        const ax = s.x - to.x, ay = s.y - to.y;
        const imp = impulse(def.knock || 0, PLAYER_WEIGHT);
        const [vx, vy] = Math.abs(ax) >= Math.abs(ay) ? [Math.sign(ax) * imp, 0] : [0, Math.sign(ay) * imp];
        out.push({ k: 'bite', id: f.id, n: def.damage, vx, vy });
      }
      // The dash ends on contact, on arrival, against a wall, or on the clock.
      if (contact || left <= def.lungeSpeed || !moved(to) || age >= def.lungeTicks) setMode('recover');
      continue;
    }

    if (f.mode === 'recover') {
      // Back off toward orbit. Cannot bite. This is the window you swing into.
      if (age >= def.recoverTicks) { setMode('circle'); continue; }
      const to = go(...steer(-rx, -ry, def.speed));
      if (moved(to)) out.push({ k: 'moveFoe', id: f.id, x: to.x, y: to.y });
    }
  }

  return out;
}

export default combat;
