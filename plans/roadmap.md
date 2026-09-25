# Roadmap

What stands between here and a shippable game, in rough order of dependency.
This is the only document that schedules work.

Unscheduled ideas live in `plans/backlog.md` and are deliberately kept out of
this one. Nothing arrives here until it has a dependency and an argument.

## What 1.0.0 means

**A shippable game — at minimum the whole of Act I.** Not a proven mechanic, not
a vertical slice: the Field and its mausoleums, the upper Barrow Deep beneath
them, and the Company Camp, Grimhaven and Ashmark above, with the loop closed
end to end and nothing placeholder left in it. A person who is not DJ can
install it, play it for a few hours, and finish something.

Act I is defined in `design/world-shape.md` and gated by the campaign's own
spoiler discipline: sets follow acts, so the Frontier Halls, the Fundament and
Vorathum's Domain are later releases, not missing pieces.

## Where it stands — 0.8.0

*Played on the Retroid, 2026-09-25: “it all feels great, combat is good, the dog
is challenging, the pop is satisfying, knockback is great … a promising
prototype.” The Field and the on-screen controls want tuning.*

A Field of open ground above a generated mausoleum, with the Company Camp as
one room of it and the mouth two rooms away; two foes on one mode machine (a
dog that circles, crouches and springs; a Sentinel that stands until you are
near); knockback both ways; the Blasting Cap, which opens boulders, breaks
furniture, spares one thing in three from a pot, and moves what a sword
cannot; a dithered fade and a pop; three save slots; fullscreen and install;
a public build on GitHub Pages that runs the gates before it deploys; on-screen
controls for a phone; a licence and a notice. Six stats, three renamed.

*What 0.5.0 said, still true:* a generated mausoleum you can walk, light, rob and be killed in, a camp to sell
into, and an object's history that tells you where to go next. The kernel is deterministic
and replayable, the world is a pure function of its address, and the actor graph
inverts — which is the mechanic the whole design rests on and the one that was
least certain to work. The first L4 system exists, so the layer contract is now
tested rather than asserted. The world above and below, and everything under
*Content and craft*, remain untouched. That is a floor with two rooms on it.

## The distance

Each of these is a MINOR release or several. Order is by dependency, not
priority, and it will change.

### ~~The loop has to close~~ — done in 0.2.0
Extraction back to camp, a quartermaster who buys by weight, a finite stash, and
an appraiser who costs coin and time. `plans/slice-01.md` is now **answerable**:
everything its question needs is built except the threat that makes the bulk
budget bite. Answering it is one play session, not a release.

### ~~Provenance has to become visible~~ — done in 0.3.0 and 0.4.0
Chains, marks, stat-gated perception, a worth multiplier and the appraiser
landed in 0.3.0. The inversion landed in 0.4.0: actors are decomposable
addresses, rooms have occupants, `possessionsOf` exists, and a legible mark
leads to a room that is real and stocked. The guaranteed-solvability constraint
is built into the generator rather than hoped for, and the `solvable` gate holds.

**What is left of the design is the middle tier.** There are still no
*amendments*, so record always equals truth and forgery has nowhere to live.
Attestation, assertion, effacement and `inherit` are the next release of this
system, and `inherit` is the one that wants the corpse run to exist first — your
own name written into a chain by play.

Also still open: a **foreign** reference names a site that computes but that
nothing yet walks to. Those dead ends close when the Field has more than one
mouth, not before.

### Threat — the dog hunts (0.7.0); the Sentinel stands (0.8.0)
`plans/foe-behaviour.md` is built and shipped: a five-mode machine in the
delta, knockback from a weapon's `knock` over a foe's `weight`, the contact
gates around *breaking contact*. Two foes on one machine, with a gate that
refuses a third that is not a table. Next foe: the Red Hand bandit, the first
that loots — it is what makes corpses and the Field mean something.
One enemy of eight, one weapon, contact damage, the swing, death and a full
drop. The claim that damage costs **cargo** rather than only health is built and
gated: the encumbrance speed table finally reaches the movement path, so a dog
outruns a laden player and not a light one.

What is left: the other seven enemies, the eight dual-use tools, grabs, stamina,
armor and condition, corruption, and the corpse as a lootable marker that
bandits carry off. `plans/slice-01.md`'s Phase 5 is not done until a player has
used the drop-load button on purpose — which is now possible and not yet
observed.

### The world above and below
The Field exists (0.8.0) as one site's surface; it wants tuning and content,
and then many mouths. Next: **the corpse** as a container of special bones
with a faint aura, opening like a chest (DJ). Then The Barrow Deep as one
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
- ~~**Container transfer is one-way.**~~ Closed in 0.4.0. The `dropped` list
  exists, both screens put things back, and drop-load sets a haul down instead
  of destroying it. The corpse run inherits it.
- **The reference art must go.** Everything in `inbox/1-bit tileset/` is
  unlicensed placeholder and cannot ship.
