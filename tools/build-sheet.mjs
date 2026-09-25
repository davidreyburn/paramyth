// Turns assets/sheets/paramyth-20.txt into paramyth-20.png: the project's own
// art, kept as text so a diff shows the pixels. `#` is the pack's light tone,
// `@` its dark tone, `.` clear — exactly the palette the stratum remap keys on.
// Zero dependencies: node's zlib and a hand-rolled PNG writer.
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const SRC = new URL('../assets/sheets/paramyth-20.txt', import.meta.url);
const OUT = new URL('../assets/sheets/paramyth-20.png', import.meta.url);
const PACK = new URL('../assets/packs/onebit.json', import.meta.url);
const CELL = 20;

const pack = JSON.parse(await readFile(PACK, 'utf8'));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const LIGHT = [...hex(pack.twoTone.light), 255], DARK = [...hex(pack.twoTone.dark), 255], CLEAR = [0, 0, 0, 0];

const text = await readFile(SRC, 'utf8');
const cells = []; let cur = [];
for (const raw of text.split('\n')) {
  const line = raw.trim();
  if (line.startsWith('#') && !/^[#@.]{20}$/.test(line)) continue;   // a comment, not a row
  if (!line) { if (cur.length) { cells.push(cur); cur = []; } continue; }
  if (!/^[#@.]{20}$/.test(line)) throw new Error(`bad row: ${JSON.stringify(raw)}`);
  cur.push(line);
}
if (cur.length) cells.push(cur);
cells.forEach((c, i) => { if (c.length !== CELL) throw new Error(`cell ${i} has ${c.length} rows, not ${CELL}`); });

const COLS = Math.max(8, cells.length);                // room to grow without renumbering
const W = COLS * CELL, H = CELL;
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;                            // filter: none
  for (let x = 0; x < W; x++) {
    const c = cells[(x / CELL) | 0], ch = c ? c[y][x % CELL] : '.';
    const p = ch === '#' ? LIGHT : ch === '@' ? DARK : CLEAR;
    raw.set(p, y * (1 + W * 4) + 1 + x * 4);
  }
}
const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (tag, data) => { const t = Buffer.from(tag); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
await writeFile(OUT, png);
console.log(`paramyth-20.png: ${cells.length} cells, ${W}x${H}, ${png.length} bytes`);
