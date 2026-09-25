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
import { carriedBulk, tier, bestWeapon, weaponOf, mostFragile, BULK_BUDGET } from '../sim/carry.js';
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
  s.foes[0].mode = 'circle';
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
  foe.mode = 'stagger'; foe.modeAt = k.tick; foe.hp = 99;   // held still: a target, not a fight
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
  f.mode = 'lunge'; f.modeAt = s.tick - FOE.dog.lungeWindup; f.aimX = s.x; f.aimY = s.y;
  f.x = s.x + 2 * H0; f.y = s.y;      // touching, not inside — bodies cannot overlap now
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
// Since the machine this is not a footrace, so raw speed says nothing. What
// decides it is BREAKING CONTACT: after a bite, can you get clear of lunge
// range before the crouch ends? Measured on the camp's open ground — thirty
// clear tiles with a wall above, so the dog circles below and has the room to
// do everything it knows. SPEED, LOAD and FOE are imported, not copied.
{
  const { CAMP } = await import('../core/gen.js');
  const chase = (bulk) => {
    const s = createState(SEED);                    // the camp: floor -1
    s.hp = 1000;
    s.x = (2 * TILE + TILE / 2) * UNITS; s.y = (TILE + TILE / 2) * UNITS;   // top row, west end
    s.facing = 1;
    // The issued blade is already in the row at bulk 3; keys make up the rest.
    s.carried = Array.from({ length: Math.max(0, bulk - 3) }, (_, i) => ref('key', i));
    // The moment after a bite: flush behind you, backing off.
    s.foes = [{ id: 'chaser', kind: 'dog', x: s.x - 2 * 5 * UNITS, y: s.y, hp: 999,
                mode: 'recover', modeAt: 0, spin: 1, aimX: 0, aimY: 0, vx: 0, vy: 0 }];
    const f = s.foes[0];
    const bites = [];
    for (let i = 0; i < 400; i++) {
      const hp = s.hp;
      step(s, setVerb(0, VERB.RIGHT, true), SYSTEMS);
      if (s.hp < hp) bites.push(i);
      if (s.floor !== CAMP) break;                     // ran out of camp: the fixture is wrong, not the dog
    }
    const gap = Math.max(Math.abs(s.x - f.x), Math.abs(s.y - f.y));
    return { t: tier(carriedBulk(s)), bites, gap: gap / UNITS, floor: s.floor };
  };
  const light = chase(4), laden = chase(12), over = chase(19);
  ok('the chase fixtures stayed in the camp', [light, laden, over].every((r) => r.floor === CAMP));
  ok('the tiers are what they claim', light.t === 'light' && laden.t === 'laden' && over.t === 'overloaded');
  ok('light breaks contact', light.bites.length === 0 && light.gap > FOE.dog.orbit + FOE.dog.orbitWobble,
     `no bites in 400 ticks; ${light.gap.toFixed(0)}px clear at the end`);
  ok('laden does not', laden.bites.length > 0, laden.bites.length ? `bitten at tick ${laden.bites[0]}` : 'never bitten');
  ok('overloaded is run down sooner', over.bites.length > 0 && (!laden.bites.length || over.bites[0] <= laden.bites[0]),
     over.bites.length ? `bitten at tick ${over.bites[0]}, ${over.bites.length} times` : 'never bitten');

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
  // Not scattered on the floor any more: ONE container where you fell, holding
  // everything, pack and row. Your remains are the reason for the next run.
  ok('and everything you held is in your remains where you fell',
     s.dropped.length === 0 && s.remains.length === 1 && s.remains[0].floor === where.floor && s.remains[0].room === where.room
       && s.remains[0].items.length === 4,
     `${s.remains[0]?.items.length} items at ${where.floor}:${where.room}`);
  ok('including the blade and the cap — death takes everything',
     s.remains[0].items.some((r) => r.kind === 'sword') && s.remains[0].items.some((r) => r.kind === 'bcap'));

  // Going back for them.
  {
    const { thingsIn, containerItems, reachable, remainsKey } = await import('../sim/room.js');
    const { prompt } = await import('../sim/prompt.js');
    const { forceOn } = await import('../core/items.js');
    const { toDelta } = await import('../sim/state.js');
    const { gridOf: gridOfRoom } = await import('../sim/room.js');
    const { centreOf } = await import('../sim/space.js');
    const r0 = s.remains[0], key = remainsKey(0);
    s.site = 0; s.floor = r0.floor; s.room = r0.room; s.foes = [];
    const c = centreOf(r0.tile); s.x = c.x; s.y = c.y;
    enterRoom(s); s.foes = [];
    ok('your remains lie in the room, as a container', thingsIn(s, s.site, s.floor, s.room).some((t) => t.kind === 'remains' && t.key === key && t.tile === r0.tile));
    ok('you can stand on them', !solidTile(0) && KIND.remains.solid === false);
    ok('and the toast says what to do', prompt(s) && prompt(s).text === 'Open remains', prompt(s)?.text);
    step(s, setVerb(0, VERB.INTERACT, true), SYSTEMS);
    ok('opening them is the container screen', s.screen === 'container' && s.screenKey === key);
    const shown = containerItems(s, key);
    ok('showing everything you died with', shown.length === 4 && shown.every((x) => x.remains === 0));
    step(s, 0, SYSTEMS);
    step(s, setVerb(0, VERB.INTERACT, true), SYSTEMS);            // take the first
    ok('taking one moves it to your pack and out of the bones', s.carried.length === 1 && containerItems(s, key).length === 3);
    step(s, 0, SYSTEMS);
    step(s, setVerb(0, VERB.TOOL, true), SYSTEMS);                // take all
    ok('take-all empties them', containerItems(s, key).length === 0 && s.carried.length === 4);
    ok('and the sword came back as a thing you can wield again', s.carried.some((r) => r.kind === 'sword' && r.key === 'issue:0:0:0'));
    step(s, 0, SYSTEMS);
    step(s, setVerb(0, VERB.CANCEL, true), SYSTEMS);
    ok('the empty bones stay as a marker but ask nothing more', thingsIn(s, s.site, s.floor, s.room).some((t) => t.kind === 'remains') && (!reachable(s) || reachable(s).kind !== 'remains'));
    // A cap set on your bones destroys them, contents and all. It is not a nice place.
    ok('a cap destroys your remains', forceOn('remains') === 'breaks');
    {
      const { blastOf } = await import('../core/items.js');
      const g = createState(SEED); g.hp = 1000;
      g.site = 0; g.floor = r0.floor; g.room = r0.room;
      const cc = centreOf(r0.tile); g.x = cc.x; g.y = cc.y;
      g.remains = [{ site: 0, floor: r0.floor, room: r0.room, tile: r0.tile, at: 0, items: [{ kind: 'gem', key: '0:0:0:9' }] }];
      enterRoom(g); g.foes = [];
      g.equipped.tool = { kind: 'bcap', key: 'issue:0:0:1' };
      // Set it and walk clear along whatever is open, so the blast alone is measured.
      step(g, setVerb(0, VERB.TOOL, true), SYSTEMS); step(g, 0, SYSTEMS);
      const gridG = gridOfRoom(g);
      const away = [[VERB.LEFT, -1, 0], [VERB.RIGHT, 1, 0], [VERB.UP, 0, -1], [VERB.DOWN, 0, 1]].find(([, dx, dy]) => { const t = r0.tile + dy * 32 + dx * 2; return t >= 0 && t < gridG.length && !solidTile(gridG[t]) && !solidTile(gridG[r0.tile + dy * 32 + dx]); });
      for (let i = 0; i < blastOf('bcap').fuse + 4; i++) step(g, away ? setVerb(0, away[0], true) : 0, SYSTEMS);
      ok('and it does: the bones are gone from the room', !thingsIn(g, 0, r0.floor, r0.room).some((t) => t.kind === 'remains'));
      ok('with everything in them', g.remains[0].gone === true && g.remains[0].items.length === 0);
      ok('and a scar where they lay', g.scars.includes(`0:${r0.floor}:${r0.room}:${r0.tile}`));
    }
    const d = JSON.parse(JSON.stringify(toDelta(s)));
    ok('remains survive a save', d.remains.length === 1 && Array.isArray(d.remains[0].items));
    const h1 = hashState(s), h2 = hashState(Object.assign(createState(SEED), d));
    ok('and are hashed', h1 === h2);
  }
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
      f.mode = 'circle'; f.modeAt = s.tick; f.x = run.x; f.y = run.y;
      // A dog that reaches you bites every 45 ticks, and six bites is a dead
      // player: die() moves you to camp and every measurement below becomes
      // the distance from the camp spawn to a frozen foe. That read as
      // "50.3px" twice and was blamed on geometry. So: the run is as long as
      // arrival needs and no longer, and surviving it is asserted.
      s.hp = 1000;
      // A hunter circles and lunges rather than walking in, so the run is
      // long enough for at least one lunge to land, and what is asserted is
      // that contact happened and overlap never did.
      let overlapped = 0, moved = false, contacts = 0, minGap = Infinity;
      const fx0 = f.x, fy0 = f.y;
      for (let i = 0; i < 400; i++) {
        for (const a of combat(s, 0)) applyAction(s, a);
        if (f.x !== fx0 || f.y !== fy0) moved = true;
        if (overlap(s, f)) overlapped++;
        if (touching(s.x, s.y, f.x, f.y)) contacts++;
        minGap = Math.min(minGap, Math.max(Math.abs(s.x - f.x), Math.abs(s.y - f.y)));
        s.tick++;
      }
      ok('the fixture survived to be measured', !s.deaths && s.floor === den.floor, `deaths ${s.deaths || 0}, floor ${s.floor}`);
      ok('a foe cannot walk through the player', moved && overlapped === 0 && minGap >= 2 * HALF && contacts > 0,
         `${overlapped} overlapping ticks; ${contacts} ticks of contact; never nearer than ${(minGap / UNITS).toFixed(1)}px`);
    } else ok('a foe cannot walk through the player', false, 'no clear run from spawn');
  }

  // Two foes cannot stack into one.
  {
    const s = delve(den.floor, den.room);
    const a = s.foes[0];
    const run = runFrom(s, 7);
    const near = run ? { x: s.x + run.dx * 5 * TILE * UNITS, y: s.y + run.dy * 5 * TILE * UNITS } : { x: s.x - 5 * TILE * UNITS, y: s.y };
    a.mode = 'circle'; a.modeAt = s.tick; a.x = near.x; a.y = near.y;
    const b = { id: 'second', kind: 'dog', x: run ? run.x : a.x - 2 * TILE * UNITS, y: run ? run.y : s.y, hp: 6, mode: 'circle', modeAt: s.tick, spin: -1, aimX: 0, aimY: 0, vx: 0, vy: 0 };
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
      f.mode = 'lunge'; f.modeAt = s.tick - FOE.dog.lungeWindup; f.aimX = s.x; f.aimY = s.y; s.hurtAt = -9999;
      f.x = s.x + gap; f.y = s.y;
      const acts = combat(s, 0);
      return { bit: acts.some((x) => x.k === 'bite'), moved: acts.some((x) => x.k === 'moveFoe'), s, f };
    };
    const flush = at(2 * HALF);
    ok('a foe flush against you bites', flush.bit);
    ok('and does not step into you to do it', !flush.moved, flush.moved ? 'it moved' : 'held its ground');
    const far = at(2 * HALF + TOUCH + FOE.dog.lungeSpeed + 1);
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
    f.mode = 'stagger'; f.modeAt = s.tick;   // held still: a target dummy, not a fight
    f.x = s.x + run.dx * (2 * HALF + UNITS); f.y = s.y + run.dy * (2 * HALF + UNITS);
    const { grid } = tilesOf(s.seed, s.site, s.floor, s.room);
    const px0 = s.x, py0 = s.y;
    let x0 = null, y0 = null, peak = 0, inside = 0, inWall = 0, staggered = false;
    step(s, setVerb(0, VERB.ATTACK, true), SYSTEMS);
    for (let i = 0; i < 60; i++) {
      if (x0 === null && f.hp < FOE.dog.hp) { x0 = f.x; y0 = f.y; }   // the tick it landed
      step(s, 0, SYSTEMS);
      if (!s.foes.length) break;
      // Only while it is DOWN: once it is up again it moves on its own account.
      if (x0 !== null && f.mode === 'stagger') peak = Math.max(peak, (f.x - x0) * run.dx + (f.y - y0) * run.dy);
      if (overlap(s, f)) inside++;
      if (blocked(grid, [], f.x, f.y)) inWall++;
      if (i > FOE.dog.staggerTicks && f.mode === 'stagger') staggered = true;   // still down after the FIRST stagger would have ended: the hit renewed it
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
      f.mode = 'stagger'; f.modeAt = s.tick;
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
    f.mode = 'stagger'; f.modeAt = s.tick; s.hurtAt = -9999;
    f.x = s.x + 2 * HALF; f.y = s.y;
    const during = combat(s, 0);
    ok('a staggered foe does not bite', !during.some((a) => a.k === 'bite'));
    ok('or move', !during.some((a) => a.k === 'moveFoe'));
    s.tick += FOE.dog.staggerTicks;
    const after = combat(s, 0);
    ok('and the stagger ends on time', after.some((a) => a.k === 'setMode' && a.mode === 'circle'), `${FOE.dog.staggerTicks} ticks`);
    for (const a of after) applyAction(s, a);
    ok('into circling, not a bite', f.mode === 'circle' && !combat(s, 0).some((a) => a.k === 'bite'));
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
      f.mode = 'lunge'; f.modeAt = s.tick - FOE.dog.lungeWindup; f.aimX = s.x; f.aimY = s.y; s.hurtAt = -9999;
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

// --- the machine: step 2 of plans/foe-behaviour.md ---------------------------
// Circle, crouch, strike, back off. Asserted, not eyeballed.
{
  const { HALF, TOUCH, touching, octLen, blocked, solidBodies, centreOf } = await import('../sim/space.js');
  const { roomTiles: tilesOf, floorPlan: planOf, floorCount: countOf, COLS: C, ROWS: R, T: TT } = await import('../core/gen.js');
  const { circleFor } = await import('../core/foes.js');
  const den = denRoom();
  const overlap = (a, b) => Math.abs(a.x - b.x) < 2 * HALF && Math.abs(a.y - b.y) < 2 * HALF;
  const dog = FOE.dog;

  // A room with room in it: the run is used to place the dog at orbit range.
  const arena = (tiles = 3) => {
    const s = delve(den.floor, den.room);
    s.hp = 1000;
    const f = s.foes[0]; s.foes = [f];
    const run = runFrom(s, tiles);
    return { s, f, run };
  };

  // Circling keeps its distance — and circles. Its circle is made endless so
  // the gate sees the mode alone.
  {
    const { s, f, run } = arena(3);
    ok('the machine fixture has a run', !!run);
    if (run) {
      const saved = dog.circleTicks; dog.circleTicks = [100000, 100000];
      f.mode = 'circle'; f.modeAt = s.tick; f.x = run.x; f.y = run.y;
      let contact = 0, quadrants = new Set(), lunged = false, ticksOut = 0, ticksIn = 0;
      for (let i = 0; i < 400; i++) {
        for (const a of combat(s, 0)) { if (a.k === 'setMode' && a.mode === 'lunge') lunged = true; applyAction(s, a); }
        s.tick++;
        if (touching(s.x, s.y, f.x, f.y)) contact++;
        const d = octLen(f.x - s.x, f.y - s.y);
        if (i > 100) { if (d > (dog.orbit + 14) * UNITS) ticksOut++; if (d < (dog.orbit - 14) * UNITS) ticksIn++; }
        quadrants.add((f.x >= s.x ? 'E' : 'W') + (f.y >= s.y ? 'S' : 'N'));
      }
      dog.circleTicks = saved;
      ok('circling keeps its distance', contact === 0 && !lunged, `${contact} ticks of contact`);
      ok('and holds near orbit once it settles', ticksOut + ticksIn < 90, `${ticksOut} far, ${ticksIn} near, of 300`);
      ok('and actually goes round', quadrants.size >= 3, [...quadrants].join(' '));
    }
  }

  // The orbit is not perfect: over a long circle it breathes in to within a
  // blade's reach and out again. Chasing it can land a hit — and costs you.
  {
    const { orbitFor } = await import('../core/foes.js');
    const reach = (KIND.sword.reach + 5) * UNITS;          // the box's far edge from your centre
    const wants = [...Array(dog.orbitPeriod)].map((_, t) => orbitFor(dog, 'x', t));
    ok('the orbit breathes', Math.min(...wants) <= dog.orbit - dog.orbitWobble + 1 && Math.max(...wants) >= dog.orbit + dog.orbitWobble - 1,
       `${Math.min(...wants)}..${Math.max(...wants)}px over ${dog.orbitPeriod} ticks`);
    ok('and at its closest it is just inside a sword', Math.min(...wants) * UNITS < reach && Math.min(...wants) * UNITS > 2 * HALF + TOUCH,
       `${Math.min(...wants)}px vs ${reach / UNITS}px reach`);
    ok('two dogs do not breathe in step', Math.abs(orbitFor(dog, '0:0:0:0', 0) - orbitFor(dog, '0:0:0:1', 0)) >= 4,
       `${orbitFor(dog, '0:0:0:0', 0)}px vs ${orbitFor(dog, '0:0:0:1', 0)}px at the same tick`);

    // The chase. You walk at it and swing whenever it is in the box; it runs
    // its full machine. A chaser CAN land a hit, and is bitten for trying.
    const { s, f, run } = arena(3);
    if (run) {
      const { hitBox: boxOf, inHitBox: inBox } = await import('../sim/carry.js');
      f.mode = 'circle'; f.modeAt = s.tick; f.x = run.x; f.y = run.y;
      f.hp = 999;                                     // a full chase, not a short one: two hits kill a real dog
      let hits = 0, bites = 0;
      for (let i = 0; i < 900 && s.foes.length; i++) {
        const rx = f.x - s.x, ry = f.y - s.y;
        const toward = Math.abs(rx) >= Math.abs(ry) ? (rx > 0 ? VERB.RIGHT : VERB.LEFT) : (ry > 0 ? VERB.DOWN : VERB.UP);
        let frame = setVerb(0, toward, true);
        // Face it, then swing if its centre is in the box and no swing is up.
        const faced = { ...s, facing: Math.abs(rx) >= Math.abs(ry) ? (rx > 0 ? 1 : 3) : (ry > 0 ? 2 : 0), swing: null };
        if (!swingPhase(s) && inBox(boxOf(faced), f.x, f.y)) frame = setVerb(frame, VERB.ATTACK, true);
        const hp = s.hp, fhp = f.hp;
        step(s, frame, SYSTEMS);
        if (f.hp < fhp) hits++;
        if (s.hp < hp) bites++;
      }
      ok('chasing it, you can just about land a hit', hits > 0, `${hits} hits in 900 ticks`);
      ok('but it is risky', bites > 0, `${bites} bites taken doing it`);
    }
  }

  // A lunge closes the gap: from orbit range, contact within the lunge.
  {
    const { s, f, run } = arena(3);
    if (run) {
      f.mode = 'lunge'; f.modeAt = s.tick; f.aimX = s.x; f.aimY = s.y;
      f.x = s.x + run.dx * dog.orbit * UNITS; f.y = s.y + run.dy * dog.orbit * UNITS;
      let bitAt = -1, stillDuringCrouch = true;
      const x0 = f.x, y0 = f.y;
      for (let i = 0; i < dog.lungeTicks + 5 && bitAt < 0; i++) {
        for (const a of combat(s, 0)) { if (a.k === 'bite') bitAt = i; applyAction(s, a); }
        if (i < dog.lungeWindup && (f.x !== x0 || f.y !== y0)) stillDuringCrouch = false;
        s.tick++;
      }
      ok('a lunge crouches first', stillDuringCrouch, `${dog.lungeWindup} still ticks`);
      ok('then closes the gap', bitAt >= 0 && bitAt < dog.lungeTicks, bitAt >= 0 ? `bit at tick ${bitAt}` : 'never bit');
      ok('and the bite ends the dash', f.mode === 'recover');
    }
  }

  // A lunge can be sidestepped: it goes where you WERE.
  {
    const { s, f, run } = arena(3);
    if (run) {
      const { grid } = tilesOf(s.seed, s.site, s.floor, s.room);
      // A clear tile beside you, perpendicular to the run.
      const [tx, ty] = [Math.floor(s.x / (TILE*UNITS)), Math.floor(s.y / (TILE*UNITS))];
      const perp = [[run.dy, run.dx], [-run.dy, -run.dx]].find(([ox, oy]) =>
        grid[(ty + oy) * C + (tx + ox)] === TT.FLOOR && !blocked(grid, solidBodies(s), s.x + ox * TILE * UNITS, s.y + oy * TILE * UNITS));
      ok('there is a tile to step aside to', !!perp);
      if (perp) {
        const verb = perp[0] > 0 ? VERB.RIGHT : perp[0] < 0 ? VERB.LEFT : perp[1] > 0 ? VERB.DOWN : VERB.UP;
        f.mode = 'lunge'; f.modeAt = s.tick; f.aimX = s.x; f.aimY = s.y;
        f.x = s.x + run.dx * dog.orbit * UNITS; f.y = s.y + run.dy * dog.orbit * UNITS;
        let bites = 0;
        for (let i = 0; i < dog.lungeTicks + dog.recoverTicks; i++) {
          const frame = i < dog.lungeWindup + 6 ? setVerb(0, verb, true) : 0;   // step aside, then stand
          const before = s.hp;
          step(s, frame, SYSTEMS);
          if (s.hp < before) bites++;
        }
        ok('a lunge can be sidestepped', bites === 0, `${bites} bites; aim was fixed at the crouch`);
      }
    }
  }

  // Recovery is a window: after a bite, no second bite for at least recoverTicks.
  {
    const { s, f } = arena(1);
    f.mode = 'lunge'; f.modeAt = s.tick - dog.lungeWindup; f.aimX = s.x; f.aimY = s.y;
    f.x = s.x + 2 * HALF; f.y = s.y;
    s.hurtAt = -9999;
    const bites = [];
    for (let i = 0; i < 300; i++) {
      const before = s.hp;
      step(s, 0, SYSTEMS);
      if (s.hp < before) bites.push(i);
    }
    ok('a flush lunge bites at once', bites[0] === 0, `first bite tick ${bites[0]}`);
    ok('recovery is a window', bites.length < 2 || bites[1] - bites[0] >= dog.recoverTicks,
       bites.length > 1 ? `next bite ${bites[1] - bites[0]} ticks later` : 'no second bite in 300 ticks');
  }

  // A corridor forces the direct approach: in a one-wide passage the dog still
  // reaches you, so a doorway is a place to fight and not a place to hide.
  {
    // Find a straight one-wide passage: three floor tiles in a row with solid
    // tiles on both sides of each. Anywhere in the world will do.
    let spot = null;
    outer: for (let site = 0; site < 24; site++)
      for (let fl = 0; fl < countOf(SEED, site); fl++)
        for (const room of planOf(SEED, site, fl).cells) {
          const { grid } = tilesOf(SEED, site, fl, room);
          for (let y = 2; y < R - 2; y++) for (let x = 2; x < C - 4; x++) {
            const solidAt = (xx, yy) => solidTile(grid[yy * C + xx]);
            const row = [0, 1, 2, 3].every((k) => grid[y * C + x + k] === TT.FLOOR && solidAt(x + k, y - 1) && solidAt(x + k, y + 1));
            if (row) { spot = { site, floor: fl, room, x, y, dx: 1, dy: 0 }; break outer; }
            const col = [0, 1, 2, 3].every((k) => grid[(y + k) * C + x] === TT.FLOOR && solidAt(x - 1, y + k) && solidAt(x + 1, y + k));
            if (col) { spot = { site, floor: fl, room, x, y, dx: 0, dy: 1 }; break outer; }
          }
        }
    ok('the world has a one-wide passage to test in', !!spot, spot ? `site ${spot.site} floor ${spot.floor} room ${spot.room}` : 'none in 24 sites');
    if (spot) {
      const s = createState(SEED);
      s.site = spot.site; s.floor = spot.floor; s.room = spot.room; s.hp = 1000;
      const a = centreOf(spot.y * C + spot.x), b = centreOf((spot.y + 3 * spot.dy) * C + spot.x + 3 * spot.dx);
      s.x = a.x; s.y = a.y;
      const saved = dog.circleTicks; dog.circleTicks = [100000, 100000];   // circling only: no lunge to cheat with
      s.foes = [{ id: 'corridor', kind: 'dog', x: b.x, y: b.y, hp: 6, mode: 'circle', modeAt: 0, spin: 1, aimX: 0, aimY: 0, vx: 0, vy: 0 }];
      const f = s.foes[0];
      let reached = -1;
      for (let i = 0; i < 200 && reached < 0; i++) {
        for (const act of combat(s, 0)) applyAction(s, act);
        s.tick++;
        if (touching(s.x, s.y, f.x, f.y)) reached = i;
      }
      dog.circleTicks = saved;
      ok('a corridor forces the direct approach', reached >= 0, reached >= 0 ? `reached you in ${reached} ticks` : 'never arrived');
    }
  }

  // A pack does not lunge in unison.
  {
    const { s, f, run } = arena(3);
    if (run) {
      const g = { id: 'second', kind: 'dog', x: 0, y: 0, hp: 6, mode: 'circle', modeAt: s.tick, spin: -1, aimX: 0, aimY: 0, vx: 0, vy: 0 };
      f.mode = 'circle'; f.modeAt = s.tick; f.x = run.x; f.y = run.y;
      g.x = s.x + run.dx * 2 * TILE * UNITS + run.dy * TILE * UNITS; g.y = s.y + run.dy * 2 * TILE * UNITS + run.dx * TILE * UNITS;
      s.foes = [f, g];
      ok('two dogs that woke together circle for different times',
         circleFor(dog, s.seed, f.id, f.modeAt) !== circleFor(dog, s.seed, g.id, g.modeAt),
         `${circleFor(dog, s.seed, f.id, f.modeAt)} vs ${circleFor(dog, s.seed, g.id, g.modeAt)} ticks`);
      const first = {};
      for (let i = 0; i < 200; i++) {
        for (const a of combat(s, 0)) { if (a.k === 'setMode' && a.mode === 'lunge' && !(a.id in first)) first[a.id] = i; applyAction(s, a); }
        s.tick++;
      }
      ok('a pack does not lunge in unison', first[f.id] !== undefined && first[g.id] !== undefined && first[f.id] !== first[g.id],
         `lunged at ${first[f.id]} and ${first[g.id]}`);
    }
  }
}

// --- the Broken Sentinel: the machine is a template ---------------------------
// A second policy table, no second machine. It does not stir until you are
// within its radius; then it comes slowly and straight; a sword does not move it.
{
  const { impulse, HALF, TOUCH, touching, octLen } = await import('../sim/space.js');
  const { CAMP } = await import('../core/gen.js');
  const { readFile } = await import('node:fs/promises');
  const sen = FOE.sentinel, dog = FOE.dog;

  // The proof of the template: the machine names no kind. Comments aside.
  const src = (await readFile(new URL('../systems/combat/index.js', import.meta.url), 'utf8'))
    .split('\n').filter((l) => !l.trim().startsWith('//')).map((l) => l.split('//')[0]).join('\n');
  ok('the machine names no kind — a Sentinel is a table, not a branch', !/sentinel|'dog'|"dog"/.test(src));

  // Open ground: the camp's top row, as the contact gates use.
  const open = (gapPx, mode = 'asleep') => {
    const s = createState(SEED); s.hp = 1000;
    s.x = (6 * TILE + TILE / 2) * UNITS; s.y = (TILE + TILE / 2) * UNITS; s.facing = 1;
    s.foes = [{ id: 'statue', kind: 'sentinel', x: s.x + gapPx * UNITS, y: s.y, hp: sen.hp,
                mode, modeAt: s.tick, spin: 1, aimX: 0, aimY: 0, vx: 0, vy: 0 }];
    return { s, f: s.foes[0] };
  };
  const run = (s, ticks, frame = 0) => { for (let i = 0; i < ticks; i++) step(s, frame, SYSTEMS); };

  // It does not stir until you are within its radius.
  {
    const far = open((sen.wake + 1) * TILE);
    const x0 = far.f.x; run(far.s, 90);
    ok('a sentinel does not stir until you are within its radius', far.f.mode === 'asleep' && far.f.x === x0,
       `${sen.wake + 1} tiles away: ${far.f.mode}, unmoved after 90 ticks`);
    const near = open(sen.wake * TILE);
    run(near.s, 2);
    ok('and stirs when you are', near.f.mode !== 'asleep', `${sen.wake} tiles away: ${near.f.mode}`);
  }

  // Then it comes straight at you, slowly.
  {
    const { s, f } = open(100, 'circle');
    const x0 = f.x, y0 = f.y;
    let backwards = 0, prev = f.x;
    for (let i = 0; i < 150; i++) { step(s, 0, SYSTEMS); if (f.x > prev) backwards++; prev = f.x; }
    const closed = (x0 - f.x) / UNITS;
    ok('then it comes at you', closed > 40 && backwards === 0, `closed ${closed.toFixed(0)}px in 150 ticks, never a step back`);
    ok('in a straight line — it does not circle', Math.abs(f.y - y0) <= UNITS, `drifted ${(Math.abs(f.y - y0) / UNITS).toFixed(1)}px sideways`);
    const [n, d] = LOAD.overloaded;
    ok('and slowly: even overloaded you can walk away from it', sen.speed < ((SPEED * n) / d | 0), `${sen.speed} < ${(SPEED * n) / d | 0}`);
  }

  // It strikes only within reach — never at empty air.
  {
    const far = open(sen.strikeRange + 30, 'circle'); far.f.modeAt = far.s.tick - 1000;
    ok('it does not lurch at empty air', !combat(far.s, 0).some((a) => a.k === 'setMode' && a.mode === 'lunge'));
    const near = open(sen.strikeRange - 2, 'circle'); near.f.modeAt = near.s.tick - 1000;
    ok('but commits when it can reach you', combat(near.s, 0).some((a) => a.k === 'setMode' && a.mode === 'lunge'));
    // And the lurch connects from there.
    let bit = false;
    for (let i = 0; i < sen.lungeTicks + 2 && !bit; i++) { const hp = near.s.hp; step(near.s, 0, SYSTEMS); if (near.s.hp < hp) bit = true; }
    ok('and the blow lands', bit, `from ${sen.strikeRange - 2}px`);
  }

  // A sword does not move it. A heavier blow would.
  {
    ok('a sword does not move a sentinel', impulse(KIND.sword.knock, sen.weight) === 0 && impulse(UNARMED.knock, sen.weight) === 0,
       `${KIND.sword.knock} over weight ${sen.weight}`);
    ok('a heavy impact weapon would', impulse(48, sen.weight) > 0, `knock 48: ${(impulse(48, sen.weight) * 4 / UNITS).toFixed(0)}px`);
    ok('while a dog still moves to a fist', impulse(UNARMED.knock, dog.weight) > 0);
    // In the simulation: hit it, and watch it neither stagger nor give ground.
    // Underground — steel stays sheathed in camp, and a fixture there swung
    // at nothing and reported a statue at full health as proof.
    const den = denRoom();
    const s = delve(den.floor, den.room); s.hp = 1000;
    const f = s.foes[0]; s.foes = [f];
    const way = runFrom(s, 2) || { dx: 1, dy: 0 };
    f.kind = 'sentinel'; f.hp = sen.hp; f.mode = 'circle'; f.modeAt = s.tick;
    f.x = s.x + way.dx * (2 * HALF + UNITS); f.y = s.y + way.dy * (2 * HALF + UNITS);
    s.facing = way.dy < 0 ? 0 : way.dx > 0 ? 1 : way.dy > 0 ? 2 : 3;
    const along = (b) => (b.x - f.x) * way.dx + (b.y - f.y) * way.dy;
    const x0 = { x: f.x, y: f.y };
    let staggered = false, gaveGround = false;
    step(s, setVerb(0, VERB.ATTACK, true), SYSTEMS);
    for (let i = 0; i < 30; i++) { step(s, 0, SYSTEMS); if (f.mode === 'stagger') staggered = true; if ((f.x - x0.x) * way.dx + (f.y - x0.y) * way.dy > 0) gaveGround = true; }
    ok('so hitting one staggers nothing and gives no ground', f.hp < sen.hp && !staggered && !gaveGround,
       `hp ${f.hp}/${sen.hp}, ${staggered ? 'staggered' : 'unmoved'}`);
  }

  ok('its blow hits harder and throws further than a dog\'s', sen.damage > dog.damage && sen.knock > dog.knock,
     `${sen.damage} for ${sen.knock}px vs ${dog.damage} for ${dog.knock}px`);

  // Where it stands: the deep strata, never the shallows.
  {
    let shallow = 0, deep = 0;
    for (let site = 0; site < 24; site++)
      for (let fl = 0; fl < floorCount(SEED, site); fl++)
        for (const room of floorPlan(SEED, site, fl).cells)
          for (const f of foesOf(SEED, site, fl, room)) if (f.kind === 'sentinel') { if (absDepth(fl) < 3) shallow++; else deep++; }
    ok('sentinels stand in the deep strata', deep > 0, `${deep} below depth 3`);
    ok('and never in the shallows', shallow === 0, `${shallow} above`);
  }
}

// --- the glass remembers: fade and pop are delta -------------------------------
{
  const { FADE_TICKS, POP_TICKS } = await import('../sim/state.js');
  const den = denRoom();
  const s = delve(den.floor, den.room);
  ok('a new state does not fade in', s.tick - s.arrivedAt >= FADE_TICKS);
  const f = s.foes[0];
  applyAction(s, { k: 'hurtFoe', id: f.id, n: 999 });
  ok('a kill leaves a pop where it died', s.pops.length === 1 && s.pops[0].kind === f.kind && s.pops[0].x === f.x, `${s.pops[0]?.kind} at ${s.pops[0]?.x},${s.pops[0]?.y}`);
  for (let i = 0; i < POP_TICKS; i++) step(s, 0, SYSTEMS);
  ok('and the pop expires', s.pops.length === 0, `${POP_TICKS} ticks`);
  s.hp = 1; s.hurtAt = -9999;
  const t = s.tick;
  applyAction(s, { k: 'bite', id: 'x', n: 5 });
  ok('dying stamps the arrival, like a stair does', s.deaths === 1 && s.arrivedAt === t, `arrivedAt ${s.arrivedAt} at tick ${t}`);
  const a = delve(den.floor, den.room), b = delve(den.floor, den.room);
  for (const st of [a, b]) { applyAction(st, { k: 'hurtFoe', id: st.foes[0].id, n: 999 }); for (let i = 0; i < 4; i++) step(st, 0, SYSTEMS); }
  ok('replay holds with a pop in flight', hashState(a) === hashState(b) && a.pops.length === 1);
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all combat gates passed\n');
process.exit(failures ? 1 : 0);
