// Combat gates. Two things are under test and the first matters more.
//
// One: the LAYER CONTRACT. `systems/combat/` is the first L4 system this project
// has ever had, so the claims in specs/spec-layer-contract.md — a system
// proposes and never writes, a system is deletable, replay survives — stop being
// architecture and start being assertions here.
//
// Two: that a dog is a cargo problem rather than a damage problem.

import { createState, hashState, spawnIn, UNITS, MAX_HP, saying, SAY_TICKS, friendly } from '../sim/state.js';
import { step, applyAction, enterRoom } from '../sim/step.js';
import combat, { WINDUP, ACTIVE, SWING_TICKS, HURT_INVULN, hitBox, swingPhase } from '../systems/combat/index.js';
const SYSTEMS = [combat];
import { foesOf, FOE } from '../core/foes.js';
import { floorPlan, floorCount, roomTiles, absDepth, COLS, ROWS, TILE, T } from '../core/gen.js';
import { VERB, setVerb } from '../sim/frame.js';
import { carriedBulk, tier, bestWeapon, mostFragile, BULK_BUDGET } from '../sim/interact.js';
import { KIND, isSolidItem } from '../core/items.js';
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
  s.foes[0].awake = true;
  const before = hashState(s);
  const actions = combat(s, 0);
  ok('combat() proposes actions', Array.isArray(actions) && actions.length > 0, `${actions.length} actions`);
  ok('and mutates nothing at all', hashState(s) === before);

  // Deletability. `plans/slice-01.md` gates it; this is the gate.
  const peaceful = delve(den.floor, den.room);
  const walk = setVerb(setVerb(0, VERB.RIGHT, true), VERB.DOWN, true);
  for (let i = 0; i < 200; i++) step(peaceful, walk, []);   // no systems: the peaceful build
  ok('a build with no systems still runs', peaceful.tick === 200 && peaceful.hp === MAX_HP);
  ok('and nothing hunts you in it', peaceful.foes.every((f) => !f.awake));

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
  for (const f of a.foes) if (!Number.isInteger(f.x) || !Number.isInteger(f.y)) fractional++;
  ok('no float enters a foe position', fractional === 0);

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

  // Empty-handed below ground is the other refusal worth voicing.
  const bare = delve(den.floor, den.room);
  bare.carried = [];
  step(bare, setVerb(0, VERB.ATTACK, true), [combat]);
  ok('swinging with nothing says so too', !bare.swing && !!saying(bare),
     bare.say ? bare.say.text : 'silence');

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
  foe.awake = true; foe.hp = 99;
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
  f.awake = true; f.x = s.x; f.y = s.y;
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
  const SPEED = 192;
  const at = (bulk) => {
    const t = tier(bulk);
    const [n, d] = { light: [1,1], laden: [4,5], overloaded: [11,20] }[t];
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
    s.carried = [ref('sword', 9), ...Array.from({ length: bulk - 3 }, (_, i) => ref('key', i))];
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
  s.carried = [ref('sword', 9), ref('gem', 1), ref('bones', 2)];
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
  s.carried = [ref('sword', 9), ref('gem', 1), ref('bones', 2)];
  step(s, setVerb(0, VERB.DROP, true), SYSTEMS);
  ok('drop-load jettisons the cargo', s.dropped.length === 2, `${s.dropped.length} down`);
  ok('and leaves you armed', s.carried.length === 1 && s.carried[0].kind === 'sword',
     s.carried.map((r) => r.kind).join(','));
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all combat gates passed\n');
process.exit(failures ? 1 : 0);
