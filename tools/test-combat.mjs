// Combat gates. Two things are under test and the first matters more.
//
// One: the LAYER CONTRACT. `systems/combat/` is the first L4 system this project
// has ever had, so the claims in specs/spec-layer-contract.md — a system
// proposes and never writes, a system is deletable, replay survives — stop being
// architecture and start being assertions here.
//
// Two: that a dog is a cargo problem rather than a damage problem.

import { createState, hashState, spawnIn, UNITS, MAX_HP, saying, SAY_TICKS, friendly } from '../sim/state.js';
import { step, applyAction, enterRoom, SPEED, LOAD } from '../sim/step.js';
import combat, { WINDUP, ACTIVE, SWING_TICKS, HURT_INVULN, hitBox, swingPhase } from '../systems/combat/index.js';
const SYSTEMS = [combat];
import { foesOf, FOE } from '../core/foes.js';
import { floorPlan, floorCount, roomTiles, absDepth, COLS, ROWS, TILE, T } from '../core/gen.js';
import { VERB, setVerb } from '../sim/frame.js';
import { carriedBulk, tier, bestWeapon, weaponOf, mostFragile, BULK_BUDGET } from '../sim/interact.js';
import { KIND, UNARMED, isSolidItem } from '../core/items.js';
import { solidTile } from '../core/grid.js';

let failures = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!c) failures++; };
const SEED = 0x1594;
const ref = (kind, n = 0) => ({ kind, key: `0:0:0:${n}` });

// Drop into a room that actually holds a dog, so nothing below is hypothetical.
function denRoom() {
  for (let f = 0; f < 4; f++)
    for (const room of floorPlan(SEED, 0, f).cells)
      if (foesOf(SEED, 0, f, room).length) return { floor: f, room };
  return null;
}
function delve(floor, room) {
  const s = createState(SEED);
  s.floor = floor; s.room = room;
  const p = spawnIn(SEED, 0, floor, room);
  s.x = p.x; s.y = p.y;
  enterRoom(s);
  return s;
}

// --- the layer contract -----------------------------------------------------
{
  const den = denRoom();
  ok('the world contains a room with something in it', !!den, den ? `floor ${den.floor} room ${den.room}` : 'none');

  // A system PROPOSES. It must not touch the delta, or apply is not the only
  // writer and every guarantee downstream of that is decoration.
  const s = delve(den.floor, den.room);
  s.foes[0].mode = 'hunt';
  const before = hashState(s);
  const actions = combat(s, 0);
  ok('combat() proposes actions', Array.isArray(actions) && actions.length > 0, `${actions.length} actions`);
  ok('and mutates nothing at all', hashState(s) === before);

  // Deletability. `plans/slice-01.md` gates it; this is the gate.
  const peaceful = delve(den.floor, den.room);
  const walk = setVerb(setVerb(0, VERB.RIGHT, true), VERB.DOWN, true);
  for (let i = 0; i < 200; i++) step(peaceful, walk, []);   // no systems: the peaceful build
  ok('a build with no systems still runs', peaceful.tick === 200 && peaceful.hp === MAX_HP);
  ok('and nothing hunts you in it', peaceful.foes.every((f) => f.mode === 'asleep'));

  // ... and it can still finish the loop: loot, carry, sell.
  const sell = createState(SEED);
  sell.carried = [ref('gem'), ref('bones')];
  const { campStations, STATION } = await import('../core/camp.js');
  const q = campStations().find((x) => x.kind === STATION.QUARTERMASTER);
  sell.x = ((q.tile % COLS) * TILE + TILE/2) * UNITS;
  sell.y = (((q.tile / COLS) | 0) * TILE + TILE/2) * UNITS;
  step(sell, setVerb(0, VERB.INTERACT, true), []);
  ok('a peaceful build can still sell a haul', sell.scrap > 0 && !sell.carried.length, `${sell.scrap} scrap`);

  // The kernel must not know that systems exist. This is the `layers` invariant
  // from specs/spec-layer-contract.md, and it is grep-able, so it is grepped.
  const { readFileSync, readdirSync } = await import('node:fs');
  const up = [];
  for (const dir of ['core', 'sim']) {
    for (const f of readdirSync(new URL(`../${dir}`, import.meta.url))) {
      if (!f.endsWith('.js')) continue;
      const src = readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8');
      if (/from\s+['"][^'"]*systems\//.test(src)) up.push(`${dir}/${f}`);
    }
  }
  ok('no layer below L4 reads a system', up.length === 0, up.join(', ') || 'core/ and sim/ are clean');
}

// --- determinism ------------------------------------------------------------
{
  const den = denRoom();
  const a = delve(den.floor, den.room), b = delve(den.floor, den.room);
  ok('two rosters from one address are identical',
     JSON.stringify(a.foes) === JSON.stringify(b.foes), `${a.foes.length} foes`);

  const log = [];
  for (let i = 0; i < 400; i++) {
    const f = (i * 2654435761) & 0x7ff;
    log.push(f); step(a, f, SYSTEMS);
  }
  for (const f of log) step(b, f, SYSTEMS);
  ok('replay holds with things alive and moving', hashState(a) === hashState(b),
     hashState(a).toString(16));

  let fractional = 0;
  const whole = (b) => [b.x, b.y, b.vx, b.vy].every(Number.isInteger);
  for (const f of a.foes) if (!whole(f)) fractional++;
  if (!whole(a)) fractional++;
  ok('no float enters a position or a shove', fractional === 0);

  // Storage: walking the world and killing nothing must cost nothing.
  const s = delve(den.floor, den.room);
  const base = JSON.stringify({ slain: s.slain, taken: s.taken, dropped: s.dropped }).length;
  for (let site = 0; site < 3; site++)
    for (let f = 0; f < floorCount(SEED, site); f++)
      for (const room of floorPlan(SEED, site, f).cells) {
        s.site = site; s.floor = f; s.room = room; enterRoom(s);
        for (let i = 0; i < 4; i++) step(s, 0, SYSTEMS);
      }
  const grew = JSON.stringify({ slain: s.slain, taken: s.taken, dropped: s.dropped }).length - base;
  ok('a long walk that kills nothing grows the save by nothing', grew === 0, `+${grew} bytes`);
}

// --- placement --------------------------------------------------------------
{
  let inWall = 0, inCamp = 0, rooms = 0, withFoes = 0, total = 0;
  for (let site = 0; site < 24; site++) {
    inCamp += foesOf(SEED, site, -1, 0).length;
    for (let f = 0; f < floorCount(SEED, site); f++)
      for (const room of floorPlan(SEED, site, f).cells) {
        rooms++;
        const fs = foesOf(SEED, site, f, room);
        if (fs.length) withFoes++;
        total += fs.length;
        const { grid, reach } = roomTiles(SEED, site, f, room);
        for (const x of fs) if (solidTile(grid[x.tile]) || !reach[x.tile]) inWall++;
      }
  }
  ok('nothing ever spawns inside a wall or a sealed pocket', inWall === 0, `${inWall} bad`);
  ok('nothing hunts you in camp', inCamp === 0);
  ok('encounters are rare, per the design', withFoes / rooms < 0.45,
     `${withFoes}/${rooms} rooms (${(100*withFoes/rooms).toFixed(0)}%), ${total} foes`);
  ok('but they are not vanishingly rare either', withFoes / rooms > 0.12,
     `${(100*withFoes/rooms).toFixed(0)}% of rooms`);
}

// --- the swing --------------------------------------------------------------
{
  const den = denRoom();
  const s = delve(den.floor, den.room);
  ok('you are carrying something to swing', !!bestWeapon(s), bestWeapon(s)?.kind);

  // J on the very first tick, in camp. Steel stays sheathed there — but the
  // refusal has to SAY so. A button that does nothing at all is
  // indistinguishable from a button that is broken, and camp is the first place
  // a player presses this one.
  const fresh = createState(SEED);
  step(fresh, setVerb(0, VERB.ATTACK, true), [combat]);
  ok('no blade is drawn in camp', !fresh.swing, `floor ${fresh.floor}`);
  ok('but the refusal says so out loud', !!saying(fresh), fresh.say ? fresh.say.text : 'silence');

  // And it goes away on its own rather than sticking to the glass.
  fresh.tick += SAY_TICKS;
  ok('and the line expires', !saying(fresh), `after ${SAY_TICKS} ticks`);

  // Empty-handed is FISTS, not nothing: a small square right in front of you.
  // Being disarmed is a bad position, not a dead stop.
  const bare = delve(den.floor, den.room);
  bare.carried = [];
  bare.equipped.weapon = null;                 // the row is where the blade lives now
  step(bare, setVerb(0, VERB.ATTACK, true), [combat]);
  ok('empty hands still swing', !!bare.swing && !bare.say);
  ok('and they are fists', weaponOf(bare).label === UNARMED.label, weaponOf(bare).label);

  // The unarmed box is small, square, and in front — measurably smaller than a
  // blade's arc in both dimensions, or "unarmed" is just a weaker sword.
  const armedBox = (() => { const t = delve(den.floor, den.room); t.facing = 1;
    t.swing = { at: t.tick, dir: 1, hit: [] }; return hitBox(t); })();
  const fistBox = (() => { const t = delve(den.floor, den.room); t.carried = []; t.equipped.weapon = null; t.facing = 1;
    t.swing = { at: t.tick, dir: 1, hit: [] }; return hitBox(t); })();
  const dim = (b) => [(b.x1 - b.x0) / UNITS, (b.y1 - b.y0) / UNITS];
  const [aw, ah] = dim(armedBox), [fw, fh] = dim(fistBox);
  ok('fists reach less far than a blade', fw < aw, `${fw} deep vs ${aw}`);
  ok('and sweep less wide', fh < ah, `${fh} across vs ${ah}`);
  ok('and the fist box is square', Math.abs(fw - fh) <= 1, `${fw} x ${fh}`);
  ok('a fist is in front of the player, not on them',
     fistBox.x0 > bare.x, `box starts ${(fistBox.x0 - bare.x) / UNITS}px ahead`);
  ok('fists hit for less than steel', UNARMED.damage < KIND.sword.damage,
     `${UNARMED.damage} vs ${KIND.sword.damage}`);

  // A screen still swallows it: the world is still behind a menu.
  const menu = createState(SEED);
  menu.screen = 'pack';
  step(menu, setVerb(0, VERB.ATTACK, true), [combat]);
  ok('but a screen swallows the verb entirely', !menu.swing && !menu.say);

  // Below ground, with a blade, it actually swings.
  const armed = delve(den.floor, den.room);
  step(armed, setVerb(0, VERB.ATTACK, true), [combat]);
  ok('and below ground the blade comes out', !!armed.swing, `floor ${armed.floor}`);

  // The hitbox is strictly in FRONT, in all four facings. A melee arc that
  // wraps behind you is a game that stops being about where you stand.
  let behind = 0;
  for (let dir = 0; dir < 4; dir++) {
    const t = delve(den.floor, den.room);
    t.facing = dir;
    t.swing = { at: t.tick, dir, hit: [] };
    const b = hitBox(t);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const away = [[0,-1],[1,0],[0,1],[-1,0]][dir];
    if (Math.sign(cx - t.x) !== away[0] || Math.sign(cy - t.y) !== away[1]) behind++;
  }
  ok('the hitbox is in front in every facing, never behind', behind === 0, `${behind}/4 wrong`);

  // Phases run in order and expire.
  const p = delve(den.floor, den.room);
  p.swing = { at: p.tick, dir: p.facing, hit: [] };
  const seen = [];
  for (let i = 0; i < SWING_TICKS + 2; i++) { seen.push(swingPhase(p)); p.tick++; }
  ok('a swing runs windup, active, recover, then ends',
     seen[0] === 'windup' && seen[WINDUP] === 'active'
     && seen[WINDUP + ACTIVE] === 'recover' && seen[SWING_TICKS] === null);

  // A foe takes at most one hit per swing, however long the active window is.
  const k = delve(den.floor, den.room);
  const foe = k.foes[0];
  foe.mode = 'hunt'; foe.hp = 99;
  foe.x = k.x + 12 * UNITS; foe.y = k.y; k.facing = 1;
  let hits = 0;
  for (let i = 0; i < SWING_TICKS; i++) {
    const acts = combat(k, i === 0 ? setVerb(0, VERB.ATTACK, true) : 0);
    for (const a of acts) { if (a.k === 'hurtFoe') hits++; applyAction(k, a); }
    k.tick++;
  }
  ok('one swing lands at most one hit on a foe', hits === 1, `${hits} hits`);
}

// --- the body ---------------------------------------------------------------
{
  const den = denRoom();

  // The invulnerability window. Without it, contact is a shredder.
  const s = delve(den.floor, den.room);
  const f = s.foes[0];
  const { HALF: H0 } = await import('../sim/space.js');
  f.mode = 'hunt'; f.x = s.x + 2 * H0; f.y = s.y;      // touching, not inside — bodies cannot overlap now
  let bites = 0;
  for (let i = 0; i < HURT_INVULN; i++) {
    for (const a of combat(s, 0)) { if (a.k === 'bite') bites++; applyAction(s, a); }
    s.tick++;
  }
  ok('grace after a hit stops contact being a shredder', bites === 1, `${bites} bites in ${HURT_INVULN} ticks`);
  ok('and a bite actually costs health', s.hp === MAX_HP - FOE.dog.damage, `${s.hp}/${MAX_HP}`);

  // Fragility: a hit risks the most fragile thing you carry, and a break
  // DESTROYS it — it is not on the floor afterwards.
  const g = delve(den.floor, den.room);
  g.carried = [ref('sword', 9), ref('urn', 1)];       // urn is the most fragile at 3
  ok('the most fragile thing is the one at risk', g.carried[mostFragile(g)].kind === 'urn');
  let broke = 0;
  for (let t = 0; t < 400; t++) {
    const h = delve(den.floor, den.room);
    h.tick = t;
    h.carried = [ref('urn', 1)];
    applyAction(h, { k: 'bite', id: h.foes[0].id, n: 0 });
    if (!h.carried.length) { broke++; ok.dropped = h.dropped.length; }
  }
  ok('a hit can destroy cargo', broke > 0, `${broke}/400 hits broke an urn`);
  ok('but losing the haul is a risk, not a certainty', broke / 400 < 0.25,
     `${(100*broke/400).toFixed(0)}% per hit on fragility ${KIND.urn.fragility}`);
  ok('and destroyed cargo is gone, not dropped', ok.dropped === 0);
}

// --- a dog is a cargo problem -----------------------------------------------
{
  // SPEED and LOAD are imported, not copied. A private copy of a constant here
  // passed cleanly while the engine ran at a different number entirely — the
  // spec's "unbound constants" failure mode, caught in its own combat gate.
  const at = (bulk) => {
    const t = tier(bulk);
    const [n, d] = LOAD[t];
    return { t, v: ((SPEED * n) / d) | 0 };
  };
  const light = at(4), laden = at(12), over = at(19);
  ok('light outruns a dog', light.v > FOE.dog.speed, `${light.v} > ${FOE.dog.speed}`);
  ok('laden does not', laden.v < FOE.dog.speed, `${laden.v} < ${FOE.dog.speed}`);
  ok('overloaded is not close', over.v < FOE.dog.speed - 40, `${over.v} vs ${FOE.dog.speed}`);

  // And the engine must actually apply it — the tiers changed nothing until now.
  const den = denRoom();
  const runs = [4, 19].map((bulk) => {
    const s = delve(den.floor, den.room);
    s.foes = [];
    // The issued blade is already in the row at bulk 3; keys make up the rest.
    s.carried = Array.from({ length: bulk - 3 }, (_, i) => ref('key', i));
    const x0 = s.x;
    for (let i = 0; i < 60; i++) step(s, setVerb(0, VERB.RIGHT, true), SYSTEMS);
    return { bulk: carriedBulk(s), moved: s.x - x0 };
  });
  ok('the encumbrance tiers actually reach the movement path',
     runs[1].moved < runs[0].moved,
     `bulk ${runs[0].bulk} moved ${runs[0].moved} vs bulk ${runs[1].bulk} moved ${runs[1].moved}`);
}

// --- death ------------------------------------------------------------------
{
  const den = denRoom();
  const s = delve(den.floor, den.room);
  s.carried = [ref('gem', 1), ref('bones', 2)];    // the blade is in the row
  s.stash = [ref('crystal', 3)];
  const where = { floor: s.floor, room: s.room };

  const biter = s.foes[0].id;
  for (let i = 0; i < 20 && !s.deaths; i++) {
    s.hurtAt = -9999;                     // no grace: we are trying to die
    applyAction(s, { k: 'bite', id: biter, n: 4 });
  }
  ok('you can be killed', s.hp === MAX_HP && s.deaths === 1, `died ${s.deaths} time(s)`);
  ok('and you wake in the camp', s.floor === -1, `floor ${s.floor}`);
  ok('carrying nothing', s.carried.length === 0);
  ok('the stash is untouched', s.stash.length === 1, s.stash.map((r) => r.kind).join(','));
  ok('and everything you held is on the floor where you fell',
     s.dropped.length >= 2 && s.dropped.every((d) => d.floor === where.floor && d.room === where.room),
     `${s.dropped.length} items at ${where.floor}:${where.room}`);
  ok('including the blade — death takes everything',
     s.dropped.some((d) => d.kind === 'sword'));
}

// --- drop-load keeps the blade ----------------------------------------------
{
  const den = denRoom();
  const s = delve(den.floor, den.room);
  s.carried = [ref('gem', 1), ref('bones', 2)];
  step(s, setVerb(0, VERB.DROP, true), SYSTEMS);
  ok('drop-load jettisons the cargo', s.dropped.length === 2 && s.carried.length === 0, `${s.dropped.length} down`);
  ok('and leaves you armed — the row is not cargo', !!bestWeapon(s) && bestWeapon(s).kind === 'sword',
     bestWeapon(s) ? bestWeapon(s).kind : 'fists');
}

// --- bodies cannot overlap ----------------------------------------------------
// Until now blocked() walked walls and barrels and nothing else, so a dog's
// move was never tested against the player. That is why it walked INTO you.
let runFrom;
{
  const { HALF, TOUCH, touching, actorBodies, blocked, centreOf } = await import('../sim/space.js');
  const { roomTiles, floorCount, floorPlan, COLS: C, ROWS: R, T: TT } = await import('../core/gen.js');
  const { foesOf } = await import('../core/foes.js');
  const { solidBodies } = await import('../sim/space.js');
  const den = denRoom();
  const overlap = (a, b) => Math.abs(a.x - b.x) < 2 * HALF && Math.abs(a.y - b.y) < 2 * HALF;

  // A straight run of clear floor from the player, in whichever cardinal
  // direction has one. A foe planted by guesswork ended up inside a wall and
  // "could not walk through the player" because it could not walk at all.
  runFrom = (s, tiles) => {
    const { grid } = roomTiles(s.seed, s.site, s.floor, s.room);
    const bodies = solidBodies(s);
    const px = Math.floor(s.x / (TILE*UNITS)), py = Math.floor(s.y / (TILE*UNITS));
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let clear = true;
      for (let k = 1; k <= tiles && clear; k++) {
        const x = px + dx*k, y = py + dy*k;
        if (x < 1 || y < 1 || x >= C-1 || y >= R-1 || grid[y*C + x] !== TT.FLOOR) clear = false;
        else if (blocked(grid, bodies, s.x + dx*k*TILE*UNITS, s.y + dy*k*TILE*UNITS)) clear = false;
      }
      if (clear) return { x: s.x + dx*tiles*TILE*UNITS, y: s.y + dy*tiles*TILE*UNITS, dx, dy,
                          verb: dx > 0 ? VERB.RIGHT : dx < 0 ? VERB.LEFT : dy > 0 ? VERB.DOWN : VERB.UP };
    }
    return null;
  };

  // The player cannot walk through a foe.
  {
    const s = delve(den.floor, den.room);
    const f = s.foes[0];
    const run = runFrom(s, 3);
    ok('there is a clear run to test against', !!run, run ? `${run.dx},${run.dy}` : 'none from spawn');
    if (run) {
      f.mode = 'asleep';                              // it stays put; no systems run
      f.x = run.x; f.y = run.y;
      const d0 = Math.abs(s.x - f.x) + Math.abs(s.y - f.y);
      for (let i = 0; i < 300; i++) step(s, setVerb(0, run.verb, true), []);
      const d1 = Math.abs(s.x - f.x) + Math.abs(s.y - f.y);
      ok('the player cannot walk through a foe', d1 < d0 && d1 >= 2 * HALF && !overlap(s, f),
         `closed from ${(d0/UNITS).toFixed(0)}px to ${(d1/UNITS).toFixed(1)}px and stopped`);
    }
  }

  // A foe cannot walk through the player.
  {
    const s = delve(den.floor, den.room);
    const f = s.foes[0];
    const run = runFrom(s, 4);
    if (run) {
      // Only this foe: a second, sleeping dog on the run once stopped the mover
      // two tiles short, and the gate passed without testing what it claims.
      s.foes = [f];
      f.mode = 'hunt'; f.x = run.x; f.y = run.y;
      // A dog that reaches you bites every 45 ticks, and six bites is a dead
      // player: die() moves you to camp and every measurement below becomes
      // the distance from the camp spawn to a frozen foe. That read as
      // "50.3px" twice and was blamed on geometry. So: the run is as long as
      // arrival needs and no longer, and surviving it is asserted.
      s.hp = 1000;
      let overlapped = 0, moved = false;
      const fx0 = f.x, fy0 = f.y;
      for (let i = 0; i < 160; i++) {
        for (const a of combat(s, 0)) applyAction(s, a);
        if (f.x !== fx0 || f.y !== fy0) moved = true;
        if (overlap(s, f)) overlapped++;
        s.tick++;
      }
      ok('the fixture survived to be measured', !s.deaths && s.floor === den.floor, `deaths ${s.deaths || 0}, floor ${s.floor}`);
      const gap = Math.max(Math.abs(s.x - f.x), Math.abs(s.y - f.y));
      const arrived = gap < 2 * HALF + TOUCH + FOE.dog.speed;
      ok('a foe cannot walk through the player', moved && overlapped === 0 && gap >= 2 * HALF && arrived,
         `${overlapped} overlapping ticks; it closed to ${(gap / UNITS).toFixed(1)}px and stopped there`);
    } else ok('a foe cannot walk through the player', false, 'no clear run from spawn');
  }

  // Two foes cannot stack into one.
  {
    const s = delve(den.floor, den.room);
    const a = s.foes[0];
    const run = runFrom(s, 7);
    const near = run ? { x: s.x + run.dx * 5 * TILE * UNITS, y: s.y + run.dy * 5 * TILE * UNITS } : { x: s.x - 5 * TILE * UNITS, y: s.y };
    a.mode = 'hunt'; a.x = near.x; a.y = near.y;
    const b = { id: 'second', kind: 'dog', x: run ? run.x : a.x - 2 * TILE * UNITS, y: run ? run.y : s.y, hp: 6, mode: 'hunt', modeAt: 0, bitAt: -9999, vx: 0, vy: 0 };
    s.foes = [a, b];
    s.hp = 1000;                                       // two dogs kill a fixture in 180 ticks; see above
    const a0 = { x: a.x, y: a.y }, b0 = { x: b.x, y: b.y };
    let stacked = 0;
    for (let i = 0; i < 250; i++) {
      for (const act of combat(s, 0)) applyAction(s, act);
      if (overlap(a, b)) stacked++;
      s.tick++;
    }
    ok('that fixture survived too', !s.deaths && s.floor === den.floor, `deaths ${s.deaths || 0}`);
    const bothMoved = (a.x !== a0.x || a.y !== a0.y) && (b.x !== b0.x || b.y !== b0.y);
    ok('two foes cannot occupy the same space', bothMoved && stacked === 0,
       `${stacked} stacked ticks; ${bothMoved ? 'both closed on you' : 'one never moved'}`);
    ok('and neither is inside the player', !overlap(s, a) && !overlap(s, b));
  }

  // A bite fires from TOUCHING. Overlap is no longer a state that can arise,
  // so the old test would have gone silently harmless.
  {
    const at = (gap) => {
      const s = delve(den.floor, den.room);
      const f = s.foes[0];
      f.mode = 'hunt'; f.bitAt = -9999; s.hurtAt = -9999;
      f.x = s.x + gap; f.y = s.y;
      const acts = combat(s, 0);
      return { bit: acts.some((x) => x.k === 'bite'), moved: acts.some((x) => x.k === 'moveFoe'), s, f };
    };
    const flush = at(2 * HALF);
    ok('a foe flush against you bites', flush.bit);
    ok('and does not step into you to do it', !flush.moved, flush.moved ? 'it moved' : 'held its ground');
    const far = at(2 * HALF + TOUCH + FOE.dog.speed + 1);
    ok('a foe a step and a margin away does not bite yet', !far.bit);
    ok('but it does close the gap', far.moved);
    ok('touching is a hard boundary, not a fuzzy one',
       touching(0, 0, 2 * HALF + TOUCH - 1, 0) && !touching(0, 0, 2 * HALF + TOUCH, 0));
  }

  // Arriving in a room never lands you inside a foe — the foe moves, you do
  // not, because where the stair puts you is a promise.
  {
    let checked = 0, inside = 0, offFloor = 0, drift = 0;
    for (let site = 0; site < 24; site++)
      for (let fl = 0; fl < floorCount(SEED, site); fl++)
        for (const room of floorPlan(SEED, site, fl).cells) {
          const roster = foesOf(SEED, site, fl, room);
          if (!roster.length) continue;
          const { grid } = roomTiles(SEED, site, fl, room);
          for (const r of roster) {
            // Worst case: you arrive exactly on its roster tile.
            const s = createState(SEED);
            s.site = site; s.floor = fl; s.room = room;
            const p = centreOf(r.tile); s.x = p.x; s.y = p.y;
            enterRoom(s);
            checked++;
            for (const f of s.foes) {
              if (overlap(s, f)) inside++;
              const tx = Math.floor(f.x / (TILE*UNITS)), ty = Math.floor(f.y / (TILE*UNITS));
              if (grid[ty*C + tx] !== TT.FLOOR) offFloor++;
            }
            // And the nudge is arithmetic: doing it again lands them in the same place.
            const t = createState(SEED);
            t.site = site; t.floor = fl; t.room = room; t.x = p.x; t.y = p.y;
            enterRoom(t);
            if (JSON.stringify(s.foes.map((f) => [f.x, f.y])) !== JSON.stringify(t.foes.map((f) => [f.x, f.y]))) drift++;
          }
        }
    ok('arriving on a foe never leaves you inside it', checked > 0 && inside === 0, `${inside}/${checked} arrivals`);
    ok('a nudged foe still stands on floor', offFloor === 0, `${offFloor} off floor`);
    ok('and the nudge is deterministic', drift === 0, `${drift} differed on replay`);
  }
}

// --- knockback: step 1 of plans/foe-behaviour.md -----------------------------
// A hit shoves the foe along the swing; a bite shoves you. Asserted, not eyeballed.
{
  const { HALF, impulse, decay, KNOCK_DECAY, blocked, centreOf } = await import('../sim/space.js');
  const { roomTiles: tilesOf, COLS: C, T: TT } = await import('../core/gen.js');
  const den = denRoom();
  const overlap = (a, b) => Math.abs(a.x - b.x) < 2 * HALF && Math.abs(a.y - b.y) < 2 * HALF;
  const facingOf = (dx, dy) => dy < 0 ? 0 : dx > 0 ? 1 : dy > 0 ? 2 : 3;

  // The pure arithmetic first: the geometric series really does sum to `knock`.
  {
    let v = impulse(KIND.sword.knock, 1), travelled = 0, ticks = 0;
    while (v && ticks < 100) { travelled += v; v = decay(v); ticks++; }
    ok('a shove travels about its knock distance', Math.abs(travelled / UNITS - KIND.sword.knock) <= 3,
       `${(travelled / UNITS).toFixed(1)}px of ${KIND.sword.knock} in ${ticks} ticks`);
    ok('and every tick of it is an integer', Number.isInteger(impulse(KIND.sword.knock, 3)) && Number.isInteger(decay(-1234)));
    ok('a rooted foe takes no impulse at all', impulse(KIND.sword.knock, Infinity) === 0);
  }

  // One swing at a foe in the box, then watch. Returns how far along the
  // swing the foe got at its furthest, and whether anything went wrong.
  const swingAt = (weapon, weight) => {
    const s = delve(den.floor, den.room);
    s.hp = 1000;
    const f = s.foes[0]; s.foes = [f];
    const run = runFrom(s, 3);
    if (!run) return null;
    const saved = FOE.dog.weight; FOE.dog.weight = weight;   // L1 is data; restored below
    s.equipped.weapon = weapon;
    s.facing = facingOf(run.dx, run.dy);
    // That close it is TOUCHING: it wakes on the first tick and would bite you
    // during the windup, shoving you and walking after you. Its bite goes on
    // cooldown for the whole fixture so what is measured is the blade's shove
    // alone — from where the foe stood when the blow landed, not from here.
    f.mode = 'hunt'; f.bitAt = s.tick + 120;
    f.x = s.x + run.dx * (2 * HALF + UNITS); f.y = s.y + run.dy * (2 * HALF + UNITS);
    const { grid } = tilesOf(s.seed, s.site, s.floor, s.room);
    const px0 = s.x, py0 = s.y;
    let x0 = null, y0 = null, peak = 0, inside = 0, inWall = 0, staggered = false;
    step(s, setVerb(0, VERB.ATTACK, true), SYSTEMS);
    for (let i = 0; i < 60; i++) {
      if (x0 === null && f.hp < FOE.dog.hp) { x0 = f.x; y0 = f.y; }   // the tick it landed
      step(s, 0, SYSTEMS);
      if (!s.foes.length) break;
      if (x0 !== null) peak = Math.max(peak, (f.x - x0) * run.dx + (f.y - y0) * run.dy);
      if (overlap(s, f)) inside++;
      if (blocked(grid, [], f.x, f.y)) inWall++;
      if (f.mode === 'stagger') staggered = true;
    }
    FOE.dog.weight = saved;
    return { peak, inside, inWall, staggered, playerMoved: s.x !== px0 || s.y !== py0, hit: f.hp < FOE.dog.hp };
  };

  const sword = swingAt(ref('sword'), 1);
  const fists = swingAt(null, 1);
  const heavy = swingAt(ref('sword'), 3);
  const rooted = swingAt(ref('sword'), Infinity);
  ok('the knockback fixture has room to shove into', !!sword, sword ? 'a clear run' : 'no clear run from spawn');
  if (sword) {
    ok('the swing lands', sword.hit && fists.hit && heavy.hit && rooted.hit);
    ok('knockback moves the foe along the swing', sword.peak > 0 && sword.peak >= (KIND.sword.knock * UNITS) / 2,
       `${(sword.peak / UNITS).toFixed(1)}px of ${KIND.sword.knock}`);
    ok('and never through you or into masonry', sword.inside === 0 && sword.inWall === 0,
       `${sword.inside} overlapping, ${sword.inWall} in wall`);
    ok('a hit staggers the foe', sword.staggered);
    ok('a sword shoves further than fists', sword.peak > fists.peak && fists.peak > 0,
       `${(sword.peak / UNITS).toFixed(1)}px vs ${(fists.peak / UNITS).toFixed(1)}px`);
    ok('a heavier foe shoves less', heavy.peak > 0 && heavy.peak < sword.peak,
       `weight 3: ${(heavy.peak / UNITS).toFixed(1)}px`);
    ok('a rooted foe does not move at all', rooted.peak === 0 && !rooted.staggered, `weight Infinity: ${rooted.peak}`);
    ok('the swing itself does not move you', !sword.playerMoved);
  }

  // Knockback respects walls: a foe with masonry at its back stops at it.
  {
    const s = delve(den.floor, den.room);
    s.hp = 1000;
    const f = s.foes[0]; s.foes = [f];
    const { grid } = tilesOf(s.seed, s.site, s.floor, s.room);
    // Find: floor (you), floor (it), wall — in a row along some cardinal.
    let spot = null;
    for (let t = 0; t < grid.length && !spot; t++) {
      const x = t % C, y = (t / C) | 0;
      if (grid[t] !== TT.FLOOR) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const fx = x + dx, fy = y + dy, wx = x + 2*dx, wy = y + 2*dy;
        if (fx < 1 || fy < 1 || fx >= C-1 || wx < 0 || wy < 0) continue;
        if (grid[fy*C + fx] === TT.FLOOR && grid[wy*C + wx] === TT.WALL) { spot = { t, dx, dy }; break; }
      }
    }
    ok('there is a foe-against-a-wall spot to test', !!spot);
    if (spot) {
      const c = centreOf(spot.t);
      s.x = c.x; s.y = c.y; s.facing = facingOf(spot.dx, spot.dy);
      f.mode = 'hunt'; f.bitAt = s.tick + 120;
      f.x = s.x + spot.dx * (2 * HALF + UNITS); f.y = s.y + spot.dy * (2 * HALF + UNITS);
      let x0 = null, y0 = null, inWall = 0, peak = 0;
      step(s, setVerb(0, VERB.ATTACK, true), SYSTEMS);
      for (let i = 0; i < 40 && s.foes.length; i++) {
        if (x0 === null && f.hp < FOE.dog.hp) { x0 = f.x; y0 = f.y; }
        step(s, 0, SYSTEMS);
        if (x0 !== null) peak = Math.max(peak, (f.x - x0) * spot.dx + (f.y - y0) * spot.dy);
        if (blocked(grid, [], f.x, f.y)) inWall++;
      }
      ok('knockback respects walls', inWall === 0 && peak < KIND.sword.knock * UNITS,
         `stopped after ${(peak / UNITS).toFixed(1)}px, ${inWall} ticks in masonry`);
    }
  }

  // A staggered foe does not bite, and the stagger ends.
  {
    const s = delve(den.floor, den.room);
    const f = s.foes[0]; s.foes = [f];
    f.mode = 'stagger'; f.modeAt = s.tick; f.bitAt = -9999; s.hurtAt = -9999;
    f.x = s.x + 2 * HALF; f.y = s.y;
    const during = combat(s, 0);
    ok('a staggered foe does not bite', !during.some((a) => a.k === 'bite'));
    ok('or move', !during.some((a) => a.k === 'moveFoe'));
    s.tick += FOE.dog.staggerTicks;
    const after = combat(s, 0);
    ok('and the stagger ends on time', after.some((a) => a.k === 'setMode' && a.mode === 'hunt'), `${FOE.dog.staggerTicks} ticks`);
    for (const a of after) applyAction(s, a);
    ok('after which it bites again', combat(s, 0).some((a) => a.k === 'bite'));
  }

  // Knockback runs both ways: a bite shoves you.
  {
    const s = delve(den.floor, den.room);
    s.hp = 1000;
    const f = s.foes[0]; s.foes = [f];
    const run = runFrom(s, 4);
    ok('the bite fixture has a run', !!run);
    if (run) {
      // You stand three tiles down the run; it stands flush beyond you; the
      // shove sends you back the way you came, over floor that is known clear.
      s.x += run.dx * 3 * TILE * UNITS; s.y += run.dy * 3 * TILE * UNITS;
      f.mode = 'hunt'; f.bitAt = -9999; s.hurtAt = -9999;
      f.x = s.x + run.dx * 2 * HALF; f.y = s.y + run.dy * 2 * HALF;
      const x0 = s.x, y0 = s.y;
      let peak = 0, bit = false;
      for (let i = 0; i < 30; i++) {
        const acts = combat(s, 0);
        if (acts.some((a) => a.k === 'bite')) bit = true;
        for (const a of acts) applyAction(s, a);
        step(s, 0, []);                               // physics only: the shove plays out
        peak = Math.max(peak, (x0 - s.x) * run.dx + (y0 - s.y) * run.dy);
      }
      ok('a bite shoves you back', bit && peak >= (FOE.dog.knock * UNITS) / 2,
         `${(peak / UNITS).toFixed(1)}px of ${FOE.dog.knock}`);
      ok('and the shove is worked off, not permanent', s.vx === 0 && s.vy === 0);
    }
  }
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all combat gates passed\n');
process.exit(failures ? 1 : 0);
