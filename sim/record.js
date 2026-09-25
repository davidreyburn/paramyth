// L3: the record, as this character can read it. A key IS an address, so a
// chain is computable from a reference alone; what you can make of it is a
// matter of Keen, Lore, and what the appraiser has read to you. Nothing here
// is stored — a lead is derived every time, so the delta never learns what
// you have worked out.
//
// One of four files that were `sim/interact.js`. This one answers: what does
// the RECORD say, to me?

import { ERAS, eraFor, absDepth } from '../core/gen.js';
import { chainOf, marksOf, readMarks, worthMultiplier, describe,
         leadOf, placeLabel, possessionsOf, occupantOf } from '../core/provenance.js';
import { valueOf } from '../core/items.js';

// --- provenance, as the game sees it ---------------------------------------
// The key IS the address, so a chain is computable from a reference alone.

export function chainFor(s, key) {
  const floor = Number(String(key).split(':')[1]);
  const depth = absDepth(floor);
  return chainOf(s.seed, key, ERAS.indexOf(eraFor(depth)), depth);
}

export const marksFor = (s, key) => readMarks(marksOf(chainFor(s, key)), s.stats);

// You can put a price on a thing when its record has been read for you, or when
// you can read every mark on it yourself. That is what Keen and Lore buy.
export function assessed(s, key) {
  if (s.known.includes(key)) return true;
  const m = marksFor(s, key);
  return m.length > 0 && m.every((x) => x.legible);
}

// Base worth until the history is legible; the chain multiplies it after.
export function itemValue(s, ref) {
  const base = valueOf(ref.kind);
  return assessed(s, ref.key) ? Math.round(base * worthMultiplier(chainFor(s, ref.key))) : base;
}

export const readOut = (s, key) => describe(chainFor(s, key), s.stats);

// An appraised record is read TO you, so it is read in full. That is what the
// fee buys, and it is why a low-Keen character can still follow a thread.
const READ_ALL = { keen: 9, lore: 9 };

// The payoff: a legible mark names a person, and that person lies somewhere
// real. Null when this character cannot read far enough to get a name — which
// is most of the time, early, and is the point.
export function leadFor(s, key) {
  return leadOf(chainFor(s, key), s.known.includes(key) ? READ_ALL : s.stats);
}

export { placeLabel };

// Everything of that person's still lying where it was left. Taken things drop
// out, so a trove you have already emptied stops advertising itself.
export function troveFor(s, actorId) {
  const taken = new Set(s.taken);
  return possessionsOf(s.seed, actorId).filter((it) => !taken.has(it.key));
}

// Every lead you are actually carrying. This is the reason to look in your own
// pack before deciding which way to walk, and it is derived — nothing about a
// lead is stored, so the delta never learns what you have worked out.
export function leads(s) {
  const out = [], seen = new Set();
  for (const ref of [...s.carried, ...s.stash]) {
    const l = leadFor(s, ref.key);
    if (!l || !l.place) continue;
    const tag = `${l.actor.id}|${l.place}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push({ ...l, from: ref });
  }
  return out;
}

export const placeHere = (s) => `${s.site}:${s.floor}:${s.room}`;
export const atPlace = (s, place) => place === placeHere(s);

// Whose room this is. Standing in a grave you were sent to is worth saying so.
export const occupantHere = (s) =>
  s.floor < 0 ? null : occupantOf(s.seed, s.site, s.floor, s.room, ERAS.indexOf(eraFor(absDepth(s.floor))));

export const haulValue = (s) => s.carried.reduce((n, r) => n + itemValue(s, r), 0);
export const APPRAISAL_FEE = 6;
