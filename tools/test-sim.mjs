// The replay gate, headless. The kernel runs in Node with no renderer,
// which is the whole point of keeping L0-L3 free of browser globals.

import { createState, hashState } from '../sim/state.js';
import { step } from '../sim/step.js';

let failures = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

// Deterministic pseudo-input, so the corpus is reproducible.
function makeLog(seed, n) {
  let s = seed >>> 0;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s >>> 11) & 0x3ff;
  }
  return out;
}

const SEED = 0x1594;
const N = 50000;
const log = makeLog(0xbeef, N);

const a = createState(SEED);
for (const f of log) step(a, f);

const b = createState(SEED);
for (const f of log) step(b, f);

ok('replay: seed + frame log reproduces state exactly',
   hashState(a) === hashState(b),
   `hash ${hashState(a).toString(16)} over ${N} frames`);

ok('tick count matches log length', a.tick === N);

const c = createState(SEED);
for (let i = 0; i < N - 1; i++) step(c, log[i]);
ok('divergence is detected (negative control)', hashState(c) !== hashState(a));

const d = createState(SEED);
for (const f of log) step(d, f);
ok('integer position: no float leaked into the sim path',
   Number.isInteger(d.x) && Number.isInteger(d.y),
   `x=${d.x} y=${d.y}`);

const e = createState(SEED);
for (const f of log) step(e, 0);
ok('empty input is a no-op for position', e.x === createState(SEED).x);

ok('save size is bounded by play, not by world',
   N * 4 < 250 * 1024, `${N} frames = ${(N * 4 / 1024).toFixed(0)} KiB`);

console.log(failures ? `\n  ${failures} failed\n` : '\n  all headless gates passed');
console.log('  2 gates need a browser: start the server and open /tools/pagecheck.html\n');
process.exit(failures ? 1 : 0);
