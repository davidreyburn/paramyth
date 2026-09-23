// L5: the asset layer. Art is referenced through a pack manifest and never
// assumed — swapping packs is a manifest change, and running with no pack at
// all is a supported mode that falls back to flat colour.

export async function loadPack(url) {
  const pack = await (await fetch(url)).json();
  const sheets = {};
  await Promise.all(Object.entries(pack.sheets).map(([k, src]) =>
    new Promise((res) => {
      const img = new Image();
      img.onload = () => { sheets[k] = img; res(); };
      img.onerror = () => { res(); };            // a missing sheet is not fatal
      img.src = src;
    })));
  const missing = Object.keys(pack.sheets).filter((k) => !sheets[k]);
  return { ...pack, sheets, missing, ok: missing.length === 0 };
}

const hex = (s) => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];

// The reference art is genuinely two-tone, so region flavour is an exact
// two-colour remap rather than a tint wash. One pass per (sheet, tone), cached.
const toneCache = new Map();

// Scale a stratum's pair toward black. Keeps hue, changes value, so wall and
// floor read apart while staying inside one colour world.
export function shadeTone(tone, k) {
  if (!k || k === 1) return tone;
  const mul = (hx) => '#' + [1,3,5].map((i) =>
    Math.max(0, Math.min(255, Math.round(parseInt(hx.slice(i, i+2), 16) * k)))
      .toString(16).padStart(2, '0')).join('');
  return { light: mul(tone.light), dark: mul(tone.dark) };
}

export function tonedSheet(pack, sheetName, tone) {
  const key = `${pack.id}|${sheetName}|${tone.light}|${tone.dark}`;
  const hit = toneCache.get(key);
  if (hit) return hit;

  const img = pack.sheets[sheetName];
  if (!img) return null;

  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = false;
  x.drawImage(img, 0, 0);

  const src = hex(pack.twoTone.light), srcD = hex(pack.twoTone.dark);
  const dst = hex(tone.light), dstD = hex(tone.dark);
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i+3] < 8) continue;
    const near = (a) => Math.abs(p[i]-a[0]) + Math.abs(p[i+1]-a[1]) + Math.abs(p[i+2]-a[2]);
    const t = near(src) <= near(srcD) ? dst : dstD;
    p[i] = t[0]; p[i+1] = t[1]; p[i+2] = t[2];
  }
  x.putImageData(d, 0, 0);

  if (toneCache.size > 32) toneCache.clear();
  toneCache.set(key, c);
  return c;
}

// Deterministic variant choice, so a tile never shimmers between frames.
export function variantFor(list, tx, ty) {
  let h = Math.imul(tx * 374761393 + ty * 668265263, 1274126177);
  return list[((h ^ (h >>> 13)) >>> 0) % list.length];
}

// Nine-slice: a wall shows an outer face on any side whose neighbour is not the
// same type. Column 0 is the left face, 1 the middle, 2 the right; likewise rows
// for top/middle/bottom. Out-of-bounds counts as same, so a room's border reads
// as continuous masonry rather than facing off the screen.
export function ninesliceOffset(n, e, s, w) {
  return [w ? (e ? 1 : 2) : 0, n ? (s ? 1 : 2) : 0];
}

// The four orthogonals alone cannot see a corner. A room's border corner has
// wall on all four sides — the border continues along both runs — and is a
// corner only because the floor sits in ONE DIAGONAL. Without this case it
// resolves to the plain centre fill and the corner simply is not drawn.
// `inner` maps each open diagonal to its piece; the art puts that piece's solid
// quadrant on the side the floor is on.
const DIAGS = [["nw", 4], ["ne", 5], ["se", 6], ["sw", 7]];
export function innerCornerKey(nb) {
  if (!(nb[0] && nb[1] && nb[2] && nb[3])) return null;   // not enclosed: an edge case
  for (const [key, i] of DIAGS) if (!nb[i]) return key;
  return null;
}

// Resolve a tile type to the ordered list of cells to blit.
// Each draw is [sheet, col, row, shade, tone] — both travel with the CELL, not
// with the call, so an overlay's base keeps its own value and its own colour
// while the thing on top keeps the other.
//
// `tone` is an optional fixed two-tone pair that replaces the stratum's. It is
// how a wooden barrel stays wooden at every depth: the stratum remap is for
// architecture, which should read as the region it is in, and not for objects,
// which are made of a material and carry it around with them.
export function drawsFor(pack, name, tx, ty, neighbours) {
  const def = pack.tiles[name];
  if (!def) return null;
  const k = def.shade === undefined ? 1 : def.shade;
  const t = def.tone;
  if (def.kind === 'variants') {
    const c = variantFor(def.cells, tx, ty);
    return [[c[0], c[1], c[2], k, t]];
  }
  if (def.kind === 'nineslice') {
    if (def.inner) {
      const dk = innerCornerKey(neighbours);
      const off = dk && def.inner[dk];
      if (off) return [[def.sheet, def.origin[0] + off[0], def.origin[1] + off[1], k, t]];
    }
    const [ox, oy] = ninesliceOffset(neighbours[0], neighbours[1], neighbours[2], neighbours[3]);
    return [[def.sheet, def.origin[0] + ox, def.origin[1] + oy, k, t]];
  }
  if (def.kind === 'overlay') {
    const base = def.base ? drawsFor(pack, def.base, tx, ty, neighbours) : [];
    const c = variantFor(def.cells, tx, ty);
    return [...(base || []), [c[0], c[1], c[2], k, t]];
  }
  return null;
}
