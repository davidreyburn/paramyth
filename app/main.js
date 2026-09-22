// Wiring only. The loop is here; no rules live in this file.

import { createState, hashState } from '../sim/state.js';
import { step } from '../sim/step.js';
import { VERB, VERB_NAMES, hasVerb } from '../sim/frame.js';
import { createInput } from './input.js';
import { createRenderer } from '../render/canvas.js';
import { loadPack } from '../render/tileset.js';
import { roomTiles, floorPlan, floorCount } from '../core/gen.js';
import { carriedBulk, tier, BULK_BUDGET, haulValue, leads, placeHere, placeLabel } from '../sim/interact.js';
import { VERSION } from '../core/version.js';

const SEED = 0x1594;
const TICK_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;   // no spiral of death

const canvas = document.getElementById('screen');
let pack = null;
try { pack = await loadPack('/assets/packs/onebit.json'); } catch (e) { pack = null; }
const renderer = createRenderer(canvas, pack && pack.ok ? pack : null);
const input = createInput();

let state = createState(SEED);
const log = [];                  // one frame per tick. This is the save.
let acc = 0, last = performance.now();
let fps = 0, fpsAcc = 0, fpsCount = 0, fpsLast = last;
let replayResult = { text: 'press R', color: '#6b6357' };

// The replay gate, live: rebuild from seed + log and compare hashes.
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyR') return;
  const t0 = performance.now();
  const rebuilt = createState(SEED);
  for (let i = 0; i < log.length; i++) step(rebuilt, log[i]);
  const ok = hashState(rebuilt) === hashState(state);
  const ms = (performance.now() - t0).toFixed(1);
  replayResult = ok
    ? { text: `REPLAY PASS  ${log.length} frames in ${ms}ms  hash ${hashState(state).toString(16)}`, color: '#7f9a5e' }
    : { text: `REPLAY FAIL  expected ${hashState(state).toString(16)} got ${hashState(rebuilt).toString(16)}`, color: '#b5553f' };
});

function heldNames(f) {
  const out = VERB_NAMES.filter((n) => hasVerb(f, VERB[n]));
  return out.length ? out.join(' ') : '—';
}

function loop(now) {
  requestAnimationFrame(loop);

  acc += now - last;
  last = now;

  fpsAcc += 1;
  if (now - fpsLast >= 500) {
    fps = Math.round((fpsAcc * 1000) / (now - fpsLast));
    fpsAcc = 0; fpsLast = now;
  }

  let frame = 0, steps = 0;
  while (acc >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
    frame = input.sample();
    log.push(frame);
    step(state, frame);
    acc -= TICK_MS;
    steps++;
  }
  if (acc > TICK_MS * MAX_STEPS_PER_FRAME) acc = 0;

  const bytes = (log.length * 4 / 1024).toFixed(1);

  // What you are carrying has told you about somewhere. The address of where
  // you stand is printed beside it, because a lead you cannot compare to your
  // own position is a riddle rather than a direction.
  const held = leads(state);
  const here = placeHere(state);
  const at = held.find((l) => l.place === here);
  const leadLine = !held.length
    ? `no leads \u00b7 you are at ${here}`
    : at
      ? `HERE \u00b7 ${at.actor.name} ${at.actor.house} was ${at.act} in this room`
      : `${held[0].actor.name} ${held[0].actor.house} \u00b7 ${held[0].act} \u00b7 ${placeLabel(held[0].place)}`
        + (held.length > 1 ? `   (+${held.length - 1} more)` : '')
        + `   \u00b7 you are at ${here}`;
  const w = roomTiles(state.seed, state.site, state.floor, state.room);
  const nFloors = floorCount(state.seed, state.site);
  const plan = floorPlan(state.seed, state.site, state.floor);
  // Four lines, because four is what the strip holds — the renderer asserts it.
  // The art/pad diagnostics moved into the title line to make room for leads,
  // which are the thing a player actually needs to read while walking.
  renderer.draw(state, [
    { text: `PARAMYTH ${VERSION}  seed ${SEED.toString(16)}  ${fps}fps x${renderer.scale}  tick ${state.tick}  art ${pack ? (pack.ok ? pack.id : 'MISSING ' + pack.missing.join(',')) : 'flat'}  pad ${input.pad}  ${bytes} KiB  ${replayResult.text}`,
      color: replayResult.color },
    { text: (state.floor < 0
        ? `COMPANY CAMP \u00b7 site ${state.site}`
        : `site ${state.site}  floor ${state.floor + 1}/${nFloors}  room ${state.room}  (${plan.cells.length} on this floor)  ${w.era.name.toUpperCase()} \u00b7 ${w.archetype}`)
        + `   moved ${state.moves}   held ${heldNames(frame)}`,
      color: '#8a7f70' },
    { text: `scrap ${state.scrap}   bulk ${carriedBulk(state)}/${BULK_BUDGET} ${tier(carriedBulk(state)).toUpperCase()}   worth ${haulValue(state)}   stash ${state.stash.length}   down ${state.dropped.length}`,
      color: tier(carriedBulk(state)) === 'overloaded' ? '#c2836b' : '#9d9284' },
    { text: leadLine, color: at ? '#d9b86a' : held.length ? '#b09a63' : '#6b6357' },
  ]);
}

requestAnimationFrame(loop);
