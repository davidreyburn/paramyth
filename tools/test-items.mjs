// Item and interaction gates. The loop's whole question is triage under cost,
// so the things under test are: items exist, they are reachable, they weigh
// something, and the prompt never disagrees with what the button does.

import { contentsOf, insideOf, roomTiles, floorPlan, floorCount, COLS, ROWS, TILE, T, solidTile } from '../core/gen.js';
import { KIND, isContainer, isPortable, isSolidItem, footOf, bulkOf, verbFor } from '../core/items.js';
import { createState, UNITS } from '../sim/state.js';
import { step, solidTiles, solidBodies } from '../sim/step.js';
import { VERB, setVerb } from '../sim/frame.js';
import { visible, reachable, prompt, carriedBulk, tier, keyOf, containerItems, BULK_BUDGET } from '../sim/interact.js';

let failures = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!c) failures++; };
const SEED = 0x1594;

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
  const st = createState(SEED);
  const cs = visible(st);
  ok('the starting room has visible contents', cs.length > 0, `${cs.length}`);

  // Stand on each thing in turn and press the button; the prompt must have
  // predicted exactly what happened.
  let checked = 0, agreed = 0;
  for (const c of cs) {
    const s2 = createState(SEED);
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

  const s = createState(SEED);
  s.carried = Array(BULK_BUDGET).fill('key');       // bulk 1 each: exactly full
  ok('bulk sums from what is carried', carriedBulk(s) === BULK_BUDGET, `${carriedBulk(s)}`);

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
    const s2 = createState(SEED);
    s2.site = found.site; s2.floor = found.floor; s2.room = found.room;
    s2.carried = Array(BULK_BUDGET).fill('key');
    s2.x = ((found.c.tile % COLS) * TILE + TILE/2) * UNITS;
    s2.y = (((found.c.tile / COLS) | 0) * TILE + TILE/2) * UNITS;
    const p = prompt(s2);
    ok('a full load refuses, and says so', !!(p && p.refuse), p ? p.text : 'no prompt');
    const n = s2.carried.length;
    step(s2, setVerb(0, VERB.INTERACT, true));
    ok('a refused pickup takes nothing', s2.carried.length === n, `${s2.carried.length} carried`);

    const s3 = createState(SEED);
    s3.site = found.site; s3.floor = found.floor; s3.room = found.room;
    s3.x = s2.x; s3.y = s2.y;
    step(s3, setVerb(0, VERB.INTERACT, true));
    ok('an empty-handed pickup succeeds', s3.carried.length === 1, s3.carried.join(','));
  }

  const d = createState(SEED);
  d.carried = ['gem','bones','crystal'];
  step(d, setVerb(0, VERB.DROP, true));
  ok('drop-load empties the hands', d.carried.length === 0);
}

// --- the world does not grow ------------------------------------------------
{
  const s = createState(SEED);
  const base = JSON.stringify(s).length;
  for (const c of visible(s)) { s.taken.push(c.key); }
  ok('taking is recorded, generation is not',
     JSON.stringify(s).length - base < 400, `+${JSON.stringify(s).length - base} bytes for ${s.taken.length} takes`);
}

// --- containers and the transfer screen ------------------------------------
{
  const s = createState(SEED);
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
  for (const [name, verb] of [['CANCEL (Esc)', VERB.CANCEL], ['DODGE (B)', VERB.DODGE], ['MAP (Tab)', VERB.MAP]]) {
    for (const which of ['container', 'pack']) {
      const t = createState(SEED);
      t.screen = which; t.screenKey = which === 'container' ? c.key : '';
      step(t, 0);
      step(t, setVerb(0, verb, true));
      ok(`${name} closes the ${which} screen`, t.screen === '', t.screen || 'closed');
    }
  }
  step(s, 0);
  step(s, setVerb(0, VERB.CANCEL, true));
  ok('escape leaves the world alone', s.screen === '' && s.carried.length > 0);

  // Movement must be inert while a screen is open.
  const m = createState(SEED);
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
    const s = createState(SEED);
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

  ok('pots are gone; the art is a crate', !('pot' in KIND) && 'crate' in KIND, Object.keys(KIND).join(', '));

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
  const s = createState(SEED);
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
  const s = createState(SEED);
  step(s, setVerb(0, VERB.INVENTORY, true));
  ok('INVENTORY opens the pack', s.screen === 'pack' && s.side === 1, s.screen || 'nothing');

  step(s, 0);
  step(s, setVerb(0, VERB.INVENTORY, true));
  ok('the same button closes it again', s.screen === '', s.screen || 'closed');

  // Y is free for tools now; it must not open anything.
  const t = createState(SEED);
  step(t, setVerb(0, VERB.TOOL, true));
  ok('TOOL no longer opens the pack', t.screen === '', t.screen || 'closed');

  // Opening the pack must not move the player or take anything.
  const u = createState(SEED);
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
    const s = createState(SEED);
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
    const s = createState(SEED);
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
        const st = createState(SEED); st.site = site; st.floor = f; st.room = room;
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

console.log(failures ? `\n  ${failures} failed\n` : '\n  all item gates passed\n');
process.exit(failures ? 1 : 0);
