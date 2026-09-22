// Wiring only. The loop is here; no rules live in this file.

import { createState, hashState } from '../sim/state.js';
import { step } from '../sim/step.js';
import { VERB, VERB_NAMES, hasVerb } from '../sim/frame.js';
import { createInput } from './input.js';
import { createRenderer } from '../render/canvas.js';
import { loadPack } from '../render/tileset.js';
import { roomTiles, floorPlan, floorCount } from '../core/gen.js';
import { carriedBulk, tier, BULK_BUDGET } from '../sim/interact.js';
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
  const w = roomTiles(state.seed, state.site, state.floor, state.room);
  const nFloors = floorCount(state.seed, state.site);
  const plan = floorPlan(state.seed, state.site, state.floor);
  renderer.draw(state, [
    { text: `PARAMYTH ${VERSION}   seed ${SEED.toString(16)}   ${fps}fps   x${renderer.scale}   tick ${state.tick}`, color: '#9d9284' },
    { text: `site ${state.site}  floor ${state.floor + 1}/${nFloors}  room ${state.room}  (${plan.cells.length} on this floor)   moved ${state.moves}`, color: '#8a7f70' },
    { text: `${w.era.name.toUpperCase()} \u00b7 ${w.archetype}     held ${heldNames(frame)}`, color: '#7d7060' },
    { text: `bulk ${carriedBulk(state)}/${BULK_BUDGET} ${tier(carriedBulk(state)).toUpperCase()}   carrying ${state.carried.length ? state.carried.join(', ') : 'nothing'}`, color: tier(carriedBulk(state)) === 'overloaded' ? '#c2836b' : '#9d9284' },
    { text: `art ${pack ? (pack.ok ? pack.id : 'MISSING ' + pack.missing.join(',')) : 'flat'}   pad ${input.pad}   log ${log.length}f / ${bytes} KiB   ${replayResult.text}`, color: replayResult.color },
  ]);
}

requestAnimationFrame(loop);
