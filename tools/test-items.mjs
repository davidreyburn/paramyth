// Item and interaction gates. The loop's whole question is triage under cost,
// so the things under test are: items exist, they are reachable, they weigh
// something, and the prompt never disagrees with what the button does.

import { contentsOf, insideOf, roomTiles, floorPlan, floorCount, COLS, ROWS, TILE, T, solidTile } from '../core/gen.js';
import { KIND, isContainer, isPortable, isSolidItem, footOf, bulkOf, verbFor } from '../core/items.js';
import { createState, spawnIn, toDelta, UNITS } from '../sim/state.js';
import { step, solidTiles, solidBodies } from '../sim/step.js';
import { VERB, setVerb } from '../sim/frame.js';
import { visible, reachable, keyOf, containerItems, stationAt, dropTile } from '../sim/room.js';
import { prompt } from '../sim/prompt.js';
import { carriedBulk, tier, BULK_BUDGET, STASH_SLOTS, bestWeapon } from '../sim/carry.js';
import { haulValue, chainFor } from '../sim/record.js';
import { hashState } from '../sim/state.js';

let failures = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!c) failures++; };
const SEED = 0x1594;

// Carried things are REFERENCES now — a kind plus the address its history is
// computed from. Distinct keys, so two fixtures never share a chain.
const ref = (kind, n = 0) => ({ kind, key: `0:0:0:${n}` });
const refs = (...kinds) => kinds.map((k, i) => ref(k, i));

// The game now starts in the CAMP, which holds no salvage. Anything testing
// loot, containers or collision needs to be underground first.
const delve = (site = 0, floor = 0, room = null) => {
  const s = createState(SEED);
  s.site = site; s.floor = floor;
  s.room = room !== null ? room : floorPlan(SEED, site, floor).cells[0];
  const p = spawnIn(SEED, s.site, s.floor, s.room);
  s.x = p.x; s.y = p.y;
  return s;
};

// --- placement -------------------------------------------------------------
{
  let rooms = 0, empty = 0, offFloor = 0, overlap = 0, total = 0;
  for (let s = 0; s < 40; s++)
    for (let f = 0; f < floorCount(SEED, s); f++)
      for (const r of floorPlan(SEED, s, f).cells) {
        const { grid } = roomTiles(SEED, s, f, r);
        const cs = contentsOf(SEED, s, f, r);
        rooms++; total += cs.length;
        if (!cs.length) empty++;
        const seen = new Set();
        for (const c of cs) {
          if (solidTile(grid[c.tile])) offFloor++;
          if (seen.has(c.tile)) overlap++;
          seen.add(c.tile);
        }
      }
  ok('every room holds something', empty === 0, `${rooms} rooms, ${total} placements, ${empty} empty`);
  ok('nothing is placed inside solid tiles', offFloor === 0, `${offFloor} off-floor`);
  ok('nothing is placed on top of anything else', overlap === 0, `${overlap} overlaps`);
  ok('placement is pure', JSON.stringify(contentsOf(SEED,3,1,1)) === JSON.stringify(contentsOf(SEED,3,1,1)));
}

// --- kinds -----------------------------------------------------------------
{
  const kinds = new Set();
  for (let s = 0; s < 120; s++)
    for (let f = 0; f < floorCount(SEED, s); f++)
      for (const r of floorPlan(SEED, s, f).cells)
        for (const c of contentsOf(SEED, s, f, r)) kinds.add(c.kind);
  const declared = Object.keys(KIND);
  const dead = declared.filter((k) => !kinds.has(k));
  ok('every declared kind can actually appear', dead.length === 0, dead.length ? 'never placed: ' + dead.join(', ') : `${kinds.size}/${declared.length}`);

  const verbless = [...kinds].filter((k) => !verbFor(k) && !KIND[k].fixture);
  ok('every non-fixture kind has a verb', verbless.length === 0, verbless.join(', '));

  let nested = 0;
  for (let s = 0; s < 40; s++)
    for (let f = 0; f < floorCount(SEED, s); f++)
      for (const r of floorPlan(SEED, s, f).cells)
        for (const c of contentsOf(SEED, s, f, r))
          if (isContainer(c.kind))
            for (const it of insideOf(SEED, s, f, r, c.slot)) if (isContainer(it.kind)) nested++;
  ok('containers hold no containers', nested === 0, `${nested} nested`);
}

// --- the prompt and the button must agree ----------------------------------
{
  const st = delve();
  const cs = visible(st);
  ok('the starting room has visible contents', cs.length > 0, `${cs.length}`);

  // Stand on each thing in turn and press the button; the prompt must have
  // predicted exactly what happened.
  let checked = 0, agreed = 0;
  for (const c of cs) {
    const s2 = delve();
    // Adjacent, not on top: a solid item is a place you cannot stand.
    s2.x = (((c.tile % COLS) - 1) * TILE + TILE/2) * UNITS;
    s2.y = (((c.tile / COLS) | 0) * TILE + TILE/2) * UNITS;
    const p = prompt(s2);
    if (!p) continue;
    checked++;
    const before = { carried: s2.carried.length, opened: s2.opened.length };
    step(s2, setVerb(0, VERB.INTERACT, true));
    const tookIt = s2.carried.length > before.carried;
    const openedIt = s2.opened.length > before.opened;
    if (p.refuse ? (!tookIt && !openedIt)
      : p.text.startsWith('Pick up') ? tookIt
      : p.text.startsWith('Open') ? openedIt
      : p.text === 'Descend' || p.text === 'Ascend' ? s2.floor !== 0 || s2.moves > 0
      : false) agreed++;
  }
  ok('the toast predicts what the button does', checked > 0 && agreed === checked, `${agreed}/${checked}`);
}

// --- bulk ------------------------------------------------------------------
{
  ok('tiers split the budget', tier(0) === 'light' && tier(12) === 'laden' && tier(19) === 'overloaded',
     `light<=8 laden<=16 overloaded<=${BULK_BUDGET}`);

  const s = delve();
  s.equipped.weapon = null; s.equipped.tool = null;
  s.carried = Array.from({ length: BULK_BUDGET }, (_, i) => ref('key', i));   // bulk 1 each
  ok('bulk sums from what is carried', carriedBulk(s) === BULK_BUDGET, `${carriedBulk(s)}`);
  s.equipped.weapon = ref('sword', 99);
  ok('and what is worn or wielded counts on top of it', carriedBulk(s) === BULK_BUDGET + 3,
     `${carriedBulk(s)} with the blade in the row`);

  // Walk the world for a real portable rather than hoping the start room has
  // one -- a gate that skips itself proves nothing.
  let found = null;
  outer:
  for (let si = 0; si < 40 && !found; si++)
    for (let f = 0; f < floorCount(SEED, si); f++)
      for (const r of floorPlan(SEED, si, f).cells)
        for (const c of contentsOf(SEED, si, f, r))
          if (isPortable(c.kind)) { found = { site: si, floor: f, room: r, c }; break outer; }

  ok('the world contains portable items at all', !!found, found ? `${found.c.kind} at site ${found.site} floor ${found.floor}` : 'none anywhere');
  if (found) {
    const s2 = delve();
    s2.site = found.site; s2.floor = found.floor; s2.room = found.room;
    s2.carried = Array.from({ length: BULK_BUDGET }, (_, i) => ref('key', i));
    s2.x = ((found.c.tile % COLS) * TILE + TILE/2) * UNITS;
    s2.y = (((found.c.tile / COLS) | 0) * TILE + TILE/2) * UNITS;
    const p = prompt(s2);
    ok('a full load refuses, and says so', !!(p && p.refuse), p ? p.text : 'no prompt');
    const n = s2.carried.length;
    step(s2, setVerb(0, VERB.INTERACT, true));
    ok('a refused pickup takes nothing', s2.carried.length === n, `${s2.carried.length} carried`);

    const s3 = delve();
    s3.site = found.site; s3.floor = found.floor; s3.room = found.room;
    s3.x = s2.x; s3.y = s2.y;
    s3.carried = [];                    // hands empty, blade set aside
    step(s3, setVerb(0, VERB.INTERACT, true));
    ok('an empty-handed pickup succeeds', s3.carried.length === 1,
       s3.carried.map((r) => r.kind).join(','));
  }

  const d = delve();
  d.carried = refs('gem','bones','crystal');
  step(d, setVerb(0, VERB.DROP, true));
  ok('drop-load empties the hands', d.carried.length === 0);
}

// --- the world does not grow ------------------------------------------------
{
  const s = delve();
  const size = () => JSON.stringify(toDelta(s)).length;   // the save, not the object
  const base = size();
  for (const c of visible(s)) { s.taken.push(c.key); }
  ok('taking is recorded, generation is not',
     size() - base < 400, `+${size() - base} bytes for ${s.taken.length} takes`);
}

// --- containers and the transfer screen ------------------------------------
{
  const s = delve();
  const c = visible(s).find((x) => isContainer(x.kind));
  ok('the start room has a container', !!c, c ? c.kind : 'none');

  s.x = ((c.tile % COLS) * TILE + TILE/2) * UNITS;
  s.y = (((c.tile / COLS) | 0) * TILE + TILE/2) * UNITS;
  step(s, setVerb(0, VERB.INTERACT, true));
  ok('opening a container opens the screen', s.screen === 'container' && s.screenKey === c.key, s.screen || 'none');

  const inside = containerItems(s, s.screenKey);
  ok('the container holds something to take', inside.length > 0, `${inside.length}`);

  // Contents must stay IN the container, not scatter across the floor.
  const onFloor = visible(s).filter((x) => x.spilled);
  ok('contents are not spilled onto the floor', onFloor.length === 0, `${onFloor.length} spilled`);

  const before = s.carried.length;
  step(s, 0);                                        // release
  step(s, setVerb(0, VERB.INTERACT, true));          // take one
  ok('taking moves an item into the pack', s.carried.length === before + 1, s.carried.join(','));
  ok('the taken item leaves the container', containerItems(s, s.screenKey).length === inside.length - 1);

  step(s, 0);
  step(s, setVerb(0, VERB.TOOL, true));              // take all
  ok('take-all empties the container', containerItems(s, s.screenKey).length === 0);

  // Every documented way out must work, from both screens.
  for (const [name, verb] of [['CANCEL (Esc)', VERB.CANCEL], ['DODGE (B)', VERB.DODGE]]) {
    for (const which of ['container', 'pack', 'status']) {
      const t = delve();
      t.screen = which; t.screenKey = which === 'container' ? c.key : '';
      step(t, 0);
      step(t, setVerb(0, verb, true));
      ok(`${name} closes the ${which} screen`, t.screen === '', t.screen || 'closed');
    }
  }
  {
    const t = delve();
    t.screen = 'container'; t.screenKey = c.key;
    step(t, 0); step(t, setVerb(0, VERB.MAP, true));
    ok('MAP (Tab) closes a container', t.screen === '', t.screen || 'closed');
  }
  step(s, 0);
  step(s, setVerb(0, VERB.CANCEL, true));
  ok('escape leaves the world alone', s.screen === '' && s.carried.length > 0);

  // Movement must be inert while a screen is open.
  const m = delve();
  m.screen = 'pack';
  const x0 = m.x;
  for (let i = 0; i < 20; i++) step(m, setVerb(0, VERB.RIGHT, true));
  ok('the world is still while a screen is open', m.x === x0);
}

// --- stairs land you ON the stair back --------------------------------------
{
  const { T, roomTiles, COLS: C2 } = await import('../core/gen.js');
  const tileAt = (s) => {
    const g = roomTiles(s.seed, s.site, s.floor, s.room).grid;
    return g[(Math.floor(s.y / (TILE*UNITS))) * C2 + Math.floor(s.x / (TILE*UNITS))];
  };

  let trips = 0, landed = 0, returned = 0;
  for (let site = 0; site < 25; site++) {
    const s = delve();
    s.site = site;
    const plan = floorPlan(SEED, site, 0);
    if (plan.stairDown < 0) continue;
    s.room = plan.stairDown;
    const g = roomTiles(SEED, site, 0, s.room).grid;
    let at = -1; for (let i = 0; i < g.length; i++) if (g[i] === T.STAIR_D) { at = i; break; }
    if (at < 0) continue;
    s.x = ((at % C2) * TILE + TILE/2) * UNITS;
    s.y = (((at / C2) | 0) * TILE + TILE/2) * UNITS;
    const fromRoom = s.room;

    trips++;
    step(s, setVerb(0, VERB.INTERACT, true));
    if (s.floor === 1 && tileAt(s) === T.STAIR_U) landed++;

    step(s, 0);
    step(s, setVerb(0, VERB.INTERACT, true));        // straight back up
    if (s.floor === 0 && s.room === fromRoom) returned++;
  }
  ok('descending lands you on the stair back up', landed === trips, `${landed}/${trips}`);
  ok('a round trip returns you to the room you left', returned === trips, `${returned}/${trips}`);
}

// --- solid items -----------------------------------------------------------
{
  ok('sacks are gone', !('sack' in KIND) , Object.keys(KIND).join(', '));

  // The pot was renamed to `crate` on 2026-09-22 on the belief that the sprite
  // at decor 3,4 was a crate. It is a round-bellied pot, and there is no crate
  // on either sheet — so for one release every crate in the game was drawn as a
  // pot. The word follows the picture, not the other way round.
  ok('the crate is gone; the art was always a pot', !('crate' in KIND) && 'pot' in KIND,
     Object.keys(KIND).join(', '));

  const solidKinds = Object.keys(KIND).filter((k) => isSolidItem(k));
  ok('containers and furniture are solid', solidKinds.length === 6, solidKinds.join(', '));

  // Nothing fills its square. A tile is 20px, so a half-extent of 10 would be
  // edge to edge — every solid thing must be smaller than the floor it sits on.
  const fat = solidKinds.filter((k) => footOf(k) >= 10 || footOf(k) <= 0);
  ok('no object claims its whole tile', fat.length === 0,
     solidKinds.map((k) => `${k} ${footOf(k)}`).join(' \u00b7 '));
  ok('a chair takes less floor than a table', footOf('chair') < footOf('table'),
     `chair ${footOf('chair')} < table ${footOf('table')}`);
  const loose = Object.keys(KIND).filter((k) => isPortable(k) && isSolidItem(k));
  ok('portables are not solid', loose.length === 0, loose.join(', '));

  // Walking into one must actually stop you.
  const s = delve();
  const solid = visible(s).find((c) => isSolidItem(c.kind));
  ok('the start room has something solid', !!solid, solid ? solid.kind : 'none');
  if (solid) {
    const tx = solid.tile % COLS, ty = (solid.tile / COLS) | 0;
    // Start on a genuinely open tile beside it, not on the border wall.
    const g = (await import('../core/gen.js')).roomTiles(SEED, s.site, s.floor, s.room).grid;
    let from = -1;
    for (let d = 1; d <= 4 && from < 0; d++) {
      const cand = tx - d;
      if (cand > 0 && g[ty*COLS + cand] === T.FLOOR) from = cand;
    }
    ok('there is open floor to run at it from', from > 0, `col ${from}`);
    if (from > 0) {
      s.x = (from * TILE + TILE/2) * UNITS;
      s.y = (ty * TILE + TILE/2) * UNITS;
      for (let i = 0; i < 300; i++) step(s, setVerb(0, VERB.RIGHT, true));
      const stoppedAt = Math.floor(s.x / (TILE*UNITS));
      ok('you cannot walk through a solid item', stoppedAt < tx && stoppedAt >= from,
         `ran from col ${from}, stopped at ${stoppedAt}, ${KIND[solid.kind].label} at ${tx}`);
    }
  }
}

// --- the pack has its own button --------------------------------------------
{
  const s = delve();
  step(s, setVerb(0, VERB.INVENTORY, true));
  ok('INVENTORY opens the pack', s.screen === 'pack' && s.side === 1, s.screen || 'nothing');

  step(s, 0);
  step(s, setVerb(0, VERB.INVENTORY, true));
  ok('the same button closes it again', s.screen === '', s.screen || 'closed');

  // Y is free for tools now; it must not open anything.
  const t = delve();
  step(t, setVerb(0, VERB.TOOL, true));
  ok('TOOL no longer opens the pack', t.screen === '', t.screen || 'closed');

  // Opening the pack must not move the player or take anything.
  const u = delve();
  const x0 = u.x, n0 = u.carried.length;
  step(u, setVerb(0, VERB.INVENTORY, true));
  ok('opening the pack changes nothing else', u.x === x0 && u.carried.length === n0);
}

// --- rock blocks ------------------------------------------------------------
{
  const { solidTile: ST, T: TT, roomTiles: RT, floorPlan: FP, floorCount: FC, COLS: C } = await import('../core/gen.js');
  ok('rubble is solid terrain', ST(TT.RUBBLE), 'a rock is a rock');
  ok('floor and stairs stay walkable', !ST(TT.FLOOR) && !ST(TT.STAIR_D) && !ST(TT.STAIR_U));

  // Run at one and stop.
  let found = null;
  outerR:
  for (let site = 0; site < 40; site++)
    for (let f = 0; f < FC(SEED, site); f++)
      for (const room of FP(SEED, site, f).cells) {
        const g = RT(SEED, site, f, room).grid;
        for (let i = 0; i < g.length; i++) {
          if (g[i] !== TT.RUBBLE) continue;
          const tx = i % C, ty = (i / C) | 0;
          if (tx > 3 && g[ty*C + tx - 1] === TT.FLOOR && g[ty*C + tx - 2] === TT.FLOOR) {
            found = { site, f, room, tx, ty }; break outerR;
          }
        }
      }
  ok('there is a rock with open floor beside it', !!found, found ? `site ${found.site} (${found.tx},${found.ty})` : 'none');
  if (found) {
    const s = delve();
    s.site = found.site; s.floor = found.f; s.room = found.room;
    s.x = ((found.tx - 2) * TILE + TILE/2) * UNITS;
    s.y = (found.ty * TILE + TILE/2) * UNITS;
    for (let i = 0; i < 400; i++) step(s, setVerb(0, VERB.RIGHT, true));
    const col = Math.floor(s.x / (TILE*UNITS));
    ok('you cannot walk over a rock', col < found.tx, `stopped at col ${col}, rock at ${found.tx}`);
  }
}

// --- footprints are real ----------------------------------------------------
// The sizes only mean something if a smaller object lets you get closer.
{
  const { floorCount: FC, floorPlan: FP, contentsOf: CO, roomTiles: RT, COLS: C, T: TT } = await import('../core/gen.js');

  const findOne = (kind) => {
    for (let site = 0; site < 60; site++)
      for (let f = 0; f < FC(SEED, site); f++)
        for (const room of FP(SEED, site, f).cells)
          for (const c of CO(SEED, site, f, room)) {
            if (c.kind !== kind) continue;
            const g = RT(SEED, site, f, room).grid;
            const tx = c.tile % C, ty = (c.tile / C) | 0;
            for (let d = 2; d <= 5; d++)
              if (tx - d > 0 && g[ty*C + tx - d] === TT.FLOOR && g[ty*C + tx - d + 1] === TT.FLOOR)
                return { site, f, room, c, tx, ty, from: tx - d };
          }
    return null;
  };

  const runAt = (hit) => {
    const s = delve();
    s.site = hit.site; s.floor = hit.f; s.room = hit.room;
    s.x = (hit.from * TILE + TILE/2) * UNITS;
    s.y = (hit.ty * TILE + TILE/2) * UNITS;
    for (let i = 0; i < 400; i++) step(s, setVerb(0, VERB.RIGHT, true));
    const centre = (hit.tx * TILE + TILE/2) * UNITS;
    return (centre - s.x) / UNITS;            // px from the object's centre
  };

  const chair = findOne('chair'), table = findOne('table');
  ok('there is a chair and a table to run at', !!chair && !!table,
     `${chair ? 'chair' : '-'} / ${table ? 'table' : '-'}`);
  if (chair && table) {
    const dc = runAt(chair), dt = runAt(table);
    ok('a smaller object lets you stand closer', dc < dt,
       `chair stops you ${dc.toFixed(1)}px out, table ${dt.toFixed(1)}px`);
    ok('you still cannot stand inside either', dc > 0 && dt > 0, `${dc.toFixed(1)} / ${dt.toFixed(1)}`);
  }
}

// --- nothing gets sealed in -------------------------------------------------
// A barrel in a doorway is a soft-lock with no error. Flood the room with the
// items in place and assert everything that matters is still reachable.
{
  const { T, roomTiles, floorPlan: FP, floorCount: FC, linksFor, exitAt, COLS: C, ROWS: R } = await import('../core/gen.js');
  const { pair } = await import('../core/addr.js');

  let rooms = 0, ok_exits = 0, exits = 0, ok_stairs = 0, stairs = 0, ok_loot = 0, loot = 0;

  for (let site = 0; site < 30; site++)
    for (let f = 0; f < FC(SEED, site); f++) {
      const plan = FP(SEED, site, f);
      for (const room of plan.cells) {
        const st = delve(); st.site = site; st.floor = f; st.room = room;
        const g = roomTiles(SEED, site, f, room).grid;
        const solids = solidTiles(st);
        rooms++;

        const open = (i) => !solidTile(g[i]) && !solids.has(i);
        let start = -1;
        for (let i = 0; i < g.length && start < 0; i++) if (open(i)) start = i;
        if (start < 0) continue;
        const seen = new Uint8Array(g.length); seen[start] = 1;
        const stack = [start];
        while (stack.length) {
          const i = stack.pop(), x = i % C, y = (i / C) | 0;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x+dx, ny = y+dy;
            if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
            const j = ny*C + nx;
            if (seen[j] || !open(j)) continue;
            seen[j] = 1; stack.push(j);
          }
        }

        for (const [a, b, axis] of linksFor(plan, room)) {
          const p = exitAt(SEED, site, f, a, b, axis);
          const [lo] = pair(a, b);
          const idx = axis === 'h' ? p*C + (room === lo ? C-1 : 0) : (room === lo ? R-1 : 0)*C + p;
          exits++; if (seen[idx]) ok_exits++;
        }
        for (const tt of [T.STAIR_D, T.STAIR_U])
          for (let i = 0; i < g.length; i++) if (g[i] === tt) { stairs++; if (seen[i]) ok_stairs++; }
        for (const c of visible(st)) { loot++; if (isSolidItem(c.kind) ? true : seen[c.tile]) ok_loot++; }
      }
    }

  // HARD: the ways out. Nothing in the game can yet undo a sealed exit, so a
  // player with no route to a door or a stair is stuck with no recourse.
  ok('every doorway stays reachable with items in place', ok_exits === exits, `${ok_exits}/${exits} across ${rooms} rooms`);
  ok('every stair stays reachable with items in place', ok_stairs === stairs, `${ok_stairs}/${stairs}`);

  // MEASURED, not required: loot behind an obstruction is content — something
  // to come back for once there are boulder-breaking and tunnelling tools
  // (DJ, 2026-09-22). This fails only if the number is absurd, which would mean
  // placement is broken rather than the world being interesting.
  const behind = loot - ok_loot;
  const pct = (behind / loot) * 100;
  ok('loot behind obstructions is a minority, by design', pct < 25,
     `${behind}/${loot} (${pct.toFixed(1)}%) out of reach for now`);
}

// --- the camp, and the loop closing ----------------------------------------
{
  const { campStations, STATION } = await import('../core/camp.js');
  const { COLS: C, TILE: TL, T: TT, roomTiles: RT, floorPlan: FP } = await import('../core/gen.js');

  const s = createState(SEED);
  ok('you start in the camp', s.floor === -1, `floor ${s.floor}`);
  ok('the camp holds no salvage', visible(s).length === 0, `${visible(s).length}`);
  // You start ARMED and otherwise empty-handed: no scrap, no stash, no salvage,
  // and three of your twenty bulk already spent on the blade.
  ok('you start with a blade and nothing else',
     s.scrap === 0 && !s.stash.length && s.carried.length === 0
       && s.equipped.weapon && s.equipped.weapon.kind === 'sword',
     `pack ${s.carried.length}, weapon ${s.equipped.weapon && s.equipped.weapon.kind}`);
  // Issue: the blade (3) and one Blasting Cap (1).
  ok('and the blade and the cap are already costing you bulk', carriedBulk(s) === 4, `${carriedBulk(s)}/20`);
  ok('the other three slots start empty',
     ['armor','helm','accessory'].every((k) => s.equipped[k] === null));

  const standAt = (st, state) => {
    state.x = ((st.tile % C) * TL + TL/2) * UNITS;
    state.y = (((st.tile / C) | 0) * TL + TL/2) * UNITS;
  };
  const q = campStations().find((x) => x.kind === STATION.QUARTERMASTER);
  const sh = campStations().find((x) => x.kind === STATION.STASH);
  ok('the camp has a quartermaster and a stash', !!q && !!sh);

  // Selling
  standAt(q, s);
  s.carried = [];                       // the issued blade is kit, not salvage
  ok('an empty-handed sale is refused, and says so', prompt(s).refuse === true, prompt(s).text);
  s.carried = refs('gem', 'gem', 'bones', 'key');
  // Appraised, so the assertion below is about provenance moving a price and
  // not about whether these four addresses happen to be legible to a Worker —
  // which they were, until the actor pool changed, and then were not.
  for (const r of s.carried) s.known.push(r.key);
  const worth = haulValue(s);
  const { itemValue } = await import('../sim/record.js');
  const parts = s.carried.reduce((n, r) => n + itemValue(s, r), 0);
  ok('the haul is worth the sum of its parts', worth === parts, `${worth} = ${s.carried.map((r) => itemValue(s, r)).join(' + ')}`);
  ok('provenance has already moved the price off base',
     worth !== 12+12+2+3, `base would be 29, it is ${worth}`);
  ok('the toast names the price', prompt(s).text.includes(String(worth)), prompt(s).text);
  step(s, setVerb(0, VERB.INTERACT, true));
  ok('selling converts the haul to scrap', s.scrap === worth && s.carried.length === 0,
     `${s.scrap} scrap, carrying ${s.carried.length}`);

  // Value per bulk is the decision the loop is made of.
  const { valueOf, bulkOf: bo } = await import('../core/items.js');
  ok('a gem beats bones per unit of bulk',
     valueOf('gem')/bo('gem') > valueOf('bones')/bo('bones'),
     `gem ${valueOf('gem')/bo('gem')}/bulk vs bones ${valueOf('bones')/bo('bones')}/bulk`);

  // Stash, both directions
  const t = createState(SEED);
  standAt(sh, t);
  ok('the stash prompts', prompt(t).text === 'Open stash', prompt(t).text);
  step(t, setVerb(0, VERB.INTERACT, true));
  ok('the stash screen opens', t.screen === 'stash', t.screen || 'none');

  t.carried = refs('gem', 'key');
  t.side = 1; t.cur = 0;
  step(t, 0); step(t, setVerb(0, VERB.INTERACT, true));
  ok('pack -> stash works', t.stash.length === 1 && t.carried.length === 1,
     `stash ${t.stash.length}, pack ${t.carried.length}`);

  t.side = 0; t.cur = 0;
  step(t, 0); step(t, setVerb(0, VERB.INTERACT, true));
  ok('stash -> pack works, so transfer is two-way', t.stash.length === 0 && t.carried.length === 2,
     `stash ${t.stash.length}, pack ${t.carried.length}`);

  t.side = 1;
  step(t, 0); step(t, setVerb(0, VERB.TOOL, true));
  ok('move-all empties the pack into the stash', t.carried.length === 0 && t.stash.length === 2);

  const full = createState(SEED);
  full.screen = 'stash'; full.side = 1; full.cur = 0;
  full.stash = Array.from({ length: STASH_SLOTS }, (_, i) => ref('key', i));
  full.carried = refs('gem');
  step(full, 0); step(full, setVerb(0, VERB.INTERACT, true));
  ok('a full stash refuses', full.carried.length === 1 && full.stash.length === STASH_SLOTS);
}

// --- the Field and the mausoleum connect both ways ---------------------------
// The mouth is on the Field now, not in the camp (DJ, 2026-09-25: "they
// wouldn't sleep next to that"). Stand on it, go down, come back up.
{
  const { T: TT, roomTiles: RT, floorPlan: FP, COLS: C, FIELD_CAMP } = await import('../core/gen.js');
  const { campRoom } = await import('../core/camp.js');

  const s = createState(SEED);
  ok('you start in the camp, room 0 of the Field', s.floor === -1 && s.room === FIELD_CAMP);
  ok('the camp has no mouth in it', ![...campRoom().grid].includes(TT.STAIR_D));
  const plan = FP(SEED, s.site, -1);
  ok('the Field has one, at least two rooms away', plan.stairDown !== FIELD_CAMP && plan.cells.includes(plan.stairDown), `room ${plan.stairDown}`);
  s.room = plan.stairDown;
  const g = RT(SEED, s.site, -1, s.room).grid;
  let mouth = -1;
  for (let i = 0; i < g.length; i++) if (g[i] === TT.STAIR_D) { mouth = i; break; }
  ok('the mouth room has the stairs', mouth >= 0);

  s.x = ((mouth % C) * TILE + TILE/2) * UNITS;
  s.y = (((mouth / C) | 0) * TILE + TILE/2) * UNITS;
  ok('standing on the mouth prompts a descent', prompt(s) && prompt(s).text === 'Descend', prompt(s) && prompt(s).text);

  step(s, setVerb(0, VERB.INTERACT, true));
  ok('descending reaches floor 0', s.floor === 0, `floor ${s.floor}`);
  const g0 = RT(SEED, s.site, 0, s.room).grid;
  const under = g0[Math.floor(s.y/(TILE*UNITS))*C + Math.floor(s.x/(TILE*UNITS))];
  ok('you land on the way back up', under === TT.STAIR_U);

  step(s, 0);
  step(s, setVerb(0, VERB.INTERACT, true));
  ok('climbing out returns you to the Field', s.floor === -1 && s.room === plan.stairDown, `floor ${s.floor} room ${s.room}`);
  ok('and you land on the mouth you left by',
     Math.floor(s.x/(TILE*UNITS)) === mouth % C && Math.floor(s.y/(TILE*UNITS)) === ((mouth/C)|0));
}

// --- putting things back ----------------------------------------------------
// Transfer used to run one way: a container gave and nothing ever went back,
// and the drop button destroyed a haul rather than setting it down. The dropped
// list fixes both, and it is the same list the corpse run will need.
{
  const press = (s, v) => { step(s, setVerb(0, v, true)); step(s, 0); };

  // One item, out of the pack and onto the floor.
  {
    const s = delve();
    s.carried = refs('gem', 'bones');
    const before = visible(s).length;
    press(s, VERB.INVENTORY);
    ok('the pack opens', s.screen === 'pack', s.screen);
    press(s, VERB.INTERACT);
    ok('putting one down takes it out of the pack', s.carried.length === 1, `${s.carried.length} left`);
    ok('and puts it in the room', visible(s).length === before + 1, `${visible(s).length} visible`);
    ok('on a real floor tile, not inside a wall',
       visible(s).filter((c) => c.dropped).every((c) => !solidTile(roomTiles(SEED, s.site, s.floor, s.room).grid[c.tile])));
    ok('nothing is dropped on top of anything else',
       new Set(visible(s).map((c) => c.tile)).size === visible(s).length);
  }

  // And back up again — the SAME object, not another of its kind.
  {
    const s = delve();
    s.carried = refs('gem');
    const key = s.carried[0].key;
    press(s, VERB.INVENTORY);
    press(s, VERB.INTERACT);
    press(s, VERB.CANCEL);
    const put = s.dropped[0];
    ok('it is recorded where it lies', !!put && put.key === key, put ? `${put.kind} at ${put.tile}` : 'nowhere');

    s.x = ((put.tile % COLS) * TILE + TILE/2) * UNITS;
    s.y = (((put.tile / COLS) | 0) * TILE + TILE/2) * UNITS;
    const p = prompt(s);
    ok('the toast offers it back', !!p && p.text.startsWith('Pick up'), p ? p.text : 'no prompt');
    press(s, VERB.INTERACT);
    ok('picking it up returns that exact object', s.carried.length === 1 && s.carried[0].key === key,
       s.carried.length ? s.carried[0].key : 'empty');
    ok('and it stops lying on the floor', s.dropped.length === 0 && !visible(s).some((c) => c.dropped));
  }

  // The best button in the game no longer destroys the haul.
  {
    const s = delve();
    s.carried = refs('gem', 'bones', 'crystal');
    const keys = s.carried.map((r) => r.key);
    press(s, VERB.DROP);
    ok('drop-load empties the hands', s.carried.length === 0);
    ok('and the haul is still on the floor', s.dropped.length === 3, `${s.dropped.length} down`);
    ok('every one of them, by name', keys.every((k) => s.dropped.some((d) => d.key === k)));
  }

  // A thing you put down stays where you left it.
  {
    const s = delve();
    s.carried = refs('gem');
    press(s, VERB.DROP);
    const { site, floor, room, tile } = s.dropped[0];
    const elsewhere = floorPlan(SEED, site, floor).cells.find((r) => r !== room);
    if (elsewhere !== undefined) {
      s.room = elsewhere;
      ok('it is not in the next room along', !visible(s).some((c) => c.dropped), `room ${elsewhere}`);
      s.room = room;
      ok('and it is still in the one you left it in',
         visible(s).some((c) => c.dropped && c.tile === tile));
    }
  }

  // A dropped thing keeps its address, so its history follows it across the
  // world. That is what `inherit` will be written on top of.
  {
    const s = delve();
    s.carried = [{ kind: 'gem', key: '0:3:2:1' }];
    const before = chainFor(s, '0:3:2:1');
    press(s, VERB.DROP);
    ok('a dropped thing keeps its own chain',
       JSON.stringify(chainFor(s, s.dropped[0].key)) === JSON.stringify(before));
  }

  // The world still does not grow. A drop is a delta entry, not a placement.
  {
    const s = delve();
    const size = () => JSON.stringify(toDelta(s)).length;
    const base = size();
    s.carried = refs('gem', 'bones');
    press(s, VERB.DROP);
    ok('putting things down is recorded in bytes, not in rooms',
       size() - base < 300, `+${size() - base} bytes for 2`);
  }

  // Determinism: the tile a thing lands on is arithmetic, not a coin toss.
  {
    const a = delve(), b = delve();
    for (const s of [a, b]) { s.carried = refs('gem', 'bones', 'key'); press(s, VERB.DROP); }
    ok('two runs put things down in the same places', hashState(a) === hashState(b),
       a.dropped.map((d) => d.tile).join(',') + ' vs ' + b.dropped.map((d) => d.tile).join(','));
  }

  // A room with no floor left refuses rather than swallowing the item.
  {
    const s = delve();
    const { grid } = roomTiles(SEED, s.site, s.floor, s.room);
    ok('a free tile exists to drop onto in a normal room', dropTile(s) >= 0, `${dropTile(s)}`);
  }
}

// --- the equipment row ------------------------------------------------------
{
  const { SLOTS, slotOf } = await import('../core/items.js');
  const open = () => { const s = delve(); s.screen = 'pack'; s.side = 1; s.cur = 0; return s; };
  const tap = (s, v) => { step(s, 0); step(s, setVerb(0, v, true)); };

  ok('the row has five labelled slots', SLOTS.join(',') === 'weapon,tool,armor,helm,accessory');
  ok('a sword belongs in the weapon slot', slotOf('sword') === 'weapon');
  ok('a gem belongs in no slot', slotOf('gem') === null);

  // Equip from the pack: the old piece takes the new one's place. Bulk is
  // unchanged, because the row counts too.
  const s = open();
  s.carried = [ref('sword', 7), ref('gem', 1)];
  const b0 = carriedBulk(s);
  tap(s, VERB.INTERACT);
  ok('A on a weapon in the pack equips it', s.equipped.weapon && s.equipped.weapon.key === '0:0:0:7',
     s.equipped.weapon && s.equipped.weapon.key);
  ok('the blade it replaced comes back into the pack, same place',
     s.carried[0] && s.carried[0].key === 'issue:0:0:0' && s.carried.length === 2,
     s.carried.map((r) => r.key).join(' '));
  ok('a swap never changes bulk', carriedBulk(s) === b0, `${b0} -> ${carriedBulk(s)}`);

  // A non-slot item on A still goes to the floor, as before.
  s.cur = 1;
  const down0 = s.dropped.length;
  tap(s, VERB.INTERACT);
  ok('A on a gem still puts it down', s.dropped.length === down0 + 1 && !s.carried.some((r) => r.kind === 'gem'));

  // Up off the top of the grid lands on the row; down comes back.
  const n = open();
  n.carried = refs('gem', 'key');
  n.cur = 1;
  tap(n, VERB.UP);
  ok('UP from the top row of the pack reaches the equipment row', n.side === 2, `side ${n.side}`);
  ok('and the cursor lands on a real slot', n.cur >= 0 && n.cur < SLOTS.length, `cur ${n.cur}`);
  tap(n, VERB.DOWN);
  ok('DOWN from the row returns to the pack', n.side === 1, `side ${n.side}`);

  // Unequip: the piece goes into the pack.
  const u = open();
  tap(u, VERB.UP); u.cur = 0;                    // weapon slot
  const b1 = carriedBulk(u);
  tap(u, VERB.INTERACT);
  ok('A on the weapon slot unequips it', u.equipped.weapon === null && u.carried.some((r) => r.kind === 'sword'));
  ok('unequipping does not change bulk either', carriedBulk(u) === b1);
  ok('you are now swinging fists', !bestWeapon(u));

  // The row exists on the pack page only.
  const c2 = delve();
  c2.screen = 'container'; c2.screenKey = visible(c2).find((x) => isContainer(x.kind)).key; c2.side = 2;
  step(c2, 0);
  ok('the container screen has no equipment row', c2.side !== 2, `side ${c2.side}`);

  // Death takes the row as well as the pack.
  const { applyAction } = await import('../sim/step.js');
  const { enterRoom } = await import('../sim/step.js');
  const d = delve(); enterRoom(d);
  d.foes = [{ id: 'x', kind: 'dog', x: d.x, y: d.y, hp: 6, mode: 'circle', modeAt: 0, spin: 1, aimX: 0, aimY: 0, vx: 0, vy: 0 }];
  for (let i = 0; i < 20 && !d.deaths; i++) { d.hurtAt = -9999; applyAction(d, { k: 'bite', id: 'x', n: 4 }); }
  ok('death empties every slot', d.deaths === 1 && SLOTS.every((k) => d.equipped[k] === null));
  ok('and the blade is on the floor where you fell', d.dropped.some((x) => x.kind === 'sword'));
}

// --- the status page --------------------------------------------------------
{
  const s = delve(); s.screen = 'pack'; s.side = 1;
  step(s, 0); step(s, setVerb(0, VERB.MAP, true));
  ok('Tab on the pack page turns to status', s.screen === 'status', s.screen);

  const h0 = hashState(s);
  for (const v of [VERB.INTERACT, VERB.UP, VERB.DOWN, VERB.LEFT, VERB.RIGHT, VERB.TOOL, VERB.DROP]) {
    step(s, 0); step(s, setVerb(0, v, true));
  }
  ok('the status page is read, not operated', s.screen === 'status' && s.carried.length === 0 && s.dropped.length === 0,
     `screen ${s.screen}, dropped ${s.dropped.length}`);
  step(s, 0); step(s, setVerb(0, VERB.MAP, true));
  ok('Tab on status turns back to the pack', s.screen === 'pack' && s.side === 1, `${s.screen} side ${s.side}`);
  step(s, 0); step(s, setVerb(0, VERB.INVENTORY, true));
  ok('Start closes it from either page', s.screen === '');
}

// --- one view per tick ------------------------------------------------------
{
  const s = delve();
  const { roomView } = await import('../sim/room.js');
  const a = roomView(s), b = roomView(s);
  ok('the room view is computed once and reused', a === b);
  ok('the cache never reaches the save', !('_view' in toDelta(s)) && '_view' in s);
  const h0 = hashState(s);
  roomView(s); visible(s);
  ok('reading the view does not change the state hash', hashState(s) === h0);
  const first = visible(s)[0];
  s.taken.push(first.key);
  ok('taking something invalidates it', roomView(s) !== a && !visible(s).some((c) => c.key === first.key));
  s.dropped.push({ kind: 'gem', key: 'z:0:0:0', site: s.site, floor: s.floor, room: s.room, tile: 40 });
  ok('putting something down invalidates it too', visible(s).some((c) => c.key === 'z:0:0:0'));
}

// --- off a table, never onto it ----------------------------------------------
// DJ put a table down out of a container and was stuck halfway in it (2026-09-25):
// the drop lands on your own tile, and every position inside the box was blocked,
// including the ones that led out. Standing in furniture is allowed to happen;
// being unable to leave it is not.
{
  const { putDown } = await import('../sim/step.js');
  const { HALF, centreOf } = await import('../sim/space.js');
  const s = delve();
  s.carried = [ref('table')];
  ok('a table can be put down where you stand', putDown(s, 0) && s.dropped.length === 1);
  const d = s.dropped[0];
  const under = d.tile === Math.floor(s.y / (TILE*UNITS)) * COLS + Math.floor(s.x / (TILE*UNITS));
  ok('and it lands on your own tile', under, `tile ${d.tile}`);
  const c = centreOf(d.tile);
  const body = solidBodies(s).find((b) => b.cx === c.x && b.cy === c.y);
  ok('and it is a solid body in the room', !!body && body.f === footOf('table') * UNITS, body ? `foot ${body.f / UNITS}` : 'no body');
  const overlapping = () => Math.abs(s.x - body.cx) < body.f + HALF && Math.abs(s.y - body.cy) < body.f + HALF;
  ok('so you are standing in it', overlapping());
  const x0 = s.x;
  for (let i = 0; i < 30; i++) step(s, setVerb(0, VERB.RIGHT, true), []);
  ok('you can walk off a table', s.x > x0 && !overlapping(), `${((s.x - x0) / UNITS).toFixed(1)}px east, clear of it`);
  const x1 = s.x;
  for (let i = 0; i < 30; i++) step(s, setVerb(0, VERB.LEFT, true), []);
  ok('but not back onto it', s.x < x1 && !overlapping(), `stopped ${((s.x - body.cx) / UNITS).toFixed(1)}px from its centre`);
  ok('and you are not inside anything now', !overlapping());
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all item gates passed\n');
process.exit(failures ? 1 : 0);
