# Roadmap

What stands between here and a shippable game, in rough order of dependency.
This is the only document that schedules work.

## What 1.0.0 means

**A shippable game — at minimum the whole of Act I.** Not a proven mechanic, not
a vertical slice: the Field and its mausoleums, the upper Barrow Deep beneath
them, and the Company Camp, Grimhaven and Ashmark above, with the loop closed
end to end and nothing placeholder left in it. A person who is not DJ can
install it, play it for a few hours, and finish something.

Act I is defined in `design/world-shape.md` and gated by the campaign's own
spoiler discipline: sets follow acts, so the Frontier Halls, the Fundament and
Vorathum's Domain are later releases, not missing pieces.

## Where it stands — 0.1.0

A generated mausoleum you can walk, light and rob. The kernel is deterministic
and replayable, the world is a pure function of its address, items exist and
weigh something, and the art layer is swappable. That is the floor, not the
house.

## The distance

Each of these is a MINOR release or several. Order is by dependency, not
priority, and it will change.

### The loop has to close
Nothing you carry is worth anything yet, and there is nowhere to take it.
Extraction back to camp, a quartermaster who buys by weight, an appraiser who
costs coin and time, and scrap with somewhere to go. **This is the step that
makes `plans/slice-01.md` answerable** — and answering it is one question, not a
release.

### Provenance has to become visible
The chains exist and nothing reads them. Marks on objects, stat-gated
perception, the actor graph, and the deduction that turns a maker's mark into a
place worth walking to. This is the thing the game is actually about.

### Threat
Eight enemies, eight dual-use tools, damage that costs cargo rather than only
health, death, and the corpse run. Encounters rare and mostly avoidable, per
`design/combat-and-tools.md`.

### The world above and below
The Field as a real surface with many mausoleum mouths. The Barrow Deep as one
connected network rather than per-site basements. Shortcuts, discovered
extraction points, and the guild lift. Company Camp, Grimhaven and Ashmark as
places with people in them.

### The economy in full
Buyers who pay different prices for the same object, faction standing, repair,
corruption clearing, permits, and the sinks that keep scrap from piling up.

### Jobs
Worker as the default job, and the Act I jobs reachable from it — selectable,
offered once, and imposed. See `design/jobs.md`.

### Content and craft
Real art replacing the unlicensed reference set. Audio. The tile sheet actually
used — four wall sets, two ornate floor sets and the architecture block are idle
today. Writing: the prose fragments and name tables that provenance reads out.

### Shipping
Saves and settings. The Capacitor APK and the device pass on the Retroid.
Accessibility, including the peaceful mode that `deletable` already implies.
Performance and battery measured on hardware, not asserted.

## Open questions that gate a release

- **`NICHE` has no art**, and `PILLAR` had none until it became masonry. If the
  architecture block holds columns and alcoves, both become real types.
- **Rubble blocks its whole tile** while its art covers about 64% of it —
  terrain needs a footprint the way items now have one.
- **Container transfer is one-way.** Putting things back needs the `dropped`
  list the corpse mechanic will need anyway; build it once.
- **The reference art must go.** Everything in `inbox/1-bit tileset/` is
  unlicensed placeholder and cannot ship.
