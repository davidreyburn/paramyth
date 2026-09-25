# Blasts and the things in them

*v0.1, 2026-09-25. Built the same day, in one commit rather than the three below; the column is `force` (the cap's own `blast` property already had the other name), and the scar is a `decals` block in the pack rather than a tile type, because a gate refuses tile types the generator cannot emit. Survivor rate across the world: 98 of 288. DJ's brief:*

> A blast should destroy barrels, containers, pots, tables, and chairs, but not
> chests. Furniture that are blasted should leave some type of mark upon the
> ground. Blasts should destroy items caught in them too. When a container is
> destroyed, it should have a chance of leaving behind one item it contained in
> its place.

## What exists to build on

- A blast is a square in the delta (`s.blasts`), lives `linger` ticks, and
  already hurts each **body** once via `hit: []`. Things are not bodies; that
  is the gap.
- A thing's existence in the world is a matter of lists: `taken` removes it
  from the room view, `dropped` puts a keyed ref back on a tile. A "destroyed"
  thing is therefore **taken and never dropped** — no new state for the thing
  itself. Its key stays valid, so the record can still speak of it.
- `broken` already records tiles the map changed. A scorch is the same shape.
- `hurt` on the player rolls fragility against cargo, so **a blast already
  costs the haul of anyone standing in it**. Nothing to add there.

## The rules, as data

`core/items.js` gains one word per kind:

| kind | `blast` | why |
|---|---|---|
| chest | `'stands'` | iron-bound; it is the one thing a cap does not open |
| barrel, pot, urn | `'breaks'` | containers: shatter, and may spill one thing |
| table, chair | `'breaks'` | furniture: splinters, and leaves a mark |
| key, gem, crystal, trinket, bones, sword, bcap | `'breaks'` | loose things caught in it are gone |

One word, not a boolean, because the next tool (a pick, a maul) will want a
third answer, and "what does force do to this?" should be one column.

## What a blast does, in order, on the tick it goes

In `fuseStep`, after rubble and before bodies:

1. **Every visible thing whose tile centre is inside the square, and whose
   `blast` is `'breaks'`,** is destroyed: its key is pushed to `taken` (or, for
   a dropped thing, removed from `dropped`). Bodies vanish with it, so the room
   view's stamp already covers it — `taken.length` changes.
2. **A destroyed container rolls once** for a survivor: `hchance(1, 3, seed,
   key, 0xb1a5)` — one in three, keyed to the container so replay agrees. If it
   survives, one item from `containerItems(s, key)` (the first, by slot order;
   the record decides which, not luck twice) is pushed to `dropped` at the
   container's tile. It keeps its own key, so its history is intact and
   `possessionsOf` still finds it. Contents that do not survive are simply
   unreachable, which they already were the moment the container's key went
   to `taken` — nothing to record.
3. **Furniture leaves a mark.** `s.scars` gains `site:floor:room:tile` for each
   destroyed table, chair, barrel, pot or urn. Same shape as `broken`, same
   stamp treatment in `roomView`, drawn as an overlay on the floor tile.
4. **Bodies**, as now.

A chest inside the square is untouched, contents and all. Its `'stands'` is
the whole rule; nothing else special-cases it.

## The mark on the ground

- Delta: `scars: []`, hashed and saved like `broken`.
- Draw: an overlay cell on the floor tile, through the pack — `tiles.scar`,
  kind `overlay`, so the nine-slice floor stays underneath. The reference decor
  sheet has rubble and stone scatter that would serve as a placeholder; the
  honest version is a cell of our own in `paramyth-20.txt` (DJ: a scorch, a
  splinter scatter, or both by kind — the plan does not need to decide).
- Not solid, not a body, no verb. It is the floor, remembered.

## Gates

- a barrel in the square is gone after the blast; a chest beside it is not
- a loose gem on the floor in the square is gone
- a destroyed pot leaves a survivor one time in three over a fixture of many
  pots — and the same pot gives the same answer on replay
- the survivor lies on the pot's tile, keeps its key, and can be picked up
- a blasted table leaves a scar on its tile; the scar survives a save
- a chest's contents are intact after a blast
- the room view forgets a destroyed body: you can walk where the barrel stood
- replay holds through a blast that breaks things

## Sequence

1. `blast` column and destruction of loose things and furniture, with scars in
   the delta and a placeholder overlay. One commit.
2. Containers: destruction and the survivor roll. One commit.
3. Own art for the scar. Whenever DJ has one.

## Open questions

1. **Does the mark mean anything later?** A scar could be the corruption
   system's first foothold — a place where Rot finds purchase — or nothing but
   a picture. Left as a picture until that system exists; the key is in the
   delta either way.
2. **Should the record know?** The provenance chain is amendable. "Blasted
   by a Company Worker, 2026" is an event a survivor's chain could carry. Not
   in this plan; noted as the first use of amendment when one is wanted.
3. **The blast that hits a corpse.** Death drops everything at your feet. A
   cap set there destroys the lot. That is correct and cruel, and worth a toast
   the first time it happens.
