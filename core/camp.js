// L1: the Company Camp — the first AUTHORED place.
//
// `design/world-shape.md` calls for hand-placed anchors with generated tissue
// between them. This is the first anchor: a fixed layout that never varies by
// seed. It is room 0 of the Field — the surface floor above every mausoleum —
// and it opens onto the Field along its east and south sides. The mausoleum
// mouth is NOT here: nobody sleeps next to that (DJ, 2026-09-25). It stands
// in a field room at least two rooms away; core/gen.js places it.
//
// Grid symbols: # palisade · . packed ground · , rubble
//               Q quartermaster · S stash · A appraiser

import { COLS, ROWS, T } from './grid.js';

const MAP = [
  '################################',
  '#...............................',
  '#..###.................###......',
  '#..#Q..................#S.......',
  '#..###.................###......',
  '#...............................',
  '#.........,...........,.........',
  '#...............................',
  '#...............................',
  '#..............,................',
  '#...............................',
  '#...............................',
  '#...............................',
  '#..###..........................',
  '#..#A...........................',
  '#...............................',
];

export const STATION = { QUARTERMASTER: 'quartermaster', STASH: 'stash', APPRAISER: 'appraiser' };

const CHAR = {
  '#': T.WALL, '.': T.FLOOR, ',': T.RUBBLE,
  'Q': T.FLOOR, 'S': T.FLOOR, 'A': T.FLOOR,
};
const STATION_CHAR = { Q: STATION.QUARTERMASTER, S: STATION.STASH, A: STATION.APPRAISER };

// The camp is the same every time, so build it once.
let built = null;

export function campRoom() {
  if (built) return built;

  if (MAP.length !== ROWS) throw new Error(`camp is ${MAP.length} rows, the grid is ${ROWS}`);
  for (const [i, row] of MAP.entries())
    if (row.length !== COLS) throw new Error(`camp row ${i} is ${row.length} wide, the grid is ${COLS}`);

  const grid = new Uint8Array(COLS * ROWS);
  const stations = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = MAP[y][x];
      const t = CHAR[c];
      if (t === undefined) throw new Error(`camp has an unknown symbol '${c}' at ${x},${y}`);
      grid[y*COLS + x] = t;
      if (STATION_CHAR[c]) stations.push({ tile: y*COLS + x, kind: STATION_CHAR[c] });
    }
  }

  // Everything is walkable from the open side; the camp is not a puzzle.
  const reach = new Uint8Array(COLS * ROWS);
  let start = (ROWS >> 1) * COLS + COLS - 1;               // the east edge, mid-height: open ground
  if (start >= 0) {
    reach[start] = 1;
    const st = [start];
    while (st.length) {
      const i = st.pop(), x = i % COLS, y = (i / COLS) | 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny*COLS + nx;
        if (reach[j] || grid[j] === T.WALL || grid[j] === T.RUBBLE) continue;
        reach[j] = 1; st.push(j);
      }
    }
  }

  for (const st of stations) {
    if (!reach[st.tile]) throw new Error(`camp station '${st.kind}' is unreachable from the open side`);
  }

  // No plan here: the camp is one room of the Field, and gen.js supplies the
  // Field's plan when it routes room 0 to this map.
  built = {
    grid, reach, stations, protect: [],
    archetype: 'company-camp',
    era: { name: 'Recent', tint: '#7a6242', arch: ['company-camp'] },
  };
  return built;
}

export const campStations = () => campRoom().stations;
