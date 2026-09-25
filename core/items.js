// L1: what things ARE. Pure data the kernel interprets — no art, no behaviour.
// Art lives in the pack manifest so it stays swappable; this file is the rules.

// `solid` is a thing you walk around. Anything that stands up off the floor
// blocks: you should not stroll through a barrel. Loose valuables lie flat and
// do not.
export const KIND = {
  // Containers. Opening one is loud and yields what is inside.
  // `foot` is the collision half-extent in pixels from the tile centre, so a
  // chair is something you brush past and a table is something you go around.
  // A tile is 20px, so 10 would fill it edge to edge; nothing does.
  chest:   { force: 'stands', label: 'chest',   container: true, solid: true, foot: 8, bulk: 0, fragility: 0 },
  pot:     { force: 'breaks', label: 'pot',     container: true, solid: true, foot: 6, bulk: 0, fragility: 1 },
  barrel:  { force: 'breaks', label: 'barrel',  container: true, solid: true, foot: 6, bulk: 0, fragility: 1 },
  urn:     { force: 'breaks', label: 'urn',     container: true, solid: true, foot: 7, bulk: 0, fragility: 3 },

  // Portable. `bulk` is the whole economy: what you carry is what you cannot.
  // `value` is BASE scrap, before provenance. Once marks are legible a chain
  // multiplies this; until then it is the flat worth of the material, and the
  // interesting number is value per bulk — a gem is worth twelve times a rib.
  // Weapons are portable items like any other: they cost bulk, they carry a
  // chain, and an appraiser will read you the history of the thing you have been
  // killing with. There is no equip slot — you swing with the best blade you are
  // carrying, so arming yourself is paid for out of the haul, every run.
  sword:   { force: 'breaks', label: 'sword',   bulk: 3, value: 14, fragility: 0, damage: 3, reach: 22, wide: 15, knock: 24, slot: 'weapon' },
  // The Blasting Cap — B.Cap on the glass — the first tool. Set it and step
  // back: a short fuse, then a square of hurt that lingers, breaks rubble to
  // floor, and shoves hard enough to move what a sword cannot. Its numbers
  // live here because a tool is data; sim/blast.js is the one reader.
  bcap:    { force: 'breaks', label: 'B.Cap',   bulk: 1, value: 2, fragility: 0, slot: 'tool',
             blast: { fuse: 45, linger: 10, radius: 28, damage: 8, knock: 48, self: 4 } },

  key:     { force: 'breaks', label: 'key',     bulk: 1, value:  3, fragility: 0 },
  gem:     { force: 'breaks', label: 'gem',     bulk: 1, value: 12, fragility: 1 },
  crystal: { force: 'breaks', label: 'crystal', bulk: 2, value:  9, fragility: 2 },
  trinket: { force: 'breaks', label: 'trinket', bulk: 1, value:  4, fragility: 1 },
  bones:   { force: 'breaks', label: 'bones',   bulk: 2, value:  2, fragility: 2 },

  // Fixtures. Scenery until a system gives them a verb — but furniture still
  // takes up the floor it stands on.
  table:   { force: 'breaks', label: 'table',   fixture: true, solid: true, foot: 9 },
  chair:   { force: 'breaks', label: 'chair',   fixture: true, solid: true, foot: 5 },
};

// Fists. Not an item — you cannot drop them, sell them or read their history —
// but exactly the same SHAPE as one, so the swing code never has to special-case
// an empty pack. A short square reach directly in front, and a third of a
// sword's damage: enough that being disarmed is a bad position rather than a
// dead stop.
// `knock` is how far a hit carries a foe of weight 1, in px. A sword moves a
// dog a tile and a bit; fists are a shove, not a launch. A maul will be more.
export const UNARMED = { label: 'fists', damage: 1, reach: 10, wide: 5, knock: 8 };

export const footOf = (k) => (KIND[k] && KIND[k].foot) || 0;

export const isSolidItem = (k) => !!(KIND[k] && KIND[k].solid);

export const isContainer = (k) => !!(KIND[k] && KIND[k].container);
export const isWeapon     = (k) => !!(KIND[k] && KIND[k].damage > 0);

// The equipment row: five labelled slots above the pack. What sits in a slot is
// worn or wielded rather than hauled, but it still counts against bulk — armor,
// tools and haul draw from one budget (design/combat-and-tools.md).
export const SLOTS = ['weapon', 'tool', 'armor', 'helm', 'accessory'];
export const slotOf = (k) => (KIND[k] && KIND[k].slot) || null;
export const damageOf     = (k) => (KIND[k] && KIND[k].damage) || 0;
export const reachOf      = (k) => (KIND[k] && KIND[k].reach) || 0;
export const wideOf       = (k) => (KIND[k] && KIND[k].wide) || 0;
export const knockOf      = (k) => (KIND[k] && KIND[k].knock) || 0;
export const blastOf      = (k) => (KIND[k] && KIND[k].blast) || null;
export const isTool       = (k) => !!(KIND[k] && KIND[k].slot === 'tool');
// What force does to a thing: 'stands' or 'breaks'. One word, not a boolean,
// because the pick and the maul will want a third answer, and "what does
// force do to this?" should be one column. A chest stands; the rest break.
export const forceOn      = (k) => (KIND[k] && KIND[k].force) || 'breaks';
export const fragilityOf  = (k) => (KIND[k] && KIND[k].fragility) || 0;
export const isPortable  = (k) => !!(KIND[k] && KIND[k].bulk > 0 && !KIND[k].container);
export const bulkOf      = (k) => (KIND[k] && KIND[k].bulk) || 0;
export const valueOf     = (k) => (KIND[k] && KIND[k].value) || 0;
export const labelOf     = (k) => (KIND[k] && KIND[k].label) || k;

// What the toast says. The verb is the whole interface: one button, one line.
export function verbFor(kind) {
  if (isContainer(kind)) return `Open ${labelOf(kind)}`;
  if (isPortable(kind))  return `Pick up ${labelOf(kind)}`;
  return null;
}

// Placement weights. Containers cluster near the surface; loose valuables and
// the dead lie deeper — the same depth-is-era gradient the world already has.
const TABLES = [
  { upTo: 1,  w: [['chest',2],['pot',4],['barrel',3],['bones',1],['trinket',2],['table',2],['chair',2],['bcap',2]] },
  { upTo: 3,  w: [['chest',3],['pot',4],['urn',3],['barrel',3],['bones',3],['trinket',3],['key',1],['gem',1],['sword',1],['table',1],['chair',1],['bcap',2]] },
  { upTo: 8,  w: [['chest',3],['urn',4],['pot',2],['bones',4],['gem',2],['crystal',2],['trinket',2],['key',2],['sword',1],['bcap',1]] },
  { upTo: 99, w: [['urn',3],['bones',4],['crystal',4],['gem',3],['trinket',2],['key',1]] },
];

export function kindTable(depth) {
  return (TABLES.find((t) => depth <= t.upTo) || TABLES[TABLES.length - 1]).w;
}

export function pickKind(depth, roll) {
  const w = kindTable(depth);
  let total = 0;
  for (const [, n] of w) total += n;
  let r = roll % total;
  for (const [k, n] of w) { if (r < n) return k; r -= n; }
  return w[0][0];
}
