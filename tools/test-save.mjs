// Save gates. Node has no localStorage, so a Map-backed shim stands in — and a
// second shim that THROWS, because a private window does, and the game has to
// run through it.

const backing = new Map();
let throwing = false;
globalThis.localStorage = {
  getItem: (k) => { if (throwing) throw new Error('nope'); return backing.has(k) ? backing.get(k) : null; },
  setItem: (k, v) => { if (throwing) throw new Error('nope'); backing.set(k, String(v)); },
  removeItem: (k) => { if (throwing) throw new Error('nope'); backing.delete(k); },
};

const { createState, toDelta, hashState, spawnIn } = await import('../sim/state.js');
const { step, enterRoom } = await import('../sim/step.js');
const { VERB, setVerb } = await import('../sim/frame.js');
const { floorPlan } = await import('../core/gen.js');
const { VERSION } = await import('../core/version.js');
const S = await import('../app/save.js');

let failures = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!c) failures++; };
const SEED = 0x1594;

const delve = () => {
  const s = createState(SEED);
  s.floor = 0; s.room = floorPlan(SEED, 0, 0).cells[0];
  const p = spawnIn(SEED, 0, 0, s.room); s.x = p.x; s.y = p.y;
  enterRoom(s);
  return s;
};

// --- the delta is the save --------------------------------------------------
{
  const s = delve();
  const { roomView } = await import('../sim/interact.js');
  roomView(s);                                       // populate the cache
  const d = toDelta(s);
  ok('a save is every non-underscore field', !('_view' in d) && 'equipped' in d && 'deaths' in d && 'seed' in d);
  ok('a fresh save is small', JSON.stringify(d).length < 2048, `${JSON.stringify(d).length} bytes`);
  ok('the frame log is not in it', !('log' in d));
}

// --- round trip -------------------------------------------------------------
{
  const s = delve();
  for (let i = 0; i < 30; i++) step(s, setVerb(0, VERB.RIGHT, true), []);
  s.scrap = 47; s.deaths = 2;
  s.carried = [{ kind: 'gem', key: '0:0:0:1' }];

  ok('a slot starts empty', S.readSlot(0) === null);
  ok('writing succeeds', S.writeSlot(0, s));
  const back = S.readSlot(0);
  ok('and reads back', !!back && back.version === VERSION && back.schema === S.SCHEMA, back && `v${back.version} schema ${back.schema}`);
  ok('it is compatible', S.compatible(back));

  const r = S.restore(back);
  ok('restore reproduces the state exactly', hashState(r) === hashState(s), `${hashState(r).toString(16)} vs ${hashState(s).toString(16)}`);
  ok('the row survives the round trip', r.equipped.weapon && r.equipped.weapon.kind === 'sword');
  ok('so does the room roster', r.foes.length === s.foes.length, `${r.foes.length} foes`);

  const sum = S.summarize(back);
  ok('the summary is what the title prints', sum && sum.scrap === 47 && sum.deaths === 2 && /site 0/.test(sum.where), JSON.stringify(sum));

  S.clearSlot(0);
  ok('deleting empties it', S.readSlot(0) === null);
}

// --- three slots, separately ------------------------------------------------
{
  const a = delve(); a.scrap = 1;
  const b = delve(); b.scrap = 2;
  S.writeSlot(0, a); S.writeSlot(2, b);
  const list = S.listSlots();
  ok('three slots are listed', list.length === S.SLOT_COUNT);
  ok('each slot is its own file',
     list[0].summary.scrap === 1 && list[1].summary === null && list[2].summary.scrap === 2,
     list.map((x) => x.summary ? x.summary.scrap : '-').join(' '));
  S.clearSlot(0); S.clearSlot(2);
}

// --- an older save is refused, not misread ----------------------------------
{
  const s = delve();
  S.writeSlot(1, s);
  const raw = JSON.parse(backing.get('paramyth.slot.1'));
  raw.schema = S.SCHEMA + 1;
  backing.set('paramyth.slot.1', JSON.stringify(raw));
  const back = S.readSlot(1);
  ok('a schema mismatch is not compatible', !S.compatible(back));
  ok('and the title marks it bad rather than empty', S.listSlots()[1].bad === true && S.listSlots()[1].summary === null);
  backing.set('paramyth.slot.1', '{not json');
  ok('corrupt text is bad, not a crash', S.readSlot(1).bad === true);
  S.clearSlot(1);
}

// --- fresh worlds -----------------------------------------------------------
{
  const seeds = [0, 1, 2].map(S.freshSeed);
  ok('a fresh seed is never zero', seeds.every((x) => x !== 0));
  ok('three slots get three worlds', new Set(seeds).size === 3, seeds.map((x) => x.toString(16)).join(' '));
}

// --- when to write ----------------------------------------------------------
{
  const s = delve();
  const c0 = S.checkpoint(s);
  for (let i = 0; i < 20; i++) step(s, setVerb(0, VERB.RIGHT, true), []);
  ok('walking within a room is not a checkpoint', S.checkpoint(s) === c0);
  s.moves++;
  ok('crossing a room is', S.checkpoint(s) !== c0);
  const c1 = S.checkpoint(s);
  s.scrap += 5;
  ok('so is a sale', S.checkpoint(s) !== c1);
  const c2 = S.checkpoint(s);
  s.screen = 'pack';
  ok('and opening or closing a screen', S.checkpoint(s) !== c2);
}

// --- storage that throws ----------------------------------------------------
{
  throwing = true;
  const s = delve();
  ok('a throwing store makes writing return false, not throw', S.writeSlot(0, s) === false);
  ok('and reading return null', S.readSlot(0) === null);
  ok('and the slot list still lists three', S.listSlots().length === 3);
  throwing = false;
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all save gates passed\n');
process.exit(failures ? 1 : 0);
