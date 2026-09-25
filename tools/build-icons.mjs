// The app's icons, from the project sheet's sword (DJ's): cell 0 of
// paramyth-20.txt, scaled by an integer with nearest neighbour, bone on void,
// inside the maskable safe area. 192 and 512, the two sizes an installable
// manifest needs. No dependencies.
import { readFile, writeFile } from 'node:fs/promises';
import { encodePNG, readCells } from './png.mjs';

const SRC = new URL('../assets/sheets/paramyth-20.txt', import.meta.url);
const cell = readCells(await readFile(SRC, 'utf8'))[0];
const BONE = [0xb1, 0xaf, 0xa8, 255], SHADOW = [0x31, 0x2f, 0x28, 255], VOID = [0, 0, 0, 255];

for (const size of [192, 512]) {
  const k = Math.floor((size * 0.6) / 20);            // integer scale inside the 80% safe zone
  const off = (size - 20 * k) >> 1;
  const png = encodePNG(size, size, (x, y) => {
    const cx = Math.floor((x - off) / k), cy = Math.floor((y - off) / k);
    if (cx < 0 || cy < 0 || cx >= 20 || cy >= 20) return VOID;
    const ch = cell[cy][cx];
    return ch === '#' ? BONE : ch === '@' ? SHADOW : VOID;
  });
  const out = new URL(`../app/icons/sword-${size}.png`, import.meta.url);
  await writeFile(out, png);
  console.log(`sword-${size}.png: x${k}, ${png.length} bytes`);
}
