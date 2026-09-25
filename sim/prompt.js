// L3: the toast line. One button, one verb, and the one refusal that matters.
// It reads the room, the load and the record and never writes; apply reads
// the same three, in the same order, and a gate holds the two together.
//
// One of four files that were `sim/interact.js`. This one answers: what
// should the glass SAY?

import { STATION } from '../core/camp.js';
import { KIND, isContainer, isPortable, bulkOf, verbFor } from '../core/items.js';
import { stationAt, stairUnder, reachable } from './room.js';
import { carriedBulk, BULK_BUDGET } from './carry.js';
import { haulValue } from './record.js';

// The toast line. One button, one verb, and the one refusal that matters.
export function prompt(s) {
  const station = stationAt(s);
  if (station) {
    if (station.kind === STATION.QUARTERMASTER) {
      const v = haulValue(s);
      return v > 0
        ? { text: `Sell salvage \u2014 ${v} scrap`, station }
        : { text: 'Nothing to sell', refuse: true, station };
    }
    if (station.kind === STATION.STASH) return { text: 'Open stash', station };
    if (station.kind === STATION.APPRAISER) {
      return s.carried.length
        ? { text: 'Consult the appraiser', station }
        : { text: 'Nothing to appraise', refuse: true, station };
    }
  }

  const st = stairUnder(s);
  if (st) return { text: st === 'down' ? 'Descend' : 'Ascend', stair: st };
  const c = reachable(s);
  if (!c) return null;
  if (isPortable(c.kind) && carriedBulk(s) + bulkOf(c.kind) > BULK_BUDGET)
    return { text: `Too heavy — drop something first`, refuse: true, target: c };
  if (isContainer(c.kind) && c.open) return { text: `Search ${KIND[c.kind].label}`, target: c };
  return { text: verbFor(c.kind), target: c };
}
