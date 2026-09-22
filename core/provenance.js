// L2: what a thing has been through. A pure function of its address, exactly
// like the room it lies in — nothing here is stored, and two readers at the
// same address compute the same history.
//
// design/provenance.md sets the three tiers:
//   truth  = chain(addr)            immutable, arithmetic
//   record = truth (+ amendments)   not yet — nothing writes amendments
//   view   = redact(record, actor)  what this character can perceive
//
// The middle tier is deliberately absent for now. When forgery lands it goes
// between these two and nothing else has to move.

import { h, hi, hrange, hpick, hchance } from './addr.js';
import { floorCount, floorPlan, contentsOf, insideOf, absDepth, eraFor, ERAS } from './gen.js';
import { isPortable, isContainer } from './items.js';

// A closed, versioned vocabulary. Adding a verb is a content change; changing
// one is a save-compatibility change.
export const ACTS = [
  'made', 'owned', 'carried', 'gave', 'sold', 'stole', 'lost', 'hid',
  'bled-on', 'killed-with', 'killed-by', 'repaired', 'defaced',
  'consecrated', 'interred', 'buried-with',
];

// Each act leaves physical evidence, or none. This table is the whole bridge
// between history and what you can actually look at.
//   read: which sense finds it — 'keen' is the eye, 'lore' is the education
const EVIDENCE = {
  'made':        { mark: "maker's mark",   read: 'keen', tier: 1, worth: 0.10 },
  'owned':       { mark: 'grip polish',    read: 'keen', tier: 1, worth: 0.10 },
  'carried':     { mark: 'wear',           read: 'keen', tier: 1, worth: 0.05 },
  'gave':        { mark: 'inscription',    read: 'lore', tier: 1, worth: 0.35 },
  'sold':        { mark: null,             read: null,   tier: 0, worth: 0.00 },
  'stole':       { mark: null,             read: null,   tier: 0, worth: 0.00 },
  'lost':        { mark: null,             read: null,   tier: 0, worth: 0.00 },
  'hid':         { mark: 'concealment wax', read: 'keen', tier: 2, worth: 0.20 },
  'bled-on':     { mark: 'staining',       read: 'keen', tier: 1, worth: 0.15 },
  'killed-with': { mark: 'notching',       read: 'keen', tier: 2, worth: 0.30 },
  'killed-by':   { mark: 'a deep score',   read: 'keen', tier: 2, worth: 0.25 },
  'repaired':    { mark: 'mismatched fittings', read: 'keen', tier: 1, worth: -0.22 },
  'defaced':     { mark: 'a scoured panel', read: 'keen', tier: 3, worth: -0.50 },
  'consecrated': { mark: 'a rite-cut',     read: 'lore', tier: 2, worth: 0.50 },
  'interred':    { mark: 'grave-dirt',     read: 'keen', tier: 1, worth: 0.20 },
  'buried-with': { mark: 'shroud fibre',   read: 'keen', tier: 2, worth: 0.30 },
};

export const evidenceFor = (act) => EVIDENCE[act];

// --- actors ---------------------------------------------------------------
// Names are era-shaped. A thing that names a salvager is recent; a thing that
// names a house is imperial; below that the names stop being names.

const NAMES = [
  { // era 0 — recent: salvagers, bandits, the company's own dead
    first: ['Hobb','Sella','Dray','Wick','Corr','Meg','Tam','Orin','Pell','Ruse','Garrow','Nim'],
    house: ['of the Red Hand','of the Company','of Ashmark','of no house','the digger','the scrapper'],
  },
  { // era 1 — the war dead of the Silent Isle
    first: ['Valen','Corin','Aldric','Sera','Marius','Ilde','Bren','Ysolde','Rook','Lucian'],
    house: ['of Grimhaven','sworn to Aurelion','of the Second Cohort','shieldbearer','lanceman'],
  },
  { // era 2 — imperial: houses and offices
    first: ['Aurelios','Mordant','Castellan','Veyne','Thorne','Aurelia','Sabbat','Vance'],
    house: ['of the Ascension','Keeper of the Archive','Sun-anointed','of the Warden’s Gate','First of the Vault'],
  },
  { // era 3 — lost empire: the names stop working
    first: ['Θal','Ulmen','Kezzir','Nine-of-Stone','The Third Apostle','Hollow-Crowned'],
    house: ['that was not a person','of the unnumbered','before the word','Old Apostle'],
  },
];

// An actor is an ADDRESS, not a hash of whatever object happened to name them.
// That is the whole difference between 0.3.0 and this: an id you can decompose
// tells you where its owner lived, and a relation you can decompose inverts.
//
//   id = site . era . n     packed into one integer, decodable both ways
//
// Each site holds a fixed pool of people per era. A small pool is the point:
// names have to RECUR before a player can notice one recurring.

export const ERA_SPAN = NAMES.length;      // 4
export const POOL = 8;                     // actors per era, per site
export const RESOLVED = 3;                 // of those, the ones who stay home
const PER_SITE = ERA_SPAN * POOL;

export const actorAddr = (site, era, n) =>
  (site * PER_SITE) + (Math.max(0, Math.min(ERA_SPAN - 1, era)) * POOL) + (((n % POOL) + POOL) % POOL);

export const homeOf = (id) => ({
  site: (id / PER_SITE) | 0,
  era: ((id % PER_SITE) / POOL) | 0,
  n: id % POOL,
});

// A RESOLVED actor's whole story stays inside their own site. Nothing anywhere
// else is allowed to name them, which is what makes the deduction close: follow
// this person and every last thing of theirs is within walking distance.
// Everyone else is a long thread, and long threads may run anywhere.
export const isResolved = (id) => homeOf(id).n < RESOLVED;

export function actorOf(seed, id) {
  const { site, era, n } = homeOf(id);
  const t = NAMES[era];
  return {
    id, era, site,
    name: hpick(t.first, seed, id, 0xa001),
    house: hpick(t.house, seed, id, 0xa002),
    // Notability drives price: most people are nobody.
    notable: hi(100, seed, id, 0xa003) < 12 + era * 9,
    resolved: n < RESOLVED,
  };
}

// --- chains ----------------------------------------------------------------
// The address is the key string the delta already uses: "site:floor:room:slot".

const ERA_ACTS = [
  ['made','owned','carried','lost','sold','stole','hid'],
  ['made','owned','carried','bled-on','killed-with','gave','lost','interred','repaired'],
  ['made','owned','consecrated','interred','buried-with','killed-with','defaced','gave','hid'],
  ['made','consecrated','buried-with','defaced','hid','killed-by','interred'],
];

// Acts that PUT A THING SOMEWHERE, and so name a place worth walking to. The
// rest are transactions: a sale happened, but not anywhere you can rob.
// `made` is deliberately out — a workshop is a fact, not a trove — which also
// keeps the maker's mark, the commonest mark in the game, from handing every
// item a destination.
const PLACES = new Set(['interred', 'buried-with', 'hid']);

// One hand in four came from elsewhere. Those are the threads that pull a
// player past the region they meant to stay in.
const FOREIGN_IN = 4;
const FOREIGN_SITES = 16;

// Which eras can be named by the things lying on a floor. An item is made in
// its own stratum's era and handled by more recent hands after — never older
// ones — so a floor names a window, not the whole past. `placeFor` has to
// respect this or it will send a player to a room where that era never was.
const eraAtFloor = (floor) => ERAS.indexOf(eraFor(absDepth(floor)));
const eraOnFloor = (floor, era) => {
  const fe = eraAtFloor(floor);
  return era <= fe && era >= fe - Math.min(fe, 2);
};

// Every room belongs to someone, once per era — an imperial lord and, above
// him, the recent scavenger who died on top of him. The occupant is the reason
// a room is a GRAVE and not a shelf: the things in it are mostly theirs.
//
// One room per floor — the plan's first cell — draws its occupant from the
// RESOLVED range only. That is design/provenance.md's guaranteed-solvability
// constraint expressed as arithmetic instead of as a hope: every floor of every
// site has at least one grave whose owner's whole story is within reach.
export const occupantOf = (seed, site, floor, room, era) => {
  const cells = floorPlan(seed, site, floor).cells;
  const span = room === cells[0] ? RESOLVED : POOL;
  return actorAddr(site, era, h(seed, site, floor, room, era, 0xb030) % span);
};

// Half of the hands that touched a thing are the hands it was buried with. That
// bias is the entire mechanism: it is why walking to a named room finds a
// trove rather than an average roomful.
const OCCUPANT_IN = 2;

function actorFor(seed, site, floor, room, era, salt) {
  if (hchance(1, OCCUPANT_IN, seed, ...salt, 0xb00f)) return occupantOf(seed, site, floor, room, era);
  if (hchance(1, FOREIGN_IN, seed, ...salt, 0xb010)) {
    const other = h(seed, ...salt, 0xb011) % FOREIGN_SITES;
    // Never a resolved actor of somewhere else: their guarantee is that NOTHING
    // outside their own site names them, and one foreign reference breaks it.
    const n = RESOLVED + (h(seed, ...salt, 0xb012) % (POOL - RESOLVED));
    return actorAddr(other === site ? (other + 1) % FOREIGN_SITES : other, era, n);
  }
  return actorAddr(site, era, h(seed, ...salt, 0xb013) % POOL);
}

// Where a person lies: the room in their own site that they occupy. Found by
// scanning that site's rooms, which is two dozen hashes and no storage — and
// it returns the room ITSELF, not a room-shaped guess, so a lead is true by
// construction. Someone who occupies nowhere names no place, and their acts
// are recorded without one rather than pointing at an empty room.
// The acts of each era that put a thing somewhere. Era 0 has only `hid` — a
// scrapper's cache — which is the whole reason the surface can name a place at
// all, and why its leads are meagre compared to what lies under them.
const PLACE_ACTS = ERA_ACTS.map((acts) => acts.filter((a) => PLACES.has(a)));
const placeActFor = (seed, era, salt) => {
  const p = PLACE_ACTS[Math.min(PLACE_ACTS.length - 1, era)];
  return p.length ? hpick(p, seed, ...salt, 0xb040) : null;
};

// The seeded grave: in each floor's anchor room, the first portable thing is
// unambiguously its occupant's, put there by them. One item per floor, and it
// is the difference between the deduction loop working and the deduction loop
// usually working.
function seededSlot(seed, site, floor, room) {
  for (const c of contentsOf(seed, site, floor, room)) {
    if (isPortable(c.kind)) return String(c.slot);
    if (isContainer(c.kind)) {
      const inside = insideOf(seed, site, floor, room, c.slot).find((it) => isPortable(it.kind));
      if (inside) return `${c.slot}.${inside.idx}`;
    }
  }
  return null;
}

function placeFor(seed, id) {
  const { site, era } = homeOf(id);
  const floors = floorCount(seed, site);
  for (let floor = 0; floor < floors; floor++) {
    if (!eraOnFloor(floor, era)) continue;
    for (const room of floorPlan(seed, site, floor).cells)
      if (occupantOf(seed, site, floor, room, era) === id) return `${site}:${floor}:${room}`;
  }
  return null;
}

const chainMemo = new Map();

export function chainOf(seed, key, era, depth) {
  const memoKey = `${seed}|${key}`;
  const hit = chainMemo.get(memoKey);
  if (hit) return hit;

  const salt = [];
  for (let i = 0; i < key.length; i++) salt.push(key.charCodeAt(i));
  // The key IS the address: site, floor, room, slot. The room is what makes an
  // item part of somebody's grave goods rather than loose stock.
  const at = String(key).split(':');
  const site = Number(at[0]) || 0, atFloor = Number(at[1]) || 0, atRoom = Number(at[2]) || 0;

  // Depth is age: a buckle from the surface has a short history; something from
  // the imperial strata has been through hands for centuries.
  const n = hrange(2 + Math.min(2, era), 4 + era * 2, seed, ...salt, 0xb000);
  const out = [];
  // Eras run OLDEST FIRST: a thing is made once, long ago, and handled since.
  // So event 0 sits at the item's own era and later hands are more recent. A
  // chain spans at most two eras — a relic does not pass through all of history.
  const span = Math.min(era, 2);

  // Is this the one thing in this floor's anchor room that its occupant is
  // guaranteed to have put there?
  const anchor = atFloor >= 0 ? floorPlan(seed, site, atFloor).cells[0] : -1;
  const seeded = atRoom === anchor && at[3] !== undefined
              && at[3] === seededSlot(seed, site, atFloor, atRoom);

  for (let i = 0; i < n; i++) {
    const evEra = era - Math.round((i / Math.max(1, n - 1)) * span);
    const acts = ERA_ACTS[Math.min(ERA_ACTS.length - 1, evEra)];
    const occupant = occupantOf(seed, site, atFloor, atRoom, evEra);

    let id = actorFor(seed, site, atFloor, atRoom, evEra, [...salt, i]);
    let act = i === 0 ? 'made' : hpick(acts.filter((a) => a !== 'made'), seed, ...salt, i, 0xb001);

    if (seeded && i === 1) {
      // The seed itself: this hand is the occupant's, and it put the thing here.
      const forced = placeActFor(seed, evEra, [...salt, i]);
      if (forced) { id = occupant; act = forced; }
    } else if (i > 0 && id === occupant && hchance(1, 3, seed, ...salt, i, 0xb041)) {
      // And in general: what lies with a person is mostly what was laid there
      // with them, which is what makes their room read as a grave.
      act = placeActFor(seed, evEra, [...salt, i]) || act;
    }

    const actor = actorOf(seed, id);
    out.push({
      era: evEra,
      act,
      actor,
      // The place is where the ACTOR lies, not where the item does. That is
      // what makes a foreign name worth following: it names somewhere else.
      place: PLACES.has(act) ? placeFor(seed, actor.id) : null,
      depth,
    });
  }

  if (chainMemo.size > 2048) chainMemo.clear();
  chainMemo.set(memoKey, out);
  return out;
}

// --- marks -----------------------------------------------------------------
// What is physically on the object. One per event that leaves evidence.

export function marksOf(chain) {
  const out = [];
  for (const [i, ev] of chain.entries()) {
    const ed = EVIDENCE[ev.act];
    if (!ed || !ed.mark) continue;
    out.push({ i, act: ev.act, mark: ed.mark, read: ed.read, tier: ed.tier, actor: ev.actor, era: ev.era });
  }
  return out;
}

// --- perception ------------------------------------------------------------
// Keen is the eye, Lore is the education. A mark is legible when the relevant
// stat reaches its tier; below that you can see THAT it is marked, not what of.

export function readMarks(marks, stats) {
  return marks.map((m) => {
    const stat = m.read === 'lore' ? (stats.lore || 0) : (stats.keen || 0);
    return { ...m, legible: stat >= m.tier };
  });
}

export const markCount = (marks) => marks.length;
export const legibleCount = (read) => read.filter((m) => m.legible).length;

// --- worth -----------------------------------------------------------------
// A chain multiplies base value. A notable owner is most of it, which is why
// reading the heraldry is worth paying for — and defacement and clumsy repair
// cut it, so paying to read a thing can turn out to be bad news. A price that
// could only ever go up would make the appraiser a tax rather than a decision.

export function worthMultiplier(chain) {
  let m = 1;
  for (const ev of chain) {
    const ed = EVIDENCE[ev.act];
    if (ed) m += ed.worth;
    if (ev.actor.notable) m += 0.4;
  }
  return Math.max(0.25, Math.round(m * 100) / 100);
}

// A one-line summary of what a reader can actually make out.
export function describe(chain, stats) {
  const read = readMarks(marksOf(chain), stats);
  const seen = read.filter((m) => m.legible);
  if (!seen.length) return read.length ? `${read.length} marks, none legible` : 'unmarked';
  // A name is the thing worth reporting, so a legible notable beats a
  // higher-tier anonymous mark. Otherwise the deepest mark wins.
  const named = seen.filter((m) => m.actor.notable);
  const pool = named.length ? named : seen;
  const best = pool.reduce((a, b) => (b.tier > a.tier ? b : a));
  const who = best.actor.notable ? `${best.actor.name} ${best.actor.house}` : 'someone';
  return `${best.mark} — ${best.act} by ${who}`;
}

// --- the inversion ---------------------------------------------------------
// The relation `chains name actors` run backwards. This is the treasure map:
// deduce a person from an object, and every other thing they touched is
// computable — and already placed, because the same function generated it.
//
// It is a scan, and it is bounded: a site is a few floors of a few rooms of a
// few slots. The result is cached in memory, keyed by address and evictable.
// Per the layer contract, a cache the save can see is a cache that has become
// the world, so this one is never written down.

const troveMemo = new Map();

export function troveIndex(seed, site) {
  const memoKey = `${seed}|${site}`;
  const hit = troveMemo.get(memoKey);
  if (hit) return hit;

  const index = new Map();
  const add = (id, entry) => {
    let a = index.get(id);
    if (!a) index.set(id, (a = []));
    a.push(entry);
  };

  const floors = floorCount(seed, site);
  for (let floor = 0; floor < floors; floor++) {
    const depth = absDepth(floor);
    const era = ERAS.indexOf(eraFor(depth));
    for (const room of floorPlan(seed, site, floor).cells) {
      const note = (key, kind) => {
        // One entry per person per object: a man who owned a sword and later
        // died on it is one owner of one sword, not two. Of his several acts
        // the one that NAMES SOMEWHERE wins, because that is the one a player
        // can do anything with.
        const seen = new Map();
        for (const ev of chainOf(seed, key, era, depth)) {
          const had = seen.get(ev.actor.id);
          if (had && !(ev.place && !had.place)) continue;
          const entry = { key, kind, site, floor, room, act: ev.act, place: ev.place };
          if (had) Object.assign(had, entry); else { seen.set(ev.actor.id, entry); add(ev.actor.id, entry); }
        }
      };
      for (const c of contentsOf(seed, site, floor, room)) {
        if (isPortable(c.kind)) note(`${site}:${floor}:${room}:${c.slot}`, c.kind);
        else if (isContainer(c.kind))
          for (const it of insideOf(seed, site, floor, room, c.slot))
            if (isPortable(it.kind)) note(`${site}:${floor}:${room}:${it.slot}.${it.idx}`, it.kind);
      }
    }
  }

  if (troveMemo.size > 16) troveMemo.clear();
  troveMemo.set(memoKey, index);
  return index;
}

// Everything in this person's home site that names them. For a resolved actor
// that is everything they ever touched, full stop; for a long thread it is the
// part of their story that lies where they lived, which is the part worth the
// walk. Ordered by address, so two readers agree.
export function possessionsOf(seed, actorId) {
  const found = troveIndex(seed, homeOf(actorId).site).get(actorId);
  return found ? found.slice() : [];
}

// The site's guaranteed-solvable people: those whose whole possession set is
// here, with enough of it to be worth following. This is the constraint from
// design/provenance.md made checkable rather than hoped for.
export function resolvedActors(seed, site, least = 2) {
  const out = [];
  for (const [id, items] of troveIndex(seed, site)) {
    if (!isResolved(id) || homeOf(id).site !== site || items.length < least) continue;
    out.push({ actor: actorOf(seed, id), items });
  }
  return out.sort((a, b) => a.actor.id - b.actor.id);
}

// --- leads -----------------------------------------------------------------
// What the player actually gets out of all this: a legible mark names a person,
// that person's record names a room, and the room is real. Perception gates it,
// so a Worker reads grave-dirt and nothing else until they learn better.

export function leadOf(chain, stats) {
  const read = readMarks(marksOf(chain), stats);
  let best = null;
  for (const m of read) {
    if (!m.legible) continue;
    const ev = chain[m.i];
    if (!ev.place) continue;
    // A name you can act on beats a deeper mark you cannot: prefer the notable,
    // then the oldest, which is the one furthest from anyone else's reach.
    const better = !best
      || (ev.actor.notable && !best.ev.actor.notable)
      || (ev.actor.notable === best.ev.actor.notable && ev.era > best.ev.era);
    if (better) best = { ev, mark: m };
  }
  if (!best) return null;
  const { ev, mark } = best;
  return { actor: ev.actor, act: ev.act, place: ev.place, mark: mark.mark, era: ev.era };
}

export const placeLabel = (place) => {
  const [site, floor, room] = String(place).split(':').map(Number);
  return `site ${site} · floor ${floor + 1} · room ${room}`;
};
