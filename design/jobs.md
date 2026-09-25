# Jobs

*v0.1, 2026-09-22. DJ's design, recorded. **Not scheduled** — nothing in the
build implements any of this yet.*

## The idea

You begin as a basic, undifferentiated **Worker** — **itself a job, the initial
default, not an absence of one** — arriving either at a Barrowlands camp or at
one of the ports of entry. Through building skills and
completing certain events you gain access to different **jobs**, of which the
campaign's player classes are a core part. Some jobs are selectable once you
qualify. Others are offered as a one-time deal. And some situations — picking up
a mutterstone, for instance — **switch your job immediately**, and hold it until
you resolve a condition.

## Why it fits

**It is the campaign's own opening.** *Into the Barrowlands* begins with new
recruits in a privateer salvage company on their first day. Starting
undifferentiated is not a concession to onboarding; it is the fiction.

**It solves a real problem the salvage loop had.** A class chosen at the title
screen is a decision made with no information — the player cannot evaluate what
a Dusk Sage is before they have been in the dark. Starting as a Worker lets the
world teach what the jobs mean before one is taken. The first Stone Knight you
meet is an argument for becoming one.

**It gives the stat block a second destination.** `design/combat-and-tools.md`
sends Lore, Insight and Charm into `viewFor` — they buy *perception*. Jobs give
them somewhere else to go: **qualification**. Stats are continuous and earned;
jobs are discrete and gate **verbs**. A Sun Priest can carry consecrated flame; a
Cave Wretch reads the deep. That keeps the two axes from competing — one changes
what you see, the other what you can do.

## The three ways a job arrives

| Mode | Shape | The thing to get right |
|---|---|---|
| **Selectable** | You meet a bar; you choose, in camp, at leisure | The bar must be legible before it is met, or qualification feels like a lottery |
| **Offered once** | A one-time deal, taken or lost | **A one-time offer the player does not understand is not a meaningful decision, it is a bad one.** The world must have *shown* you that job first |
| **Imposed** | A condition takes you — the mutterstone — and holds until resolved | This is the strongest of the three and the one that justifies the whole system |

### The imposed case is the interesting one

Picking up an object that changes who you are is a different mechanic from
choosing a class, and it is exactly what the lore says the mutterstone does:
*"a fragment of ancient stone that reveals hidden truths while corrupting its
bearer... constantly tempted toward ruin."* Myk the Digger is a hireling who is
secretly a Cursed Fool. The campaign already runs this exact plot.

It also lands squarely on `design/provenance.md`: an item's chain acting on
whoever holds it. Most provenance is *information*; a mutterstone is provenance
with an **appetite**. If one item can impose a job, the design has a place for
every cursed thing the setting contains, and the salvage loop gains a real
hazard — the most valuable thing in the room being the one you should not pick
up.

## Ports of entry are not spawn points

Company Camp, Grimhaven and Ashmark are three different *relationships to the
Barrowlands*: already employed; imperial, disciplined and suspicious; lawless and
desperate. If where you arrive seeds which jobs are reachable and which are
closed, the start is a real choice rather than a map marker — and it gives the
surface strata a job to do beyond being a place you sell things.

## How this would sit in the layer contract

- **L3** gains `job` and its qualification state — a handful of bytes.
- **L4** gains a `jobs` system: it reads stats, the delta and what has been
  carried, and proposes a job change. It reads no other system.
- **Deletability holds.** Remove `systems/jobs/` and you are a Worker forever;
  the game boots, delves, hauls and sells. That is the module test passing, and
  it means jobs can be built late without the rest of the design waiting.

## Open questions

1. **When can a job change?** Selectable and offered jobs almost certainly change
   only in camp — a build that shifts mid-run makes the triage decision noisy.
   The imposed case is the deliberate exception, and it is better for being the
   only one.
2. ~~Is Worker a job or the absence of one?~~ **Settled (DJ, 2026-09-22): Worker
   is its own job, the initial default.** So it carries its own verbs, and never
   taking another job is a playable way through rather than a waiting room. It
   also means the `jobs` system always has a value to hold and never a null, and
   that deleting the system leaves the game in a legitimate state rather than an
   undefined one.
3. **Can a job be lost?** The imposed case implies yes, at least temporarily.
   Whether a chosen job can be *failed out of* is a much larger question.
4. **Spoiler gating.** Sun Priest and Stone Knight are surface-legible. Prophet
   of Markkon and Blighted Scholar reveal cosmology. Job availability should
   follow the Act gating already in `design/world-shape.md`, so a Set 1 player
   cannot reach a job that names something they have not met.
5. **Do jobs change bulk?** Tempting — a Stone Knight carries more — but bulk is
   the one number the whole loop reads. Changing it by job risks making the job
   choice a numbers decision instead of an identity one.
