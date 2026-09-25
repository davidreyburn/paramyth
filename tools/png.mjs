// A PNG writer with no dependencies: RGBA, 8-bit, filter none. Shared by the
// sheet builder and the icon builder so there is one of these, not two.
import { deflateSync } from 'node:zlib';

const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (tag, data) => { const t = Buffer.from(tag); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };

// `pixel(x, y)` returns [r, g, b, a].
export function encodePNG(w, h, pixel) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) raw.set(pixel(x, y), y * (1 + w * 4) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// The project's text art: cells of 20 rows of 20 in `#` (light), `@` (dark), `.` (clear).
export function readCells(text) {
  const cells = []; let cur = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#') && !/^[#@.]{20}$/.test(line)) continue;
    if (!line) { if (cur.length) { cells.push(cur); cur = []; } continue; }
    if (!/^[#@.]{20}$/.test(line)) throw new Error(`bad row: ${JSON.stringify(raw)}`);
    cur.push(line);
  }
  if (cur.length) cells.push(cur);
  cells.forEach((c, i) => { if (c.length !== 20) throw new Error(`cell ${i} has ${c.length} rows, not 20`); });
  return cells;
}
