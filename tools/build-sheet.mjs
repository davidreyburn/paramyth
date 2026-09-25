// Turns assets/sheets/paramyth-20.txt into paramyth-20.png: the project's own
// art, kept as text so a diff shows the pixels. `#` is the pack's light tone,
// `@` its dark tone, `.` clear — exactly the palette the stratum remap keys on.
import { readFile, writeFile } from 'node:fs/promises';
import { encodePNG, readCells } from './png.mjs';

const SRC = new URL('../assets/sheets/paramyth-20.txt', import.meta.url);
const OUT = new URL('../assets/sheets/paramyth-20.png', import.meta.url);
const PACK = new URL('../assets/packs/onebit.json', import.meta.url);
const CELL = 20;

const pack = JSON.parse(await readFile(PACK, 'utf8'));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const LIGHT = [...hex(pack.twoTone.light), 255], DARK = [...hex(pack.twoTone.dark), 255], CLEAR = [0, 0, 0, 0];

const cells = readCells(await readFile(SRC, 'utf8'));
const COLS = Math.max(8, cells.length);                // room to grow without renumbering
const W = COLS * CELL, H = CELL;
const png = encodePNG(W, H, (x, y) => {
  const c = cells[(x / CELL) | 0], ch = c ? c[y][x % CELL] : '.';
  return ch === '#' ? LIGHT : ch === '@' ? DARK : CLEAR;
});
await writeFile(OUT, png);
console.log(`paramyth-20.png: ${cells.length} cells, ${W}x${H}, ${png.length} bytes`);
